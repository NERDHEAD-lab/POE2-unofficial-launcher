import { randomUUID } from "node:crypto";

import { Notification } from "electron";

/**
 * [v42] Patch Reservation Resolution Logic Summary:
 *
 * 1. 성공 (isUpdated: true)
 *    - UI 타이틀에서 "완료" 혹은 다국어 완료 문구(Done, Fertig, Hecho 등)가 명시적으로 확인된 경우.
 *    - 처리 위치: `handleUiTitleTick`
 *
 * 2. 업데이트 없음 (isUpdated: false)
 *    - 로그 분석 중 `LOG_GAME_STARTUP` 이벤트가 발생한 경우. (패치 없이 바로 게임 진입)
 *    - 처리 위치: `handleGameStartup`
 *
 * 3. 실패 (Failure / Canceled)
 *    - 프로세스 종료(`PROCESS_STOP`) 후 60초 내에 새로운 프로세스가 시작되지 않고,
 *    - 이전에 "완료" 문구를 확인하지 못한 상태인 경우.
 *    - 처리 위치: `PR_ProcessStopHandler` -> `abnormalExitTimeout` (60초 유예)
 *
 * 4. PID 교체 (Normal Flow)
 *    - 프로세스 종료 후 60초 이내에 새 프로세스나 세션이 시작되는 경우.
 *    - 처리 위치: `PR_ProcessStopHandler`에서 타이머 시작 -> 시작 신호에서 해제
 */
import {
  getNextRecurringOccurrence,
  isRenewedPatchReservation,
} from "../../shared/patch-reservation";
import { compareVersions } from "../../shared/version";
import { GAME_SERVICE_PROFILES } from "../config/GameServiceProfiles";
import { eventBus } from "../events/EventBus";
import {
  clearAutoPatchRun,
  getAutoPatchRunIdForPid,
  registerAutoPatchExpectation,
} from "../events/handlers/AutoPatchHandler";
import {
  AppContext,
  AppEvent,
  EventHandler,
  EventType,
  IService,
  LogSessionStartEvent,
  LogPatchCheckCompleteEvent,
  LogGameStartupEvent,
  ProcessEvent,
  PatchReservationFailedEvent,
  PatchReservationSuccessEvent,
  PatchRetryRequestedEvent,
  ConfigChangeEvent,
  PatchUiTitleTickEvent,
  UIEvent,
} from "../events/types";
import {
  getGameStatus,
  isLaunchBlockingStatus,
} from "../state/GameStatusStore";
import { setConfigWithEvent } from "../utils/config-utils";
import { logger } from "../utils/logger";
import { PowerShellManager } from "../utils/powershell";
import { RemoteVersionResolver } from "../utils/RemoteVersionResolver";

import type {
  AppConfig,
  PatchReservation,
  RenewedPatchReservation,
  RenewedPatchReservationCommandResult,
} from "../../shared/types";

export enum PatchTaskStatus {
  IDLE = "IDLE",
  TRIGGERED = "TRIGGERED",
  PATCH_WAITING = "PATCH_WAITING",
  COMPLETED = "COMPLETED",
}

export type PatchTaskResult = "success" | "failure" | "no-update";

const INACTIVITY_TIMEOUT_MS = 60_000;
const PID_ROTATION_GRACE_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_000_000;

interface PatchExecutionTask {
  reservation: PatchReservation;
  source: "legacy" | "renewed";
  runId: string;
  launchAfterUpdate: boolean;
  detectedVersion?: string;
  renewedReservationId?: string;
  renewedScheduleToken?: number;
  requiresLiveRenewedReservation?: boolean;
}

interface TaskContext extends PatchExecutionTask {
  currentPid: number | null;
  generation: number;
}

export class PatchReservationService implements IService {
  public readonly id = "PatchReservationService";
  private isStarted = false;

  // State Management
  private status: PatchTaskStatus = PatchTaskStatus.IDLE;
  private currentContext: TaskContext | null = null;
  private lastStateChangeTime: number = Date.now();

  // Map to store active timer for each reservation ID
  private scheduledTimers = new Map<string, NodeJS.Timeout>();
  private renewedScheduledTimers = new Map<string, NodeJS.Timeout>();
  private renewedScheduleTokens = new Map<string, number>();
  private renewedScheduleFingerprints = new Map<string, string>();

  // Queue for sequential execution
  private reservationQueue: PatchExecutionTask[] = [];
  private isProcessing = false;
  private queueGeneration = 0;

  // State-specific timeouts
  private stateTimeout: NodeJS.Timeout | null = null;
  private abnormalExitTimeout: NodeJS.Timeout | null = null;
  private stateWatchdogEpoch = 0;
  private abnormalExitWatchdogEpoch = 0;
  private taskGeneration = 0;

  // Dynamic listener IDs for cleanup
  private dynamicListenerIds: Map<EventType, string> = new Map();

  constructor(private context: AppContext) {
    this.initEventListeners();
  }

  public async init(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    this.refreshSchedules();
    this.refreshRenewedSchedules();
  }

  private initEventListeners() {
    // [Persistent] Listen for config changes to refresh scheduled timers
    eventBus.register({
      id: "PatchReservationRefreshHandler",
      targetEvent: EventType.CONFIG_CHANGE,
      condition: (event) =>
        (event as ConfigChangeEvent).payload?.key === "patchReservations",
      handle: async (_event) => {
        this.refreshSchedules();
      },
    });

    eventBus.register({
      id: "RenewedPatchReservationRefreshHandler",
      targetEvent: EventType.CONFIG_CHANGE,
      condition: (event) =>
        (event as ConfigChangeEvent).payload?.key ===
        "renewedPatchReservations",
      handle: async (_event) => {
        this.refreshRenewedSchedules();
      },
    });

    // Handle Retry Requests
    eventBus.register({
      id: "PatchReservationRetryHandler",
      targetEvent: EventType.PATCH_RETRY_REQUESTED,
      handle: async (event) => {
        if (!this.isStarted) return;
        const { gameId, serviceId, retryCount, runId } = (
          event as PatchRetryRequestedEvent
        ).payload;
        const currentTask =
          this.currentContext?.runId === runId ? this.currentContext : null;
        if (!currentTask) return;

        this.enqueueTask({
          reservation: {
            id: `retry_${runId || Date.now()}_${retryCount}`,
            gameId: gameId as AppConfig["activeGame"],
            serviceId: serviceId as AppConfig["serviceChannel"],
            targetTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            retryCount,
          },
          source: currentTask.source,
          runId: randomUUID(),
          launchAfterUpdate: currentTask.launchAfterUpdate,
          detectedVersion: currentTask.detectedVersion,
          renewedReservationId: currentTask.renewedReservationId,
          renewedScheduleToken: currentTask.renewedScheduleToken,
          requiresLiveRenewedReservation:
            currentTask.requiresLiveRenewedReservation,
        });
      },
    });
  }

  /**
   * Transitions the FSM to a new state and executes entry/exit logic.
   */
  private async transitionTo(
    nextStatus: PatchTaskStatus,
    result?: PatchTaskResult,
  ) {
    if (
      nextStatus === PatchTaskStatus.COMPLETED &&
      (this.status === PatchTaskStatus.COMPLETED || !this.currentContext)
    ) {
      return;
    }

    const prevStatus = this.status;
    const now = Date.now();
    const duration =
      prevStatus !== PatchTaskStatus.IDLE
        ? ` (Duration: ${((now - this.lastStateChangeTime) / 1000).toFixed(1)}s)`
        : "";

    this.status = nextStatus;
    this.lastStateChangeTime = now;

    logger.log(
      `[FSM] Transition: [${prevStatus}] -> [${nextStatus}]${duration}${result ? ` (Result: ${result})` : ""}`,
    );

    // Stop current state timer and invalidate already-queued callbacks.
    this.clearStateWatchdog();

    switch (nextStatus) {
      case PatchTaskStatus.TRIGGERED:
        await this.handleTriggeredEntry();
        break;
      case PatchTaskStatus.PATCH_WAITING:
        this.handlePatchWaitingEntry();
        break;
      case PatchTaskStatus.COMPLETED:
        await this.handleCompletedEntry(result || "failure");
        break;
      case PatchTaskStatus.IDLE:
        this.handleIdleEntry();
        break;
    }
  }

  private async handleTriggeredEntry() {
    if (!this.currentContext) return;
    const { reservation } = this.currentContext;

    // 1. Subscribe to events
    this.subscribeExecutionEvents();

    // 2. Arm before launch so early activity cannot race ahead of the watchdog.
    this.armStateWatchdog("reservation triggered");

    // 3. Start game/patch
    const retryCount = (reservation as PatchReservation).retryCount || 0;
    registerAutoPatchExpectation(
      reservation.gameId,
      reservation.serviceId,
      retryCount,
      this.currentContext.runId,
    );
    const res = this.currentContext?.reservation;
    if (res) {
      setConfigWithEvent("activeGame", res.gameId as AppConfig["activeGame"]);
      setConfigWithEvent(
        "serviceChannel",
        res.serviceId as AppConfig["serviceChannel"],
      );
    }
    await eventBus.emit<UIEvent>(EventType.UI_GAME_START_CLICK, this.context, {
      gameId: res.gameId as AppConfig["activeGame"],
      serviceId: res.serviceId as AppConfig["serviceChannel"],
    });
  }

  private handlePatchWaitingEntry() {
    if (!this.currentContext) return;
    const key = `${this.currentContext.reservation.gameId}_${this.currentContext.reservation.serviceId}`;
    logger.log(
      `[FSM] Entered PATCH_WAITING for ${key}. Watching UI for "Done" or PID swap...`,
    );
    this.armStateWatchdog("patch waiting entered");
  }

  private async handleCompletedEntry(result: PatchTaskResult) {
    if (!this.currentContext) return;
    const { reservation, currentPid, source, launchAfterUpdate, runId } =
      this.currentContext;
    const { gameId, serviceId } = reservation;

    // 1. Unsubscribe
    this.cleanupExecutionListeners();

    // 2. Clear all state timers
    this.clearStateWatchdog();
    this.clearAbnormalExitWatchdog();

    // 3. Stop the observed patch/game process only after terminal state is locked.
    let cleanupSucceeded = true;
    if (result === "success" || result === "no-update") {
      const terminate =
        source === "legacy"
          ? this.context.getConfig("terminateAfterPatch") !== false
          : result === "success" || !launchAfterUpdate;
      if (terminate) {
        cleanupSucceeded = await this.cleanupProcess(
          gameId,
          serviceId,
          currentPid,
        );
      }
    }

    if (!this.isStarted || this.currentContext?.runId !== runId) {
      clearAutoPatchRun(runId);
      return;
    }

    // 4. Notification
    if (!cleanupSucceeded) {
      this.notifyFailure({
        gameId,
        serviceId,
        reason:
          "패치 프로세스를 종료하지 못해 후속 동작을 시작하지 않았습니다.",
      });
    } else if (result === "success" || result === "no-update") {
      this.notifyUpdateResult(gameId, serviceId, result === "success");
    } else {
      this.notifyFailure({
        gameId,
        serviceId,
        reason: "패치 상태 확인 불가 혹은 비정상 종료",
      });
    }

    const shouldLaunchAfterUpdate =
      cleanupSucceeded &&
      source === "renewed" &&
      launchAfterUpdate &&
      result === "success";

    // Retire the auto-patch attempt before a normal follow-up game launch.
    clearAutoPatchRun(runId);
    if (shouldLaunchAfterUpdate) {
      await eventBus.emit<UIEvent>(
        EventType.UI_GAME_START_CLICK,
        this.context,
        {
          gameId,
          serviceId,
        },
      );
    }

    // 5. Release the task only after its follow-up action is complete.
    this.currentContext = null;

    // 6. Back to IDLE and allow the next queued task to revalidate.
    await this.transitionTo(PatchTaskStatus.IDLE);
  }

  private handleIdleEntry() {
    this.reservationQueue.shift();
    this.isProcessing = false;
    this.processQueue();
  }

  private clearStateWatchdog() {
    this.stateWatchdogEpoch += 1;
    if (this.stateTimeout) clearTimeout(this.stateTimeout);
    this.stateTimeout = null;
  }

  private clearAbnormalExitWatchdog() {
    this.abnormalExitWatchdogEpoch += 1;
    if (this.abnormalExitTimeout) clearTimeout(this.abnormalExitTimeout);
    this.abnormalExitTimeout = null;
  }

  private armStateWatchdog(reason: string) {
    if (
      !this.currentContext ||
      (this.status !== PatchTaskStatus.TRIGGERED &&
        this.status !== PatchTaskStatus.PATCH_WAITING)
    ) {
      return;
    }

    this.clearStateWatchdog();
    const { reservation, generation } = this.currentContext;
    const expectedStatus = this.status;
    const expectedEpoch = this.stateWatchdogEpoch;
    const key = `${reservation.gameId}_${reservation.serviceId}`;

    logger.log(
      `[FSM] ${expectedStatus} activity for ${key} (${reason}). Resetting 60s inactivity watchdog.`,
    );

    this.stateTimeout = setTimeout(() => {
      if (
        this.currentContext?.generation !== generation ||
        this.status !== expectedStatus ||
        this.stateWatchdogEpoch !== expectedEpoch
      ) {
        return;
      }

      this.stateTimeout = null;
      logger.warn(`[FSM] ${expectedStatus} 60s inactivity timeout for ${key}.`);
      void this.transitionTo(PatchTaskStatus.COMPLETED, "failure");
    }, INACTIVITY_TIMEOUT_MS);
  }

  private resumeFromProcessActivity(pid: number, reason: string) {
    if (!this.currentContext) return;
    this.currentContext.currentPid = pid;
    this.clearAbnormalExitWatchdog();
    this.armStateWatchdog(reason);
  }

  private armAbnormalExitWatchdog(stoppedPid: number) {
    if (!this.currentContext) return;

    this.clearAbnormalExitWatchdog();
    const { reservation, generation } = this.currentContext;
    const expectedStatus = this.status;
    const expectedEpoch = this.abnormalExitWatchdogEpoch;
    const key = `${reservation.gameId}_${reservation.serviceId}`;

    logger.warn(
      `[FSM] Process ${stoppedPid} stopped for ${key}. Waiting 60s for PID rotation...`,
    );

    this.abnormalExitTimeout = setTimeout(() => {
      if (
        this.currentContext?.generation !== generation ||
        this.currentContext.currentPid !== null ||
        this.status !== expectedStatus ||
        this.abnormalExitWatchdogEpoch !== expectedEpoch
      ) {
        return;
      }

      this.abnormalExitTimeout = null;
      logger.error(
        `[FSM] Process did not recover after 60s for ${key}. Ending task.`,
      );
      void this.transitionTo(PatchTaskStatus.COMPLETED, "failure");
    }, PID_ROTATION_GRACE_MS);
  }

  private subscribeExecutionEvents() {
    this.cleanupExecutionListeners();

    // 1. Process Start (launcher/patcher activity and PID rotation)
    this.registerHandler<ProcessEvent>({
      id: "PR_ProcessStartHandler",
      targetEvent: EventType.PROCESS_START,
      handle: async (event) => {
        const { gameId, serviceId, pid } = event.payload;
        if (!gameId || !serviceId) return;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;
        if (!this.isCurrentAttemptPid(pid)) return;

        this.resumeFromProcessActivity(pid, "process started");
      },
    });

    // 2. Session Start (PID Tracking)
    this.registerHandler({
      id: "PR_LogSessionHandler",
      targetEvent: EventType.LOG_SESSION_START,
      handle: async (event: LogSessionStartEvent) => {
        const { gameId, serviceId, pid } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;
        if (!this.isCurrentAttemptPid(pid)) return;

        if (this.abnormalExitTimeout) {
          logger.log(
            `[FSM] PID Rotation detected: ${pid}. Clearing exit timeout.`,
          );
        }
        this.resumeFromProcessActivity(pid, "log session started");
        logger.log(`[FSM] Tracking PID ${pid} for ${gameId}_${serviceId}`);
      },
    });

    // 3. WebRoot readiness is activity, not final patch completion.
    this.registerHandler<PatchReservationSuccessEvent>({
      id: "PR_ReservationSuccessHandler",
      targetEvent: EventType.PATCH_RESERVATION_SUCCESS,
      handle: async (event) => {
        const { gameId, serviceId, runId } = event.payload;
        if (!this.isCurrentTask(gameId, serviceId)) return;
        if (this.currentContext?.runId !== runId) return;
        if (this.currentContext?.currentPid === null) return;

        this.armStateWatchdog("patch reservation ready");
      },
    });

    // 4. Explicit auto-patch failure
    this.registerHandler<PatchReservationFailedEvent>({
      id: "PR_ReservationFailedHandler",
      targetEvent: EventType.PATCH_RESERVATION_FAILED,
      handle: async (event) => {
        const { gameId, serviceId, runId } = event.payload;
        if (!this.isCurrentTask(gameId, serviceId)) return;
        if (this.currentContext?.runId !== runId) return;

        await this.transitionTo(PatchTaskStatus.COMPLETED, "failure");
      },
    });

    // 5. Patch Check Complete
    this.registerHandler({
      id: "PR_LogPatchCheckCompleteHandler",
      targetEvent: EventType.LOG_PATCH_CHECK_COMPLETE,
      handle: async (event: LogPatchCheckCompleteEvent) => {
        const { gameId, serviceId, pid } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;
        if (!this.isCurrentAttemptPid(pid)) return;
        this.resumeFromProcessActivity(pid, "patch check complete");
        if (this.status === PatchTaskStatus.TRIGGERED) {
          await this.transitionTo(PatchTaskStatus.PATCH_WAITING);
        }
      },
    });

    // 6. Game Startup (No-update case)
    this.registerHandler({
      id: "PR_LogGameStartupHandler",
      targetEvent: EventType.LOG_GAME_STARTUP,
      handle: async (event: LogGameStartupEvent) => {
        const { gameId, serviceId, pid } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;
        if (!this.isCurrentAttemptPid(pid)) return;

        logger.log(`[FSM] Game started directly for ${gameId}_${serviceId}.`);
        if (this.currentContext) this.currentContext.currentPid = pid;
        await this.transitionTo(PatchTaskStatus.COMPLETED, "no-update");
      },
    });

    // 7. UI Title Detection
    this.registerHandler({
      id: "PR_UiTitleTickHandler",
      targetEvent: EventType.PATCH_UI_TITLE_TICK,
      handle: async (event: PatchUiTitleTickEvent) => {
        const { title, gameId, serviceId, pid } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;
        if (this.status !== PatchTaskStatus.PATCH_WAITING) return;
        if (this.currentContext?.currentPid !== pid) return;
        if (!this.isCurrentAttemptPid(pid)) return;

        const isDone =
          /Done|Pronto|Завершено|Fertig|Hecho|Terminé|완료|完了|เสร็จสิ้น|完成/i.test(
            title,
          );
        if (isDone) {
          logger.log(`[FSM] UI "Done" detected for ${gameId}_${serviceId}.`);
          await this.transitionTo(PatchTaskStatus.COMPLETED, "success");
          return;
        }

        this.armStateWatchdog("patch UI responded");
      },
    });

    // 8. Process Stop (Error/Exit detection)
    this.registerHandler({
      id: "PR_ProcessStopHandler",
      targetEvent: EventType.PROCESS_STOP,
      handle: async (event: ProcessEvent) => {
        const { pid } = event.payload;
        if (this.currentContext?.currentPid !== pid) return;

        this.currentContext.currentPid = null;
        this.clearStateWatchdog();
        this.armAbnormalExitWatchdog(pid);
      },
    });
  }

  /**
   * Type-safe registration helper to avoid 'any' casting.
   */
  private registerHandler<T extends AppEvent>(handler: EventHandler<T>) {
    eventBus.register(handler);
    this.dynamicListenerIds.set(handler.targetEvent, handler.id);
  }

  private cleanupExecutionListeners() {
    this.dynamicListenerIds.forEach((id, type) => eventBus.off(type, id));
    this.dynamicListenerIds.clear();
  }

  private isCurrentTask(gameId: string, serviceId: string): boolean {
    return (
      this.currentContext?.reservation.gameId === gameId &&
      this.currentContext?.reservation.serviceId === serviceId
    );
  }

  private isCurrentAttemptPid(pid: number): boolean {
    return (
      !!this.currentContext &&
      getAutoPatchRunIdForPid(pid) === this.currentContext.runId
    );
  }

  private refreshSchedules() {
    if (!this.isStarted) return;
    for (const timer of this.scheduledTimers.values()) clearTimeout(timer);
    this.scheduledTimers.clear();

    const config = this.context.getConfig() as AppConfig;
    const reservations = config.patchReservations || [];
    const now = new Date();

    reservations.forEach((res) => {
      const delay = Math.max(
        0,
        new Date(res.targetTime).getTime() - now.getTime(),
      );
      const timer = setTimeout(() => {
        this.enqueue(res);
        this.removeReservation(res.id);
        this.scheduledTimers.delete(res.id);
      }, delay);
      this.scheduledTimers.set(res.id, timer);
    });
  }

  private refreshRenewedSchedules() {
    if (!this.isStarted) return;
    const config = this.context.getConfig() as AppConfig;
    const reservations = config.renewedPatchReservations || [];
    const validReservations = new Map<string, RenewedPatchReservation>();

    for (const reservation of reservations) {
      if (!isRenewedPatchReservation(reservation)) {
        logger.warn(
          `[PatchReservation] Ignoring invalid renewed reservation: ${String((reservation as { id?: unknown }).id)}`,
        );
        continue;
      }
      validReservations.set(reservation.id, reservation);
    }

    for (const id of this.renewedScheduleFingerprints.keys()) {
      if (!validReservations.has(id)) {
        this.invalidateRenewedSchedule(id, true);
      }
    }

    for (const reservation of validReservations.values()) {
      const fingerprint = this.getRenewedScheduleFingerprint(reservation);
      if (
        this.renewedScheduleFingerprints.get(reservation.id) === fingerprint
      ) {
        continue;
      }

      this.invalidateRenewedSchedule(reservation.id, false);
      this.renewedScheduleFingerprints.set(reservation.id, fingerprint);
      const token = this.renewedScheduleTokens.get(reservation.id)!;
      this.scheduleRenewedReservation(reservation, token);
    }
  }

  private scheduleRenewedReservation(
    reservation: RenewedPatchReservation,
    token: number,
  ) {
    if (!this.isRenewedTokenCurrent(reservation.id, token)) return;

    const now = Date.now();
    const { schedule } = reservation;
    if (schedule.kind === "once-at") {
      const target = Date.parse(schedule.at);
      if (target <= now) {
        this.removeRenewedReservation(reservation.id);
        return;
      }
      this.scheduleRenewedTimeout(reservation, target, token);
      return;
    }

    if (schedule.kind === "once-range") {
      const startsAt = Date.parse(schedule.startsAt);
      const endsAt = Date.parse(schedule.endsAt);
      if (endsAt < now) {
        this.notifyRenewedRangeExpired(reservation);
        this.removeRenewedReservation(reservation.id);
        return;
      }
      this.scheduleRenewedTimeout(reservation, Math.max(startsAt, now), token);
      return;
    }

    const next = getNextRecurringOccurrence(reservation, new Date(now));
    if (next) {
      this.scheduleRenewedTimeout(reservation, next.getTime(), token);
    }
  }

  private scheduleRenewedTimeout(
    reservation: RenewedPatchReservation,
    dueAt: number,
    token: number,
  ) {
    const arm = () => {
      if (!this.isRenewedTokenCurrent(reservation.id, token)) return;

      const delay = dueAt - Date.now();
      if (delay > MAX_TIMEOUT_MS) {
        const timer = setTimeout(arm, MAX_TIMEOUT_MS);
        this.renewedScheduledTimers.set(reservation.id, timer);
        return;
      }

      const timer = setTimeout(
        () => {
          this.renewedScheduledTimers.delete(reservation.id);
          if (!this.isRenewedTokenCurrent(reservation.id, token)) return;
          void this.handleRenewedOccurrence(reservation, dueAt, token);
        },
        Math.max(0, delay),
      );
      this.renewedScheduledTimers.set(reservation.id, timer);
    };

    arm();
  }

  private async handleRenewedOccurrence(
    reservation: RenewedPatchReservation,
    dueAt: number,
    token: number,
  ) {
    const outcome = await this.checkRenewedReservation(reservation, token);
    if (
      !this.isRenewedTokenCurrent(reservation.id, token) ||
      !this.hasRenewedReservation(reservation.id)
    ) {
      return;
    }

    const { schedule } = reservation;
    if (schedule.kind === "once-at") {
      if (outcome === "no-update") {
        this.notifyRenewedNoUpdate(reservation, dueAt);
      }
      this.removeRenewedReservation(reservation.id);
      return;
    }

    if (schedule.kind === "once-range") {
      if (outcome === "handled") {
        this.removeRenewedReservation(reservation.id);
        return;
      }

      const endsAt = Date.parse(schedule.endsAt);
      const intervalMs = schedule.intervalMinutes * 60_000;
      const elapsedIntervals =
        Math.floor((Math.max(Date.now(), dueAt) - dueAt) / intervalMs) + 1;
      const nextCheck = dueAt + elapsedIntervals * intervalMs;
      if (nextCheck <= endsAt) {
        this.scheduleRenewedTimeout(reservation, nextCheck, token);
      } else {
        this.notifyRenewedRangeExpired(reservation);
        this.removeRenewedReservation(reservation.id);
      }
      return;
    }

    this.scheduleRenewedReservation(reservation, token);
  }

  private async checkRenewedReservation(
    reservation: RenewedPatchReservation,
    token: number,
  ): Promise<"handled" | "no-update" | "skipped"> {
    if (
      reservation.action.kind === "auto-update" &&
      this.isRenewedTargetBusy(reservation)
    ) {
      this.notifyRenewedSkipped(reservation);
      return "skipped";
    }

    const remote = await RemoteVersionResolver.resolveFresh(reservation.gameId);
    if (
      !this.isRenewedTokenCurrent(reservation.id, token) ||
      !this.hasRenewedReservation(reservation.id)
    ) {
      return "skipped";
    }

    if (
      reservation.action.kind === "auto-update" &&
      this.isRenewedTargetBusy(reservation)
    ) {
      this.notifyRenewedSkipped(reservation);
      return "skipped";
    }

    const config = this.context.getConfig() as AppConfig;
    const localVersion =
      config.knownGameVersions?.[
        `${reservation.gameId}_${reservation.serviceId}`
      ]?.version;
    const remoteVersion = remote?.version;
    if (
      !remoteVersion ||
      remoteVersion === "unknown" ||
      !localVersion ||
      localVersion === "unknown" ||
      compareVersions(remoteVersion, localVersion) <= 0
    ) {
      return "no-update";
    }

    if (reservation.action.kind === "notify") {
      const liveReservation = this.getRenewedReservation(reservation.id);
      if (!liveReservation) return "skipped";
      if (
        "onlyNewVersion" in reservation.action &&
        reservation.action.onlyNewVersion &&
        liveReservation.lastNotifiedVersion === remoteVersion
      ) {
        return "handled";
      }

      this.notifyRenewedUpdateAvailable(reservation, remoteVersion);
      if (
        "onlyNewVersion" in reservation.action &&
        reservation.action.onlyNewVersion
      ) {
        this.updateRenewedLastNotifiedVersion(reservation.id, remoteVersion);
      }
      return "handled";
    }

    this.enqueueRenewed(reservation, remoteVersion);
    return "handled";
  }

  private getRenewedScheduleFingerprint(
    reservation: RenewedPatchReservation,
  ): string {
    return JSON.stringify({
      gameId: reservation.gameId,
      serviceId: reservation.serviceId,
      schedule: reservation.schedule,
      action: reservation.action,
    });
  }

  private invalidateRenewedSchedule(id: string, forgetFingerprint: boolean) {
    const timer = this.renewedScheduledTimers.get(id);
    if (timer) clearTimeout(timer);
    this.renewedScheduledTimers.delete(id);
    this.renewedScheduleTokens.set(
      id,
      (this.renewedScheduleTokens.get(id) || 0) + 1,
    );
    if (forgetFingerprint) this.renewedScheduleFingerprints.delete(id);
  }

  private isRenewedTokenCurrent(id: string, token: number): boolean {
    return (
      this.isStarted &&
      this.renewedScheduleTokens.get(id) === token &&
      this.renewedScheduleFingerprints.has(id)
    );
  }

  private isRenewedTargetBusy(reservation: RenewedPatchReservation): boolean {
    return isLaunchBlockingStatus(
      getGameStatus(reservation.gameId, reservation.serviceId).status,
    );
  }

  private hasRenewedReservation(id: string): boolean {
    return !!this.getRenewedReservation(id);
  }

  private getRenewedReservation(
    id: string,
  ): RenewedPatchReservation | undefined {
    const config = this.context.getConfig() as AppConfig;
    return (config.renewedPatchReservations || []).find(
      (reservation) => reservation.id === id,
    );
  }

  private enqueueRenewed(
    reservation: RenewedPatchReservation,
    detectedVersion: string,
  ) {
    const isRecurring =
      reservation.schedule.kind === "daily" ||
      reservation.schedule.kind === "weekly";
    this.enqueueTask({
      reservation: {
        id: reservation.id,
        gameId: reservation.gameId,
        serviceId: reservation.serviceId,
        targetTime: new Date().toISOString(),
        createdAt: reservation.createdAt,
      },
      source: "renewed",
      runId: randomUUID(),
      launchAfterUpdate:
        reservation.action.kind === "auto-update" &&
        "launchAfterUpdate" in reservation.action &&
        reservation.action.launchAfterUpdate,
      detectedVersion,
      renewedReservationId: reservation.id,
      renewedScheduleToken: this.renewedScheduleTokens.get(reservation.id),
      requiresLiveRenewedReservation: isRecurring,
    });
  }

  private enqueue(res: PatchReservation) {
    this.enqueueTask({
      reservation: res,
      source: "legacy",
      runId: randomUUID(),
      launchAfterUpdate: false,
    });
  }

  private enqueueTask(task: PatchExecutionTask) {
    if (!this.isStarted) return;
    if (
      this.reservationQueue.some(
        (queued) => queued.reservation.id === task.reservation.id,
      )
    ) {
      return;
    }
    this.reservationQueue.push(task);
    this.processQueue();
  }

  private async processQueue() {
    if (
      !this.isStarted ||
      this.isProcessing ||
      this.reservationQueue.length === 0
    ) {
      return;
    }
    this.isProcessing = true;
    const nextItem = this.reservationQueue[0];
    const generation = this.queueGeneration;

    if (nextItem.source === "renewed") {
      const canStart = await this.canStartRenewedExecution(nextItem);
      if (
        generation !== this.queueGeneration ||
        this.reservationQueue[0] !== nextItem
      ) {
        this.isProcessing = false;
        return;
      }
      if (!canStart) {
        this.reservationQueue.shift();
        this.isProcessing = false;
        void this.processQueue();
        return;
      }
    }

    this.currentContext = {
      ...nextItem,
      currentPid: null,
      generation: ++this.taskGeneration,
    };
    void this.transitionTo(PatchTaskStatus.TRIGGERED);
  }

  private async canStartRenewedExecution(
    task: PatchExecutionTask,
  ): Promise<boolean> {
    const { gameId, serviceId } = task.reservation;
    const renewedReservationId =
      task.renewedReservationId ?? task.reservation.id;
    if (
      task.requiresLiveRenewedReservation &&
      (task.renewedScheduleToken === undefined ||
        !this.isRenewedTokenCurrent(
          renewedReservationId,
          task.renewedScheduleToken,
        ))
    ) {
      logger.log(
        `[PatchReservation] Canceled queued renewed update for removed reservation: ${renewedReservationId}`,
      );
      return false;
    }

    if (isLaunchBlockingStatus(getGameStatus(gameId, serviceId).status)) {
      this.notifyRenewedSkipped(task.reservation);
      return false;
    }

    const config = this.context.getConfig() as AppConfig;
    const localVersion =
      config.knownGameVersions?.[`${gameId}_${serviceId}`]?.version;
    const remoteVersion = task.detectedVersion;
    const canStart =
      !!remoteVersion &&
      remoteVersion !== "unknown" &&
      !!localVersion &&
      localVersion !== "unknown" &&
      compareVersions(remoteVersion, localVersion) > 0;

    if (!canStart) {
      logger.log(
        `[PatchReservation] Queued renewed update no longer requires execution: ${task.reservation.id}`,
      );
    }
    return canStart;
  }

  private async cleanupProcess(
    gameId: string,
    serviceId: string,
    pid: number | null,
  ): Promise<boolean> {
    const profile =
      GAME_SERVICE_PROFILES[serviceId as AppConfig["serviceChannel"]];
    const useAdmin = this.context.getConfig("skipDaumGameStarterUac") !== true;
    const terminationTasks: Promise<unknown>[] = [];
    const processNames =
      profile?.processKeywords.map((keyword) =>
        keyword.replace(/\.exe$/i, ""),
      ) || [];
    const powerShell = PowerShellManager.getInstance();

    if (pid) {
      await eventBus.emit(EventType.PROCESS_WILL_TERMINATE, this.context, {
        pid,
      });
      terminationTasks.push(
        powerShell.execute(`taskkill /PID ${pid} /F /T`, useAdmin),
      );
    }

    if (profile) {
      for (const keyword of profile.processKeywords) {
        terminationTasks.push(
          powerShell.execute(`taskkill /IM "${keyword}" /F /T`, useAdmin),
        );
      }
    }

    await Promise.allSettled(terminationTasks);

    if (!pid && processNames.length === 0) return true;

    const pidQuery = pid
      ? `$remaining += @(Get-Process -Id ${pid} -ErrorAction SilentlyContinue);`
      : "";
    const nameQuery =
      processNames.length > 0
        ? `$remaining += @(Get-Process -Name @(${processNames
            .map((name) => `'${name.replace(/'/g, "''")}'`)
            .join(", ")}) -ErrorAction SilentlyContinue);`
        : "";

    try {
      const verification = await powerShell.execute(
        `$remaining = @(); ${pidQuery} ${nameQuery} if (@($remaining).Count -gt 0) { 'remaining' } else { 'none' }`,
        false,
        true,
      );
      const succeeded =
        verification.code === 0 && verification.stdout.trim() === "none";
      if (!succeeded) {
        logger.error(
          `[PatchReservation] Process cleanup verification failed for ${gameId}/${serviceId}.`,
        );
      }
      return succeeded;
    } catch (error) {
      logger.error(
        `[PatchReservation] Process cleanup verification failed for ${gameId}/${serviceId}:`,
        error,
      );
      return false;
    }
  }

  private notifyRenewedUpdateAvailable(
    reservation: RenewedPatchReservation,
    remoteVersion: string,
  ) {
    this.notifyRenewed(
      "새 게임 업데이트 확인",
      `[${reservation.serviceId}] ${reservation.gameId} ${remoteVersion} 업데이트가 확인되었습니다.`,
    );
  }

  private notifyRenewedSkipped(
    reservation: Pick<RenewedPatchReservation, "gameId" | "serviceId">,
  ) {
    this.notifyRenewed(
      "예약 패치 건너뜀",
      `[${reservation.serviceId}] ${reservation.gameId}가 실행 중이거나 시작 중이어서 예약 업데이트를 시작하지 않았습니다.`,
    );
  }

  private notifyRenewedNoUpdate(
    reservation: RenewedPatchReservation,
    checkedAt: number,
  ) {
    this.notifyRenewed(
      "예약 패치 확인 종료",
      `${this.formatReservationDateTime(checkedAt)}에 새 업데이트가 확인되지 않아 예약 패치 확인을 종료했습니다.`,
    );
    logger.log(
      `[PatchReservation] Renewed one-time check completed without update: ${reservation.id}`,
    );
  }

  private notifyRenewedRangeExpired(reservation: RenewedPatchReservation) {
    if (reservation.schedule.kind !== "once-range") return;
    const startsAt = Date.parse(reservation.schedule.startsAt);
    const endsAt = Date.parse(reservation.schedule.endsAt);
    this.notifyRenewed(
      "예약 패치 확인 종료",
      `${this.formatReservationDateTime(startsAt)}~${this.formatReservationDateTime(endsAt)} 동안 새 업데이트가 확인되지 않아 예약 패치 확인을 종료했습니다.`,
    );
  }

  private notifyRenewed(title: string, body: string) {
    const config = this.context.getConfig() as AppConfig;
    if (config.silentPatchNotification !== true && Notification.isSupported()) {
      new Notification({ title, body, timeoutType: "never" }).show();
    }
    logger.log(`[PatchReservation] Notification: ${body}`);
  }

  private formatReservationDateTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  }

  private notifyUpdateResult(
    gameId: string,
    serviceId: string,
    isUpdated: boolean,
  ) {
    const config = this.context.getConfig() as AppConfig;
    const isSilent = config.silentPatchNotification === true;
    const title = isUpdated ? "예약 패치 완료" : "업데이트 없음";
    const body = `[${serviceId}] ${gameId} ${isUpdated ? "패치 예약 동작이 성공적으로 완료되었습니다." : "패치를 시도했으나 업데이트가 없었습니다."}`;

    if (!isSilent && Notification.isSupported()) {
      new Notification({ title, body, timeoutType: "never" }).show();
    }
    logger.log(`[PatchReservation] Notification: ${body}`);
  }

  private notifyFailure(payload: {
    gameId: string;
    serviceId: string;
    reason: string;
  }) {
    const config = this.context.getConfig() as AppConfig;
    const isSilent = config.silentPatchNotification === true;
    const { gameId, serviceId, reason } = payload;
    const title = "예약 패치 실패";
    const body = `[${serviceId}] ${gameId} 패치 예약에 실패했습니다.\n사유: ${reason}`;

    if (!isSilent && Notification.isSupported()) {
      new Notification({
        title,
        body,
        urgency: "critical",
        timeoutType: "never",
      }).show();
    }
    logger.error(`[PatchReservation] FINAL FAILURE: ${body}`);
  }

  private removeReservation(id: string) {
    const config = this.context.getConfig() as AppConfig;
    const filtered = (config.patchReservations || []).filter(
      (res) => res.id !== id,
    );
    setConfigWithEvent("patchReservations", filtered);
  }

  private removeRenewedReservation(id: string) {
    const config = this.context.getConfig() as AppConfig;
    const filtered = (config.renewedPatchReservations || []).filter(
      (reservation) => reservation.id !== id,
    );
    setConfigWithEvent("renewedPatchReservations", filtered);
  }

  private updateRenewedLastNotifiedVersion(id: string, remoteVersion: string) {
    const config = this.context.getConfig() as AppConfig;
    const updated = (config.renewedPatchReservations || []).map(
      (reservation) =>
        reservation.id === id
          ? { ...reservation, lastNotifiedVersion: remoteVersion }
          : reservation,
    );
    setConfigWithEvent("renewedPatchReservations", updated);
  }

  public addReservation(reservation: PatchReservation) {
    const config = this.context.getConfig() as AppConfig;
    const updated = [...(config.patchReservations || []), reservation];
    setConfigWithEvent("patchReservations", updated);
  }

  public deleteReservation(id: string) {
    this.removeReservation(id);
  }

  public addRenewedReservation(
    reservation: RenewedPatchReservation,
  ): RenewedPatchReservationCommandResult {
    if (!this.isStarted) {
      return { ok: false, reason: "service-unavailable" };
    }
    if (!isRenewedPatchReservation(reservation)) {
      logger.warn(
        "[PatchReservation] Rejected invalid renewed reservation payload.",
      );
      return { ok: false, reason: "invalid" };
    }
    const scheduleStartsAt =
      reservation.schedule.kind === "once-at"
        ? Date.parse(reservation.schedule.at)
        : reservation.schedule.kind === "once-range"
          ? Date.parse(reservation.schedule.startsAt)
          : null;
    if (scheduleStartsAt !== null && scheduleStartsAt <= Date.now()) {
      logger.warn(
        "[PatchReservation] Rejected invalid renewed reservation payload.",
      );
      return { ok: false, reason: "invalid" };
    }

    const config = this.context.getConfig() as AppConfig;
    const current = config.renewedPatchReservations || [];
    if (current.some((item) => item.id === reservation.id)) {
      logger.warn(
        `[PatchReservation] Rejected duplicate renewed reservation: ${reservation.id}`,
      );
      return { ok: false, reason: "duplicate" };
    }
    setConfigWithEvent("renewedPatchReservations", [...current, reservation]);
    return { ok: true };
  }

  public deleteRenewedReservation(
    id: string,
  ): RenewedPatchReservationCommandResult {
    if (!this.isStarted) {
      return { ok: false, reason: "service-unavailable" };
    }
    if (!this.hasRenewedReservation(id)) {
      return { ok: false, reason: "not-found" };
    }
    this.removeRenewedReservation(id);
    return { ok: true };
  }

  public async stop(): Promise<void> {
    this.isStarted = false;
    for (const timer of this.scheduledTimers.values()) clearTimeout(timer);
    this.scheduledTimers.clear();
    for (const timer of this.renewedScheduledTimers.values()) {
      clearTimeout(timer);
    }
    this.renewedScheduledTimers.clear();
    this.renewedScheduleTokens.clear();
    this.renewedScheduleFingerprints.clear();
    this.clearStateWatchdog();
    this.clearAbnormalExitWatchdog();
    this.cleanupExecutionListeners();
    if (this.currentContext) clearAutoPatchRun(this.currentContext.runId);
    this.reservationQueue = [];
    this.queueGeneration += 1;
    this.isProcessing = false;
    this.currentContext = null;
    this.status = PatchTaskStatus.IDLE;
    this.taskGeneration += 1;
  }
}

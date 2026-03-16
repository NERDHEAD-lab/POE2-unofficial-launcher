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
 *    - 프로세스 종료(`PROCESS_STOP`) 후 10초 내에 새로운 프로세스가 시작되지 않고,
 *    - 이전에 "완료" 문구를 확인하지 못한 상태인 경우.
 *    - 처리 위치: `handleProcessStop` -> `abnormalExitTimeout` (10초 유예)
 *
 * 4. PID 교체 (Normal Flow)
 *    - 프로세스 종료 후 10초 이내에 새로운 세션(`LOG_SESSION_START`)이 시작되는 경우.
 *    - 처리 위치: `handleProcessStop`에서 타이머 시작 -> `LOG_SESSION_START`에서 타이머 해제
 */
import { PatchReservation, AppConfig } from "../../shared/types";
import { GAME_SERVICE_PROFILES } from "../config/GameServiceProfiles";
import { eventBus } from "../events/EventBus";
import { registerAutoPatchExpectation } from "../events/handlers/AutoPatchHandler";
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
  PatchRetryRequestedEvent,
  ConfigChangeEvent,
  PatchUiTitleTickEvent,
} from "../events/types";
import { setConfigWithEvent } from "../utils/config-utils";
import { logger } from "../utils/logger";
import { PowerShellManager } from "../utils/powershell";

export enum PatchTaskStatus {
  IDLE = "IDLE",
  TRIGGERED = "TRIGGERED",
  PATCH_WAITING = "PATCH_WAITING",
  COMPLETED = "COMPLETED",
}

export type PatchTaskResult = "success" | "failure" | "no-update";

interface TaskContext {
  reservation: PatchReservation;
  currentPid: number | null;
}

export class PatchReservationService implements IService {
  public readonly id = "PatchReservationService";

  // State Management
  private status: PatchTaskStatus = PatchTaskStatus.IDLE;
  private currentContext: TaskContext | null = null;
  private lastStateChangeTime: number = Date.now();

  // Map to store active timer for each reservation ID
  private scheduledTimers = new Map<string, NodeJS.Timeout>();

  // Queue for sequential execution
  private reservationQueue: PatchReservation[] = [];
  private isProcessing = false;

  // State-specific timeouts
  private stateTimeout: NodeJS.Timeout | null = null;
  private abnormalExitTimeout: NodeJS.Timeout | null = null;

  // Dynamic listener IDs for cleanup
  private dynamicListenerIds: Map<EventType, string> = new Map();

  constructor(private context: AppContext) {
    this.initEventListeners();
  }

  public async init(): Promise<void> {
    this.refreshSchedules();
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

    // Handle Retry Requests
    eventBus.register({
      id: "PatchReservationRetryHandler",
      targetEvent: EventType.PATCH_RETRY_REQUESTED,
      handle: async (event) => {
        const { gameId, serviceId, retryCount } = (
          event as PatchRetryRequestedEvent
        ).payload;
        this.enqueue({
          id: `retry_${Date.now()}`,
          gameId: gameId as AppConfig["activeGame"],
          serviceId: serviceId as AppConfig["serviceChannel"],
          targetTime: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          retryCount,
        } as PatchReservation);
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

    // Stop current state timer if any
    if (this.stateTimeout) {
      clearTimeout(this.stateTimeout);
      this.stateTimeout = null;
    }

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
    const key = `${reservation.gameId}_${reservation.serviceId}`;

    // 1. Subscribe to events
    this.subscribeExecutionEvents();

    // 2. Start game/patch
    const retryCount = (reservation as PatchReservation).retryCount || 0;
    registerAutoPatchExpectation(
      reservation.gameId,
      reservation.serviceId,
      retryCount,
    );
    const res = this.currentContext?.reservation;
    if (res) {
      setConfigWithEvent("activeGame", res.gameId as AppConfig["activeGame"]);
      setConfigWithEvent(
        "serviceChannel",
        res.serviceId as AppConfig["serviceChannel"],
      );
    }
    eventBus.emit(EventType.UI_GAME_START_CLICK, this.context, undefined);

    // 3. 30s Silence Timeout
    this.stateTimeout = setTimeout(() => {
      logger.warn(`[FSM] TRIGGERED 30s Silence timeout for ${key}.`);
      this.transitionTo(PatchTaskStatus.COMPLETED, "failure");
    }, 30000);
  }

  private handlePatchWaitingEntry() {
    if (!this.currentContext) return;
    const key = `${this.currentContext.reservation.gameId}_${this.currentContext.reservation.serviceId}`;
    logger.log(
      `[FSM] Entered PATCH_WAITING for ${key}. Watching UI for "Done" or PID swap...`,
    );
  }

  private async handleCompletedEntry(result: PatchTaskResult) {
    if (!this.currentContext) return;
    const { gameId, serviceId } = this.currentContext.reservation;

    // 1. Unsubscribe
    this.cleanupExecutionListeners();

    // 2. Clear all state timers
    if (this.abnormalExitTimeout) {
      clearTimeout(this.abnormalExitTimeout);
      this.abnormalExitTimeout = null;
    }

    // 3. Notification
    if (result === "success" || result === "no-update") {
      this.notifyUpdateResult(gameId, serviceId, result === "success");
    } else {
      this.notifyFailure({
        gameId,
        serviceId,
        reason: "패치 상태 확인 불가 혹은 비정상 종료",
      });
    }

    // 4. Cleanup context
    this.currentContext = null;

    // 5. Back to IDLE
    this.transitionTo(PatchTaskStatus.IDLE);
  }

  private handleIdleEntry() {
    this.reservationQueue.shift();
    this.isProcessing = false;
    this.processQueue();
  }

  private subscribeExecutionEvents() {
    this.cleanupExecutionListeners();

    // 1. Session Start (PID Tracking)
    this.registerHandler({
      id: "PR_LogSessionHandler",
      targetEvent: EventType.LOG_SESSION_START,
      handle: async (event: LogSessionStartEvent) => {
        const { gameId, serviceId, pid } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;

        if (this.abnormalExitTimeout) {
          logger.log(
            `[FSM] PID Rotation detected: ${pid}. Clearing exit timeout.`,
          );
          clearTimeout(this.abnormalExitTimeout);
          this.abnormalExitTimeout = null;
        }
        if (this.currentContext) this.currentContext.currentPid = pid;
        logger.log(`[FSM] Tracking PID ${pid} for ${gameId}_${serviceId}`);
      },
    });

    // 2. Patch Check Complete
    this.registerHandler({
      id: "PR_LogPatchCheckCompleteHandler",
      targetEvent: EventType.LOG_PATCH_CHECK_COMPLETE,
      handle: async (event: LogPatchCheckCompleteEvent) => {
        const { gameId, serviceId } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;
        if (this.status === PatchTaskStatus.TRIGGERED) {
          this.transitionTo(PatchTaskStatus.PATCH_WAITING);
        }
      },
    });

    // 3. Game Startup (No-update case)
    this.registerHandler({
      id: "PR_LogGameStartupHandler",
      targetEvent: EventType.LOG_GAME_STARTUP,
      handle: async (event: LogGameStartupEvent) => {
        const { gameId, serviceId, pid } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;

        logger.log(`[FSM] Game started directly for ${gameId}_${serviceId}.`);
        const terminate =
          this.context.getConfig("terminateAfterPatch") !== false;
        if (terminate)
          await this.cleanupProcess(gameId as string, serviceId as string, pid);

        this.transitionTo(PatchTaskStatus.COMPLETED, "no-update");
      },
    });

    // 4. UI Title Detection
    this.registerHandler({
      id: "PR_UiTitleTickHandler",
      targetEvent: EventType.PATCH_UI_TITLE_TICK,
      handle: async (event: PatchUiTitleTickEvent) => {
        const { title, gameId, serviceId, pid } = event.payload;
        if (!this.isCurrentTask(gameId as string, serviceId as string)) return;
        if (this.status !== PatchTaskStatus.PATCH_WAITING) return;

        const isDone =
          /Done|Pronto|Завершено|Fertig|Hecho|Terminé|완료|完了|เสร็จสิ้น|完成/i.test(
            title,
          );
        if (isDone) {
          logger.log(`[FSM] UI "Done" detected for ${gameId}_${serviceId}.`);
          const terminate =
            this.context.getConfig("terminateAfterPatch") !== false;
          if (terminate)
            await this.cleanupProcess(
              gameId as string,
              serviceId as string,
              pid,
            );
          this.transitionTo(PatchTaskStatus.COMPLETED, "success");
        }
      },
    });

    // 5. Process Stop (Error/Exit detection)
    this.registerHandler({
      id: "PR_ProcessStopHandler",
      targetEvent: EventType.PROCESS_STOP,
      handle: async (event: ProcessEvent) => {
        const { pid } = event.payload;
        if (this.currentContext?.currentPid !== pid) return;

        logger.warn(
          `[FSM] Process ${pid} stopped. Waiting 30s for recovery/rotation...`,
        );
        this.abnormalExitTimeout = setTimeout(() => {
          logger.error(`[FSM] Process did not recover after 30s. Ending task.`);
          this.transitionTo(PatchTaskStatus.COMPLETED, "failure");
        }, 30000);
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

  private refreshSchedules() {
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

  private enqueue(res: PatchReservation) {
    if (this.reservationQueue.some((q) => q.id === res.id)) return;
    this.reservationQueue.push(res);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing || this.reservationQueue.length === 0) return;
    this.isProcessing = true;
    const nextItem = this.reservationQueue[0];

    this.currentContext = { reservation: nextItem, currentPid: null };
    this.transitionTo(PatchTaskStatus.TRIGGERED);
  }

  private async cleanupProcess(
    gameId: string,
    serviceId: string,
    pid: number | null,
  ) {
    const profile =
      GAME_SERVICE_PROFILES[serviceId as AppConfig["serviceChannel"]];
    const useAdmin = this.context.getConfig("skipDaumGameStarterUac") !== true;

    if (pid) {
      eventBus.emit(EventType.PROCESS_WILL_TERMINATE, this.context, { pid });
      PowerShellManager.getInstance()
        .execute(`taskkill /PID ${pid} /F /T`, useAdmin)
        .catch(() => {});
    }

    if (profile) {
      for (const keyword of profile.processKeywords) {
        PowerShellManager.getInstance()
          .execute(`taskkill /IM "${keyword}.exe" /F /T`, useAdmin)
          .catch(() => {});
      }
    }
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

  public addReservation(reservation: PatchReservation) {
    const config = this.context.getConfig() as AppConfig;
    const updated = [...(config.patchReservations || []), reservation];
    setConfigWithEvent("patchReservations", updated);
  }

  public deleteReservation(id: string) {
    this.removeReservation(id);
  }

  public async stop(): Promise<void> {
    for (const timer of this.scheduledTimers.values()) clearTimeout(timer);
    this.scheduledTimers.clear();
    if (this.stateTimeout) clearTimeout(this.stateTimeout);
    if (this.abnormalExitTimeout) clearTimeout(this.abnormalExitTimeout);
    this.cleanupExecutionListeners();
    this.reservationQueue = [];
    this.isProcessing = false;
    this.currentContext = null;
    this.status = PatchTaskStatus.IDLE;
  }
}

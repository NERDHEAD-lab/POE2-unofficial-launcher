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
  EventType,
  IService,
  LogSessionStartEvent,
  LogPatchFinishedEvent,
  LogGameStartupEvent,
  ProcessEvent,
  PatchRetryRequestedEvent,
  PatchReservationFailedEvent,
  PatchReservationSuccessEvent,
  ProcessWillTerminateEvent,
  ConfigChangeEvent,
  PatchUiTitleTickEvent,
} from "../events/types";
import { setConfigWithEvent } from "../utils/config-utils";
import { logger } from "../utils/logger";
import { PowerShellManager } from "../utils/powershell";

export class PatchReservationService implements IService {
  public readonly id = "PatchReservationService";
  // Map to store active timer for each reservation ID
  private scheduledTimers = new Map<string, NodeJS.Timeout>();

  // Queue for sequential execution
  private reservationQueue: PatchReservation[] = [];
  private isProcessing = false;

  private activeTimeouts = new Map<string, NodeJS.Timeout>();
  private currentActivePid: number | null = null;
  // [v42] Changed from Map (timeouts) to Set (keys) because backup timer is removed
  private pendingResolutionKeys = new Set<string>();
  private abnormalExitTimeouts = new Map<string, NodeJS.Timeout>();

  // Dynamic listener IDs for cleanup
  private dynamicListenerIds: Map<EventType, string> = new Map();

  constructor(private context: AppContext) {
    this.initEventListeners();
  }

  public async init(): Promise<void> {
    // Initial schedule refresh (also handles missed reservations)
    this.refreshSchedules();
  }

  private initEventListeners() {
    // [Persistent] Listen for config changes to refresh scheduled timers
    eventBus.on(EventType.CONFIG_CHANGE, (event: ConfigChangeEvent) => {
      if (event.payload.key === "patchReservations") {
        this.refreshSchedules();
      }
    });

    // Handle Retry Requests (from Abnormal Exit or Silence)
    eventBus.on(
      EventType.PATCH_RETRY_REQUESTED,
      (event: PatchRetryRequestedEvent) => {
        const { gameId, serviceId, retryCount } = event.payload;
        this.triggerPatch(
          {
            id: `retry_${Date.now()}`,
            gameId: gameId as AppConfig["activeGame"],
            serviceId: serviceId as AppConfig["serviceChannel"],
            targetTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          retryCount,
        );
      },
    );
  }

  /**
   * Subscribes to execution-related events only when a patch starts.
   */
  private subscribeExecutionEvents() {
    this.cleanupExecutionListeners(); // Ensure clean state

    const id0 = eventBus.on(
      EventType.LOG_SESSION_START,
      (event: LogSessionStartEvent) => {
        const { gameId, serviceId, pid } = event.payload;
        const taskKey = `${gameId}_${serviceId}`;

        // [v42] PID Rotation Check: Clear any "Abnormal Exit" timer if a new session starts for same task
        if (this.abnormalExitTimeouts.has(taskKey)) {
          logger.log(
            `[PatchReservation] PID Rotation detected for ${taskKey}. New PID: ${pid}. Continuing...`,
          );
          clearTimeout(this.abnormalExitTimeouts.get(taskKey));
          this.abnormalExitTimeouts.delete(taskKey);
        }

        this.currentActivePid = pid;
        logger.log(
          `[PatchReservation] Tracking PID ${this.currentActivePid} for current assignment.`,
        );
      },
    );

    const id1 = eventBus.on(
      EventType.LOG_PATCH_FINISHED,
      (event: LogPatchFinishedEvent) => {
        this.handlePatchFinished(event.payload);
      },
    );

    const id2 = eventBus.on(
      EventType.LOG_GAME_STARTUP,
      (event: LogGameStartupEvent) => {
        this.handleGameStartup(event.payload);
      },
    );

    const id3 = eventBus.on(
      EventType.PATCH_RESERVATION_SUCCESS,
      (event: PatchReservationSuccessEvent) => {
        const { gameId, serviceId } = event.payload;
        const key = `${gameId}_${serviceId}`;
        const timeout = this.activeTimeouts.get(key);
        if (timeout) {
          clearTimeout(timeout);
          this.activeTimeouts.delete(key);
          logger.log(
            `[PatchReservation] Silence timeout cleared for ${key}. Waiting for log result...`,
          );
        }
        // Note: Do NOT finishCurrentAndContinue() here. Wait for LOG events to trigger notification.
      },
    );

    const id4 = eventBus.on(
      EventType.PATCH_RESERVATION_FAILED,
      (event: PatchReservationFailedEvent) => {
        this.notifyFailure(event.payload);
        this.finishCurrentAndContinue();
      },
    );

    const id5 = eventBus.on(
      EventType.PATCH_UI_TITLE_TICK,
      (event: PatchUiTitleTickEvent) => {
        this.handleUiTitleTick(event.payload);
      },
    );

    const id6 = eventBus.on(EventType.PROCESS_STOP, (event: ProcessEvent) => {
      this.handleProcessStop(event.payload);
    });

    this.dynamicListenerIds.set(EventType.LOG_SESSION_START, id0);
    this.dynamicListenerIds.set(EventType.LOG_PATCH_FINISHED, id1);
    this.dynamicListenerIds.set(EventType.LOG_GAME_STARTUP, id2);
    this.dynamicListenerIds.set(EventType.PATCH_RESERVATION_SUCCESS, id3);
    this.dynamicListenerIds.set(EventType.PATCH_RESERVATION_FAILED, id4);
    this.dynamicListenerIds.set(EventType.PATCH_UI_TITLE_TICK, id5);
    this.dynamicListenerIds.set(EventType.PROCESS_STOP, id6);

    logger.log(
      `[PatchReservation] Dynamic execution listeners subscribed (Queue: ${this.reservationQueue.length}).`,
    );
  }

  /**
   * Removes all dynamic execution listeners.
   */
  private cleanupExecutionListeners() {
    this.dynamicListenerIds.forEach((id, type) => {
      eventBus.off(type, id);
    });
    this.dynamicListenerIds.clear();
    this.currentActivePid = null;
    logger.log("[PatchReservation] Dynamic execution listeners unsubscribed.");
  }

  private refreshSchedules() {
    // Clear all existing timers
    for (const timer of this.scheduledTimers.values()) {
      clearTimeout(timer);
    }
    this.scheduledTimers.clear();

    const config = this.context.getConfig() as AppConfig;
    const reservations = config.patchReservations || [];
    const now = new Date();

    const missed: PatchReservation[] = [];
    const future: PatchReservation[] = [];

    // Categorize reservations
    reservations.forEach((res) => {
      if (new Date(res.targetTime) <= now) {
        missed.push(res);
      } else {
        future.push(res);
      }
    });

    // 1. Handle Missed (Catch-up) with Deduplication
    if (missed.length > 0) {
      // Deduplicate: same game+service -> keep latest
      const dedupMap = new Map<string, PatchReservation>();
      missed.forEach((m) => {
        const key = `${m.gameId}_${m.serviceId}`;
        const existing = dedupMap.get(key);
        if (
          !existing ||
          new Date(m.targetTime) > new Date(existing.targetTime)
        ) {
          dedupMap.set(key, m);
        }
      });

      // Add deduped missed to queue
      dedupMap.forEach((res) => {
        this.enqueue(res);
        this.removeReservation(res.id); // Remove from config as it's now in queue
      });
    }

    // 2. Schedule Future
    future.forEach((res) => {
      const delay = new Date(res.targetTime).getTime() - now.getTime();
      const timer = setTimeout(() => {
        this.enqueue(res);
        this.removeReservation(res.id);
        this.scheduledTimers.delete(res.id);
      }, delay);
      this.scheduledTimers.set(res.id, timer);
    });

    logger.log(
      `[PatchReservation] Schedules refreshed. Missed: ${missed.length}, Future: ${future.length}`,
    );
  }

  private enqueue(res: PatchReservation) {
    if (this.reservationQueue.some((q) => q.id === res.id)) return;
    this.reservationQueue.push(res);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing || this.reservationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const nextItem = this.reservationQueue[0];

    // [Subscription] Start listening for events per task
    this.subscribeExecutionEvents();

    logger.log(
      `[PatchReservation] Processing queue - Current: ${nextItem.gameId}_${nextItem.serviceId}`,
    );
    await this.triggerPatch(nextItem);
  }

  private finishCurrentAndContinue() {
    this.reservationQueue.shift();
    this.isProcessing = false;

    // Explicit Unsubscribe after EACH task completion (triggered by notification)
    this.cleanupExecutionListeners();

    // Clear any dangling status from the finished task
    this.pendingResolutionKeys.clear();

    for (const timeout of this.abnormalExitTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.abnormalExitTimeouts.clear();

    for (const timeout of this.activeTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.activeTimeouts.clear();

    this.processQueue();
  }

  private async triggerPatch(res: PatchReservation, retryCount: number = 0) {
    const key = `${res.gameId}_${res.serviceId}`;
    logger.log(
      `[PatchReservation] Triggering patch for ${key} (Attempt: ${retryCount + 1})`,
    );

    // 1. Register expectation in AutoPatchHandler
    registerAutoPatchExpectation(res.gameId, res.serviceId, retryCount);

    // 2. Temporarily set config to the reserved game/service
    setConfigWithEvent("activeGame", res.gameId as AppConfig["activeGame"]);
    setConfigWithEvent(
      "serviceChannel",
      res.serviceId as AppConfig["serviceChannel"],
    );

    // 3. Set silence timeout (60s)
    if (this.activeTimeouts.has(key)) {
      clearTimeout(this.activeTimeouts.get(key)!);
    }

    const timeout = setTimeout(() => {
      logger.warn(`[PatchReservation] Silence timeout (60s) for ${key}.`);
      this.activeTimeouts.delete(key);
      eventBus.emit(EventType.PATCH_RETRY_REQUESTED, this.context, {
        gameId: res.gameId,
        serviceId: res.serviceId,
        retryCount: retryCount + 1,
      });
    }, 60000);

    this.activeTimeouts.set(key, timeout);

    // 4. Emit start event
    eventBus.emit(EventType.UI_GAME_START_CLICK, this.context, undefined);
  }

  private handlePatchFinished(payload: LogPatchFinishedEvent["payload"]) {
    const { gameId, serviceId } = payload;
    const taskKey = `${gameId}_${serviceId}`;

    // Verify this event belongs to the CURRENT reservation
    const currentRes = this.reservationQueue[0];
    if (
      !currentRes ||
      currentRes.gameId !== gameId ||
      currentRes.serviceId !== serviceId
    ) {
      logger.log(
        `[PatchReservation] Ignoring LOG_PATCH_FINISHED for ${taskKey} (Not the current reserved task)`,
      );
      return;
    }

    // [v42] No more 30s timeout. Just mark as waiting for UI/Startup resolution.
    this.pendingResolutionKeys.add(taskKey);

    logger.log(
      `[PatchReservation] Patch finished detected for ${taskKey}. Waiting for UI "완료" or Game Startup...`,
    );
  }

  private async handleGameStartup(payload: LogGameStartupEvent["payload"]) {
    const { pid, gameId, serviceId } = payload;
    const taskKey = `${gameId}_${serviceId}`;

    const terminateAfterPatch =
      this.context.getConfig("terminateAfterPatch") !== false;

    // Case 1: Game started AFTER patch detected (within the checking phase)
    // -> This means "No Update" because the game launched immediately after checking files.
    if (this.pendingResolutionKeys.has(taskKey)) {
      this.pendingResolutionKeys.delete(taskKey); // Ensure cleanup
      logger.log(
        `[PatchReservation] Game startup detected after patch check for ${taskKey}. No update found.`,
      );
      this.notifyUpdateResult(gameId, serviceId, false);

      if (terminateAfterPatch) {
        await this.cleanupProcess(gameId, serviceId, pid);
      } else {
        logger.log(
          `[PatchReservation] No update found but terminateAfterPatch is disabled. PID ${pid} remains alive.`,
        );
      }

      this.finishCurrentAndContinue();
      return;
    }

    // Case 2: Game started DIRECTLY (No Update)
    if (this.currentActivePid === pid) {
      logger.log(
        `[PatchReservation] Game startup detected directly (No Update) for PID ${pid}.`,
      );
      this.notifyUpdateResult(gameId, serviceId, false);

      if (terminateAfterPatch) {
        await this.cleanupProcess(gameId, serviceId, pid);
      } else {
        logger.log(
          `[PatchReservation] Direct startup detected but terminateAfterPatch is disabled. PID ${pid} remains alive.`,
        );
      }

      this.finishCurrentAndContinue();
    }
  }

  private async handleUiTitleTick(payload: PatchUiTitleTickEvent["payload"]) {
    const { title, gameId, serviceId, pid } = payload;
    const taskKey = `${gameId}_${serviceId}`;

    const currentRes = this.reservationQueue[0];
    if (
      !currentRes ||
      currentRes.gameId !== gameId ||
      currentRes.serviceId !== serviceId
    ) {
      return;
    }

    // [v42] Optimization: Trigger "Update Success" immediately if UI says "완료" (Done)
    // ONLY use the following user-provided completion strings
    const isDone =
      /Done|Pronto|Завершено|Fertig|Hecho|Terminé|완료|完了|เสร็จสิ้น|完成/i.test(
        title,
      );

    if (
      isDone &&
      this.pendingResolutionKeys.has(taskKey) &&
      gameId &&
      serviceId
    ) {
      logger.log(
        `[PatchReservation] UI status "완료" detected for ${taskKey}. Closing patcher...`,
      );
      this.pendingResolutionKeys.delete(taskKey);

      this.notifyUpdateResult(gameId, serviceId, true);

      // [v42 FIX] Always attempt cleanup if title "완료" is seen, respecting config
      const terminateAfterPatch =
        this.context.getConfig("terminateAfterPatch") !== false;
      if (terminateAfterPatch) {
        await this.cleanupProcess(gameId, serviceId, pid);
      } else {
        logger.log(
          `[PatchReservation] terminateAfterPatch is disabled. PID ${pid} remains alive.`,
        );
      }

      this.finishCurrentAndContinue();
    }
  }

  private handleProcessStop(payload: { pid: number; name: string }) {
    const { pid } = payload;

    // If the process we were tracking just stopped
    if (this.currentActivePid === pid) {
      logger.log(`[PatchReservation] Process stopped: PID ${pid}`);

      // [v42] Case A: PID Rotation Check -> Wait 10s
      // If the process stops while reservation is active, we MUST wait for potential PID rotation (Starter -> Patcher)
      // or check if it was truly finished (which should have been handled by handleUiTitleTick).
      const currentRes = this.reservationQueue[0];
      if (currentRes) {
        const taskKey = `${currentRes.gameId}_${currentRes.serviceId}`;
        logger.warn(
          `[PatchReservation] Process stopped for ${taskKey}. Waiting 10s for PID Rotation or confirming exit...`,
        );

        const timeout = setTimeout(() => {
          // If 10s passed and we are still in this state, it's a FAILURE
          // because if it were successful, handleUiTitleTick or handleGameStartup would have cleared these states.
          logger.error(
            `[PatchReservation] No new process detected after 10s for ${taskKey}. Marking as FAILED.`,
          );
          this.abnormalExitTimeouts.delete(taskKey);

          this.notifyFailure({
            gameId: currentRes.gameId,
            serviceId: currentRes.serviceId,
            reason:
              "사용자 중단 혹은 프로세스가 비정상 종료되었습니다. (완료 확인 불가)",
          });
          this.finishCurrentAndContinue();
        }, 10000);

        this.abnormalExitTimeouts.set(taskKey, timeout);
        return;
      }

      this.currentActivePid = null;
    }
  }

  private emitLog(content: string) {
    logger.log(`[PatchReservation] ${content}`);
  }

  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  private notifyUpdateResult(
    gameId: string,
    serviceId: string,
    isUpdated: boolean,
  ) {
    logger.log(
      `[PatchReservation-DEBUG] notifyUpdateResult called. gameId: ${gameId}, serviceId: ${serviceId}, isUpdated (success): ${isUpdated}`,
    );
    try {
      throw new Error("TRACE_LOG");
    } catch (e: unknown) {
      if (e instanceof Error) {
        logger.log(
          `[PatchReservation-DEBUG] Stack trace for notifyUpdateResult(${isUpdated}):\n${e.stack}`,
        );
      }
    }

    const config = this.context.getConfig() as AppConfig;
    const isSilent = config.silentPatchNotification === true;

    const currentRes = this.reservationQueue[0];
    const timePrefix = currentRes
      ? `[${this.formatTime(currentRes.targetTime)}] `
      : "";

    const title = isUpdated ? "예약 패치 완료" : "업데이트 없음";
    const body = isUpdated
      ? `${timePrefix}[${serviceId}] ${gameId} 패치 예약 동작이 성공적으로 완료되었습니다.`
      : `${timePrefix}[${serviceId}] ${gameId} 패치를 시도했으나 업데이트가 없었습니다.`;

    if (!isSilent && Notification.isSupported()) {
      new Notification({
        title,
        body,
        timeoutType: "never",
      }).show();
    }

    logger.log(
      `[PatchReservation] ${isSilent ? "(SILENT) " : ""}Notification: ${body}`,
    );
  }

  private notifyFailure(payload: PatchReservationFailedEvent["payload"]) {
    const config = this.context.getConfig() as AppConfig;
    const isSilent = config.silentPatchNotification === true;

    const currentRes = this.reservationQueue[0];
    const timePrefix = currentRes
      ? `[${this.formatTime(currentRes.targetTime)}] `
      : "";

    const { gameId, serviceId, reason } = payload;
    const title = "예약 패치 실패";
    const body = `${timePrefix}[${serviceId}] ${gameId} 패치 예약에 실패했습니다.\n사유: ${reason}`;

    if (!isSilent && Notification.isSupported()) {
      new Notification({
        title,
        body,
        urgency: "critical",
        timeoutType: "never",
      }).show();
    }

    logger.error(
      `[PatchReservation] ${isSilent ? "(SILENT) " : ""}FINAL FAILURE: ${body}`,
    );

    const key = `${gameId}_${serviceId}`;
    if (this.activeTimeouts.get(key)) {
      clearTimeout(this.activeTimeouts.get(key)!);
      this.activeTimeouts.delete(key);
    }
  }

  private async cleanupProcess(
    gameId: string,
    serviceId: string,
    pid: number | null,
  ) {
    logger.log(
      `[PatchReservation] Cleaning up process for ${gameId} (${serviceId}). Target PID: ${pid}`,
    );

    const uacBypassEnabled =
      this.context.getConfig("skipDaumGameStarterUac") === true;
    const useAdmin = !uacBypassEnabled;

    // [v34 FIX] Try to kill by PID first if provided
    if (pid) {
      eventBus.emit(EventType.PROCESS_WILL_TERMINATE, this.context, {
        pid,
      } as ProcessWillTerminateEvent["payload"]);

      PowerShellManager.getInstance().execute(
        `taskkill /PID ${pid} /F /T`,
        useAdmin,
      );

      if (this.currentActivePid === pid) {
        this.currentActivePid = null;
      }
    }

    // [v34 FIX] Also kill ALL related processes for the game/service to handle PID changes (Kakao Games case)
    const profile =
      GAME_SERVICE_PROFILES[serviceId as AppConfig["serviceChannel"]];
    if (profile) {
      this.emitLog(
        `[PatchReservation] Performing broad cleanup for ${serviceId} keywords: ${profile.processKeywords.join(", ")}`,
      );
      for (const keyword of profile.processKeywords) {
        PowerShellManager.getInstance()
          .execute(`taskkill /IM "${keyword}.exe" /F /T`, useAdmin)
          .catch(() => {
            // Silently ignore if no processes found with that name
          });
      }
    }
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
    for (const timer of this.scheduledTimers.values()) {
      clearTimeout(timer);
    }
    this.scheduledTimers.clear();

    this.pendingResolutionKeys.clear();

    for (const timeout of this.abnormalExitTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.abnormalExitTimeouts.clear();

    for (const timeout of this.activeTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.activeTimeouts.clear();

    this.cleanupExecutionListeners(); // Cleanup on stop
    this.reservationQueue = [];
    this.isProcessing = false;
  }
}

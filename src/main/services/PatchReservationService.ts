import { Notification } from "electron";

import { PatchReservation, AppConfig } from "../../shared/types";
import { eventBus } from "../events/EventBus";
import { registerAutoPatchExpectation } from "../events/handlers/AutoPatchHandler";
import {
  AppContext,
  EventType,
  LogPatchFinishedEvent,
  LogGameStartupEvent,
  PatchRetryRequestedEvent,
  PatchReservationFailedEvent,
  PatchReservationSuccessEvent,
  ProcessWillTerminateEvent,
} from "../events/types";
import { setConfigWithEvent } from "../utils/config-utils";
import { logger } from "../utils/logger";
import { PowerShellManager } from "../utils/powershell";

export class PatchReservationService {
  private timer: NodeJS.Timeout | null = null;
  // Key: gameId_serviceId
  private activeTimeouts = new Map<string, NodeJS.Timeout>();
  private pendingChecks = new Map<
    number,
    {
      id: string;
      gameId: string;
      serviceId: string;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(private context: AppContext) {
    this.startScheduler();
    this.initEventListeners();
  }

  private startScheduler() {
    this.timer = setInterval(() => {
      this.checkReservations();
    }, 1000 * 30); // Check every 30 seconds
  }

  private initEventListeners() {
    // Listen for patch finished
    eventBus.on(
      EventType.LOG_PATCH_FINISHED,
      (event: LogPatchFinishedEvent) => {
        this.handlePatchFinished(event.payload);
      },
    );

    // Listen for game startup
    eventBus.on(EventType.LOG_GAME_STARTUP, (event: LogGameStartupEvent) => {
      this.handleGameStartup(event.payload);
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

    // Handle Success
    eventBus.on(
      EventType.PATCH_RESERVATION_SUCCESS,
      (event: PatchReservationSuccessEvent) => {
        const { gameId, serviceId } = event.payload;
        const key = `${gameId}_${serviceId}`;
        const timeout = this.activeTimeouts.get(key);
        if (timeout) {
          clearTimeout(timeout);
          this.activeTimeouts.delete(key);
          logger.log(`[PatchReservation] Success confirmed for ${key}.`);
        }
      },
    );

    // Handle Ultimate Failure
    eventBus.on(
      EventType.PATCH_RESERVATION_FAILED,
      (event: PatchReservationFailedEvent) => {
        this.notifyFailure(event.payload);
      },
    );
  }

  private async checkReservations() {
    const config = this.context.getConfig() as AppConfig;
    const reservations = config.patchReservations || [];
    const now = new Date();

    const due = reservations.filter((res) => new Date(res.targetTime) <= now);

    for (const res of due) {
      await this.triggerPatch(res);
      this.removeReservation(res.id);
    }
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
    const { pid, gameId, serviceId } = payload;

    // 1. Set 1 minute timer (This is to check if it automatically transitions to game)
    const timeout = setTimeout(() => {
      this.notifyUpdateResult(gameId, serviceId, true);
      this.cleanupProcess(pid);
    }, 60000);

    this.pendingChecks.set(pid, {
      id: pid.toString(),
      gameId,
      serviceId,
      timeout,
    });
  }

  private handleGameStartup(payload: LogGameStartupEvent["payload"]) {
    const { pid, gameId, serviceId } = payload;
    const check = this.pendingChecks.get(pid);

    if (check) {
      // Game started within 1 minute of patch finish -> No update was needed
      clearTimeout(check.timeout);
      this.notifyUpdateResult(gameId, serviceId, false);
      this.cleanupProcess(pid);
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
    const body = isUpdated
      ? `[${serviceId}] ${gameId} 패치 예약 동작이 성공적으로 완료되었습니다.`
      : `[${serviceId}] ${gameId} 패치를 시도했으나 업데이트가 없었습니다.`;

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

    logger.error(
      `[PatchReservation] ${isSilent ? "(SILENT) " : ""}FINAL FAILURE: ${body}`,
    );

    // Cleanup timeout if any
    const key = `${gameId}_${serviceId}`;
    if (this.activeTimeouts.has(key)) {
      clearTimeout(this.activeTimeouts.get(key)!);
      this.activeTimeouts.delete(key);
    }
  }

  private cleanupProcess(pid: number) {
    logger.log(`[PatchReservation] Cleaning up process ${pid}`);

    // Emit intentional stop event BEFORE killing to avoid abnormal exit detection
    eventBus.emit(EventType.PROCESS_WILL_TERMINATE, this.context, {
      pid,
    } as ProcessWillTerminateEvent["payload"]);

    // Use PowerShellManager for taskkill
    const uacBypassEnabled =
      this.context.getConfig("skipDaumGameStarterUac") === true;
    PowerShellManager.getInstance().execute(
      `taskkill /PID ${pid} /F /T`,
      !uacBypassEnabled,
    );

    this.pendingChecks.delete(pid);
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

  public stop() {
    if (this.timer) clearInterval(this.timer);
    for (const check of this.pendingChecks.values()) {
      clearTimeout(check.timeout);
    }
    this.pendingChecks.clear();
    for (const timeout of this.activeTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.activeTimeouts.clear();
  }
}

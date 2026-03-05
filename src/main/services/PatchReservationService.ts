import { Notification } from "electron";

import { PatchReservation, AppConfig } from "../../shared/types";
import { eventBus } from "../events/EventBus";
import {
  AppContext,
  EventType,
  LogPatchFinishedEvent,
  LogGameStartupEvent,
} from "../events/types";
import { setConfigWithEvent } from "../utils/config-utils";
import { logger } from "../utils/logger";
import { PowerShellManager } from "../utils/powershell";

export class PatchReservationService {
  private timer: NodeJS.Timeout | null = null;
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

  private async triggerPatch(res: PatchReservation) {
    logger.log(
      `[PatchReservation] Triggering patch for ${res.gameId} (${res.serviceId})`,
    );

    // Trigger Game Start event which will handle authentication and patching
    // We need to ensure the active config matches the reservation for a moment or pass data
    // The current architecture uses global config for game start.

    // In actual implementation, we'd emit UI_GAME_START_CLICK or a direct start command
    // but we need to ensure right game/service is targeted.

    // For now, let's assume we want to trigger the specific start handler.
    // However, the cleanest way is to use existing UI_GAME_START_CLICK after setting config.

    // 1. Temporarily set config to the reserved game/service
    setConfigWithEvent("activeGame", res.gameId);
    setConfigWithEvent("serviceChannel", res.serviceId);

    // 2. Emit start event
    eventBus.emit(EventType.UI_GAME_START_CLICK, this.context, undefined);
  }

  private handlePatchFinished(payload: LogPatchFinishedEvent["payload"]) {
    const { pid, gameId, serviceId } = payload;

    // 1. Set 1 minute timer
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
    const title = isUpdated ? "업데이트 완료" : "업데이트 없음";
    const body = isUpdated
      ? `[${serviceId}] ${gameId} 업데이트가 완료되었습니다.`
      : `[${serviceId}] ${gameId} 업데이트가 없습니다.`;

    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }

    logger.log(`[PatchReservation] Notification: ${body}`);
  }

  private cleanupProcess(pid: number) {
    logger.log(`[PatchReservation] Cleaning up process ${pid}`);

    // Use PowerShellManager for taskkill (as in Korean Mode)
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
  }
}

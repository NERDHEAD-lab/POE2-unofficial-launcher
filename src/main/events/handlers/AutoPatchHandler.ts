import { PatchManager } from "../../services/PatchManager";
import { getGameInstallPath } from "../../utils/registry";
import {
  AppContext,
  EventHandler,
  EventType,
  LogErrorDetectedEvent,
} from "../types";

// Simple polling helper to wait for process exit
const waitForProcessExit = async (
  processName: string,
  timeoutMs: number = 30000,
): Promise<boolean> => {
  const start = Date.now();
  // Dynamic import to avoid circular dep if process utils are elsewhere
  // But we reused `ProcessWatcher` logic or `ps-list` wrapper in `process.ts`
  const { isProcessRunning } = await import("../../utils/process"); // Assuming this exists or similar

  while (Date.now() - start < timeoutMs) {
    const running = await isProcessRunning(processName);
    if (!running) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

export class AutoPatchHandler implements EventHandler<LogErrorDetectedEvent> {
  public id = "AutoPatchHandler";
  public targetEvent: EventType.LOG_ERROR_DETECTED =
    EventType.LOG_ERROR_DETECTED;

  private patchManager: PatchManager;

  constructor(context: AppContext) {
    this.patchManager = new PatchManager(context);

    // Also listen for Manual trigger from IPC (We will wire this up in main.ts possibly,
    // or handle manual execution here if we had a MANAGED_EVENT for manual trigger)
    // For now, IPC calls will likely invoke `patchManager` directly or via a wrapper.
    // But let's expose patchManager to Instance if needed, or keep it private.
  }

  // Public accessor for Main to use in IPC
  public getManager() {
    return this.patchManager;
  }

  public async handle(event: LogErrorDetectedEvent, context: AppContext) {
    console.log(
      `[AutoPatchHandler] Error Detected! Count: ${event.payload.errorCount}`,
    );

    // 1. Check Auto-Fix Setting
    const autoFix = context.store.get("autoFixPatchError", false);
    const serviceId = event.payload.serviceId;
    const gameId = event.payload.gameId;

    // 2. Determine Process Name to wait for
    // Kakao: PathOfExile_KG.exe or POE2_KG...
    // We should probably look at what ProcessWatcher detected or use Config.
    // For simplicity, let's wait for generic names.
    const targetProcess =
      serviceId === "Kakao Games" ? "PathOfExile_KG.exe" : "PathOfExile.exe"; // Simplified

    // 3. Notify User (if not auto-fix, or even if auto-fix but as toast)
    // If Manual: Show Modal requesting confirmation -> "Close Game & Fix"
    // If Auto: Show Toast "Error detected, fixing after exit..." -> Wait -> Fix

    if (autoFix) {
      // Auto Mode
      console.log(
        "[AutoPatchHandler] Auto-Fix ENABLED. Waiting for process exit...",
      );
      // Show Toast/Notification via MessageEvent or direct IPC?
      // eventBus.emit(EventType.MESSAGE_GAME_PROGRESS_INFO, ...);

      // Wait for exit
      const exited = await waitForProcessExit(targetProcess);
      if (exited) {
        const installPath = await getGameInstallPath(serviceId, gameId);
        if (installPath) {
          // Trigger UI Modal in "Auto/Progress" mode
          context.mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
            autoStart: true,
          });

          // Start Patch
          await this.patchManager.startSelfDiagnosis(installPath, serviceId);
        }
      } else {
        console.warn(
          "[AutoPatchHandler] Process did not exit. Aborting auto-fix.",
        );
      }
    } else {
      // Manual Mode
      // Trigger UI Modal in "Confirm" mode
      context.mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
        autoStart: false,
        serviceId,
        gameId,
      });
    }
  }
}

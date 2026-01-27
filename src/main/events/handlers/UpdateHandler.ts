// import { autoUpdater } from "electron-updater";

import { UpdateStatus } from "../../../shared/types";
import {
  AppContext,
  EventHandler,
  EventType,
  UIUpdateCheckEvent,
} from "../types";

/**
 * Handler to process 'check-for-updates' requests.
 * Currently MOCKED to simulate update available state for UI testing.
 */

// Keep track if events are already bound to avoid duplicate listeners
// let isAutoUpdaterBound = false;

export const UpdateHandler: EventHandler<UIUpdateCheckEvent> = {
  id: "UpdateHandler",
  targetEvent: EventType.UI_UPDATE_CHECK,

  condition: () => true,

  handle: async (_event, context: AppContext) => {
    // FIX: Send update events to Main Window (Launcher UI), not Game Window
    const window = context.mainWindow;
    if (!window || window.isDestroyed()) return;

    console.log("[UpdateHandler] Checking for updates (MOCK)...");

    // 1. Notify Checking
    window.webContents.send("update-status-change", {
      state: "checking",
    } as UpdateStatus);

    // Simulate Network Delay and Update Availability
    setTimeout(() => {
      // 2. Notify Update Available (Mock)
      console.log("[UpdateHandler] Update available (MOCK v0.0.9)!");
      if (!window.isDestroyed()) {
        window.webContents.send("update-status-change", {
          state: "available",
          version: "0.0.9", // Fake version newer than 0.0.1
        } as UpdateStatus);
      }
    }, 3000);
  },
};

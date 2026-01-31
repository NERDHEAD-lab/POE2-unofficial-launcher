import { BrowserWindow } from "electron";

import { DEBUG_APP_CONFIG } from "../../../shared/config";
import { logger } from "../../utils/logger";
import { AppContext, EventHandler, EventType, ProcessEvent } from "../types";

export const CleanupLauncherWindowHandler: EventHandler<ProcessEvent> = {
  id: "CleanupLauncherWindowHandler",
  targetEvent: EventType.PROCESS_START,

  condition: (event, _context: AppContext) => {
    // Trigger cleanup when ANY Launcher starts
    const launcherNames = ["poe2_launcher.exe", "poe_launcher.exe"];
    return launcherNames.includes(event.payload.name.toLowerCase());
  },

  handle: async (event, context) => {
    logger.log(
      `[CleanupHandler] Launcher Detected (${event.payload.name})! Cleaning up windows...`,
    );

    // Force cleanup all windows except mainWindow
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
      // 1. Skip Main Window
      if (win === context.mainWindow) continue;

      // 2. Handle Game Window (Reset & Hide)
      if (context.gameWindow && win === context.gameWindow) {
        if (!win.isDestroyed()) {
          try {
            await win.loadURL("about:blank");
          } catch (e) {
            logger.error(`[CleanupHandler] Failed to unload URL: ${e}`);
          }
          win.hide();
        }
        continue;
      }

      // 3. Close Any Other Windows (Popups, etc.)
      if (!win.isDestroyed()) {
        // [Fix] Check by reference or custom title/hash
        const isDebugWindow =
          context.debugWindow && win === context.debugWindow;

        if (isDebugWindow) {
          logger.log("[CleanupHandler] Skipping Debug Console cleanup.");
          continue;
        }

        const url = win.webContents.getURL();
        if (
          url.includes(DEBUG_APP_CONFIG.HASH) ||
          win.title === DEBUG_APP_CONFIG.TITLE
        ) {
          logger.log(
            "[CleanupHandler] Skipping Debug Console cleanup (matched by title/URL).",
          );
          continue;
        }

        logger.log(
          `[CleanupHandler] Closing auxiliary window: ${win.title} (ID: ${win.id}, URL: ${url})`,
        );
        win.close();
      }
    }

    logger.log(`[CleanupHandler] Cleanup complete.`);
  },
};

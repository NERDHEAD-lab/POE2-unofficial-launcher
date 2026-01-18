import { BrowserWindow } from "electron";

import { AppContext, EventHandler, EventType, ProcessEvent } from "../types";

export const CleanupPoe2WindowHandler: EventHandler<ProcessEvent> = {
  id: "CleanupPoe2WindowHandler",
  targetEvent: EventType.PROCESS_START,

  condition: (_context: AppContext) => {
    // Condition logic is moved inside handle or we can check payload here if we had access to event?
    // EventHandler.condition only gets context.
    // So we must handle specific process check inside 'handle' logic because 'condition' doesn't receive the event payload.
    return true;
  },

  handle: async (event, context) => {
    // 'event' is inferred as ProcessEvent. payload is { name: string }
    const payload = event.payload;

    if (!payload || !payload.name) return;

    // Check if the started process is the POE2 Launcher
    if (payload.name.toLowerCase() === "poe2_launcher.exe") {
      console.log(
        `[CleanupHandler] POE2 Launcher Detected! Cleaning up windows...`,
      );

      // Force cleanup all windows except mainWindow
      const allWindows = BrowserWindow.getAllWindows();
      for (const win of allWindows) {
        // 1. Skip Main Window
        if (win === context.mainWindow) continue;

        // 2. Handle Game Window (Reset & Hide)
        if (win === context.gameWindow) {
          if (!win.isDestroyed()) {
            try {
              await win.loadURL("about:blank");
            } catch (e) {
              console.error(`[CleanupHandler] Failed to unload URL: ${e}`);
            }
            win.hide();
          }
          continue;
        }

        // 3. Close Any Other Windows (Popups, etc.)
        // Note: This might close DevTools if it's a separate window, but acceptable for cleanup.
        if (!win.isDestroyed()) {
          console.log(
            `[CleanupHandler] Closing auxiliary window: ${win.title} (ID: ${win.id})`,
          );
          win.close();
        }
      }

      console.log(`[CleanupHandler] Cleanup complete.`);
    }
  },
};

import { BrowserWindow } from "electron";

import { logger } from "../../utils/logger";
import {
  AppContext,
  EventHandler,
  EventType,
  SyncDevToolsVisibilityEvent,
} from "../types";

export const DevToolsVisibilityHandler: EventHandler<SyncDevToolsVisibilityEvent> =
  {
    id: "DevToolsVisibilityHandler",
    targetEvent: EventType.SYNC_DEVTOOLS_VISIBILITY,

    handle: async (event, context: AppContext) => {
      const { mainWindow } = context;

      // 1. Check Global Conditions
      // Main window visibility is the primary gatekeeper for Tray logic
      const isAppVisible = !!(
        mainWindow &&
        !mainWindow.isDestroyed() &&
        mainWindow.isVisible()
      );

      // Config check
      const isConfigOn =
        context.getConfig("show_inactive_window_console") === true;

      // Final Decision: Show only if App is Visible AND Config is ON
      const shouldOpen = isAppVisible && isConfigOn;

      logger.log(
        `[DevToolsHandler] Syncing State. Visible: ${isAppVisible}, Config: ${isConfigOn} => Open: ${shouldOpen}`,
      );

      // 2. Apply to ALL Windows
      BrowserWindow.getAllWindows().forEach((win) => {
        if (win.isDestroyed()) return;

        if (shouldOpen) {
          if (!win.webContents.isDevToolsOpened()) {
            win.webContents.openDevTools({ mode: "detach" });
          }
        } else {
          if (win.webContents.isDevToolsOpened()) {
            win.webContents.closeDevTools();
          }
        }
      });
    },
  };

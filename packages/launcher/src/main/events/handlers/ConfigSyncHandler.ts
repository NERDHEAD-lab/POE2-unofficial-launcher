import { BrowserWindow } from "electron";

import {
  AppContext,
  ConfigChangeEvent,
  ConfigDeleteEvent,
  EventType,
  EventHandler,
} from "../types";

/**
 * Handler to synchronize configuration changes across all renderer windows.
 */
export const ConfigChangeSyncHandler: EventHandler<ConfigChangeEvent> = {
  id: "ConfigChangeSyncHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  handle: async (event, context: AppContext) => {
    const windows = [
      context.mainWindow,
      context.debugWindow,
      context.gameWindow,
    ];

    const { key, newValue } = event.payload;

    windows.forEach((win: BrowserWindow | null) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("config-changed", key, newValue);
      }
    });
  },
};

/**
 * Handler to synchronize configuration deletions across all renderer windows.
 */
export const ConfigDeleteSyncHandler: EventHandler<ConfigDeleteEvent> = {
  id: "ConfigDeleteSyncHandler",
  targetEvent: EventType.CONFIG_DELETE,

  handle: async (event, context: AppContext) => {
    const windows = [
      context.mainWindow,
      context.debugWindow,
      context.gameWindow,
    ];

    const { key } = event.payload;

    windows.forEach((win: BrowserWindow | null) => {
      if (win && !win.isDestroyed()) {
        // Send 'undefined' to trigger key removal in renderer's state
        win.webContents.send("config-changed", key, undefined);
      }
    });
  },
};

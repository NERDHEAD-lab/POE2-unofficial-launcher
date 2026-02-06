import { app } from "electron";

import { AppConfig } from "../../../shared/types";
import { getConfig } from "../../store";
import { logger } from "../../utils/logger";
import {
  AppContext,
  ConfigChangeEvent,
  EventHandler,
  EventType,
} from "../types";

/**
 * Synchronizes the Auto Launch setting with the current executable path.
 * This ensures that if the user moves the app, the startup registry entry is updated to the new path.
 */
export const syncAutoLaunch = () => {
  // Current State Resolution
  const currentConfig = getConfig() as AppConfig;
  const shouldAutoLaunch = currentConfig.autoLaunch === true;
  const shouldStartMinimized = currentConfig.startMinimized === true;

  logger.log(
    `[AutoLaunch] Syncing settings: OpenAtLogin=${shouldAutoLaunch}, Minimized=${shouldStartMinimized}`,
  );

  if (!app.isPackaged) {
    logger.log(
      `[AutoLaunch] Dev mode detected. Skipping OS registration. (HIDDEN_ARG=${shouldStartMinimized ? '"--hidden"' : "NONE"})`,
    );
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: shouldAutoLaunch,
    openAsHidden: false, // Legacy macOS option (we use args instead for cross-platform control)
    path: app.getPath("exe"),
    args: shouldStartMinimized ? ["--hidden"] : [],
  });
};

export const AutoLaunchHandler: EventHandler<ConfigChangeEvent> = {
  id: "AutoLaunchHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) => {
    const key = event.payload.key;
    return key === "autoLaunch" || key === "startMinimized";
  },

  handle: async (_event, _context: AppContext) => {
    syncAutoLaunch();
  },
};

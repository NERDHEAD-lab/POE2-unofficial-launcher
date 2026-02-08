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
 * Synchronizes the Auto Launch setting via standard Electron API (Registry Run Key).
 */
export const syncAutoLaunch = async () => {
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

  try {
    app.setLoginItemSettings({
      openAtLogin: shouldAutoLaunch,
      openAsHidden: shouldStartMinimized,
      args: shouldStartMinimized ? ["--hidden"] : [],
    });
    logger.log("[AutoLaunch] Standard login item settings updated.");
  } catch (e) {
    logger.error("[AutoLaunch] Failed to update login item settings:", e);
  }
};

export const AutoLaunchHandler: EventHandler<ConfigChangeEvent> = {
  id: "AutoLaunchHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) => {
    const key = event.payload.key;
    return key === "autoLaunch" || key === "startMinimized";
  },

  handle: async (_event, _context: AppContext) => {
    await syncAutoLaunch();
  },
};

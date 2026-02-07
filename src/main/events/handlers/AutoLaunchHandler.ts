import { app } from "electron";

import { AppConfig } from "../../../shared/types";
import { getConfig } from "../../store";
import { logger } from "../../utils/logger";
import { AutoLaunchFeature } from "../../utils/uac-bypass";
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
export const syncAutoLaunch = async () => {
  // Current State Resolution
  const currentConfig = getConfig() as AppConfig;
  const shouldAutoLaunch = currentConfig.autoLaunch === true;
  const shouldStartMinimized = currentConfig.startMinimized === true;
  const runAsAdmin = currentConfig.runAsAdmin === true;

  logger.log(
    `[AutoLaunch] Syncing settings: OpenAtLogin=${shouldAutoLaunch}, Minimized=${shouldStartMinimized}, Admin=${runAsAdmin}`,
  );

  if (!app.isPackaged) {
    logger.log(
      `[AutoLaunch] Dev mode detected. Skipping OS registration. (HIDDEN_ARG=${shouldStartMinimized ? '"--hidden"' : "NONE"})`,
    );
    return;
  }

  if (shouldAutoLaunch) {
    if (runAsAdmin) {
      // 1. Admin Mode: Use Task Scheduler
      logger.log(
        "[AutoLaunch] Configuring Admin AutoLaunch (Task Scheduler)...",
      );
      await AutoLaunchFeature.enable(true, shouldStartMinimized);
    } else {
      // 2. Normal Mode: Use Registry
      logger.log("[AutoLaunch] Configuring User AutoLaunch (Registry)...");
      await AutoLaunchFeature.enable(false, shouldStartMinimized);
    }
  } else {
    // Disable All
    logger.log("[AutoLaunch] Disabling all AutoLaunch methods...");
    await AutoLaunchFeature.disable();
  }
};

export const AutoLaunchHandler: EventHandler<ConfigChangeEvent> = {
  id: "AutoLaunchHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) => {
    const key = event.payload.key;
    return (
      key === "autoLaunch" || key === "startMinimized" || key === "runAsAdmin"
    );
  },

  handle: async (_event, _context: AppContext) => {
    await syncAutoLaunch();
  },
};

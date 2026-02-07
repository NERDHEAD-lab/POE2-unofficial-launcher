import { app } from "electron";

import { AppConfig } from "../../../shared/types";
import { getConfig } from "../../store";
import { setupAdminAutoLaunch } from "../../utils/admin";
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
      // Clean up legacy registry entry first to avoid double launch
      logger.log("[AutoLaunch] Removing User AutoLaunch (Registry)...");
      app.setLoginItemSettings({
        openAtLogin: false,
        path: app.getPath("exe"),
      });

      // Register Task
      await setupAdminAutoLaunch(true, shouldStartMinimized);
    } else {
      // 2. Normal Mode: Use Registry (Electron API)
      logger.log("[AutoLaunch] Configuring User AutoLaunch (Registry)...");
      // Clean up Admin Task first
      logger.log("[AutoLaunch] Removing Admin AutoLaunch (Task Scheduler)...");
      await setupAdminAutoLaunch(false);

      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false,
        path: app.getPath("exe"),
        args: shouldStartMinimized ? ["--hidden"] : [],
      });
    }
  } else {
    // Disable All
    logger.log("[AutoLaunch] Disabling all AutoLaunch methods...");
    logger.log("[AutoLaunch] Removing User AutoLaunch (Registry)...");
    app.setLoginItemSettings({
      openAtLogin: false,
      path: app.getPath("exe"),
    });
    logger.log("[AutoLaunch] Removing Admin AutoLaunch (Task Scheduler)...");
    await setupAdminAutoLaunch(false);
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

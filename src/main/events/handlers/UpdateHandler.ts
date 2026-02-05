import { app } from "electron";
import { autoUpdater } from "electron-updater";

import { UpdateStatus } from "../../../shared/types";
import { logger } from "../../utils/logger";
import {
  AppContext,
  EventHandler,
  EventType,
  UIUpdateCheckEvent,
  UIUpdateDownloadEvent,
  UIUpdateInstallEvent,
} from "../types";

// Configure autoUpdater
autoUpdater.autoDownload = false; // Manual download trigger required
autoUpdater.autoInstallOnAppQuit = true;

// Prevent duplicate listeners
let isListenerAttached = false;
let currentCheckIsSilent = false;
let lastEmittedPercent = -1; // For throttling progress updates

const sendStatus = (context: AppContext, status: UpdateStatus) => {
  const win = context.mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send("update-status-change", {
      ...status,
      isSilent: currentCheckIsSilent,
    });
  }
};

const attachUpdateListeners = (context: AppContext) => {
  if (isListenerAttached) return;

  autoUpdater.on("checking-for-update", () => {
    logger.log("[UpdateHandler] Checking for updates...");
    sendStatus(context, { state: "checking" });
  });

  let lastVersionInfo = "";

  autoUpdater.on("update-available", (info) => {
    lastVersionInfo = info.version; // Store version for progress updates
    logger.log(
      `[UpdateHandler] Update available: ${info.version} (Current: ${app.getVersion()}, Silent: ${currentCheckIsSilent})`,
    );
    sendStatus(context, { state: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", (info) => {
    logger.log(
      `[UpdateHandler] Update not available. (Current: ${app.getVersion()}, Latest: ${info.version})`,
    );
    sendStatus(context, { state: "idle" });
  });

  autoUpdater.on("error", (err) => {
    logger.error("[UpdateHandler] Update error:", err);
    sendStatus(context, { state: "idle" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    // Only send updates if percent increased by at least 10%
    // to prevent flooding the event bus and UI logs.
    const currentPercent = Math.floor(progressObj.percent / 10) * 10;
    if (currentPercent !== lastEmittedPercent) {
      lastEmittedPercent = currentPercent;
      sendStatus(context, {
        state: "downloading",
        progress: progressObj.percent,
        version: lastVersionInfo,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    logger.log(`[UpdateHandler] Update downloaded: ${info.version}`);
    sendStatus(context, { state: "downloaded", version: info.version });
    lastEmittedPercent = -1; // Reset for next time
  });

  isListenerAttached = true;
};

/**
 * Starts a periodic update check in the background.
 * Periodic checks are always 'silent' (don't show popup).
 */
export const startUpdateCheckInterval = (context: AppContext) => {
  const ONE_HOUR = 1000 * 60 * 60;
  const UPDATE_INTERVAL = ONE_HOUR * 4; // Check every 4 hours

  logger.log("[UpdateHandler] Initializing background update scheduler.");

  setInterval(async () => {
    logger.log("[UpdateHandler] Background update check triggered.");
    currentCheckIsSilent = true; // Background checks are silent
    attachUpdateListeners(context);
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      logger.error("[UpdateHandler] Background check failed:", e);
    }
  }, UPDATE_INTERVAL);
};

/**
 * Handler: Check for Updates
 */
export const UpdateCheckHandler: EventHandler<UIUpdateCheckEvent> = {
  id: "UpdateCheckHandler",
  targetEvent: EventType.UI_UPDATE_CHECK,

  condition: () => true,

  handle: async (_event, context: AppContext) => {
    currentCheckIsSilent = false; // Manual/Startup trigger is NOT silent
    attachUpdateListeners(context);

    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      logger.error("[UpdateHandler] Failed check:", e);
    }
  },
};

/**
 * Handler: Start Download
 */
export const UpdateDownloadHandler: EventHandler<UIUpdateDownloadEvent> = {
  id: "UpdateDownloadHandler",
  targetEvent: EventType.UI_UPDATE_DOWNLOAD,

  condition: () => true,

  handle: async (_event, context: AppContext) => {
    logger.log("[UpdateHandler] Requesting download...");
    currentCheckIsSilent = false; // Downloading is usually explicit
    attachUpdateListeners(context);
    await autoUpdater.downloadUpdate();
  },
};

/**
 * Handler: Install & Restart
 */
export const UpdateInstallHandler: EventHandler<UIUpdateInstallEvent> = {
  id: "UpdateInstallHandler",
  targetEvent: EventType.UI_UPDATE_INSTALL,

  condition: () => true,

  handle: async (_event, _context: AppContext) => {
    logger.log(
      `[UpdateHandler] Requesting install & quit... (Current EXE: ${app.getPath("exe")})`,
    );

    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      logger.log(
        "[UpdateHandler] Dev mode detected. Skipping actual quitAndInstall.",
      );
      return;
    }
    autoUpdater.quitAndInstall(true, true); // Enforce Silent Install (isSilent: true)
  },
};

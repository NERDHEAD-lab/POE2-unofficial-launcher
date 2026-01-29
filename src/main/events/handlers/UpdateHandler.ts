import { app } from "electron";
import { autoUpdater } from "electron-updater";

import { UpdateStatus } from "../../../shared/types";
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
    console.log("[UpdateHandler] Checking for updates...");
    sendStatus(context, { state: "checking" });
  });

  let lastVersionInfo = "";

  autoUpdater.on("update-available", (info) => {
    lastVersionInfo = info.version; // Store version for progress updates
    console.log(
      `[UpdateHandler] Update available: ${info.version} (Current: ${app.getVersion()}, Silent: ${currentCheckIsSilent})`,
    );
    sendStatus(context, { state: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log(
      `[UpdateHandler] Update not available. (Current: ${app.getVersion()}, Latest: ${info.version})`,
    );
    sendStatus(context, { state: "idle" });
  });

  autoUpdater.on("error", (err) => {
    console.error("[UpdateHandler] Update error:", err);
    sendStatus(context, { state: "idle" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    sendStatus(context, {
      state: "downloading",
      progress: progressObj.percent,
      version: lastVersionInfo, // [Fix] Include version during download
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[UpdateHandler] Update downloaded: ${info.version}`);
    sendStatus(context, { state: "downloaded", version: info.version });
  });

  isListenerAttached = true;
};

/**
 * [NEW] Starts a periodic update check in the background.
 * Periodic checks are always 'silent' (don't show popup).
 */
export const startUpdateCheckInterval = (context: AppContext) => {
  const ONE_HOUR = 1000 * 60 * 60;
  const UPDATE_INTERVAL = ONE_HOUR * 4; // Check every 4 hours

  console.log("[UpdateHandler] Initializing background update scheduler.");

  setInterval(async () => {
    console.log("[UpdateHandler] Background update check triggered.");
    currentCheckIsSilent = true; // Background checks are silent
    attachUpdateListeners(context);
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      console.error("[UpdateHandler] Background check failed:", e);
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
      console.error("[UpdateHandler] Failed check:", e);
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
    console.log("[UpdateHandler] Requesting download...");
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
    console.log("[UpdateHandler] Requesting install & quit...");

    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      console.log(
        "[UpdateHandler] Dev mode detected. Skipping actual quitAndInstall.",
      );
      return;
    }
    autoUpdater.quitAndInstall(true, true); // [Fix] Enforce Silent Install (isSilent: true)
  },
};

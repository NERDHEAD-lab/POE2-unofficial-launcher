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

const attachUpdateListeners = (context: AppContext) => {
  if (isListenerAttached) return;

  const sendStatus = (status: UpdateStatus) => {
    const win = context.mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send("update-status-change", status);
    }
  };

  autoUpdater.on("checking-for-update", () => {
    console.log("[UpdateHandler] Checking for updates...");
    sendStatus({ state: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[UpdateHandler] Update available: ${info.version}`);
    sendStatus({ state: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[UpdateHandler] Update not available.");
    sendStatus({ state: "idle" }); // or 'not-available' if UI supports it
  });

  autoUpdater.on("error", (err) => {
    console.error("[UpdateHandler] Update error:", err);
    sendStatus({ state: "idle" }); // Reset to idle on error
  });

  autoUpdater.on("download-progress", (_progressObj) => {
    // console.log(`[UpdateHandler] Progress: ${progressObj.percent}%`);
    // UI doesn't currently support progress bar, but we can send checking/downloading state
    // sendStatus({ state: "downloading" ... });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[UpdateHandler] Update downloaded: ${info.version}`);
    sendStatus({ state: "downloaded", version: info.version });
  });

  isListenerAttached = true;
};

/**
 * Handler: Check for Updates
 */
export const UpdateCheckHandler: EventHandler<UIUpdateCheckEvent> = {
  id: "UpdateCheckHandler",
  targetEvent: EventType.UI_UPDATE_CHECK,

  condition: () => true,

  handle: async (_event, context: AppContext) => {
    attachUpdateListeners(context);

    // Skip check if dev environment (unless configured otherwise)
    // if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    //   console.log("[UpdateHandler] Skipping update check in Dev mode.");
    //   return;
    // }

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
    autoUpdater.quitAndInstall(false, true);
  },
};

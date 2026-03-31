import axios from "axios";
import { app } from "electron";
import { autoUpdater } from "electron-updater";

import { UpdateStatus, ChangelogItem } from "../../../shared/types";
import { changelogService } from "../../services/ChangelogService";
import { logger } from "../../utils/logger";
import { PowerShellManager } from "../../utils/powershell";
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

  autoUpdater.on("update-available", async (info) => {
    lastVersionInfo = info.version; // Store version for progress updates
    logger.log(
      `[UpdateHandler] Update available: ${info.version} (Current: ${app.getVersion()}, Silent: ${currentCheckIsSilent})`,
    );

    // Fetch changelogs for the update
    const changelogs = await changelogService.fetchChangelogs(
      info.version,
      app.getVersion(),
    );

    sendStatus(context, {
      state: "available",
      version: info.version,
      changelogs,
    });
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
 * Checks for updates smartly by verifying the tag first via GitHub API.
 * This prevents unnecessary downloads of `latest.yml` which inflates download counts.
 */
const checkForUpdatesSmart = async () => {
  try {
    const repo = "NERDHEAD-lab/POE2-unofficial-launcher";
    const url = `https://api.github.com/repos/${repo}/releases/latest`;

    logger.log(
      `[UpdateHandler] Smart Check: Fetching latest release from ${url}`,
    );
    const response = await axios.get(url, { timeout: 5000 });

    if (response.status === 200 && response.data?.tag_name) {
      const latestTag = response.data.tag_name; // e.g., "v0.7.0" or "0.7.0"
      const currentVersion = app.getVersion();

      // Remove 'v' prefix for comparison if present
      const cleanLatest = latestTag.replace(/^v/, "");
      const cleanCurrent = currentVersion.replace(/^v/, "");

      logger.log(
        `[UpdateHandler] Smart Check: Latest=${cleanLatest}, Current=${cleanCurrent}`,
      );

      // Simple string comparison for now as versions are strictly numeric + dots
      // In a real semver scenario, we'd use 'semver' package, but let's assume standard format.
      // Actually, simple string comparison "0.7.0" vs "0.6.3" works, but "0.10.0" < "0.9.0" in string.
      // We should be careful. Let's split and compare numbers.
      const parseVersion = (v: string) => v.split(".").map(Number);
      const [lMa, lMi, lPa] = parseVersion(cleanLatest);
      const [cMa, cMi, cPa] = parseVersion(cleanCurrent);

      let isNewer = false;
      if (lMa > cMa) isNewer = true;
      else if (lMa === cMa && lMi > cMi) isNewer = true;
      else if (lMa === cMa && lMi === cMi && lPa > cPa) isNewer = true;

      if (!isNewer) {
        logger.log(
          "[UpdateHandler] Smart Check: App is up to date (or newer). Skipping autoUpdater.",
        );
        return; // EXIT: Do not trigger autoUpdater
      }

      logger.log(
        "[UpdateHandler] Smart Check: New version detected. Triggering autoUpdater...",
      );
    }
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 403) {
      logger.warn(
        "[UpdateHandler] GitHub API Rate Limit exceeded (403). Falling back to standard check.",
      );
    } else {
      logger.error(
        "[UpdateHandler] Smart Check failed. Falling back to standard check.",
        e,
      );
    }
  }

  // Fallback or explicit update required
  await autoUpdater.checkForUpdates();
};

/**
 * Triggers an update check immediately.
 * @param context App context
 * @param isSilent Whether to suppress UI popups if an update is found
 */
export const triggerUpdateCheck = async (
  context: AppContext,
  isSilent = false,
) => {
  if (!app.isPackaged || process.env.VITE_DEV_SERVER_URL) {
    logger.log(`[UpdateHandler] Skipping update check in development mode.`);
    return;
  }

  logger.log(
    `[UpdateHandler] Manual/Triggered update check (isSilent: ${isSilent})`,
  );
  currentCheckIsSilent = isSilent;
  attachUpdateListeners(context);

  try {
    await checkForUpdatesSmart();
  } catch (e) {
    logger.error("[UpdateHandler] Failed check:", e);
  }
};

/**
 * Handler: Check for Updates
 */
export const UpdateCheckHandler: EventHandler<UIUpdateCheckEvent> = {
  id: "UpdateCheckHandler",
  targetEvent: EventType.UI_UPDATE_CHECK,

  condition: () => true,

  handle: async (event, context: AppContext) => {
    const isSilent = event.payload?.isSilent ?? false;
    await triggerUpdateCheck(context, isSilent);
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

  handle: async (event, _context: AppContext) => {
    const isSilent = event.payload?.isSilent ?? true;

    logger.log(
      `[UpdateHandler] Requesting install & quit... (isSilent: ${isSilent}, Current EXE: ${app.getPath("exe")})`,
    );

    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      logger.log(
        "[UpdateHandler] Dev mode detected. Skipping actual quitAndInstall.",
      );
      return;
    }

    // [Safety] Cleanup PowerShell sessions before quitting to ensure no file locks
    try {
      PowerShellManager.getInstance().cleanup();
    } catch (e) {
      logger.error("[UpdateHandler] Failed to cleanup PowerShell sessions:", e);
    }

    autoUpdater.quitAndInstall(isSilent, true);
  },
};

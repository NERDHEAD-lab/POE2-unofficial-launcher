import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  session,
  screen,
} from "electron";
import JSZip from "jszip";

import { eventBus } from "./events/EventBus";
import { DEBUG_APP_CONFIG } from "../shared/config";
import { getGameName, getLauncherTitle } from "../shared/naming";
import {
  AppConfig,
  RunStatus,
  NewsCategory,
  DebugLogPayload,
} from "../shared/types";
import {
  AutoLaunchHandler,
  syncAutoLaunch,
} from "./events/handlers/AutoLaunchHandler";
import {
  LogSessionHandler,
  LogWebRootHandler,
  LogErrorHandler,
  AutoPatchProcessStopHandler,
  PatchProgressHandler,
  triggerPendingManualPatches,
  cancelPendingPatches,
} from "./events/handlers/AutoPatchHandler";
import { ChangelogCheckHandler } from "./events/handlers/ChangelogCheckHandler";
import { ChangelogUISyncHandler } from "./events/handlers/ChangelogUISyncHandler";
import { CleanupLauncherWindowHandler } from "./events/handlers/CleanupLauncherWindowHandler";
import {
  ConfigChangeSyncHandler,
  ConfigDeleteSyncHandler,
} from "./events/handlers/ConfigSyncHandler";
import { DebugLogHandler } from "./events/handlers/DebugLogHandler";
import { DevToolsVisibilityHandler } from "./events/handlers/DevToolsVisibilityHandler";
import { GameInstallCheckHandler } from "./events/handlers/GameInstallCheckHandler";
import {
  GameProcessStartHandler,
  GameProcessStopHandler,
} from "./events/handlers/GameProcessStatusHandler";
import { GameStatusSyncHandler } from "./events/handlers/GameStatusSyncHandler";
import { InactiveWindowVisibilityHandler } from "./events/handlers/InactiveWindowVisibilityHandler";
import { StartPoe1KakaoHandler } from "./events/handlers/StartPoe1KakaoHandler";
import { StartPoe2KakaoHandler } from "./events/handlers/StartPoe2KakaoHandler";
import { StartPoeGggHandler } from "./events/handlers/StartPoeGggHandler";
import { SystemWakeUpHandler } from "./events/handlers/SystemWakeUpHandler";
import { UacHandler } from "./events/handlers/UacHandler";
import {
  UpdateCheckHandler,
  UpdateDownloadHandler,
  UpdateInstallHandler,
  startUpdateCheckInterval,
  triggerUpdateCheck,
} from "./events/handlers/UpdateHandler";
import {
  AppContext,
  ConfigChangeEvent,
  ConfigDeleteEvent,
  EventType,
  GameStatusChangeEvent,
  EventHandler,
  AppEvent,
  UIUpdateCheckEvent,
  UIUpdateDownloadEvent,
  UIUpdateInstallEvent,
  UpdateWindowTitleEvent,
  DebugLogEvent,
} from "./events/types";
import { initKakaoSession, KAKAO_PARTITION } from "./kakao/session";
import { trayManager } from "./managers/TrayManager"; // Added
import { setupSessionSecurity } from "./security/permissions";
import { changelogService } from "./services/ChangelogService";
import { LogWatcher } from "./services/LogWatcher";
import { newsService } from "./services/NewsService";
import { PatchManager } from "./services/PatchManager";
import { ProcessWatcher } from "./services/ProcessWatcher";
import {
  getConfig,
  setConfig,
  deleteConfig,
  setupStoreObservers,
  default as store,
} from "./store";
import {
  isAdmin,
  relaunchAsAdmin,
  ensureAdminSession,
  isAdminSessionActive,
} from "./utils/admin";
import {
  setupMainLogger,
  logger,
  getLogHistory,
  printBanner,
} from "./utils/logger";
import { PowerShellManager } from "./utils/powershell";
import { getGameInstallPath, isGameInstalled } from "./utils/registry";
import { syncInstallLocation } from "./utils/registry";
import { LegacyUacManager, SimpleUacBypass } from "./utils/uac/uac-migration";
import {
  applyResolutionRules,
  enforceConstraints,
} from "./utils/window-resolution";

/**
 * Checks if the launcher version has changed since the last run.
 * If changed, triggers the Changelog check sequence.
 */
async function checkLauncherVersionUpdate(_context: AppContext) {
  const currentVersion = app.getVersion();
  const storedVersion = getConfig("launcherVersion") as string;

  if (currentVersion !== storedVersion) {
    logger.log(
      `[Main] Version changed: ${storedVersion || "none"} -> ${currentVersion}. Updating config.`,
    );
    setConfig("launcherVersion", currentVersion);

    // Emit Config Change Event manually to trigger ChangelogHandler
    // We only trigger if there WAS a previous version (not fresh install)
    if (storedVersion) {
      eventBus.emit<ConfigChangeEvent>(EventType.CONFIG_CHANGE, appContext, {
        key: "launcherVersion",
        oldValue: storedVersion,
        newValue: currentVersion,
      });
    }
  }
}

// --- Global State for Interruption Handling ---
let currentSystemStatus: RunStatus = "idle";
let currentActiveContext: {
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
} | null = null;

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public");

let mainWindow: BrowserWindow | null;
let gameWindow: BrowserWindow | null;
let debugWindow: BrowserWindow | null = null; // Debug Window Reference

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

// Track the current game/service being launched to sync context to popups
interface SessionContext {
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
}

let activeSessionContext: SessionContext | null = null;

// Reliable mapping of window IDs to their game context
const windowContextMap = new Map<number, SessionContext>();

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.log("[Main] Another instance is already running. Quitting...");
  app.quit();
} else {
  app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
    logger.log("[Main] Second instance detected. Focusing existing window...");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();

      // [Trigger] Check for updates silently when a second instance tries to launch
      if (appContext) {
        triggerUpdateCheck(appContext, true);
      }
    }
  });
}

// Debug Constants
const FORCE_DEBUG = process.env.VITE_SHOW_GAME_WINDOW === "true";
const DEBUG_KEYS = [
  "dev_mode",
  "debug_console",
  "show_inactive_windows",
  "show_inactive_window_console",
];

/**
 * Get configuration value considering environment variable priority.
 * This does not persist the forced value to the store.
 */
function getEffectiveConfig(
  key?: string,
  ignoreDependencies = false,
  includeForced = true,
): unknown {
  // 1. Full Config Object
  if (!key) {
    const raw = getConfig() as Record<string, unknown>;
    const effective = { ...raw };
    DEBUG_KEYS.forEach((k) => {
      effective[k] = getEffectiveConfig(k, ignoreDependencies, includeForced);
    });
    return effective;
  }

  // 2. Force Debug Mode via Env Var
  if (includeForced && FORCE_DEBUG && DEBUG_KEYS.includes(key)) {
    return true;
  }

  // 3. Resolve Dependency: If dev_mode is disabled, force dependent keys to false
  if (!ignoreDependencies && DEBUG_KEYS.includes(key) && key !== "dev_mode") {
    const isDevMode = getEffectiveConfig("dev_mode") === true;
    if (!isDevMode) {
      return false;
    }
  }

  const value = getConfig(key);
  return value;
}

// Security: Explicitly blocked permissions
// Security: Permissions are now handled in src/main/security/permissions.ts

// IPC Handlers for Configuration
ipcMain.handle(
  "config:get",
  (_event, key?: string, ignoreDependencies = false, includeForced = true) => {
    return getEffectiveConfig(key, ignoreDependencies, includeForced);
  },
);

ipcMain.handle("config:is-forced", (_event, key: string) => {
  return FORCE_DEBUG && DEBUG_KEYS.includes(key);
});

ipcMain.on("debug-log:send", (_event, log: DebugLogPayload) => {
  if (appContext) {
    eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, appContext, log);
  }
});

ipcMain.on("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle("debug:get-history", () => {
  return getLogHistory();
});

// [Removed] Old session:logout handler (duplicates new partitioned one)

ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
  // [Safety] Do not persist if the key is forced in dev:test mode
  if (FORCE_DEBUG && DEBUG_KEYS.includes(key)) {
    logger.warn(`[Main] config:set ignored for forced key: ${key}`);
    return;
  }

  const oldValue = getConfig(key);

  // Optimization: Only update and emit if value has changed
  const oldStr = JSON.stringify(oldValue);
  const newStr = JSON.stringify(value);

  if (oldStr === newStr) {
    return;
  }

  setConfig(key, value);

  // Dispatch Config Change Event (Sync Handler will handle UI broadcast)
  if (appContext) {
    eventBus.emit<ConfigChangeEvent>(EventType.CONFIG_CHANGE, appContext, {
      key,
      oldValue,
      newValue: value,
    });
  }
});

ipcMain.handle("config:delete", (_event, key: string) => {
  const oldValue = getConfig(key);
  deleteConfig(key);

  // Dispatch Config Delete Event (Sync Handler will handle UI broadcast)
  if (appContext) {
    eventBus.emit<ConfigDeleteEvent>(EventType.CONFIG_DELETE, appContext, {
      key,
      oldValue,
    });
  }
});

ipcMain.handle(
  "report:save",
  async (_event, files: { name: string; content: string }[]) => {
    if (!files || files.length === 0) return false;

    try {
      const win = BrowserWindow.fromWebContents(_event.sender);
      if (!win) return false;

      if (files.length === 1) {
        // Single File: Direct Save
        const file = files[0];
        const ext = path.extname(file.name) || ".txt";
        const { filePath, canceled } = await dialog.showSaveDialog(win, {
          title: "Save Report File",
          defaultPath: file.name,
          filters: [
            { name: "Report File", extensions: [ext.replace(".", "")] },
          ],
        });

        if (canceled || !filePath) return false;
        await fs.writeFile(filePath, file.content);
        return true;
      } else {
        // Multi Files: Zip & Save
        const zip = new JSZip();
        files.forEach((f) => {
          zip.file(f.name, f.content);
        });

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

        const { filePath, canceled } = await dialog.showSaveDialog(win, {
          title: "Save Report ZIP",
          defaultPath: "report.zip",
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (canceled || !filePath) return false;
        await fs.writeFile(filePath, zipBuffer);
        return true;
      }
    } catch (error) {
      logger.error("[Main] Failed to save report:", error);
      return false;
    }
  },
);

ipcMain.handle("file:get-hash", async (_event, filePath: string) => {
  try {
    let targetPath = filePath;

    // Resolve URL-like paths (e.g., from VITE assets or data URLs)
    if (filePath.startsWith("data:")) {
      return crypto.createHash("md5").update(filePath).digest("hex");
    }

    if (filePath.startsWith("file://")) {
      targetPath = fileURLToPath(filePath);
    } else if (!path.isAbsolute(filePath) || filePath.startsWith("/")) {
      // Normalize path to handle leading slashes correctly with path.join on Windows
      // path.join('C:\\a', '/b') results in 'C:\\b' on Windows, which we want to avoid.
      const normalizedFilePath = filePath.replace(/^\/+/, "");

      // Project root directory
      const projectRoot = app.isPackaged ? app.getAppPath() : process.cwd();

      // In dev mode, assets are served from /src/renderer/assets or /public
      // In prod mode, they are in the packaged app
      const possiblePaths = [
        path.join(process.env.VITE_PUBLIC || "", normalizedFilePath),
        path.join(projectRoot, "dist", normalizedFilePath),
        path.join(projectRoot, normalizedFilePath.replace(/\//g, path.sep)),
        path.join(
          projectRoot,
          "src/renderer",
          normalizedFilePath.replace(/\//g, path.sep),
        ),
      ];

      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          targetPath = p;
          break;
        } catch {
          continue;
        }
      }
    }

    const fileBuffer = await fs.readFile(targetPath);
    return crypto.createHash("md5").update(fileBuffer).digest("hex");
  } catch (error) {
    logger.error(`[Hash] Failed to get hash for ${filePath}:`, error);
    return "";
  }
});

// --- News Dashboard IPC Handlers ---
ipcMain.handle(
  "news:get",
  async (
    _event,
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => {
    return newsService.fetchNewsList(game, service, category);
  },
);

ipcMain.handle(
  "news:get-cache",
  (
    _event,
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => {
    return newsService.getCacheItems({ game, service, category });
  },
);

ipcMain.handle("news:get-content", async (_event, id: string, link: string) => {
  return newsService.fetchNewsContent(id, link);
});

ipcMain.handle("news:get-content-cache", (_event, id: string) => {
  return newsService.getContentFromCache(id);
});

ipcMain.handle("news:mark-as-read", async (_event, id: string) => {
  return newsService.markAsRead(id);
});

ipcMain.handle("news:mark-multiple-as-read", async (_event, ids: string[]) => {
  return newsService.markMultipleAsRead(ids);
});

ipcMain.handle("shell:open-external", async (_event, url: string) => {
  return shell.openExternal(url);
});

ipcMain.handle(
  "app:get-path",
  (_event, name: Parameters<typeof app.getPath>[0]) => {
    return app.getPath(name);
  },
);

ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
  return shell.openPath(targetPath);
});

// --- UAC Bypass IPC Handlers ---
ipcMain.on("uac-migration:confirm", async () => {
  logger.log("[Main] User confirmed UAC Migration.");
  await LegacyUacManager.cleanupLegacy();

  const key = "skipDaumGameStarterUac";
  const oldValue = getConfig(key);
  const newValue = true;

  // 1. Update Store
  setConfig(key, newValue);

  // 2. Emit Event to trigger UacHandler & UI Sync
  if (appContext) {
    eventBus.emit<ConfigChangeEvent>(EventType.CONFIG_CHANGE, appContext, {
      key,
      oldValue,
      newValue,
    });
  }
});

// [Fix] Register Missing UAC Handlers
ipcMain.handle("uac:is-enabled", async () => {
  return await SimpleUacBypass.isRunAsInvokerEnabled();
});

ipcMain.handle("uac:enable", async () => {
  // Logic moved to UacHandler (triggered by setConfig)
  setConfig("skipDaumGameStarterUac", true);
  return true; // Optimistic success (Handler will log error if fails)
});

ipcMain.handle("uac:disable", async () => {
  // Logic moved to UacHandler (triggered by setConfig)
  setConfig("skipDaumGameStarterUac", false);
  return true; // Optimistic success
});

// [New] Legacy UAC Mode Handlers (Test/Fallback)
ipcMain.handle("legacy-uac:is-enabled", async () => {
  return await LegacyUacManager.detectLegacy();
});

// --- Constants ---
const PARTITIONS = {
  KAKAO: KAKAO_PARTITION,
  GGG: "persist:ggg_game",
};

ipcMain.handle("legacy-uac:disable", async () => {
  // cleanupLegacy removes the legacy mode
  return await LegacyUacManager.cleanupLegacy();
});

// --- Admin IPC ---

ipcMain.handle("admin:is-admin", () => isAdmin());
ipcMain.handle("admin:ensure-session", () => ensureAdminSession());
ipcMain.handle("admin:is-session-active", () => isAdminSessionActive());
ipcMain.on("admin:relaunch", () => relaunchAsAdmin());

ipcMain.handle("session:logout", async () => {
  try {
    // 1. Reset Context
    activeSessionContext = null;

    // 2. Close Game Window if exists (Prevents Auth Popups/Reloads)
    if (gameWindow && !gameWindow.isDestroyed()) {
      logger.log("[Main] Closing GameWindow for logout...");
      gameWindow.close();
      gameWindow = null;
      context.gameWindow = null;
    }

    // 3. Clear Storage (Specified Partition)
    const kakaoSession = session.fromPartition(PARTITIONS.KAKAO);
    await kakaoSession.clearStorageData({
      storages: [
        "cookies",
        "localstorage",
        "cachestorage",
        "indexdb",
        "serviceworkers",
      ],
    });
    logger.log(
      `[Main] Session storage cleared for partition: ${PARTITIONS.KAKAO}`,
    );
    return true;
  } catch (error) {
    logger.error("[Main] Failed to clear session storage:", error);
    return false;
  }
});

// --- Shared Window Open Handler Factory ---
const createHandleWindowOpen =
  (parentPartition?: string) =>
  ({ url }: { url: string }) => {
    logger.log(
      `[Main] Window Open Request: ${url} (Partition: ${parentPartition || "default"})`,
    );

    const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
    const showInactive = getEffectiveConfig("show_inactive_windows") === true;

    // Checking forced visibility if creating a popup?
    // Usually popups start hidden until navigation, but if parent is forced, maybe popup should be?
    // For now, keep flash prevention logic.
    const shouldShowAtInit = isDebugEnv || showInactive;

    // Always Allow creation + Always Inject Preload (for automation)
    const result = {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        show: shouldShowAtInit, // Visibility Control (Default Hidden unless Debug)
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: false,
          preload: path.join(__dirname, "kakao/preload.js"), // Always inject
          partition: parentPartition, // Inherit Partition
        },
      },
    } as const;

    return result;
  };

// --- Visibility Control State ---
const forcedVisibleWindows = new Set<number>();

// [IPC] Dynamic Visibility Request from Preload
ipcMain.on(
  "window-visibility-request",
  (
    event,
    isVisible: boolean,
    options?: {
      width?: number;
      height?: number;
      minWidth?: number;
      minHeight?: number;
    },
  ) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return;

    if (isVisible && options) {
      if (options.width && options.height) {
        window.setSize(options.width, options.height);
      }
      if (options.minWidth && options.minHeight) {
        window.setMinimumSize(options.minWidth, options.minHeight);
      }
      logger.log(
        `[Main] Applied window options for ${window.id}: ${JSON.stringify(options)}`,
      );
    }

    const showInactive = getEffectiveConfig("show_inactive_windows") === true;

    if (isVisible) {
      if (!forcedVisibleWindows.has(window.id)) {
        forcedVisibleWindows.add(window.id);
        logger.log(`[Main] Window ${window.id} requested FORCED VISIBILITY.`);
        // If forced, it must show immediately (even if inactive config is off)
        if (!window.isVisible()) {
          window.showInactive();
          window.moveTop();
        }
      }
    } else {
      if (forcedVisibleWindows.has(window.id)) {
        forcedVisibleWindows.delete(window.id);
        logger.log(`[Main] Window ${window.id} released FORCED VISIBILITY.`);

        // If released, check if it should be hidden (Config Check)
        // If "Show Inactive" is OFF, and it's not the Main/Game/Debug window, hide it.
        if (!showInactive) {
          // Double check against context to avoid hiding critical windows mistakenly
          // But logic in InactiveWindowVisibilityHandler handles this.
          // Let's reuse the logic by manual check here for responsiveness.
          const isMainWindow =
            context.mainWindow && context.mainWindow.id === window.id;
          const isGameWindow =
            context.gameWindow && context.gameWindow.id === window.id;
          const isDebugWindow =
            context.debugWindow && context.debugWindow.id === window.id;

          if (!isMainWindow && !isGameWindow && !isDebugWindow) {
            logger.log(
              `[Main] Hiding window ${window.id} (Config is OFF & Force Released)`,
            );
            window.hide();
          }
        }
      }
    }
  },
);

// 2. Initialize Shared Context
const context: AppContext = {
  mainWindow: null,
  gameWindow: null,
  debugWindow: null,

  store,
  isForcedVisible: (windowId: number) => forcedVisibleWindows.has(windowId),
  ensureGameWindow: (options?: { service: string }) => {
    if (!gameWindow || gameWindow.isDestroyed()) {
      const service = options?.service || "Kakao Games"; // Default to Kakao for now
      let partition = PARTITIONS.KAKAO;
      let preloadPath = path.join(__dirname, "kakao/preload.js");

      if (service === "GGG") {
        partition = PARTITIONS.GGG;
        // TODO: Create ggg/preload.js when GGG support is fully implemented.
        // For now, use Kakao preload or a minimal one?
        // Actually, GGG web login might need different preload.
        // Let's use kakao preload as placeholder but isolated.
        preloadPath = path.join(__dirname, "kakao/preload.js");
      }

      gameWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: `POE2 Launcher (${service} Window)`,
        show: false, // 기본 숨김 처리 (플래시 방지)
        webPreferences: {
          preload: preloadPath,
          nodeIntegration: false,
          contextIsolation: true, // Partitioned Game Window needs isolation? Usually yes.
          partition: partition, // Session Isolation based on Service
        },
      });

      // Update Context
      context.gameWindow = gameWindow;

      // Handle closing
      gameWindow.on("closed", () => {
        resetGameStatusIfInterrupted(gameWindow!);
        gameWindow = null;
        context.gameWindow = null;
      });
    }
    return gameWindow!;
  },
  getConfig: (key?: string) => getEffectiveConfig(key),
};

/**
 * Resets the game status back to 'idle' if a critical window is closed
 * while the system is still in an intermediate automation state.
 */
function resetGameStatusIfInterrupted(_win: BrowserWindow) {
  // Only interrupt if we are in a middle-state that requires a window/session
  const interruptibleStates: RunStatus[] = [
    "preparing",
    "processing",
    "authenticating",
  ];

  if (interruptibleStates.includes(currentSystemStatus)) {
    logger.log(
      `[Main] Critical window closed during ${currentSystemStatus}. Resetting to idle.`,
    );

    // Default to POE2/Kakao if context is missing for some reason
    const gameId = currentActiveContext?.gameId || "POE2";
    const serviceId = currentActiveContext?.serviceId || "Kakao Games";

    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      appContext,
      {
        gameId,
        serviceId,
        status: "idle",
      },
    );
  }
}

// 3. Register Global Store Observers
setupStoreObservers(context);

// 4. Register Event Handlers
const handlers = [
  DebugLogHandler,
  ConfigChangeSyncHandler,
  ConfigDeleteSyncHandler,
  StartPoe1KakaoHandler,
  StartPoe2KakaoHandler,
  StartPoeGggHandler,
  CleanupLauncherWindowHandler,
  GameStatusSyncHandler,
  GameProcessStartHandler,
  GameProcessStopHandler,
  GameInstallCheckHandler,
  SystemWakeUpHandler,
  UpdateCheckHandler,
  UpdateDownloadHandler,
  UpdateInstallHandler,
  LogSessionHandler,
  LogWebRootHandler,
  LogErrorHandler,
  AutoPatchProcessStopHandler,
  PatchProgressHandler, // Added
  AutoLaunchHandler, // Added
  DevToolsVisibilityHandler,
  ChangelogCheckHandler,
  ChangelogUISyncHandler,
  UacHandler, // Added
  InactiveWindowVisibilityHandler, // [New] Dynamic Visibility
  {
    id: "UpdateWindowTitleHandler",
    targetEvent: EventType.UPDATE_WINDOW_TITLE,
    handle: async (_event: UpdateWindowTitleEvent, _context: AppContext) => {
      broadcastTitleUpdate();
    },
  },
  {
    id: "DisplaySettingsHandler",
    targetEvent: EventType.CONFIG_CHANGE,
    condition: (event: ConfigChangeEvent) =>
      event.payload.key === "autoResolution" ||
      event.payload.key === "resolutionMode",
    handle: async (event: ConfigChangeEvent, context: AppContext) => {
      // Typed
      const { mainWindow } = context;
      if (mainWindow && !mainWindow.isDestroyed()) {
        const config = getConfig() as AppConfig;
        logger.log(
          `[Main] Display Config Changed: ${event.payload.key} -> ${event.payload.newValue}`,
        );
        const changed = applyResolutionRules(mainWindow, config);
        if (changed) {
          eventBus.emit(EventType.UPDATE_WINDOW_TITLE, context, undefined);
        }
        syncDebugWindow("ConfigChange");
      }
    },
  },
];

// --- Patch IPC ---
ipcMain.on("patch:start-manual", () => {
  if (appContext) {
    logger.log("[Main] Triggering Manual Patch via IPC");
    triggerPendingManualPatches(appContext);
  }
});

ipcMain.on("patch:cancel", () => {
  if (appContext) {
    logger.log("[Main] Cancelling Patch via IPC");
    cancelPendingPatches(appContext);
  }
});

// --- Update Check IPC ---
ipcMain.on("ui:update-check", () => {
  if (appContext) {
    eventBus.emit<UIUpdateCheckEvent>(
      EventType.UI_UPDATE_CHECK,
      appContext,
      undefined,
    );
  }
});

ipcMain.on("ui:update-download", () => {
  if (appContext) {
    eventBus.emit<UIUpdateDownloadEvent>(
      EventType.UI_UPDATE_DOWNLOAD,
      appContext,
      undefined,
    );
  }
});

ipcMain.on("ui:update-install", () => {
  if (appContext) {
    eventBus.emit<UIUpdateInstallEvent>(
      EventType.UI_UPDATE_INSTALL,
      appContext,
      undefined,
    );
  }
});

handlers.forEach((handler) => {
  eventBus.register(handler as EventHandler<AppEvent>);
});

// Track app quitting state to bypass "hide-on-close" behavior
let isQuitting = false;
const BASE_WIDTH = 1440;
const BASE_HEIGHT = 960;

/**
 * Dynamically adjusts window constraints (resizable, size, etc.) based on the current display environment.
 */
function applyIntelligentConstraints(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return;
  const config = getConfig() as AppConfig;
  const changed = applyResolutionRules(win, config);
  if (changed && appContext) {
    eventBus.emit(EventType.UPDATE_WINDOW_TITLE, appContext, undefined);
  }
  syncDebugWindow("IntelligentConstraints");
}

// Global Context
let appContext: AppContext;

// Initialize Services
newsService.init(() => {
  mainWindow?.webContents.send("news:updated");
});

// [Unified] DevTools Visibility Sync Logic
// [Unified] DevTools Visibility Sync Trigger
const triggerDevToolsSync = () => {
  eventBus.emit(EventType.SYNC_DEVTOOLS_VISIBILITY, appContext, {
    source: "triggerDevToolsSync",
  });
};

// Cache for title to prevent spam
let lastBroadcastedTitle: string | null = null;

/**
 * Calculates the current title based on global config/state and broadcasts it
 * to the Window, Tray, and Renderer (via Event).
 */
function broadcastTitleUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const version = app.getVersion();
  const activeGame = (getEffectiveConfig("activeGame") || "POE2") as string;
  const isLowRes =
    screen.getDisplayNearestPoint(mainWindow.getBounds()).workAreaSize.width <
    BASE_WIDTH + 10;

  const gameName = getGameName(activeGame);
  const title = getLauncherTitle(gameName, version, isLowRes);

  // 1. Update Window System Title
  mainWindow.setTitle(title);

  // 2. Update Tray Tooltip
  trayManager.updateTitle(title);

  // 3. Notify Renderer (for UI TitleBar)
  mainWindow.webContents.send("app:title-updated", title);

  // Spam Prevention: Log only if changed
  if (lastBroadcastedTitle !== title) {
    logger.log(`[Main] Title Broadcasted: ${title}`);
    lastBroadcastedTitle = title;
  }
}

function createWindows() {
  // 1. Main Window (UI)
  mainWindow = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    minWidth: 1024,
    minHeight: 683,
    resizable: false, // Will be updated by applyIntelligentConstraints
    maximizable: false, // Will be updated by applyIntelligentConstraints
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(process.env.VITE_PUBLIC as string, "icon.ico"),
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // [Security] Force external links to open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // [Security] Block internal navigation to external sites
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Only allow navigation to internal file:// or localhost (dev)
    const isInternal =
      url.startsWith("file://") ||
      (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL));

    if (!isInternal && (url.startsWith("http:") || url.startsWith("https:"))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Apply initial constraints based on the display it will open on
  applyIntelligentConstraints(mainWindow);

  // Monitor for resolution/DPI changes OR moving between monitors
  screen.on("display-metrics-changed", () => {
    logger.log("[Main] Display metrics changed. Updating UI constraints...");
    applyIntelligentConstraints(mainWindow);
  });

  // Reveal window when ready-to-show
  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Check for --hidden arg (Start Minimized)
      const startHidden = process.argv.includes("--hidden");
      if (!startHidden) {
        mainWindow.show();
        // [Fix] Show Debug Console ONLY AFTER main window is shown to ensure correct Z-order/Focus
        initDebugWindow("AppStart");
      } else {
        logger.log("[Main] Starting hidden (minimized to tray).");
      }

      // [Fix] Defer Version Check/Changelog until Window is Ready
      // A small timeout ensures the renderer has fully initialized and registered IPC listeners.
      setTimeout(async () => {
        if (appContext) {
          checkLauncherVersionUpdate(appContext);
        }

        // [UAC Migration] Trigger In-App Modal if Legacy Detected
        if (await LegacyUacManager.detectLegacy()) {
          logger.log(
            "[Main] Legacy UAC detected. Requesting migration modal...",
          );
          mainWindow?.webContents.send("uac-migration:request");
        }
      }, 1000);
    }
  });

  // Handle Close Action
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      const config = getConfig() as AppConfig;
      if (config.closeAction === "minimize") {
        e.preventDefault();
        mainWindow?.hide();
        logger.log("[Main] Window hidden due to 'minimize' closeAction.");
        return;
      }
    }
    logger.log("[Main] Window closing (quitting).");
  });

  // Visibility Synchronization (Window Hiding/Showing Logic)
  const syncSubWindowsVisibility = (visible: boolean) => {
    const isDebugMode = getEffectiveConfig("dev_mode") === true;
    const showDebugConsole = getEffectiveConfig("debug_console") === true;
    const showInactiveWindows =
      getEffectiveConfig("show_inactive_windows") === true;

    // 1. Manage Debug Window Visibility
    if (debugWindow && !debugWindow.isDestroyed()) {
      if (visible && isDebugMode && showDebugConsole) {
        debugWindow.show();
      } else {
        debugWindow.hide();
      }
    }

    // 2. Manage other subordinate windows visibility
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win === mainWindow || win === debugWindow) return;
      if (win.isDestroyed()) return;

      if (visible) {
        // Removed isUserFacingPage: Visibility is now controlled by Preload IPC or Inactive Config
        const shouldShowWindow = isDebugMode && showInactiveWindows;

        if (shouldShowWindow && !win.isVisible()) {
          win.show();
        }
      } else {
        if (win.isVisible()) {
          win.hide();
        }
      }
    });

    // [Trigger Point 1] Sync DevTools whenever Window Visibility changes (Tray interaction)
    triggerDevToolsSync();
  };

  mainWindow.on("show", () => {
    syncSubWindowsVisibility(true);
    mainWindow?.webContents.send("app:window-show");
    syncDebugWindow("MainShow");
  });
  mainWindow.on("hide", () => syncSubWindowsVisibility(false));

  mainWindow.on("enter-full-screen", () => syncDebugWindow("FullScreenEnter"));
  mainWindow.on("leave-full-screen", () => syncDebugWindow("FullScreenLeave"));
  mainWindow.on("maximize", () => syncDebugWindow("Maximize"));
  mainWindow.on("unmaximize", () => syncDebugWindow("Unmaximize"));
  mainWindow.on("resize", () => syncDebugWindow("Resize"));
  mainWindow.on("move", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const config = getConfig() as AppConfig;
      enforceConstraints(mainWindow, config);
      syncDebugWindow("MainMove");
    }
  });

  // [Z-Order Sync] Keep debug console above launcher only when launcher is focused
  mainWindow.on("focus", () => {
    const win = mainWindow;
    if (
      win &&
      !win.isDestroyed() &&
      debugWindow &&
      !debugWindow.isDestroyed()
    ) {
      // In fullscreen/maximized, we need setAlwaysOnTop to stay above the host
      if (win.isFullScreen() || win.isMaximized()) {
        debugWindow.setAlwaysOnTop(true, "screen-saver");
        debugWindow.showInactive(); // Ensure visible without stealing focus
        debugWindow.moveTop();
      }
    }
  });

  mainWindow.on("blur", () => {
    if (debugWindow && !debugWindow.isDestroyed()) {
      // Release always-on-top so it can go behind other apps with the launcher
      debugWindow.setAlwaysOnTop(false);
    }
  });

  // Initialize Tray
  trayManager.init(mainWindow, context);

  // --- SECURITY: Block WebAuthn & Unwanted Permissions ---
  // This prevents Windows Security popups (Passkey) and other intrusive browser behaviors.
  // --- SECURITY: Block WebAuthn & Unwanted Permissions ---
  // This prevents Windows Security popups (Passkey) and other intrusive browser behaviors.

  // Apply to Default Session
  setupSessionSecurity(session.defaultSession, "default");

  // Initialize Kakao Partition (Security & Config)
  initKakaoSession();

  // Apply to GGG Partition (if exists)
  if (PARTITIONS.GGG) {
    setupSessionSecurity(session.fromPartition(PARTITIONS.GGG), PARTITIONS.GGG);
  }

  // Initialize Global Context
  appContext = context;
  appContext.mainWindow = mainWindow;
  setupMainLogger(appContext, (event) => {
    eventBus.emit(event.type, appContext, event.payload);
  });

  printBanner();
  logger.log("[Main] Main Logger initialized.");

  // Perform initial installation check for ALL contexts
  // const initialConfig = getConfig() as AppConfig; (Removed: unused)
  const checkAllGameStatuses = async () => {
    const combinations = [
      { game: "POE1", service: "Kakao Games" },
      { game: "POE2", service: "Kakao Games" },
      { game: "POE1", service: "GGG" },
      { game: "POE2", service: "GGG" },
    ] as const;

    logger.log("[Main] Checking initial status for all game contexts...");

    for (const combo of combinations) {
      const installed = await isGameInstalled(
        combo.service as AppConfig["serviceChannel"],
        combo.game as AppConfig["activeGame"],
      );

      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        appContext,
        {
          gameId: combo.game as AppConfig["activeGame"],
          serviceId: combo.service as AppConfig["serviceChannel"],
          status: installed ? "idle" : "uninstalled",
        },
      );
    }
  };
  checkAllGameStatuses();

  // Sync Auto Launch Status
  // Sync Auto Launch Status
  // [Refactor] Use centralized handler to respect Admin/User mode and avoid double-launch
  syncAutoLaunch().catch((err) => {
    logger.error("[Main] Failed to sync auto-launch settings:", err);
  });

  // Inject Context into PowerShellManager for Debug Logs
  PowerShellManager.getInstance().setContext(appContext);
  eventBus.setContext(appContext);

  // Start Background Update Scheduler
  startUpdateCheckInterval(appContext);

  // Initialize and Start Process Watcher
  const processWatcher = new ProcessWatcher(appContext);
  // Assign to context for handlers (e.g., SystemWakeUpHandler)
  appContext.processWatcher = processWatcher;
  processWatcher.startWatching();

  // Initialize LogWatcher
  const logWatcher = new LogWatcher(appContext);
  logWatcher.init();

  // --- ProcessWatcher Optimization & wake-up integrated in Class ---
  mainWindow.on("blur", () => {
    logger.log("[Main] Window blurred (Focus Lost).");
    processWatcher.scheduleSuspension();
  });

  mainWindow.on("focus", () => {
    logger.log("[Main] Window focused.");
    processWatcher.cancelSuspension();
  });

  // --- Main Window Loading ---
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST as string, "index.html"));
  }

  // [Dynamic Splash] First title broadcast to sync UI/Tray
  mainWindow.webContents.on("did-finish-load", () => {
    broadcastTitleUpdate();
  });

  // Ensure app quits when main UI window is closed
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });
}

/**
 * Synchronizes the debug window's docking state, position, and height with the main window.
 */
function syncDebugWindow(triggerSource: string = "Dynamic") {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !debugWindow ||
    debugWindow.isDestroyed()
  ) {
    return;
  }

  const isFullScreen = mainWindow.isFullScreen();
  const isMaximized = mainWindow.isMaximized();
  const isDocked = !isFullScreen && !isMaximized;

  // Reduced logging during high-frequency move events
  if (triggerSource !== "MainMove") {
    logger.log(
      `[Main][${triggerSource}] Syncing Debug Window. Docked: ${isDocked}`,
    );
  }

  if (isDocked) {
    const mainBounds = mainWindow.getBounds();
    const debugBounds = debugWindow.getBounds();
    const targetX = mainBounds.x + mainBounds.width;

    // 1. Enforce Parent & Movability (Only if changed)
    if (debugWindow.getParentWindow() !== mainWindow) {
      debugWindow.setParentWindow(mainWindow);
    }
    if (debugWindow.isMovable()) {
      debugWindow.setMovable(false);
    }

    // 2. Sync Bounds (Position + Height)
    // We only update if there's a meaningful difference to avoid event loops
    if (
      debugBounds.x !== targetX ||
      debugBounds.y !== mainBounds.y ||
      debugBounds.height !== mainBounds.height
    ) {
      debugWindow.setBounds({
        x: targetX,
        y: mainBounds.y,
        height: mainBounds.height,
        width: debugBounds.width, // Preserve user-defined width
      });
    }

    // 3. Keep constraints (Only if changed)
    const [minW, minH] = debugWindow.getMinimumSize();
    if (minW !== 400 || minH !== mainBounds.height) {
      debugWindow.setMinimumSize(400, mainBounds.height);
    }
    const [maxW, maxH] = debugWindow.getMaximumSize();
    if (maxW !== 1000 || maxH !== mainBounds.height) {
      debugWindow.setMaximumSize(1000, mainBounds.height);
    }
  } else {
    // Detached Mode (Fullscreen or Flexible/Maximized)
    // 1. Release Parent & Allow movement (Only if changed)
    if (debugWindow.getParentWindow() !== null) {
      debugWindow.setParentWindow(null);
    }
    if (!debugWindow.isMovable()) {
      debugWindow.setMovable(true);
    }

    // 2. Remove height/size constraints (Only if changed)
    const [minW, minH] = debugWindow.getMinimumSize();
    if (minW !== 400 || minH !== 300) {
      debugWindow.setMinimumSize(400, 300);
    }
    const [maxW, maxH] = debugWindow.getMaximumSize();
    if (maxW !== 2000 || maxH !== 2000) {
      debugWindow.setMaximumSize(2000, 2000);
    }

    // 3. Move forward if it was behind (Optional UX)
    // [Fix] Removed moveTop() to prevent focus-stealing during state transitions (Fullscreen/Maximize)
    // which caused the "stuck in top-left" regression on Windows.
  }
}

let isInitInProgress = false; // Guard against recursive/redundant calls during creation

/**
 * Creates or destroys the debug window based on current configuration.
 * Can be called multiple times during runtime to toggle the window.
 */
function initDebugWindow(triggerSource: string = "Dynamic") {
  if (!mainWindow || mainWindow.isDestroyed()) {
    logger.log(
      `[Main][${triggerSource}] initDebugWindow skipped: mainWindow is missing/destroyed`,
    );
    return;
  }

  if (isInitInProgress) {
    logger.log(
      `[Main][${triggerSource}] initDebugWindow skipped: Initialization already in progress`,
    );
    return;
  }

  const isDevMode = getEffectiveConfig("dev_mode") === true;
  const isDebugConsole = getEffectiveConfig("debug_console") === true;
  const shouldShow = isDevMode && isDebugConsole;

  logger.log(`[Main][${triggerSource}] Debug Window State Check:`, {
    isDevMode,
    isDebugConsole,
    shouldShow,
    exists: !!debugWindow && !debugWindow.isDestroyed(),
  });

  // 1. If we should show but window doesn't exist -> Create
  if (shouldShow && (!debugWindow || debugWindow.isDestroyed())) {
    isInitInProgress = true;
    try {
      const mainBounds = mainWindow.getBounds();

      debugWindow = new BrowserWindow({
        width: 900,
        height: mainBounds.height,
        parent: mainWindow,
        title: DEBUG_APP_CONFIG.TITLE,
        frame: false,
        movable: false,
        resizable: true,
        minimizable: true,
        closable: true,
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
        },
      });

      // Reveal when ready
      debugWindow.once("ready-to-show", () => {
        if (debugWindow && !debugWindow.isDestroyed()) {
          debugWindow.show();
          syncDebugWindow("ReadyToShow");
        }
      });

      // Update Context
      context.debugWindow = debugWindow;

      const debugUrl = VITE_DEV_SERVER_URL
        ? `${VITE_DEV_SERVER_URL}${DEBUG_APP_CONFIG.HASH}`
        : `file://${path.join(process.env.DIST as string, "index.html")}${DEBUG_APP_CONFIG.HASH}`;

      debugWindow.loadURL(debugUrl);

      // --- ProcessWatcher Integration for Debug Window ---
      debugWindow.on("blur", () => {
        if (appContext?.processWatcher) {
          appContext.processWatcher.scheduleSuspension();
        }
      });

      debugWindow.on("focus", () => {
        if (appContext?.processWatcher) {
          appContext.processWatcher.cancelSuspension();
        }
      });

      // Enforce docking during debug window resize (only if docked)
      debugWindow.on("resize", () => {
        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          debugWindow &&
          !debugWindow.isDestroyed() &&
          !mainWindow.isFullScreen() &&
          !mainWindow.isMaximized()
        ) {
          const mainBounds = mainWindow.getBounds();
          const debugBounds = debugWindow.getBounds();
          const targetX = mainBounds.x + mainBounds.width;

          // If X or Y drifted during resize, snap back
          if (debugBounds.x !== targetX || debugBounds.y !== mainBounds.y) {
            debugWindow.setPosition(targetX, mainBounds.y);
          }
          // Height MUST match
          if (debugBounds.height !== mainBounds.height) {
            debugWindow.setSize(debugBounds.width, mainBounds.height);
          }
        }
      });

      debugWindow.on("closed", () => {
        logger.log("[Main] Debug Window Closed event fired.");
        debugWindow = null;
        context.debugWindow = null;
      });

      logger.log("[Main] Debug Console Creation Finalized.");
    } finally {
      isInitInProgress = false;
    }
  }
  // 2. If we should NOT show but window exists -> Close
  else if (!shouldShow && debugWindow && !debugWindow.isDestroyed()) {
    logger.log(
      `[Main][${triggerSource}] Closing Debug Window (Disabled in settings or dependency failed)`,
    );
    debugWindow.close();
    debugWindow = null;
    context.debugWindow = null;
  }
}

// IPC Handlers
ipcMain.on("trigger-game-start", () => {
  logger.log('[Main] IPC "trigger-game-start" Received from Renderer');
  if (appContext) {
    eventBus.emit(EventType.UI_GAME_START_CLICK, appContext, undefined);
  } else {
    logger.error("[Main] AppContext not initialized!");
  }
});

// --- Patch Management IPC ---
// Keep track of the active patch manager for cancellation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeManualPatchManager: any = null;

ipcMain.on(
  "patch:trigger-manual",
  async (
    _event,
    serviceIdOverride?: AppConfig["serviceChannel"],
    gameIdOverride?: AppConfig["activeGame"],
  ) => {
    // Cancel previous instance if running?
    if (activeManualPatchManager) {
      try {
        activeManualPatchManager.cancelPatch();
      } catch {
        // Ignore
      }
    }

    activeManualPatchManager = new PatchManager(appContext);

    const serviceId =
      serviceIdOverride ||
      (appContext.getConfig("serviceChannel") as AppConfig["serviceChannel"]);
    const activeGame = (gameIdOverride ||
      appContext.getConfig("activeGame")) as AppConfig["activeGame"];
    const installPath = await getGameInstallPath(serviceId, activeGame);

    logger.log(
      `[Main] Triggering Manual Patch Fix for ${serviceId} / ${activeGame}`,
    );

    if (installPath) {
      // [FIX] Trigger UI Modal for Feedback
      mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
        autoStart: false,
        serviceId,
        gameId: activeGame,
      });

      activeManualPatchManager
        .startSelfDiagnosis(installPath, serviceId)
        .finally(() => {
          // Cleanup reference if it finished (optional, but good for GC)
          // But we have to check if IT is the same instance
          // activeManualPatchManager = null;
        });
    } else {
      logger.error("Install path not found for manual patch fix.");
    }
  },
);

ipcMain.on(
  "patch:restore-local",
  async (
    _event,
    serviceIdOverride?: AppConfig["serviceChannel"],
    gameIdOverride?: AppConfig["activeGame"],
  ) => {
    // Cancel previous instance if running?
    if (activeManualPatchManager) {
      try {
        activeManualPatchManager.cancelPatch();
      } catch {
        // Ignore
      }
    }

    activeManualPatchManager = new PatchManager(appContext);

    const serviceId =
      serviceIdOverride ||
      (appContext.getConfig("serviceChannel") as AppConfig["serviceChannel"]);
    const activeGame = (gameIdOverride ||
      appContext.getConfig("activeGame")) as AppConfig["activeGame"];
    const installPath = await getGameInstallPath(serviceId, activeGame);

    logger.log(
      `[Main] Triggering Local Restore for ${serviceId} / ${activeGame}`,
    );

    if (installPath) {
      // Show UI Modal (Reuse logic but with autoStart=false to show progress)
      mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
        autoStart: false,
        serviceId,
        gameId: activeGame,
      });

      activeManualPatchManager.restoreLocalBackup(installPath).finally(() => {
        // Cleanup
        // activeManualPatchManager = null;
      });
    } else {
      logger.error("Install path not found for local restore.");
    }
  },
);

ipcMain.handle(
  "patch:check-backup",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => {
    try {
      const installPath = await getGameInstallPath(serviceId, gameId);

      if (!installPath) return false;

      const backupDir = path.join(installPath, ".patch_backups");
      try {
        const stats = await fs.stat(backupDir);
        if (!stats.isDirectory()) return false;

        const files = await fs.readdir(backupDir);
        if (files.length === 0) return false;

        // [NEW] Try to read metadata
        const metadataPath = path.join(backupDir, "backup-info.json");
        try {
          const content = await fs.readFile(metadataPath, "utf-8");
          const metadata = JSON.parse(content);
          return metadata; // Return BackupMetadata object
        } catch {
          // Legacy: No metadata file, but files exist. Return pseudo-metadata
          return {
            timestamp: stats.mtime.toISOString(),
            files,
            version: "legacy",
          };
        }
      } catch {
        return false;
      }
    } catch (error) {
      logger.error("[Main] Failed to check backup availability:", error);
      return false;
    }
  },
);

ipcMain.on("patch:cancel", () => {
  logger.log("[Main] Patch Cancel requested.");
  if (activeManualPatchManager) {
    activeManualPatchManager.cancelPatch();
  } else {
    logger.log("[Main] No active manual patch manager to cancel.");
  }
});

// Utility for sync config access (Preload only)
ipcMain.on("config:get-sync", (event, key: string) => {
  event.returnValue = getConfig(key);
});

// Window Controls IPC
ipcMain.on("app:set-title", (_event, title: string) => {
  // Manual override if needed, but we mostly use broadcastTitleUpdate
  trayManager.updateTitle(title);
});

ipcMain.on("window-minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on("window-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win === mainWindow) {
      // If main window, quit app (or close, which triggers closed event)
      win.close();
    } else {
      // If debug window or others, just hide or close based on logic
      // For debug window, we agreed to 'close' it (app keeps running).
      win.close();
    }
  }
});

// Game Status Update IPC (From Game Window Preload)
ipcMain.on(
  "game-status-update",
  (
    _event,
    status: unknown,
    msgContext: {
      gameId: AppConfig["activeGame"];
      serviceId: AppConfig["serviceChannel"];
    } | null,
  ) => {
    if (appContext) {
      const senderId = _event.sender.id;
      const mappedContext = windowContextMap.get(senderId);

      // Determine context (Priority: IPC Payload > Window Map > Global Active Session > Defaults)
      const gameId =
        msgContext?.gameId ||
        mappedContext?.gameId ||
        activeSessionContext?.gameId ||
        "POE2";
      const serviceId =
        msgContext?.serviceId ||
        mappedContext?.serviceId ||
        activeSessionContext?.serviceId ||
        "Kakao Games";

      // Only log error if we absolutely don't know the context and had to use hard-coded defaults
      if (
        !msgContext &&
        !mappedContext &&
        !activeSessionContext &&
        (!gameId || !serviceId)
      ) {
        logger.error(
          `[Main] IPC "game-status-update" received from unknown window (${senderId}) with no active session context!`,
        );
      }

      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        appContext,
        {
          gameId: gameId as AppConfig["activeGame"],
          serviceId: serviceId as AppConfig["serviceChannel"],
          status: status as RunStatus,
        },
      );
    }
  },
);

// --- Visibility Management ---

// Internal API Interface to avoid raw 'any'
interface ExtendedWebContents extends Electron.WebContents {
  getWebPreferences(): Electron.WebPreferences;
}

// Global Listener for New Windows (Popups)
app.on("browser-window-created", (_, window) => {
  // 1. Enable recursive popup handling with Partition Inheritance
  // Cast to access internal getWebPreferences() method
  const webContents = window.webContents as unknown as ExtendedWebContents;
  const webPrefs = webContents.getWebPreferences?.();
  const currentPartition = webPrefs?.partition;
  window.webContents.setWindowOpenHandler(
    createHandleWindowOpen(currentPartition),
  );
  // [Log] Monitor Popup Closing
  window.on("close", () => {
    // Skip Main/Debug windows (handled separately)
    if (window === mainWindow || window === debugWindow) return;

    try {
      if (!window.isDestroyed()) {
        const url = window.webContents.getURL();
        const title = window.getTitle();
        // Filter out empty/initial windows
        if (url && url !== "about:blank") {
          logger.log(`[Main] Popup/Window closing: "${title}" (${url})`);
        }
      }
    } catch {
      // Ignore
    }
  });

  // 2. Monitor Navigation for dynamic visibility
  const checkAndShow = () => {
    // CRITICAL: Do not hide the Main UI Window or Debug Console!
    if (mainWindow && window === mainWindow) return;
    if (debugWindow && window === debugWindow) return;
    if (window.isDestroyed()) return;

    const url = window.webContents.getURL();
    // 0. Ignore empty/initial loading to prevent premature closing
    if (!url || url === "about:blank") return;

    const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
    const showInactive = getEffectiveConfig("show_inactive_windows") === true;

    // 1. Determine if window should be shown (Central Policy)
    // Removed isUserFacingPage: Visibility is now controlled by Preload IPC or Inactive Config
    const isForcedVisible = forcedVisibleWindows.has(window.id);

    // Priority: Forced > DebugEnv > InactiveConfig
    // Note: ForcedVisible might not be set yet during initial load (Preload not run yet)
    // But once preload runs, it will trigger the IPC and show the window.
    const shouldShow = isForcedVisible || isDebugEnv || showInactive;

    if (shouldShow) {
      if (!window.isVisible()) {
        logger.log(`[Main] Showing window: ${url}`);
        window.show();
      }
    } else {
      if (window.isVisible()) {
        logger.log(`[Main] Hiding prohibited/background window: ${url}`);
        window.hide();
      }
    }
  };

  window.webContents.on("did-navigate", checkAndShow);
  window.webContents.on("did-finish-load", () => {
    if (!window.isDestroyed()) {
      checkAndShow();
      // Seeding context to new windows if we are in a launch session
      if (activeSessionContext) {
        window.webContents.send("execute-game-start", activeSessionContext);
      }
    }
  });

  const wcId = window.webContents.id;

  // 3. Debugging Support
  const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
  const showConsole =
    getEffectiveConfig("show_inactive_window_console") === true;

  if (isDebugEnv || showConsole) {
    if (!window.isDestroyed()) {
      window.webContents.openDevTools({ mode: "detach" });
      logger.log("[Main] DevTools opened for new window");
      window.setMenuBarVisibility(false);
    }
  }

  // Register context mapping for the new window (popup)
  if (activeSessionContext && !window.isDestroyed()) {
    windowContextMap.set(wcId, activeSessionContext);
  }

  // Cleanup mapping when window is destroyed
  window.on("closed", () => {
    resetGameStatusIfInterrupted(window);
    windowContextMap.delete(wcId);
  });
});

// Sync terminal context tracking with internal status changes
eventBus.register({
  id: "ActiveSessionTracker",
  targetEvent: EventType.GAME_STATUS_CHANGE,
  handle: async (event: GameStatusChangeEvent) => {
    const { status, gameId, serviceId } = event.payload;
    // Sync with global tracker for interruption handling
    currentSystemStatus = status;

    // If we are prepared to launch or already launching, update active context
    if (
      status === "preparing" ||
      status === "processing" ||
      status === "authenticating"
    ) {
      activeSessionContext = { gameId, serviceId };
      currentActiveContext = { gameId, serviceId };
    }
  },
});

// Register Toggler for Debug Window (Show/Hide dynamically)
eventBus.register({
  id: "DebugWindowTicker",
  targetEvent: EventType.CONFIG_CHANGE,
  handle: async (event: ConfigChangeEvent) => {
    const { key } = event.payload;
    if (DEBUG_KEYS.includes(key)) {
      initDebugWindow(`ConfigUpdate:${key}`);
    }
  },
});

// Register Toggler for Auxiliary DevTools (Unified Event Handler)
eventBus.register({
  id: "DevToolsSyncManager",
  targetEvent: EventType.CONFIG_CHANGE,
  handle: async (event: ConfigChangeEvent) => {
    const { key } = event.payload;
    // [Trigger Point 2] Sync DevTools whenever Config changes
    // Dependencies: show_inactive_window_console relies on dev_mode.
    if (key === "show_inactive_window_console" || key === "dev_mode") {
      // Emit Sync Event
      eventBus.emit(EventType.SYNC_DEVTOOLS_VISIBILITY, appContext, {
        source: "ConfigChange",
      });
    }

    // [Trigger Point 3] Broadcast Title Update when Active Game changes
    if (key === "activeGame") {
      broadcastTitleUpdate();
    }
  },
});

app.on("before-quit", () => {
  isQuitting = true;
  PowerShellManager.getInstance().cleanup();
});

app.on("window-all-closed", () => {
  PowerShellManager.getInstance().cleanup();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows();
  }
});

// Set App User Model ID for Windows Taskbar Icon handling
app.setAppUserModelId("com.nerdhead.poe2-launcher");

ipcMain.handle("changelog:get-all", async () => {
  const currentVersion = app.getVersion();
  // Empty previousVersion triggers 'fetch all' in service
  return changelogService.fetchChangelogs(currentVersion, "");
});

app.whenReady().then(async () => {
  // [UAC Sync] Ensure RUNASINVOKER is applied if config is set
  if (getEffectiveConfig("skipDaumGameStarterUac") === true) {
    if (!(await SimpleUacBypass.isRunAsInvokerEnabled())) {
      logger.log("[Main] Re-applying RUNASINVOKER from config...");
      await SimpleUacBypass.setRunAsInvoker(true);
    }
  }

  // Handle Uninstall Cleanup Flag
  await syncInstallLocation();
  // Ensure Auto-Launch path is updated (in case user moved the app)
  syncAutoLaunch();
  createWindows();
});

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain, dialog, shell, session } from "electron";
import JSZip from "jszip";

import { eventBus } from "./events/EventBus";
import { DEBUG_APP_CONFIG } from "../shared/config";
import {
  AppConfig,
  RunStatus,
  NewsCategory,
  DebugLogPayload,
} from "../shared/types";
import { isUserFacingPage } from "../shared/visibility";
import { AutoLaunchHandler } from "./events/handlers/AutoLaunchHandler";
import {
  LogSessionHandler,
  LogWebRootHandler,
  LogErrorHandler,
  AutoPatchProcessStopHandler,
  PatchProgressHandler, // Added
  triggerPendingManualPatches, // Added
  cancelPendingPatches, // Added
} from "./events/handlers/AutoPatchHandler";
import { CleanupLauncherWindowHandler } from "./events/handlers/CleanupLauncherWindowHandler";
import { DebugLogHandler } from "./events/handlers/DebugLogHandler";
import { GameInstallCheckHandler } from "./events/handlers/GameInstallCheckHandler";
import {
  GameProcessStartHandler,
  GameProcessStopHandler,
} from "./events/handlers/GameProcessStatusHandler";
import { GameStatusSyncHandler } from "./events/handlers/GameStatusSyncHandler";
import { StartPoe1KakaoHandler } from "./events/handlers/StartPoe1KakaoHandler";
import { StartPoe2KakaoHandler } from "./events/handlers/StartPoe2KakaoHandler";
import { StartPoeGggHandler } from "./events/handlers/StartPoeGggHandler";
import { SystemWakeUpHandler } from "./events/handlers/SystemWakeUpHandler";
import {
  UpdateCheckHandler,
  UpdateDownloadHandler,
  UpdateInstallHandler,
  startUpdateCheckInterval,
} from "./events/handlers/UpdateHandler";
import {
  AppContext,
  ConfigChangeEvent,
  EventType,
  GameStatusChangeEvent,
  EventHandler,
  AppEvent,
  UIUpdateCheckEvent,
  UIUpdateDownloadEvent,
  UIUpdateInstallEvent,
  DebugLogEvent,
} from "./events/types";
import { trayManager } from "./managers/TrayManager"; // Added
import { LogWatcher } from "./services/LogWatcher";
import { newsService } from "./services/NewsService";
import { PatchManager } from "./services/PatchManager";
import { ProcessWatcher } from "./services/ProcessWatcher";
import {
  getConfig,
  setConfig,
  setupStoreObservers,
  default as store,
} from "./store";
import {
  setupMainLogger,
  logger,
  getLogHistory,
  printBanner,
} from "./utils/logger";
import { PowerShellManager } from "./utils/powershell";
import { getGameInstallPath, isGameInstalled } from "./utils/registry";
import {
  isUACBypassEnabled,
  enableUACBypass,
  disableUACBypass,
} from "./utils/uac";

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
function getEffectiveConfig(key?: string): unknown {
  // 1. Full Config Object
  if (!key) {
    const raw = getConfig() as Record<string, unknown>;
    const effective = { ...raw };
    DEBUG_KEYS.forEach((k) => {
      effective[k] = getEffectiveConfig(k);
    });
    return effective;
  }

  // 2. Force Debug Mode via Env Var
  if (FORCE_DEBUG && DEBUG_KEYS.includes(key)) {
    return true;
  }

  // 3. Resolve Dependency: If dev_mode is disabled, force dependent keys to false
  if (DEBUG_KEYS.includes(key) && key !== "dev_mode") {
    const isDevMode = getEffectiveConfig("dev_mode") === true;
    if (!isDevMode) {
      return false;
    }
  }

  const value = getConfig(key);
  return value;
}

// Security: Explicitly blocked permissions
const BLOCKED_PERMISSIONS = [
  // WebAuthn (Passkey)
  "authenticator",
  // Camera/Microphone
  "media",
  // Location
  "geolocation",
  // Browser Notifications
  "notifications",
  "midi",
  "midiSysex",
  "pointerLock",
  "fullscreen",
  // "openExternal",
  // Programmatic clipboard read
  "clipboard-read",
];

// IPC Handlers for Configuration
ipcMain.handle("config:get", (_event, key?: string) => {
  return getEffectiveConfig(key);
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

    // 3. Clear Storage
    await session.defaultSession.clearStorageData({
      storages: [
        "cookies",
        "localstorage",
        "cachestorage",
        "indexdb",
        "serviceworkers",
      ],
    });
    logger.log("[Main] Session storage cleared (Logout).");
    return true;
  } catch (error) {
    logger.error("[Main] Failed to clear session storage:", error);
    return false;
  }
});

ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
  const oldValue = getConfig(key);

  // Optimization: Only update and emit if value has changed
  const oldStr = JSON.stringify(oldValue);
  const newStr = JSON.stringify(value);

  if (oldStr === newStr) {
    return;
  }

  setConfig(key, value);

  // Dispatch Config Change Event
  if (appContext) {
    eventBus.emit<ConfigChangeEvent>(EventType.CONFIG_CHANGE, appContext, {
      key,
      oldValue,
      newValue: value,
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

ipcMain.handle("news:mark-as-read", async (_event, id: string) => {
  return newsService.markAsRead(id);
});

ipcMain.handle("news:mark-multiple-as-read", async (_event, ids: string[]) => {
  return newsService.markMultipleAsRead(ids);
});

ipcMain.handle("shell:open-external", async (_event, url: string) => {
  return shell.openExternal(url);
});

// --- UAC Bypass IPC Handlers ---
ipcMain.handle("uac:is-enabled", () => isUACBypassEnabled());
ipcMain.handle("uac:enable", () => enableUACBypass());
ipcMain.handle("uac:disable", () => disableUACBypass());

// --- Shared Window Open Handler ---
const handleWindowOpen = ({ url }: { url: string }) => {
  logger.log(`[Main] Window Open Request: ${url}`);

  const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
  const showInactive = getEffectiveConfig("show_inactive_windows") === true;

  // 창이 갑자기 나타나는 '플래시' 현상을 방지하기 위해 기본적으로 숨김(show: false) 처리.
  // 실제 노출 여부는 이후 did-navigate 핸들러(checkAndShow)에서 결정함.
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
      },
    },
  } as const;

  return result;
};

// 2. Initialize Shared Context
const context: AppContext = {
  mainWindow: null,
  gameWindow: null,
  debugWindow: null,

  store,
  ensureGameWindow: () => {
    if (!gameWindow || gameWindow.isDestroyed()) {
      gameWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: "POE2 Launcher (Game Window)",
        show: false, // 기본 숨김 처리 (플래시 방지)
        webPreferences: {
          preload: path.join(__dirname, "kakao/preload.js"),
          nodeIntegration: false,
          contextIsolation: true,
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
 * [NEW] Resets the game status back to 'idle' if a critical window is closed
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

// Global Context
let appContext: AppContext;

// Initialize Services
newsService.init(() => {
  mainWindow?.webContents.send("news:updated");
});

function createWindows() {
  // 1. Main Window (UI)
  mainWindow = new BrowserWindow({
    width: 1440, // Increased by 20% (1200 * 1.2)
    height: 960, // Increased by 20% (800 * 1.2)
    resizable: false, // Fixed size
    maximizable: false, // Prevent maximize on double-click
    frame: false, // Disable OS Frame
    titleBarStyle: "hidden", // Allow custom drag regions on macOS (optional for Windows but good practice)
    icon: path.join(process.env.VITE_PUBLIC as string, "icon.ico"),
    show: false, // Start hidden to prevent white flash
    backgroundColor: "#000000", // Match app theme
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Reveal window when ready-to-show
  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Check for --hidden arg (Start Minimized)
      const startHidden = process.argv.includes("--hidden");
      if (!startHidden) {
        mainWindow.show();
      } else {
        logger.log("[Main] Starting hidden (minimized to tray).");
      }
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

  // Visibility Synchronization
  const syncSubWindowsVisibility = (visible: boolean) => {
    const isDebugMode = getEffectiveConfig("dev_mode") === true;
    const showDebugConsole = getEffectiveConfig("debug_console") === true;
    const showInactiveWindows =
      getEffectiveConfig("show_inactive_windows") === true;

    // 1. Manage Debug Window
    if (debugWindow && !debugWindow.isDestroyed()) {
      if (visible && isDebugMode && showDebugConsole) {
        debugWindow.show();
      } else {
        debugWindow.hide();
      }
    }

    // 2. Manage other subordinate windows (Popups, Inactive Game Windows)
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win === mainWindow || win === debugWindow) return;
      if (win.isDestroyed()) return;

      if (visible) {
        // Restore based on policy
        const url = win.webContents.getURL();
        const isUserFacing = isUserFacingPage(url);
        const shouldShow = (isDebugMode && showInactiveWindows) || isUserFacing;
        if (shouldShow) win.show();
      } else {
        // Always hide when main window is hidden (Minimize to tray)
        win.hide();
      }
    });
  };

  mainWindow.on("show", () => syncSubWindowsVisibility(true));
  mainWindow.on("hide", () => syncSubWindowsVisibility(false));

  // Initialize Tray
  trayManager.init(mainWindow);

  // --- SECURITY: Block WebAuthn & Unwanted Permissions ---
  // This prevents Windows Security popups (Passkey) and other intrusive browser behaviors.
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const isBlocked = BLOCKED_PERMISSIONS.includes(permission);

      if (isBlocked) {
        logger.log(`[Security] Blocked permission request: ${permission}`);
        return callback(false); // DENY
      }

      // Allow others (e.g., clipboard)
      callback(true);
    },
  );

  // --- FINAL SECURITY: Block Passkey API requests ---
  // This prevents the Kakao login page from even attempting to start the Passkey auth sequence.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["https://accounts.kakao.com/api/v2/passkey/*"] },
    (details, callback) => {
      logger.log(`[Security] Blocked Passkey API request: ${details.url}`);
      callback({ cancel: true });
    },
  );

  // FIX: Prevent forced fullscreen/maximize on monitor driver reset
  mainWindow.on("maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.unmaximize();
    }
  });

  mainWindow.on("enter-full-screen", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(false);
    }
  });

  // Initialize Global Context
  appContext = context;
  appContext.mainWindow = mainWindow;
  setupMainLogger(appContext, (event) => {
    eventBus.emit(event.type, appContext, event.payload);
  });

  printBanner();
  logger.log("[Main] Main Logger initialized.");

  // Perform initial installation check for ALL contexts
  const initialConfig = getConfig() as AppConfig; // [Restore] Needed for downstream usage (Auto Launch)
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

      // Note: We only check 'installed' or 'uninstalled/idle' here.
      // If a game is actually RUNNING, the 'GameProcessStartHandler' or 'ProcessWatcher' logic
      // might need to be robust enough to detect pre-existing processes on startup.
      // Currently, ProcessWatcher scans for processes and emits PROCESS_START.
      // Tricky part: ProcessWatcher emits PROCESS_START, which triggers GameProcessStartHandler.
      // So assuming ProcessWatcher starts AFTER this or concurrently, the "running" state will eventually override this "idle" state.

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
  if (!app.isPackaged) {
    logger.log(
      "[Main] Dev mode detected. Skipping Auto Launch sync (OS registration).",
    );
  } else if (initialConfig.autoLaunch) {
    const shouldStartMinimized = initialConfig.startMinimized === true;
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath("exe"),
      args: shouldStartMinimized ? ["--hidden"] : [],
    });
  } else {
    // Ensure it's disabled if config says so (handle external changes)
    const loginSettings = app.getLoginItemSettings();
    if (loginSettings.openAtLogin) {
      app.setLoginItemSettings({
        openAtLogin: false,
        path: app.getPath("exe"),
      });
    }
  }

  // Inject Context into PowerShellManager for Debug Logs
  PowerShellManager.getInstance().setContext(appContext);
  eventBus.setContext(appContext);

  // [NEW] Start Background Update Scheduler
  startUpdateCheckInterval(appContext);

  // Initialize and Start Process Watcher
  const processWatcher = new ProcessWatcher(appContext);
  // Assign to context for handlers (e.g., SystemWakeUpHandler)
  appContext.processWatcher = processWatcher;
  processWatcher.startWatching();

  // Initialize LogWatcher
  const logWatcher = new LogWatcher(appContext);
  logWatcher.init();

  // Save AutoPatchHandler instance for IPC access (via find in handlers list or a better way)
  // For simplicity, we can get it from the handlers array if we need reference,
  // OR we can make a dedicated IPC handler class if code grows.
  // But here we need to implement `triggerManualPatchFix` IPC which calls `AutoPatchHandler` -> `PatchManager`.

  // --- ProcessWatcher Optimization & wake-up integrated in Class ---
  mainWindow.on("blur", () => {
    logger.log("[Main] Window blurred (Focus Lost).");
    processWatcher.scheduleSuspension();
  });

  mainWindow.on("focus", () => {
    logger.log("[Main] Window focused.");
    processWatcher.cancelSuspension();

    // [Fix] Automatically restore window size if it was stretched by OS/Resolution changes
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [width, height] = mainWindow.getSize();
      if (width !== 1440 || height !== 960) {
        logger.log(
          `[Main] Resolution divergence detected (${width}x${height}). Restoring to 1440x960.`,
        );
        mainWindow.setSize(1440, 960);
      }
    }
  });

  // 2. Game Window (Lazy Init - Do NOT create here)
  // Removed initial creation block.

  // --- Main Window Loading ---
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST as string, "index.html"));
  }

  // Ensure app quits when main UI window is closed
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });

  // --- Debug Window Management ---
  initDebugWindow("AppStart");
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
      // Check bounds
      const mainBounds = mainWindow.getBounds();
      const targetX = mainBounds.x + mainBounds.width;
      const targetY = mainBounds.y;

      logger.log(`[Main][${triggerSource}] Creating Debug Window at:`, {
        targetX,
        targetY,
      });

      debugWindow = new BrowserWindow({
        width: 900,
        height: mainBounds.height,
        x: targetX,
        y: targetY,
        parent: mainWindow,
        title: DEBUG_APP_CONFIG.TITLE,
        frame: false,
        movable: false,
        resizable: true,
        minimizable: true,
        closable: true,
        autoHideMenuBar: true,
        show: true, // Explicitly show
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
        },
      });

      // Update Context
      context.debugWindow = debugWindow;

      // Lock Height to match Main Window
      debugWindow.setMinimumSize(400, mainBounds.height);
      debugWindow.setMaximumSize(1000, mainBounds.height);

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

      const updateDebugPosition = () => {
        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          debugWindow &&
          !debugWindow.isDestroyed()
        ) {
          const bounds = mainWindow.getBounds();
          debugWindow.setPosition(bounds.x + bounds.width, bounds.y);
        }
      };

      mainWindow.on("move", updateDebugPosition);

      // Enforce docking during resize
      debugWindow.on("resize", () => {
        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          debugWindow &&
          !debugWindow.isDestroyed()
        ) {
          const mainBounds = mainWindow.getBounds();
          const debugBounds = debugWindow.getBounds();
          const targetX = mainBounds.x + mainBounds.width;

          if (
            debugBounds.x !== targetX ||
            debugBounds.y !== mainBounds.y ||
            debugBounds.height !== mainBounds.height
          ) {
            debugWindow.setBounds({
              x: targetX,
              y: mainBounds.y,
              height: mainBounds.height,
              width: debugBounds.width + (debugBounds.x - targetX),
            });
          }
        }
      });

      debugWindow.on("closed", () => {
        logger.log("[Main] Debug Window Closed event fired.");
        debugWindow = null;
        context.debugWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.off("move", updateDebugPosition);
        }
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

// Window Controls IPC
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

// Global Listener for New Windows (Popups)
app.on("browser-window-created", (_, window) => {
  // 1. Enable recursive popup handling
  window.webContents.setWindowOpenHandler(handleWindowOpen);

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
    const isUserFacing = isUserFacingPage(url);
    const shouldShow = isDebugEnv || showInactive || isUserFacing;

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

// Register Toggler for Auxiliary DevTools (Detach/Close dynamically)
eventBus.register({
  id: "DevToolsTicker",
  targetEvent: EventType.CONFIG_CHANGE,
  handle: async (event: ConfigChangeEvent) => {
    const { key, newValue } = event.payload;
    if (key === "show_inactive_window_console") {
      const show = newValue === true;
      const allWindows = BrowserWindow.getAllWindows();

      allWindows.forEach((win) => {
        // Skip Main Window & Debug Console (they have their own logic or are always allowed)
        if (win === mainWindow || win === debugWindow) return;

        if (show) {
          if (!win.webContents.isDevToolsOpened()) {
            win.webContents.openDevTools({ mode: "detach" });
          }
        } else {
          if (win.webContents.isDevToolsOpened()) {
            win.webContents.closeDevTools();
          }
        }
      });
    }
  },
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
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

app.whenReady().then(async () => {
  // [NEW] Handle Uninstall Cleanup Flag
  createWindows();
});

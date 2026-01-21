import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

import { eventBus } from "./events/EventBus";
import { DEBUG_APP_CONFIG } from "../shared/config";
import { AppConfig, RunStatus } from "../shared/types";
import { CleanupLauncherWindowHandler } from "./events/handlers/CleanupLauncherWindowHandler";
import { DebugLogHandler } from "./events/handlers/DebugLogHandler";
import {
  GameProcessStartHandler,
  GameProcessStopHandler,
} from "./events/handlers/GameProcessStatusHandler";
import { GameStatusSyncHandler } from "./events/handlers/GameStatusSyncHandler";
import { StartPoe1KakaoHandler } from "./events/handlers/StartPoe1KakaoHandler";
import { StartPoe2KakaoHandler } from "./events/handlers/StartPoe2KakaoHandler";
import { SystemWakeUpHandler } from "./events/handlers/SystemWakeUpHandler";
import {
  AppContext,
  ConfigChangeEvent,
  EventType,
  GameStatusChangeEvent,
  EventHandler,
  AppEvent,
} from "./events/types";
import { ProcessWatcher } from "./services/ProcessWatcher";
import {
  getConfig,
  setConfig,
  setupStoreObservers,
  default as store,
} from "./store";
import { PowerShellManager } from "./utils/powershell";

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

// IPC Handlers for Configuration
ipcMain.handle("config:get", (_event, key?: string) => {
  return getConfig(key);
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

ipcMain.handle("file:get-hash", async (_event, filePath: string) => {
  try {
    let targetPath = filePath;

    // Resolve URL-like paths (e.g., from VITE assets or data URLs)
    if (filePath.startsWith("data:")) {
      return crypto.createHash("md5").update(filePath).digest("hex");
    }

    if (filePath.startsWith("file://")) {
      targetPath = fileURLToPath(filePath);
    } else if (!path.isAbsolute(filePath)) {
      // In dev mode, assets are served from /src/renderer/assets or /public
      // In prod mode, they are in the packaged app
      const possiblePaths = [
        path.join(process.env.VITE_PUBLIC || "", filePath),
        path.join(app.getAppPath(), "dist", filePath),
        path.join(
          app.getAppPath(),
          "src/renderer",
          filePath.replace(/\//g, path.sep),
        ),
        path.join(app.getAppPath(), filePath.replace(/\//g, path.sep)),
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
    console.error(`[Hash] Failed to get hash for ${filePath}:`, error);
    return "";
  }
});

// --- Shared Window Open Handler ---
const handleWindowOpen = ({ url }: { url: string }) => {
  console.log(`[Main] Window Open Request: ${url}`);

  // User Logic: Only 'accounts.kakao.com' should be visible strictly.
  // Other popups (e.g. security checks) should generally be hidden unless in debug mode.
  const isKakaoLogin = url.includes("accounts.kakao.com");
  const isDebug = process.env.VITE_SHOW_GAME_WINDOW === "true";

  const shouldShow = isKakaoLogin || isDebug;

  // Always allow, but control visibility
  return {
    action: "allow",
    overrideBrowserWindowOptions: {
      width: 800,
      height: 600,
      autoHideMenuBar: true,
      show: shouldShow,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        preload: path.join(__dirname, "kakao/preload.js"),
      },
    },
  } as const;
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
        gameWindow = null;
        context.gameWindow = null;
      });
    }
    return gameWindow!;
  },
};

// 3. Register Global Store Observers
setupStoreObservers(context);

// 4. Register Event Handlers
const handlers = [
  DebugLogHandler,
  StartPoe1KakaoHandler,
  StartPoe2KakaoHandler,
  CleanupLauncherWindowHandler,
  GameStatusSyncHandler,
  GameProcessStartHandler,
  GameProcessStopHandler,
  SystemWakeUpHandler,
];

handlers.forEach((handler) => {
  eventBus.register(handler as EventHandler<AppEvent>);
});

// Global Context
let appContext: AppContext;

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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Initialize Global Context
  appContext = context;
  appContext.mainWindow = mainWindow;

  // Inject Context into PowerShellManager for Debug Logs
  PowerShellManager.getInstance().setContext(appContext);
  eventBus.setContext(appContext);

  // Initialize and Start Process Watcher
  const processWatcher = new ProcessWatcher(appContext);
  // Assign to context for handlers (e.g., SystemWakeUpHandler)
  appContext.processWatcher = processWatcher;
  processWatcher.startWatching();

  // --- ProcessWatcher Optimization & wake-up integrated in Class ---
  mainWindow.on("blur", () => {
    console.log("[Main] Window blurred (Focus Lost).");
    processWatcher.scheduleSuspension();
  });

  mainWindow.on("focus", () => {
    console.log("[Main] Window focused.");
    processWatcher.cancelSuspension();
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

  // Note: We previously attached gameWindow listeners here.
  // Now they are attached in initGameWindow().

  mainWindow.webContents.setWindowOpenHandler(handleWindowOpen);

  // --- Debug Console Window (If Debug Mode) ---
  if (process.env.VITE_SHOW_GAME_WINDOW === "true") {
    // Calculate initial position
    const mainBounds = mainWindow.getBounds();

    debugWindow = new BrowserWindow({
      width: 900, // Default width (Increased by 50% from 600)
      height: mainBounds.height, // Match main window height
      x: mainBounds.x + mainBounds.width, // Attach to right
      y: mainBounds.y, // Align top
      parent: mainWindow, // <--- Key change: Syncs focus/minimize/restore
      title: DEBUG_APP_CONFIG.TITLE,
      frame: false, // Custom frame
      movable: false, // Prevent moving independently
      resizable: true, // Allow resizing (restricted to width by min/max height below)
      minimizable: true,
      closable: true,
      autoHideMenuBar: true,
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

    // Docking Logic: Follow Main Window

    // --- ProcessWatcher Integration for Debug Window ---
    debugWindow.on("blur", () => {
      console.log("[Debug] Console blurred (Focus Lost).");
      processWatcher.scheduleSuspension();
    });

    debugWindow.on("focus", () => {
      console.log("[Debug] Console focused.");
      processWatcher.cancelSuspension();
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

    // Ensure debug window closes if main window closes (handled by standard logic too)
    debugWindow.on("closed", () => {
      debugWindow = null;
      context.debugWindow = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.off("move", updateDebugPosition);
      }
    });

    // If main window is closed, we should clean up listeners
    mainWindow.on("closed", () => {
      if (debugWindow && !debugWindow.isDestroyed()) {
        debugWindow.close();
      }
    });
  }
}

// IPC Handlers
ipcMain.on("trigger-game-start", () => {
  console.log('[Main] IPC "trigger-game-start" Received from Renderer');
  if (appContext) {
    eventBus.emit(EventType.UI_GAME_START_CLICK, appContext, undefined);
  } else {
    console.error("[Main] AppContext not initialized!");
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
        console.error(
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
    // CRITICAL: Do not hide the Main UI Window!
    if (mainWindow && window === mainWindow) return;
    if (window.isDestroyed()) return;

    const url = window.webContents.getURL();
    const isKakaoLogin = url.includes("accounts.kakao.com");
    const isDebug = process.env.VITE_SHOW_GAME_WINDOW === "true";

    // Scenario A: Login page detected -> Show window
    if (isKakaoLogin) {
      if (!window.isVisible()) {
        console.log(`[Main] Login Page Detected. Showing window: ${url}`);
        window.show();
      }
    }
    // Scenario B: Navigated AWAY from login -> Hide window (unless debug)
    else {
      if (window.isVisible() && !isDebug) {
        console.log(`[Main] Non-Login Page Detected. Hiding window: ${url}`);
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
  const showGameWindow = process.env.VITE_SHOW_GAME_WINDOW === "true";
  if (showGameWindow) {
    if (!window.isDestroyed()) {
      window.webContents.openDevTools({ mode: "detach" });
      console.log("[Main] DevTools opened for new window");
      window.setMenuBarVisibility(false);
    }
  }

  // Register context mapping for the new window (popup)
  if (activeSessionContext && !window.isDestroyed()) {
    windowContextMap.set(wcId, activeSessionContext);
  }

  // Cleanup mapping when window is destroyed
  window.on("closed", () => {
    windowContextMap.delete(wcId);
  });
});

// Sync terminal context tracking with internal status changes
eventBus.register({
  id: "ActiveSessionTracker",
  targetEvent: EventType.GAME_STATUS_CHANGE,
  handle: async (event: GameStatusChangeEvent) => {
    const { status, gameId, serviceId } = event.payload;
    // If we are prepared to launch or already launching, update active context
    if (
      status === "preparing" ||
      status === "processing" ||
      status === "authenticating"
    ) {
      activeSessionContext = { gameId, serviceId };
    }
  },
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

app.whenReady().then(createWindows);

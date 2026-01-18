import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

import { eventBus } from "./events/EventBus";
import { CleanupPoe2WindowHandler } from "./events/handlers/CleanupPoe2WindowHandler";
import {
  GameProcessStartHandler,
  GameProcessStopHandler,
} from "./events/handlers/GameProcessStatusHandler";
import { RendererBridgeHandler } from "./events/handlers/RendererBridgeHandler";
import { StartPoe2KakaoHandler } from "./events/handlers/StartPoe2KakaoHandler";
import {
  AppContext,
  ConfigChangeEvent,
  EventType,
  MessageEvent as AppMessageEvent,
  UIEvent,
} from "./events/types";
import { ProcessWatcher } from "./services/ProcessWatcher";
import {
  getConfig,
  setConfig,
  setupStoreObservers,
  default as store,
} from "./store";

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public");

let mainWindow: BrowserWindow | null;
let gameWindow: BrowserWindow | null;

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

// IPC Handlers for Configuration
ipcMain.handle("config:get", (_event, key?: string) => {
  return getConfig(key);
});

ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
  const oldValue = getConfig(key);
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
        preload: path.join(__dirname, "preload-game.js"),
      },
    },
  } as const;
};

const initGameWindow = () => {
  const showGameWindow = process.env.VITE_SHOW_GAME_WINDOW === "true";
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    x: showGameWindow ? 650 : undefined,
    y: showGameWindow ? 0 : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload-game.js"),
      nodeIntegration: false,
      contextIsolation: false,
    },
  });

  win.on("closed", () => {
    console.log("[Main] Game Window Closed");
    gameWindow = null;
    if (appContext) appContext.gameWindow = null;
    // Note: We don't unset context.gameWindow here to avoid null refs in async handlers,
    // but handlers should check isDestroyed() logic.
  });

  if (showGameWindow) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  win.webContents.setWindowOpenHandler(handleWindowOpen);
  win.webContents.on("did-finish-load", () => {
    console.log("[Main] Game Window Loaded:", win?.webContents.getURL());
  });

  return win;
};

// Global Context
let appContext: AppContext;

function createWindows() {
  // 1. Main Window (UI)
  mainWindow = new BrowserWindow({
    width: 1200, // Increased width for better ratio
    height: 800, // Slightly increased height
    resizable: false, // Fixed size
    maximizable: false, // Prevent maximize on double-click
    frame: false, // Disable OS Frame
    titleBarStyle: "hidden", // Allow custom drag regions on macOS (optional for Windows but good practice)
    icon: path.join(process.env.VITE_PUBLIC as string, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Setup Config Observers (Reactive)
  setupStoreObservers(mainWindow);

  // Register Event Handlers
  eventBus.register(StartPoe2KakaoHandler);
  eventBus.register(CleanupPoe2WindowHandler);
  eventBus.register(RendererBridgeHandler);
  eventBus.register(GameProcessStartHandler);
  eventBus.register(GameProcessStopHandler);

  // Initialize Global Context
  // context is declared as const but properties are mutable if it's an object.
  // However, I need to pass this context to ProcessWatcher.
  // I will declare context first.
  appContext = {
    mainWindow,
    gameWindow: null,
    store,
    ensureGameWindow: () => {
      if (!gameWindow || gameWindow.isDestroyed()) {
        console.log("[Main] creating new Game Window...");
        gameWindow = initGameWindow();
        appContext.gameWindow = gameWindow;
      }
      return gameWindow;
    },
  };

  // Initialize and Start Process Watcher
  const processWatcher = new ProcessWatcher(appContext);
  processWatcher.startWatching();

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
ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-close", () => {
  if (mainWindow) mainWindow.close();
});

// Game Progress Update IPC (From Game Window)
ipcMain.on("game-progress-update", (_event, text: string) => {
  if (appContext) {
    eventBus.emit<AppMessageEvent>(
      EventType.MESSAGE_GAME_PROGRESS_INFO,
      appContext,
      { text },
    );
  }
});

// Global Listener for New Windows (Popups)
app.on("browser-window-created", (_, window) => {
  // 1. Enable recursive popup handling
  window.webContents.setWindowOpenHandler(handleWindowOpen);

  // 2. Monitor Navigation for dynamic visibility
  const checkAndShow = () => {
    // CRITICAL: Do not hide the Main UI Window!
    if (mainWindow && window === mainWindow) return;

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
  window.webContents.on("did-finish-load", checkAndShow);

  // 3. Debugging Support
  const showGameWindow = process.env.VITE_SHOW_GAME_WINDOW === "true";
  if (showGameWindow) {
    window.webContents.openDevTools({ mode: "detach" });
    console.log("[Main] DevTools opened for new window");
    window.setMenuBarVisibility(false);
  }
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

app.whenReady().then(createWindows);

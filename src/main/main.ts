import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public");

let mainWindow: BrowserWindow | null;
let gameWindow: BrowserWindow | null;

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindows() {
  // 1. Main Window (UI)
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    icon: path.join(process.env.VITE_PUBLIC as string, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 2. Game Window (Hidden Background)
  const showGameWindow = process.env.VITE_SHOW_GAME_WINDOW === "true";
  gameWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false, // Initially hidden. Shown only on 'trigger-game-start'
    x: showGameWindow ? 650 : undefined, // Offset if visible for easier debugging
    y: showGameWindow ? 0 : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload-game.js"), // Use .js extension (implies CJS now)
      nodeIntegration: false,
      contextIsolation: false, // Often needed for robust DOM manipulation in background
    },
  });

  gameWindow.on("closed", () => {
    console.log("[Main] Game Window Closed");
    gameWindow = null;
  });

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

  // --- Game Window Loading ---
  // Initial State: Hidden and Blank.
  // It will be shown and loaded only when 'trigger-game-start' IPC is received.

  // Optional: Open DevTools if configured, but kept hidden until triggered
  if (showGameWindow) {
    gameWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.setWindowOpenHandler(handleWindowOpen);
  gameWindow.webContents.setWindowOpenHandler(handleWindowOpen);

  // Listen for Game Window navigation events (Optional Debugging)
  gameWindow.webContents.on("did-finish-load", () => {
    console.log("[Main] Game Window Loaded:", gameWindow?.webContents.getURL());
  });
}

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

// IPC Handler: UI -> Main -> Game Window
ipcMain.on("trigger-game-start", () => {
  console.log('[Main] IPC "trigger-game-start" Received from Renderer');
  if (gameWindow) {
    if (gameWindow.isDestroyed()) {
      console.error(
        "[Main] Game Window has been destroyed! Please restart the app.",
      );
      return;
    }

    console.log("[Main] Showing Game Window and Loading URL...");

    // 1. Show the window (Only if VITE_SHOW_GAME_WINDOW is true)
    if (process.env.VITE_SHOW_GAME_WINDOW === "true") {
      gameWindow.show();
    }

    // 2. Load the URL
    const targetUrl = "https://pathofexile2.game.daum.net/main";
    gameWindow.loadURL(targetUrl);

    // 3. Wait for load to finish, then trigger automation
    gameWindow.webContents.once("did-finish-load", () => {
      console.log('[Main] Game Window Loaded. Sending "execute-game-start"...');

      // Double check before sending
      if (gameWindow && !gameWindow.isDestroyed()) {
        gameWindow.webContents.send("execute-game-start");
      }
    });
  } else {
    console.error("[Main] Game Window is null! (Closed by user?)");
  }
});

// Global Listener for New Windows (Popups)
app.on("browser-window-created", (_, window) => {
  // 1. Enable recursive popup handling
  window.webContents.setWindowOpenHandler(handleWindowOpen);

  // 2. Monitor Navigation for dynamic visibility
  const checkAndShow = () => {
    // CRITICAL: Do not hide the Main UI Window!
    if (window === mainWindow) return;

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

import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let mainWindow: BrowserWindow | null
let gameWindow: BrowserWindow | null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindows() {
  // 1. Main Window (UI)
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    icon: path.join(process.env.VITE_PUBLIC as string, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // 2. Game Window (Hidden Background)
  const showGameWindow = process.env.VITE_SHOW_GAME_WINDOW === 'true';
  gameWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: showGameWindow, // Controlled by Env Var
    x: showGameWindow ? 650 : undefined, // Offset if visible for easier debugging
    y: showGameWindow ? 0 : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload-game.js'), // Use .js extension (implies CJS now)
      nodeIntegration: false,
      contextIsolation: false, // Often needed for robust DOM manipulation in background
    },
  })

  // --- Main Window Loading ---
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST as string, 'index.html'))
  }

  // --- Game Window Loading ---
  gameWindow.loadURL('https://pathofexile2.game.daum.net/main')
  
  if (showGameWindow) {
      gameWindow.webContents.openDevTools({ mode: 'detach' });
      console.log('[Main] Debug Mode: Game Window is Visible and DevTools opened.');
  }

  // --- Window Open Handler (Shared or Specific) ---
  const handleWindowOpen = ({ url }: { url: string }) => {
    console.log('[Main] Window Open Request:', url); // Debug Log

    const allowedDomains = [
      'accounts.kakao.com',
      'logins.daum.net',
      'kauth.kakao.com',
      'pubsvc.game.daum.net', // Launcher / Game Start
      'security-center.game.daum.net' // PC Security Check
    ];

    const isAllowed = allowedDomains.some(domain => url.includes(domain)) || url.includes('gamestart');
    
    if (isAllowed) {
      console.log(`[Main] Allowed Popup: ${url}`);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 800,
          height: 600,
          autoHideMenuBar: true,
          show: true, // Force visible even if parent is hidden
          webPreferences: { 
            nodeIntegration: false, 
            contextIsolation: false, // Match parent window settings for ease of DOM access (or keep true if using contextBridge)
            preload: path.join(__dirname, 'preload-game.js') // Inject the same preload script
          }
        }
      } as const
    }
    console.warn('[Main] Blocked Popup:', url);
    return { action: 'deny' } as const
  }

  mainWindow.webContents.setWindowOpenHandler(handleWindowOpen)
  gameWindow.webContents.setWindowOpenHandler(handleWindowOpen)

  // Listen for Game Window navigation events (Optional Debugging)
  gameWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Game Window Loaded:', gameWindow?.webContents.getURL())
  })
}

// IPC Handler: UI -> Main -> Game Window
ipcMain.on('trigger-game-start', () => {
    console.log('[Main] IPC "trigger-game-start" Received from Renderer');
    if (gameWindow) {
        console.log('[Main] Sending "execute-game-start" to Game Window...');
        gameWindow.webContents.send('execute-game-start');
    } else {
        console.error('[Main] Game Window is null!');
    }
})

// Global Listener for New Windows (Popups) to enable DevTools
app.on('browser-window-created', (_, window) => {
    const showGameWindow = process.env.VITE_SHOW_GAME_WINDOW === 'true';
    if (showGameWindow) {
        // Open DevTools for any new window (including popups)
        window.webContents.openDevTools({ mode: 'detach' });
        console.log('[Main] DevTools opened for new window');
        
        // Optional: Remove menu bar for cleaner popups
        window.setMenuBarVisibility(false);
    }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows()
  }
})

app.whenReady().then(createWindows)

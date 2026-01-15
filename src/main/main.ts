import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
      preload: path.join(__dirname, 'preload-game.js'), // Use separate preload
      nodeIntegration: false,
      contextIsolation: false, // Often needed for robust DOM manipulation in background, or keep true with IPC
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
    const isLoginUrl = url.includes('login') || url.includes('oauth') || url.includes('auth') || url.includes('nid.naver.com');
    if (isLoginUrl) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 800,
          height: 600,
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        }
      } as const
    }
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
    console.log('[Main] Triggering Game Start on Game Window');
    if (gameWindow) {
        gameWindow.webContents.send('execute-game-start');
    }
})

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

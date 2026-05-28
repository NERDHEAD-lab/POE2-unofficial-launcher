import path from "node:path";

import { app, BrowserWindow, ipcMain, shell } from "electron";

import {
  registerBuildsHandlers,
  registerPobSessionHandlers,
  verifyPobInstallation,
} from "@poe2-launcher/pob-bridge";

import { createJsonPobWrapperConfigStore } from "./configStore";
import { createPobWrapperInstallLocationService } from "./installLocation";
import { registerPobWrapperHandlers } from "./ipc";
import {
  POB_WRAPPER_PRODUCT_NAME,
  resolvePobWrapperUserDataPath,
} from "./namespace";
import { createWindowsPobInstallLocator } from "./windowsRegistryLocator";

app.setPath(
  "userData",
  resolvePobWrapperUserDataPath(app.getPath("appData"), "standalone"),
);

const DEFAULT_GAME_HASH = "game=POE2&host=standalone";
const RENDERER_DEV_URL_ENV = "POB_WRAPPER_RENDERER_URL";

const rendererDistPath = (): string =>
  path.resolve(__dirname, "..", "..", "pob-ui", "dist", "index.html");

const configStore = createJsonPobWrapperConfigStore(
  path.join(app.getPath("userData"), "config.json"),
);
const installLocations = createPobWrapperInstallLocationService({
  store: configStore,
  detectInstallLocation: createWindowsPobInstallLocator(),
  verifyInstallation: verifyPobInstallation,
});

registerBuildsHandlers();
registerPobSessionHandlers({
  installLocator: installLocations.resolve,
});
registerPobWrapperHandlers({
  store: configStore,
  installLocations,
});

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: POB_WRAPPER_PRODUCT_NAME,
    backgroundColor: "#1a1a1a",
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenu(null);
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const devUrl = process.env[RENDERER_DEV_URL_ENV];
  if (devUrl) {
    const baseUrl = devUrl.endsWith("/") ? devUrl : `${devUrl}/`;
    void win.loadURL(`${baseUrl}#${DEFAULT_GAME_HASH}`);
  } else {
    void win.loadFile(rendererDistPath(), { hash: DEFAULT_GAME_HASH });
  }

  return win;
};

ipcMain.on("window-minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window-toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on("window-close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

void app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

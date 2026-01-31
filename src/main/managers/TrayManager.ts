import path from "node:path";

import { app, Menu, Tray, BrowserWindow } from "electron";

import { logger } from "../utils/logger";

class TrayManager {
  private static instance: TrayManager;
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {}

  public static getInstance(): TrayManager {
    if (!TrayManager.instance) {
      TrayManager.instance = new TrayManager();
    }
    return TrayManager.instance;
  }

  public init(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.createTray();
  }

  public destroy() {
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.destroy();
    }
    this.tray = null;
  }

  private createTray() {
    if (this.tray) return;

    try {
      const iconPath = path.join(process.env.VITE_PUBLIC as string, "icon.ico");
      this.tray = new Tray(iconPath);
      this.tray.setToolTip("POE2 Unofficial Launcher");

      this.updateContextMenu();

      // Double click to open
      this.tray.on("double-click", () => {
        this.showMainWindow();
      });
    } catch (error) {
      logger.error("[Tray] Failed to create tray icon:", error);
    }
  }

  private updateContextMenu() {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open Launcher",
        click: () => this.showMainWindow(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private showMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }
}

export const trayManager = TrayManager.getInstance();

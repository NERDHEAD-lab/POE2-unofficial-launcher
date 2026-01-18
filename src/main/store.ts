import { BrowserWindow } from "electron";
import Store from "electron-store";

import { DEFAULT_CONFIG, CONFIG_KEYS } from "../shared/config";
import { AppConfig } from "../shared/types";

// Initialize Electron Store
const store = new Store<AppConfig>({
  defaults: DEFAULT_CONFIG,
});

/**
 * Setup config observers to notify renderer on changes
 */
export function setupStoreObservers(mainWindow: BrowserWindow) {
  Object.values(CONFIG_KEYS).forEach((key) => {
    store.onDidChange(key as keyof AppConfig, (newValue) => {
      // Only send if window is not destroyed
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("config-changed", key, newValue);
      }
    });
  });
}

/**
 * Get a value from the store
 */
export function getConfig(key?: string) {
  return key ? store.get(key as keyof AppConfig) : store.store;
}

/**
 * Set a value in the store
 */
export function setConfig(key: string, value: unknown) {
  store.set(key as keyof AppConfig, value as any);
}

export default store;

import Store from "electron-store";

import { DEFAULT_CONFIG, CONFIG_KEYS } from "../shared/config";
import { AppConfig } from "../shared/types";
import { AppContext } from "./events/types";

// Initialize Electron Store
const store = new Store<AppConfig>({
  defaults: DEFAULT_CONFIG,
});

/**
 * Setup config observers to notify renderer on changes
 */
export function setupStoreObservers(context: AppContext) {
  Object.values(CONFIG_KEYS).forEach((key) => {
    store.onDidChange(key as keyof AppConfig, (newValue) => {
      // Only send if window is not destroyed
      if (context.mainWindow && !context.mainWindow.isDestroyed()) {
        context.mainWindow.webContents.send("config-changed", key, newValue);
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
  store.set(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
}

export default store;

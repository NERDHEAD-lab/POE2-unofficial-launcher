import path from "node:path";

import { app } from "electron";
import Store from "electron-store";

import { DEFAULT_CONFIG } from "../shared/config";
import { AppConfig } from "../shared/types";
import { AppContext } from "./events/types";

// [Fix] Force User Data path to match electron-builder 'productName' (with spaces)
// This must be set BEFORE creating the Store instance to ensure config.json maps to correct folder.
app.setPath(
  "userData",
  path.join(app.getPath("appData"), "POE2 Unofficial Launcher"),
);

const store = new Store<AppConfig>({
  defaults: DEFAULT_CONFIG,
});

/**
 * Setup config observers to notify renderer on changes
 */
export function setupStoreObservers(_context: AppContext) {
  // Manual broadcasting removed in favor of ConfigSyncHandler (EventBus pattern)
  /*
  Object.values(CONFIG_KEYS).forEach((key) => {
    store.onDidChange(key as keyof AppConfig, (newValue) => {
      // Broadcast to all active windows in the context
      const windows = [
        context.mainWindow,
        context.debugWindow,
        context.gameWindow,
      ];

      windows.forEach((win) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send("config-changed", key, newValue);
        }
      });
    });
  });
  */
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

/**
 * Delete a key from the store
 */
export function deleteConfig(key: string) {
  store.delete(key as keyof AppConfig);
}

export { store as default };

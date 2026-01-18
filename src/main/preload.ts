import { contextBridge, ipcRenderer } from "electron";

// --- Electron API Expose ---
// Used by React Renderer (App.tsx)

contextBridge.exposeInMainWorld("electronAPI", {
  triggerGameStart: () => {
    console.log("[Preload] Sending trigger-game-start to Main Process");
    ipcRenderer.send("trigger-game-start");
  },
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  getConfig: (key?: string) => ipcRenderer.invoke("config:get", key),
  setConfig: (key: string, value: unknown) =>
    ipcRenderer.invoke("config:set", key, value),
  onConfigChange: (callback: (key: string, value: any) => void) => {
    ipcRenderer.on("config-changed", (_event, key, value) =>
      callback(key, value),
    );
  },
});

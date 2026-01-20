import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

import { GameStatusState } from "../shared/types";
import { DebugLogEvent } from "./events/types";

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
  onConfigChange: (callback: (key: string, value: unknown) => void) => {
    ipcRenderer.on("config-changed", (_event, key, value) =>
      callback(key, value),
    );
  },
  onProgressMessage: (callback: (text: string) => void) => {
    ipcRenderer.on("message-progress", (_event, text) => callback(text));
  },
  onGameStatusUpdate: (callback: (status: GameStatusState) => void) => {
    ipcRenderer.on("game-status-update", (_event, status) => callback(status));
  },
  onDebugLog: (callback: (log: DebugLogEvent["payload"]) => void) => {
    const handler = (_event: IpcRendererEvent, log: DebugLogEvent["payload"]) =>
      callback(log);
    ipcRenderer.on("debug-log", handler);
    return () => ipcRenderer.off("debug-log", handler);
  },
});

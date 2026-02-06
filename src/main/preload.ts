import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

import {
  GameStatusState,
  AppConfig,
  NewsCategory,
  UpdateStatus,
  PatchProgress,
} from "../shared/types";
import { DebugLogEvent } from "./events/types";
import { PreloadLogger } from "./utils/preload-logger";

const logger = new PreloadLogger({ type: "PRELOAD", typeColor: "#8BE9FD" });

// --- Electron API Expose ---
// Used by React Renderer (App.tsx)

contextBridge.exposeInMainWorld("electronAPI", {
  triggerGameStart: () => {
    logger.log("[Preload] Sending trigger-game-start to Main Process");
    ipcRenderer.send("trigger-game-start");
  },
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  getConfig: (
    key?: string,
    ignoreDependencies?: boolean,
    includeForced?: boolean,
  ) => ipcRenderer.invoke("config:get", key, ignoreDependencies, includeForced),
  isConfigForced: (key: string) => ipcRenderer.invoke("config:is-forced", key),
  setConfig: (key: string, value: unknown) =>
    ipcRenderer.invoke("config:set", key, value),
  getFileHash: (path: string) => ipcRenderer.invoke("file:get-hash", path),
  onConfigChange: (callback: (key: string, value: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, key: string, value: unknown) =>
      callback(key, value);
    ipcRenderer.on("config-changed", handler);
    return () => ipcRenderer.off("config-changed", handler);
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
  saveReport: (files: { name: string; content: string }[]) =>
    ipcRenderer.invoke("report:save", files),
  getNews: (
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => ipcRenderer.invoke("news:get", game, service, category),
  getNewsCache: (
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => ipcRenderer.invoke("news:get-cache", game, service, category),
  getNewsContent: (id: string, link: string) =>
    ipcRenderer.invoke("news:get-content", id, link),
  markNewsAsRead: (id: string) => ipcRenderer.invoke("news:mark-as-read", id),
  markMultipleNewsAsRead: (ids: string[]) =>
    ipcRenderer.invoke("news:mark-multiple-as-read", ids),
  onNewsUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("news-updated", handler);
    return () => ipcRenderer.off("news-updated", handler);
  },
  sendDebugLog: (log: DebugLogEvent["payload"]) =>
    ipcRenderer.send("debug-log:send", log),

  getPath: (name: string) => ipcRenderer.invoke("app:get-path", name),
  openPath: (path: string) => ipcRenderer.invoke("shell:open-path", path),

  // [Update API]
  checkForUpdates: () => ipcRenderer.send("ui:update-check"),
  downloadUpdate: () => ipcRenderer.send("ui:update-download"),
  installUpdate: () => ipcRenderer.send("ui:update-install"),
  onUpdateStatusChange: (callback: (status: UpdateStatus) => void) => {
    const handler = (_event: IpcRendererEvent, status: UpdateStatus) =>
      callback(status);
    ipcRenderer.on("update-status-change", handler);
    return () => ipcRenderer.off("update-status-change", handler);
  },

  isUACBypassEnabled: () => ipcRenderer.invoke("uac:is-enabled"),
  enableUACBypass: () => ipcRenderer.invoke("uac:enable"),
  disableUACBypass: () => ipcRenderer.invoke("uac:disable"),

  relaunchApp: () => ipcRenderer.send("app:relaunch"),
  logoutSession: () => ipcRenderer.invoke("session:logout"),

  // [Patch API]
  onShowPatchFixModal: (
    callback: (data: {
      autoStart: boolean;
      serviceId?: string;
      gameId?: string;
    }) => void,
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (_event: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on("UI:SHOW_PATCH_MODAL", handler);
    return () => ipcRenderer.off("UI:SHOW_PATCH_MODAL", handler);
  },
  onPatchProgress: (callback: (progress: PatchProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: PatchProgress) =>
      callback(progress);
    ipcRenderer.on("patch:progress", handler);
    return () => ipcRenderer.off("patch:progress", handler);
  },
  triggerManualPatchFix: (
    serviceId?: AppConfig["serviceChannel"],
    gameId?: AppConfig["activeGame"],
  ) => {
    if (serviceId || gameId) {
      // Explicit trigger (e.g., from Settings 'Restore' button)
      ipcRenderer.send("patch:trigger-manual", serviceId, gameId);
    } else {
      // Resume pending (e.g., from Auto-Fix Confirmation Modal)
      ipcRenderer.send("patch:start-manual");
    }
  },
  triggerPatchCancel: () => ipcRenderer.send("patch:cancel"),
  checkBackupAvailability: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => ipcRenderer.invoke("patch:check-backup", serviceId, gameId),
  getDebugHistory: () => ipcRenderer.invoke("debug:get-history"),
  deleteConfig: (key: string) => ipcRenderer.invoke("config:delete", key),
  onScalingModeChange: (callback: (enabled: boolean) => void) => {
    const handler = (_event: IpcRendererEvent, enabled: boolean) =>
      callback(enabled);
    ipcRenderer.on("scaling-mode-changed", handler);
    return () => ipcRenderer.off("scaling-mode-changed", handler);
  },

  // Changelog
  onShowChangelog: (
    callback: (
      data:
        | import("../shared/types").ChangelogItem[]
        | {
            changelogs: import("../shared/types").ChangelogItem[];
            oldVersion?: string;
            newVersion?: string;
          },
    ) => void,
  ) => {
    const subscription = (
      _event: IpcRendererEvent,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any,
    ) => callback(data);
    ipcRenderer.on("UI:SHOW_CHANGELOG", subscription);
    return () => {
      ipcRenderer.removeListener("UI:SHOW_CHANGELOG", subscription);
    };
  },
});

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

import { DebugLogEvent } from "./events/types";
import { PreloadLogger } from "./utils/preload-logger";
import { getGameName } from "../shared/naming";
import { ChangelogItem } from "../shared/types";
import {
  GameStatusState,
  AppConfig,
  NewsCategory,
  UpdateStatus,
  PatchProgress,
  AccountUpdateData,
  PatchReservation,
  RenewedPatchReservation,
  RemoteFontItem,
  ImportSelection,
  GameLaunchContext,
  KakaoMaintenanceInfo,
  KakaoGameStarterMigrationRequest,
  GameInstallPathConflictAction,
  GameInstallPathConflictTarget,
  GameInstallPathConflictResolveResult,
  GameInstallPathClearResult,
  GameInstallPathDiagnostics,
  GameInstallPathRegistryTargetDeleteActionResult,
  GameInstallPathRegistryTargetDeleteRequest,
  GameInstallPathRegisterRequest,
  GameInstallPathRegisterResult,
  GameInstallPathSaveResult,
  GameInstallPathSelectionBatchResult,
  GameInstallPathSelectionResult,
  GameInstallPathTargetId,
  FatalErrorPayload,
  LauncherLogAvailability,
  LauncherLogSaveResult,
} from "../shared/types";

const logger = new PreloadLogger({ type: "PRELOAD", typeColor: "#8BE9FD" });

// --- Electron API Expose ---
// Used by React Renderer (App.tsx)

contextBridge.exposeInMainWorld("electronAPI", {
  triggerGameStart: (context: GameLaunchContext) => {
    logger.log("[Preload] Sending trigger-game-start to Main Process");
    ipcRenderer.send("trigger-game-start", context);
  },
  getGameInstallPathDiagnostics: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ): Promise<GameInstallPathDiagnostics> =>
    ipcRenderer.invoke("game-install-path:get-diagnostics", serviceId, gameId),
  setGameInstallPath: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    installPath: string,
  ): Promise<GameInstallPathSaveResult> =>
    ipcRenderer.invoke("game-install-path:set", serviceId, gameId, installPath),
  pickGameInstallPathTargets: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ): Promise<GameInstallPathSelectionResult> =>
    ipcRenderer.invoke("game-install-path:pick-targets", serviceId, gameId),
  applyGameInstallPathTargets: (
    selectionId: string,
    targetIds: readonly GameInstallPathTargetId[],
  ): Promise<GameInstallPathSelectionBatchResult> =>
    ipcRenderer.invoke("game-install-path:apply-targets", {
      selectionId,
      targetIds,
    }),
  resolveGameInstallPathConflict: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    action: GameInstallPathConflictAction,
    registryTarget: GameInstallPathConflictTarget,
  ): Promise<GameInstallPathConflictResolveResult> =>
    ipcRenderer.invoke(
      "game-install-path:resolve-conflict",
      serviceId,
      gameId,
      action,
      registryTarget,
    ),
  clearGameInstallPath: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ): Promise<GameInstallPathClearResult> =>
    ipcRenderer.invoke("game-install-path:clear-config", serviceId, gameId),
  deleteGameInstallPathRegistryTarget: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    request: GameInstallPathRegistryTargetDeleteRequest,
  ): Promise<GameInstallPathRegistryTargetDeleteActionResult> =>
    ipcRenderer.invoke(
      "game-install-path:delete-registry-target",
      serviceId,
      gameId,
      request,
    ),
  registerGameInstallPath: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    request: GameInstallPathRegisterRequest,
  ): Promise<GameInstallPathRegisterResult> =>
    ipcRenderer.invoke(
      "game-install-path:register",
      serviceId,
      gameId,
      request,
    ),
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
    const handler = (_event: IpcRendererEvent, status: GameStatusState) =>
      callback(status);
    ipcRenderer.on("game-status-update", handler);
    return () => ipcRenderer.off("game-status-update", handler);
  },
  getGameStatus: (gameId: string, serviceId: string) =>
    ipcRenderer.invoke("game:get-status", gameId, serviceId),
  onDebugLog: (callback: (log: DebugLogEvent["payload"]) => void) => {
    const handler = (_event: IpcRendererEvent, log: DebugLogEvent["payload"]) =>
      callback(log);
    ipcRenderer.on("debug-log", handler);
    return () => ipcRenderer.off("debug-log", handler);
  },
  onExceptionLog: (callback: (log: DebugLogEvent["payload"]) => void) => {
    const handler = (_event: IpcRendererEvent, log: DebugLogEvent["payload"]) =>
      callback(log);
    ipcRenderer.on("app:exception-log", handler);
    return () => ipcRenderer.off("app:exception-log", handler);
  },
  saveReport: (files: { name: string; content: string }[]) =>
    ipcRenderer.invoke("report:save", files),
  getLauncherLogAvailability: (
    timestamp: number,
  ): Promise<LauncherLogAvailability> =>
    ipcRenderer.invoke("launcher-log:get-export-availability", timestamp),
  saveLauncherLogsForTimestamp: (
    timestamp: number,
  ): Promise<LauncherLogSaveResult> =>
    ipcRenderer.invoke("launcher-log:save-for-timestamp", timestamp),
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
  getNewsContentCache: (id: string) =>
    ipcRenderer.invoke("news:get-content-cache", id),
  refreshAllNews: () => ipcRenderer.invoke("news:refresh-all"),
  getNewsLastUpdatedAt: (
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => ipcRenderer.invoke("news:get-last-updated-at", game, service, category),
  markNewsAsRead: (id: string) => ipcRenderer.invoke("news:mark-as-read", id),
  markMultipleNewsAsRead: (ids: string[]) =>
    ipcRenderer.invoke("news:mark-multiple-as-read", ids),
  onNewsUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("news-updated", handler);
    return () => ipcRenderer.off("news-updated", handler);
  },
  onWindowShow: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("app:window-show", handler);
    return () => ipcRenderer.off("app:window-show", handler);
  },
  sendDebugLog: (log: DebugLogEvent["payload"]) =>
    ipcRenderer.send("debug-log:send", log),

  getPath: (name: string) => ipcRenderer.invoke("app:get-path", name),
  openPath: (path: string) => ipcRenderer.invoke("shell:open-path", path),

  // [Update API]
  checkForUpdates: () => ipcRenderer.send("ui:update-check"),
  downloadUpdate: () => ipcRenderer.send("ui:update-download"),
  installUpdate: (isSilent?: boolean) =>
    ipcRenderer.send("ui:update-install", isSilent),
  onUpdateStatusChange: (callback: (status: UpdateStatus) => void) => {
    const handler = (_event: IpcRendererEvent, status: UpdateStatus) =>
      callback(status);
    ipcRenderer.on("update-status-change", handler);
    return () => ipcRenderer.off("update-status-change", handler);
  },
  getActiveTheme: (game: AppConfig["activeGame"]) =>
    ipcRenderer.invoke("theme:get-active", game),
  getThemes: () => ipcRenderer.invoke("theme:get-all"),
  syncThemesForce: () => ipcRenderer.invoke("theme:sync-force"),
  onThemeSynced: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("theme:synced", handler);
    return () => ipcRenderer.off("theme:synced", handler);
  },

  isUACBypassEnabled: () => ipcRenderer.invoke("uac:is-enabled"),
  enableUACBypass: () => ipcRenderer.invoke("uac:enable"),
  disableUACBypass: () => ipcRenderer.invoke("uac:disable"),

  relaunchApp: () => ipcRenderer.send("app:relaunch"),
  logoutSession: () => ipcRenderer.invoke("session:logout"),

  // Admin / UAC
  isAdmin: () => ipcRenderer.invoke("admin:is-admin"),
  relaunchAsAdmin: () => ipcRenderer.send("admin:relaunch"),
  ensureAdminSession: () => ipcRenderer.invoke("admin:ensure-session"),
  isAdminSessionActive: () => ipcRenderer.invoke("admin:is-session-active"),

  // [Patch API]
  onShowPatchFixModal: (
    callback: (data: {
      autoStart: boolean;
      serviceId?: string;
      gameId?: string;
    }) => void,
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      data: {
        autoStart: boolean;
        serviceId?: string;
        gameId?: string;
      },
    ) => callback(data);
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
  triggerRestoreBackup: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => {
    ipcRenderer.send("patch:restore-local", serviceId, gameId);
  },
  triggerPatchCancel: () => ipcRenderer.send("patch:cancel"),
  triggerForceRepair: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    manualVersion?: string,
    remoteWebRoot?: string,
  ) =>
    ipcRenderer.invoke(
      "tool:force-repair-executable",
      serviceId,
      gameId,
      manualVersion,
      remoteWebRoot,
    ),
  checkBackupAvailability: (
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => ipcRenderer.invoke("patch:check-backup", serviceId, gameId),
  triggerPatchReservation: (reservation: PatchReservation) =>
    ipcRenderer.send("patch:reserve", reservation),
  deletePatchReservation: (id: string) =>
    ipcRenderer.send("patch:delete-reservation", id),
  triggerRenewedPatchReservation: (reservation: RenewedPatchReservation) =>
    ipcRenderer.invoke("patch:reserve-renewed", reservation),
  deleteRenewedPatchReservation: (id: string) =>
    ipcRenderer.invoke("patch:delete-renewed-reservation", id),
  onShowPatchReservationModal: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("UI:SHOW_PATCH_RESERVATION_MODAL", handler);
    return () => ipcRenderer.off("UI:SHOW_PATCH_RESERVATION_MODAL", handler);
  },
  getDebugHistory: () => ipcRenderer.invoke("debug:get-history"),
  deleteConfig: (key: string) => ipcRenderer.invoke("config:delete", key),
  onScalingModeChange: (callback: (enabled: boolean) => void) => {
    const handler = (_event: IpcRendererEvent, enabled: boolean) =>
      callback(enabled);
    ipcRenderer.on("scaling-mode-changed", handler);
    return () => ipcRenderer.off("scaling-mode-changed", handler);
  },
  getAllChangelogs: () => ipcRenderer.invoke("changelog:get-all"),
  setWindowTitle: (title: string) => ipcRenderer.send("app:set-title", title),

  // Changelog
  onShowChangelog: (
    callback: (
      data:
        | ChangelogItem[]
        | {
            changelogs: ChangelogItem[];
            oldVersion?: string;
            newVersion?: string;
          },
    ) => void,
  ) => {
    const subscription = (
      _event: IpcRendererEvent,
      data:
        | ChangelogItem[]
        | {
            changelogs: ChangelogItem[];
            oldVersion?: string;
            newVersion?: string;
          },
    ) => callback(data);
    ipcRenderer.on("UI:SHOW_CHANGELOG", subscription);
    return () => {
      ipcRenderer.removeListener("UI:SHOW_CHANGELOG", subscription);
    };
  },
  onTitleUpdated: (callback: (title: string) => void) => {
    const handler = (_event: IpcRendererEvent, title: string) =>
      callback(title);
    ipcRenderer.on("app:title-updated", handler);
    return () => ipcRenderer.off("app:title-updated", handler);
  },
  onTopCenterTitlebarHover: (callback: (hovered: boolean) => void) => {
    const handler = (_event: IpcRendererEvent, hovered: boolean) =>
      callback(hovered);
    ipcRenderer.on("app:top-center-titlebar-hover", handler);
    return () => ipcRenderer.off("app:top-center-titlebar-hover", handler);
  },
  onKakaoMaintenanceDetected: (
    callback: (
      info: KakaoMaintenanceInfo & {
        gameId: AppConfig["activeGame"];
        serviceId: "Kakao Games";
      },
    ) => void,
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      info: KakaoMaintenanceInfo & {
        gameId: AppConfig["activeGame"];
        serviceId: "Kakao Games";
      },
    ) => callback(info);
    ipcRenderer.on("kakao:maintenance-detected", handler);
    return () => ipcRenderer.off("kakao:maintenance-detected", handler);
  },
  requestTitleUpdate: () => ipcRenderer.send("app:request-title"),

  // [UAC Migration]
  onUacMigrationRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("uac-migration:request", handler);
    return () => ipcRenderer.off("uac-migration:request", handler);
  },
  onKakaoStarterUacRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("kakao-starter-uac:request", handler);
    return () => ipcRenderer.off("kakao-starter-uac:request", handler);
  },
  onKakaoStarterMigrationRequest: (
    callback: (request: KakaoGameStarterMigrationRequest) => void,
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      request: KakaoGameStarterMigrationRequest,
    ) => callback(request);
    ipcRenderer.on("kakao-starter-migration:request", handler);
    return () => ipcRenderer.off("kakao-starter-migration:request", handler);
  },
  reportUacMigrationReady: () => ipcRenderer.send("uac-migration:ready"),
  confirmUacMigration: () => ipcRenderer.send("uac-migration:confirm"),
  confirmKakaoStarterUacBypass: () =>
    ipcRenderer.invoke("kakao-starter-uac:confirm"),
  declineKakaoStarterUacBypass: () =>
    ipcRenderer.invoke("kakao-starter-uac:decline"),
  openKakaoGamesStarterInstaller: () =>
    ipcRenderer.invoke("kakao-starter-migration:open-installer"),
  uninstallDaumGameStarter: () =>
    ipcRenderer.invoke("kakao-starter-migration:uninstall-daum"),
  dismissKakaoStarterMigrationPrompt: () =>
    ipcRenderer.invoke("kakao-starter-migration:dismiss"),

  initialGameName: getGameName(
    ipcRenderer.sendSync("config:get-sync", "activeGame"),
  ),

  // [Account ID & Validation]
  triggerAccountValidation: (serviceId: AppConfig["serviceChannel"]) =>
    ipcRenderer.send("account:trigger-validation", serviceId),
  showLoginWindow: (serviceId: AppConfig["serviceChannel"]) =>
    ipcRenderer.send("account:show-login-window", serviceId),
  onAccountUpdate: (callback: (data: AccountUpdateData) => void) => {
    const handler = (_event: IpcRendererEvent, data: AccountUpdateData) =>
      callback(data);
    ipcRenderer.on("account:updated", handler);
    return () => ipcRenderer.off("account:updated", handler);
  },

  // [Fatal Error Handling]
  onFatalError: (callback: (payload: FatalErrorPayload) => void) => {
    const handler = (_event: IpcRendererEvent, payload: FatalErrorPayload) =>
      callback(payload);
    ipcRenderer.on("app:fatal-error", handler);
    return () => ipcRenderer.off("app:fatal-error", handler);
  },
  reportFatalReady: () => ipcRenderer.send("app:fatal-error-ready"),

  // [Font Management]
  font: {
    getForceApplyPolicy: () =>
      ipcRenderer.invoke("font:get-force-apply-policy"),
    setForceApplyPolicy: (enabled: boolean) =>
      ipcRenderer.invoke("font:set-force-apply-policy", enabled),
    getFonts: () => ipcRenderer.invoke("font:get-fonts"),
    getUnifiedFonts: () => ipcRenderer.invoke("font:get-unified-fonts"),
    pickFontFile: () => ipcRenderer.invoke("font:pick-file"),
    readFile: (filePath: string) =>
      ipcRenderer.invoke("font:read-file", filePath),
    analyzeFile: (filePath: string) =>
      ipcRenderer.invoke("font:analyze-file", filePath),
    addFont: (
      filePath: string,
      previewDataUrl?: string,
      customAlias?: string,
      remoteSourceId?: string | null,
    ) =>
      ipcRenderer.invoke(
        "font:add-font",
        filePath,
        previewDataUrl,
        customAlias,
        remoteSourceId,
      ),
    removeFont: (id: string) => ipcRenderer.invoke("font:remove-font", id),
    updateAlias: (id: string, newAlias: string) =>
      ipcRenderer.invoke("font:update-alias", id, newAlias),
    applyBatch: (assignments: Record<string, string | null>) =>
      ipcRenderer.invoke("font:apply-batch", assignments),
    reapply: () => ipcRenderer.invoke("font:reapply"),
    checkMigration: () => ipcRenderer.invoke("font:check-migration"),
    completeMigration: () => ipcRenderer.invoke("font:complete-migration"),
    downloadRemote: (item: RemoteFontItem, customAlias?: string) =>
      ipcRenderer.invoke("font:download-remote", item, customAlias),
    openCustomFontsFolder: () => ipcRenderer.invoke("font:open-folder"),
    importExternalFont: (serviceId: string) =>
      ipcRenderer.invoke("font:import-external", serviceId),
    cleanupExternalFont: (serviceId: string) =>
      ipcRenderer.invoke("font:cleanup-external", serviceId),
    detectExternalFontsDetail: () =>
      ipcRenderer.invoke("font:detect-external-detail"),
    importSelectedExternalFonts: (selection: ImportSelection[]) =>
      ipcRenderer.invoke("font:import-selected-external", selection),
    getCatalog: () => ipcRenderer.invoke("font:get-catalog"),
    syncCatalog: (force: boolean = false) =>
      ipcRenderer.invoke("font:sync-catalog", force),
    onFontUpdated: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("font:updated", handler);
      return () => ipcRenderer.off("font:updated", handler);
    },
    onDownloadProgress: (
      callback: (data: { id: string; progress: number }) => void,
    ) => {
      const handler = (
        _event: IpcRendererEvent,
        data: { id: string; progress: number },
      ) => callback(data);
      ipcRenderer.on("font:download-progress", handler);
      return () => ipcRenderer.off("font:download-progress", handler);
    },
  },
  remoteVersion: {
    resolve: (gameId: AppConfig["activeGame"]) =>
      ipcRenderer.invoke("version:resolveRemote", gameId),
    peek: (gameId: AppConfig["activeGame"]) =>
      ipcRenderer.invoke("version:peekRemote", gameId),
    onUpdated: (
      callback: (payload: {
        gameId: AppConfig["activeGame"];
        webRoot: string;
        version: string;
        source: "master-socket" | "gh-pages";
        fetchedAt: number;
      }) => void,
    ) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: {
          gameId: AppConfig["activeGame"];
          webRoot: string;
          version: string;
          source: "master-socket" | "gh-pages";
          fetchedAt: number;
        },
      ) => callback(payload);
      ipcRenderer.on("remote-version:updated", handler);
      return () => ipcRenderer.off("remote-version:updated", handler);
    },
  },
});

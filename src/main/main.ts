import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  session,
  screen,
  protocol,
  net,
  webContents,
} from "electron";
import JSZip from "jszip";

import { registerShutdownHandlers } from "./app-shutdown";
import { ContextProvider } from "./context-provider";
import { eventBus } from "./events/EventBus";
import { registerCoreEventHandlers } from "./events/register-handlers";
import { createFatalErrorRecord } from "./fatal-error";
import {
  setConfigWithEvent,
  deleteConfigWithEvent,
} from "./utils/config-utils";
import { DEBUG_APP_CONFIG } from "../shared/config";
import { getGameName, getLauncherTitle, getAppName } from "../shared/naming";
import {
  ACTIVE_GAMES,
  AppConfig,
  NewsCategory,
  DebugLogPayload,
  FatalErrorPayload,
  GameInstallPathConflictTarget,
  GameInstallPathRegisterRequest,
  GameLaunchContext,
  SERVICE_CHANNELS,
} from "../shared/types";
import { BASE_URLS } from "../shared/urls";
import { syncAutoLaunch } from "./events/handlers/AutoLaunchHandler";
import {
  triggerPendingManualPatches,
  cancelPendingPatches,
} from "./events/handlers/AutoPatchHandler";
import { FontIpcHandler } from "./events/handlers/FontIpcHandler";
import { ToolForceRepairHandler } from "./events/handlers/ToolHandler";
import { triggerUpdateCheck } from "./events/handlers/UpdateHandler";
import {
  AppContext,
  ConfigChangeEvent,
  EventType,
  GameStatusChangeEvent,
  EventHandler,
  AppEvent,
  UIUpdateCheckEvent,
  UIUpdateDownloadEvent,
  UIUpdateInstallEvent,
  UpdateWindowTitleEvent,
  DebugLogEvent,
  IServiceManager,
  UIEvent,
} from "./events/types";
import {
  createGameInstallPathIpcHandlers,
  createGameInstallPathRegistryDeleteHandler,
} from "./game/GameInstallPathIpcHandlers";
import { GameInstallPathSelectionService } from "./game/GameInstallPathSelectionService";
import {
  reconcileAllGameInstallStatuses,
  reconcileCurrentGameInstallStatusIfStale,
  runManualGameInstallPathAction,
} from "./game/GameInstallStatusReconciler";
import { GameSessionTracker, SessionContext } from "./game/GameSessionTracker";
import { registerDiagnosticLogIpc } from "./ipc/diagnostic-log-ipc";
import { registerEventNotificationIpc } from "./ipc/event-notifications";
import { registerGameStatusIpc } from "./ipc/game-status-ipc";
import {
  createRenewedPatchReservation,
  deleteRenewedPatchReservation,
} from "./ipc/renewed-patch-reservation-ipc";
import {
  archiveAutomationDumpSession,
  dumpAutomationPage,
  handleAutomationDumpGameStatus,
  scheduleAutomationDumpRetentionCleanup,
  startAutomationDumpSession,
  type AutomationDumpArchiveResult,
} from "./kakao/automation-page-dump";
import { isExpectedNavigationAbort } from "./kakao/navigation-error";
import { initKakaoSession, KAKAO_PARTITION } from "./kakao/session";
import { shouldHideReleasedAutomationWindow } from "./kakao/visibility-policy";
import { trayManager } from "./managers/TrayManager";
import {
  buildGamePathDiagnosticQaRendererUrl,
  isAllowedGamePathDiagnosticQaRendererUrl,
  resolveGamePathDiagnosticQaLaunch,
  type GamePathDiagnosticQaLaunchRequest,
} from "./qa/GamePathDiagnosticQa";
import { setupSessionSecurity } from "./security/permissions";
import { changelogService } from "./services/ChangelogService";
import { diagnosticLogStore } from "./services/DiagnosticLogStore";
import { GameVersionScanner } from "./services/GameVersionScanner";
import { newsService } from "./services/NewsService";
import { PatchManager } from "./services/PatchManager";
import {
  getPatchReservationService,
  getProcessWatcher,
  initializeCoreServices,
} from "./services/register-services";
import { serviceManager } from "./services/ServiceManager";
import { themeCacheManager } from "./services/ThemeCacheManager";
import { getConfig, setupStoreObservers, default as store } from "./store";
import {
  isAdmin,
  relaunchAsAdmin,
  ensureAdminSession,
  isAdminSessionActive,
} from "./utils/admin";
import {
  setupMainLogger,
  logger,
  getLogHistory,
  printBanner,
  recordDebugLogPayload,
  setupDiagnosticLogSink,
} from "./utils/logger";
import { LogParser } from "./utils/LogParser";
import { openExternalSafely } from "./utils/open-external";
import { PowerShellManager } from "./utils/powershell";
import {
  getGameInstallPath,
  getGameInstallPathDiagnostics,
  applyGameInstallPathTarget,
  clearGameInstallPath,
  deleteGameInstallPathRegistryTarget,
  deriveGameInstallPathTargetSnapshots,
  registerGameInstallPath,
  resolveGameInstallPathConflict,
  setGameInstallPath,
  syncInstallLocation,
} from "./utils/registry";
import { RemoteVersionResolver } from "./utils/RemoteVersionResolver";
import { KAKAO_GAMES_STARTER_INSTALLER_URL } from "./utils/uac/kakao-game-starter";
import {
  KakaoGameStarterMigration,
  LegacyUacManager,
  SimpleUacBypass,
} from "./utils/uac/uac-migration";
import {
  applyResolutionRules,
  enforceConstraints,
} from "./utils/window-resolution";

// Set App Name explicitly for Windows Branding
// Dynamically set in broadcastTitleUpdate
// app.setName("POE2 Unofficial Launcher");

// Register custom protocol as privileged so it bypasses CSP and works like file://
protocol.registerSchemesAsPrivileged([
  {
    scheme: "asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

/**
 * Checks if the launcher version has changed since the last run.
 * If changed, triggers the Changelog check sequence.
 */
async function checkLauncherVersionUpdate() {
  const currentVersion = app.getVersion();
  const storedVersion = getConfig("launcherVersion") as string;

  if (currentVersion !== storedVersion) {
    logger.log(
      `[Main] Version changed: ${storedVersion || "none"} -> ${currentVersion}. Updating config.`,
    );

    // Use setConfigWithEvent (broadcasts change automatically)
    setConfigWithEvent("launcherVersion", currentVersion);
  }
}

// --- Fatal Error Handling State ---
let fatalErrorBuffer: FatalErrorPayload | null = null;
let isRendererReadyForFatalError = false;

function handleFatalError(error: Error | unknown, type: string) {
  const { payload, errorMessage } = createFatalErrorRecord(error, type);

  if (
    isRendererReadyForFatalError &&
    context.mainWindow &&
    !context.mainWindow.isDestroyed()
  ) {
    context.mainWindow.webContents.send("app:fatal-error", payload);
  } else {
    // Buffer it if renderer isn't ready
    if (!fatalErrorBuffer) {
      fatalErrorBuffer = payload;
    } else {
      fatalErrorBuffer = {
        ...fatalErrorBuffer,
        errorDetails: `${fatalErrorBuffer.errorDetails}\n\n[${type}] ${errorMessage}`,
      };
    }
  }
}

process.on("uncaughtException", (error) => {
  handleFatalError(error, "uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  handleFatalError(reason, "unhandledRejection");
});

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public");

let mainWindow: BrowserWindow | null;
let gameWindow: BrowserWindow | null;
let debugWindow: BrowserWindow | null = null; // Debug Window Reference
let debugDestructionTimeout: NodeJS.Timeout | null = null; // [New] Delayed destruction timer
let debugRecoveryTimeout: NodeJS.Timeout | null = null;

const gameInstallPathSelectionService = new GameInstallPathSelectionService({
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
  fsStat: (targetPath) => fs.stat(targetPath),
  getDiagnostics: getGameInstallPathDiagnostics,
  collectSnapshots: deriveGameInstallPathTargetSnapshots,
  applyTarget: applyGameInstallPathTarget,
});

// --- Account Validation State ---
let validationModeActive = false;
let validationTimeout: NodeJS.Timeout | null = null;
const VALIDATION_TIMEOUT_MS = 10000; // 10s
let automationTimeout: NodeJS.Timeout | null = null;
let lastActiveAutomationWebContentsId: number | null = null; // [New] Track which window last updated the timeout

// [New] Safety Cleanup for Automation Tracking
app.on("web-contents-created", (_, wc) => {
  wc.on("destroyed", () => {
    if (lastActiveAutomationWebContentsId === wc.id) {
      logger.log(
        `[Main] Clearing lastActiveAutomationWebContentsId ${wc.id} (Destroyed)`,
      );
      lastActiveAutomationWebContentsId = null;
    }
    // navigationTriggerContexts is not globally available here but we can use the helper
    setNavigationTrigger(wc.id, null);
  });
});

/**
 * Safely resizes a window based on actual content dimensions using setSize.
 * Includes a 100ms delay to allow external layouts to fully settle.
 * Iterates through all DOM elements to find the true max scroll dimensions,
 * preventing clipping on sites that use internal scroll containers.
 */
async function resizeToFitContent(win: BrowserWindow) {
  if (!win || win.isDestroyed()) return;

  // Wait for dynamic layouts to stabilize
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const dimensions = await win.webContents.executeJavaScript(`
      (() => {
        const allElements = document.querySelectorAll('*');
        let maxW = document.documentElement.scrollWidth;
        let maxH = document.documentElement.scrollHeight;

        allElements.forEach(el => {
          if (el.scrollWidth > maxW) maxW = el.scrollWidth;
          if (el.scrollHeight > maxH) maxH = el.scrollHeight;
        });

        return { width: maxW, height: maxH };
      })();
    `);

    if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
      // Add a small safety margin to prevent scrollbars from appearing
      const targetWidth = Math.ceil(dimensions.width) + 30;
      const targetHeight = Math.ceil(dimensions.height) + 40;

      logger.log(
        `[Main] Adjusting window ${win.id} size to fit content: ${targetWidth}x${targetHeight}`,
      );
      win.setSize(targetWidth, targetHeight);

      // Re-center after resizing
      win.center();
    }
  } catch (e) {
    logger.error(`[Main] Failed to adjust window ${win.id} size:`, e);
  }
}

function setValidationMode(active: boolean) {
  validationModeActive = active;
  if (validationTimeout) {
    clearTimeout(validationTimeout);
    validationTimeout = null;
  }

  if (active) {
    validationTimeout = setTimeout(() => {
      const currentUrl =
        gameWindow && !gameWindow.isDestroyed()
          ? gameWindow.webContents.getURL()
          : "Unknown (Window closed)";

      // Ignore timeout if the window is cleanly reset or still loading about:blank
      if (currentUrl === "about:blank") {
        logger.log(
          "[Account] Ignoring validation timeout on about:blank window.",
        );
        return;
      }

      logger.error(`[Account] Validation timed out at: ${currentUrl}`);

      setValidationMode(false);
      if (gameWindow && !gameWindow.isDestroyed()) {
        gameWindow.close();
      }
    }, VALIDATION_TIMEOUT_MS);
  }
}

function clearAutomationTimeout() {
  if (automationTimeout) {
    clearTimeout(automationTimeout);
    automationTimeout = null;
  }
}

function startAutomationTimeout(ms: number = VALIDATION_TIMEOUT_MS) {
  clearAutomationTimeout();

  if (ms === -1) {
    logger.log("[Automation] Process timer DISABLED (infinite wait).");
    return;
  }

  automationTimeout = setTimeout(async () => {
    // [Getter Logic] Determine which window to show for the timeout
    let targetWindow = gameWindow;

    if (lastActiveAutomationWebContentsId) {
      const wc = webContents.fromId(lastActiveAutomationWebContentsId);
      if (wc) {
        const activeWin = BrowserWindow.fromWebContents(wc);
        if (activeWin && !activeWin.isDestroyed()) {
          targetWindow = activeWin;
        }
      }
    }

    const currentUrl =
      targetWindow && !targetWindow.isDestroyed()
        ? targetWindow.webContents.getURL()
        : "Unknown (Window closed)";

    // Ignore timeout if the window is cleanly reset or still loading about:blank
    if (currentUrl === "about:blank") {
      logger.log(
        "[Automation] Ignoring process timeout on about:blank window.",
      );
      return;
    }

    logger.error(
      `[Automation] Process timed out at: ${currentUrl} (Win: ${targetWindow?.id || "N/A"})`,
    );

    if (targetWindow && !targetWindow.isDestroyed()) {
      // [Security] Do NOT show or alert if this is a background validation window
      const triggerContext = getNavigationTrigger(targetWindow.webContents.id);
      if (triggerContext === "ACCOUNT_VALIDATION") {
        logger.log(
          "[Automation] Process timed out (Validation Mode). Suppressing show/alert.",
        );
        return;
      }

      // [v22] Adjust size with 0.1s delay
      targetWindow.show();
      await resizeToFitContent(targetWindow);
      targetWindow.center();
      targetWindow.focus();
      targetWindow.moveTop();
      await dumpAutomationPage(targetWindow, {
        reason: "automation-timeout",
        triggerContext: triggerContext ?? undefined,
        mainWindow,
        debugWindow,
      });
      // Use native dialog to avoid blocking the renderer thread (v9)
      try {
        const displayUrl = currentUrl.includes("?")
          ? currentUrl.split("?")[0] + "?..."
          : currentUrl.length > 80
            ? currentUrl.substring(0, 77) + "..."
            : currentUrl;

        dialog.showMessageBox(targetWindow, {
          type: "warning",
          title: "자동화 지연 알림",
          message: "자동화 진행 중 지연이 발생했습니다.",
          detail: `페이지 확인이 필요할 수 있습니다. 직접 확인해 주세요.\n\n현재 URL:\n${displayUrl}`,
          buttons: ["확인"],
          noLink: true,
        });
      } catch (e) {
        logger.error("[Automation] Failed to show alert in target window:", e);
      }
    }
  }, ms);
}

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

// Track the current game/service being launched to sync context to popups
const gameSessionTracker = new GameSessionTracker();

// Reliable mapping of window IDs to their game context
const windowContextMap = new Map<number, SessionContext>();

registerGameStatusIpc({
  getAppContext: () => appContext,
  getActiveSessionContext: () => gameSessionTracker.getActiveSessionContext(),
  getWindowContext: (webContentsId) => windowContextMap.get(webContentsId),
});

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.log("[Main] Another instance is already running. Quitting...");
  app.quit();
} else {
  app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
    logger.log("[Main] Second instance detected. Focusing existing window...");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();

      // [Trigger] Check for updates silently when a second instance tries to launch
      if (appContext) {
        triggerUpdateCheck(appContext, true);
      }
    }
  });
}

// Debug Constants
const FORCE_DEBUG = process.env.VITE_SHOW_GAME_WINDOW === "true";
let didReportKakaoStartFailure = false;
const DEBUG_KEYS = [
  "dev_mode",
  "debug_console",
  "show_inactive_windows",
  "show_inactive_window_console",
];

type KakaoAutomationFailurePayload = {
  errorCode?: string;
  handlerName?: string;
  message?: string;
  name?: string;
  stack?: string;
  url?: string;
  context?: {
    gameId?: AppConfig["activeGame"];
    serviceId?: AppConfig["serviceChannel"];
  } | null;
};

/**
 * Get configuration value considering environment variable priority.
 * This does not persist the forced value to the store.
 */
function getEffectiveConfig(
  key?: string,
  ignoreDependencies = false,
  includeForced = true,
): unknown {
  // 1. Full Config Object
  if (!key) {
    const raw = getConfig() as Record<string, unknown>;
    const effective = { ...raw };
    DEBUG_KEYS.forEach((k) => {
      effective[k] = getEffectiveConfig(k, ignoreDependencies, includeForced);
    });
    return effective;
  }

  // 2. Force Debug Mode via Env Var
  if (includeForced && FORCE_DEBUG && DEBUG_KEYS.includes(key)) {
    return true;
  }

  // 3. Resolve Dependency: If dev_mode is disabled, force dependent keys to false
  if (!ignoreDependencies && DEBUG_KEYS.includes(key) && key !== "dev_mode") {
    const isDevMode = getEffectiveConfig("dev_mode") === true;
    if (!isDevMode) {
      return false;
    }
  }

  const value = getConfig(key);
  return value;
}

function createKakaoAutomationError(payload: KakaoAutomationFailurePayload) {
  const message =
    payload.message || payload.errorCode || "KAKAO_AUTOMATION_FAILURE";
  const error = new Error(message);
  error.name = payload.name || "KakaoAutomationFailure";
  if (payload.stack) {
    error.stack = payload.stack;
  }
  return error;
}

function sanitizeKakaoFailureReason(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatKakaoStartFailureLog(input: {
  errorCode: string;
  archiveResult: AutomationDumpArchiveResult | null;
}) {
  const dumpLines = input.archiveResult
    ? [
        `진단 덤프 파일: ${input.archiveResult.archivePath}`,
        "문의 시 위 파일을 함께 첨부해 주세요.",
      ]
    : [
        "진단 덤프 파일: 생성되지 않았습니다.",
        "문의 시 아래 오류 정보를 함께 전달해 주세요.",
      ];

  return [
    "[KakaoStartFailure] 게임 실행 또는 로그인 절차 중 오류가 발생했습니다.",
    `오류 코드: ${input.errorCode}`,
    ...dumpLines,
  ].join("\n");
}

async function finalizeKakaoStartFailure(input: {
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
  errorCode: string;
  error: Error;
  dumpReason: string;
  targetWindow?: BrowserWindow | null;
  triggerContext?: string;
}) {
  if (!appContext) return;
  if (didReportKakaoStartFailure) {
    logger.warn(
      `[KakaoStartFailure] Ignored duplicate Kakao start failure report: ${input.errorCode}`,
    );
    return;
  }
  didReportKakaoStartFailure = true;

  if (input.targetWindow && !input.targetWindow.isDestroyed()) {
    await dumpAutomationPage(input.targetWindow, {
      reason: input.dumpReason,
      triggerContext: input.triggerContext,
      mainWindow,
      debugWindow,
    });
  }

  const archiveResult = await archiveAutomationDumpSession(
    `status-error-${input.errorCode}`,
    { logResult: false },
  );

  logger.error(
    formatKakaoStartFailureLog({
      errorCode: input.errorCode,
      archiveResult,
    }),
    input.error,
  );

  await eventBus.emit<GameStatusChangeEvent>(
    EventType.GAME_STATUS_CHANGE,
    appContext,
    {
      gameId: input.gameId,
      serviceId: input.serviceId,
      status: "error",
      errorCode: input.errorCode,
    },
  );
}

// Security: Explicitly blocked permissions
// Security: Permissions are now handled in src/main/security/permissions.ts

// IPC Handlers for Configuration
ipcMain.handle(
  "config:get",
  (_event, key?: string, ignoreDependencies = false, includeForced = true) => {
    return getEffectiveConfig(key, ignoreDependencies, includeForced);
  },
);

ipcMain.handle("config:is-forced", (_event, key: string) => {
  return FORCE_DEBUG && DEBUG_KEYS.includes(key);
});

ipcMain.on("debug-log:send", (_event, log: DebugLogPayload) => {
  recordDebugLogPayload(log);
  if (appContext) {
    eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, appContext, log);
  }
});

ipcMain.on(
  "kakao:automation-failure",
  async (event, payload: KakaoAutomationFailurePayload) => {
    if (!appContext) return;

    const senderId = event.sender.id;
    const mappedContext = windowContextMap.get(senderId);
    const activeSessionContext = gameSessionTracker.getActiveSessionContext();
    const gameId =
      payload.context?.gameId ||
      mappedContext?.gameId ||
      activeSessionContext?.gameId;
    const serviceId =
      payload.context?.serviceId ||
      mappedContext?.serviceId ||
      activeSessionContext?.serviceId;

    if (!gameId || serviceId !== "Kakao Games") {
      logger.warn(
        `[KakaoStartFailure] Ignored automation failure from unknown context: ${senderId}`,
      );
      return;
    }

    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    await finalizeKakaoStartFailure({
      gameId,
      serviceId,
      errorCode: payload.errorCode || "KAKAO_AUTOMATION_FAILURE",
      error: createKakaoAutomationError(payload),
      dumpReason: `automation-failure-${sanitizeKakaoFailureReason(
        payload.handlerName || "unknown",
      )}`,
      targetWindow: sourceWindow,
      triggerContext: getNavigationTrigger(senderId) ?? undefined,
    });
  },
);

ipcMain.on("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
});

// [Fatal Error Handling]
ipcMain.on("app:fatal-error-ready", () => {
  logger.log("[Main] Renderer is ready to receive fatal errors.");
  isRendererReadyForFatalError = true;

  // Flush buffer if any
  if (fatalErrorBuffer && mainWindow && !mainWindow.isDestroyed()) {
    logger.log("[Main] Flushing fatal error buffer to renderer.");
    mainWindow.webContents.send("app:fatal-error", fatalErrorBuffer);
    fatalErrorBuffer = null;
  }
});

ipcMain.handle("debug:get-history", () => {
  return getLogHistory();
});

// [Removed] Old session:logout handler (duplicates new partitioned one)

const isSupportedGameInstallContext = (
  serviceId: unknown,
  gameId: unknown,
): serviceId is AppConfig["serviceChannel"] => {
  return (
    SERVICE_CHANNELS.includes(serviceId as AppConfig["serviceChannel"]) &&
    ACTIVE_GAMES.includes(gameId as AppConfig["activeGame"])
  );
};

const gameInstallPathIpcHandlers = createGameInstallPathIpcHandlers({
  isSupportedContext: isSupportedGameInstallContext,
  selectionService: gameInstallPathSelectionService,
  showOpenDialog: async (sender, options) => {
    const ownerWebContents = webContents.fromId(sender.id);
    const targetWindow = ownerWebContents
      ? BrowserWindow.fromWebContents(ownerWebContents)
      : null;
    return targetWindow
      ? dialog.showOpenDialog(targetWindow, options)
      : dialog.showOpenDialog(options);
  },
  runManualAction: (context, action) =>
    runManualGameInstallPathAction(
      appContext,
      context.serviceId,
      context.gameId,
      "manual-path-targets-apply",
      action,
    ),
});

const gameInstallPathRegistryDeleteHandler =
  createGameInstallPathRegistryDeleteHandler({
    isSupportedContext: isSupportedGameInstallContext,
    deleteRegistryTarget: deleteGameInstallPathRegistryTarget,
    getDiagnostics: getGameInstallPathDiagnostics,
    runManualAction: (context, action) =>
      runManualGameInstallPathAction(
        appContext,
        context.serviceId,
        context.gameId,
        "manual-registry-target-delete",
        action,
      ),
  });

ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
  // [Safety] Do not persist if the key is forced in dev:test mode
  if (FORCE_DEBUG && DEBUG_KEYS.includes(key)) {
    logger.warn(`[Main] config:set ignored for forced key: ${key}`);
    return;
  }

  const oldValue = getConfig(key);

  // Optimization: Only update and emit if value has changed
  const oldStr = JSON.stringify(oldValue);
  const newStr = JSON.stringify(value);

  if (oldStr === newStr) {
    return;
  }

  // Use shared utility to Set & Broadcast
  // It handles context checking internally
  setConfigWithEvent(key, value);
});

ipcMain.handle("config:delete", (_event, key: string) => {
  // Use shared utility to Delete & Broadcast
  deleteConfigWithEvent(key);
});

ipcMain.handle(
  "game-install-path:get-diagnostics",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => {
    if (!isSupportedGameInstallContext(serviceId, gameId)) {
      throw new Error(
        `Unsupported game install context: ${serviceId}/${gameId}`,
      );
    }

    return getGameInstallPathDiagnostics(serviceId, gameId);
  },
);

ipcMain.handle(
  "game-install-path:set",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    installPath: string,
  ) => {
    if (!isSupportedGameInstallContext(serviceId, gameId)) {
      throw new Error(
        `Unsupported game install context: ${serviceId}/${gameId}`,
      );
    }

    return runManualGameInstallPathAction(
      appContext,
      serviceId,
      gameId,
      "manual-config-path-set",
      () => setGameInstallPath(serviceId, gameId, installPath),
    );
  },
);

ipcMain.handle(
  "game-install-path:pick-targets",
  gameInstallPathIpcHandlers.pickGameInstallPathTargets,
);

ipcMain.handle(
  "game-install-path:apply-targets",
  gameInstallPathIpcHandlers.applyGameInstallPathTargets,
);

ipcMain.handle(
  "game-install-path:resolve-conflict",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    action: "launcher-config-only" | "sync-registry",
    registryTarget: GameInstallPathConflictTarget,
  ) => {
    if (!isSupportedGameInstallContext(serviceId, gameId)) {
      throw new Error(
        `Unsupported game install context: ${serviceId}/${gameId}`,
      );
    }

    if (action !== "launcher-config-only" && action !== "sync-registry") {
      throw new Error(`Unsupported game install conflict action: ${action}`);
    }
    const canonicalRegistryTarget: GameInstallPathConflictTarget = {
      targetId: registryTarget?.targetId,
      expectedPath: registryTarget?.expectedPath,
      expectedConfigPath: registryTarget?.expectedConfigPath,
    };

    return runManualGameInstallPathAction(
      appContext,
      serviceId,
      gameId,
      `manual-path-conflict-${action}`,
      () =>
        resolveGameInstallPathConflict(
          serviceId,
          gameId,
          action,
          canonicalRegistryTarget,
        ),
    );
  },
);

ipcMain.handle(
  "game-install-path:clear-config",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => {
    if (!isSupportedGameInstallContext(serviceId, gameId)) {
      throw new Error(
        `Unsupported game install context: ${serviceId}/${gameId}`,
      );
    }

    return runManualGameInstallPathAction(
      appContext,
      serviceId,
      gameId,
      "manual-config-path-clear",
      () => clearGameInstallPath(serviceId, gameId, "config"),
    );
  },
);

ipcMain.handle(
  "game-install-path:delete-registry-target",
  gameInstallPathRegistryDeleteHandler,
);

ipcMain.handle(
  "game-install-path:register",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    request: GameInstallPathRegisterRequest,
  ) => {
    if (!isSupportedGameInstallContext(serviceId, gameId)) {
      throw new Error(
        `Unsupported game install context: ${serviceId}/${gameId}`,
      );
    }

    return runManualGameInstallPathAction(
      appContext,
      serviceId,
      gameId,
      "manual-registry-path-register",
      () => registerGameInstallPath(serviceId, gameId, request),
    );
  },
);

ipcMain.handle(
  "report:save",
  async (_event, files: { name: string; content: string }[]) => {
    if (!files || files.length === 0) return false;

    try {
      const win = BrowserWindow.fromWebContents(_event.sender);
      if (!win) return false;

      if (files.length === 1) {
        // Single File: Direct Save
        const file = files[0];
        const ext = path.extname(file.name) || ".txt";
        const { filePath, canceled } = await dialog.showSaveDialog(win, {
          title: "Save Report File",
          defaultPath: file.name,
          filters: [
            { name: "Report File", extensions: [ext.replace(".", "")] },
          ],
        });

        if (canceled || !filePath) return false;
        await fs.writeFile(filePath, file.content);
        return true;
      } else {
        // Multi Files: Zip & Save
        const zip = new JSZip();
        files.forEach((f) => {
          zip.file(f.name, f.content);
        });

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

        const { filePath, canceled } = await dialog.showSaveDialog(win, {
          title: "Save Report ZIP",
          defaultPath: "report.zip",
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (canceled || !filePath) return false;
        await fs.writeFile(filePath, zipBuffer);
        return true;
      }
    } catch (error) {
      logger.error("[Main] Failed to save report:", error);
      return false;
    }
  },
);

ipcMain.handle("file:get-hash", async (_event, filePath: string) => {
  try {
    let targetPath = filePath;

    // Resolve URL-like paths (e.g., from VITE assets or data URLs)
    if (filePath.startsWith("data:")) {
      return crypto.createHash("md5").update(filePath).digest("hex");
    }

    if (filePath.startsWith("file://")) {
      targetPath = fileURLToPath(filePath);
    } else if (filePath.startsWith("asset://")) {
      // Decode the virtual path: asset://[game]/[themeId]/[filename]
      try {
        const urlObj = new URL(filePath);
        // urlObj.hostname = game (lowercase), urlObj.pathname = /themeId/filename
        const themeDir = themeCacheManager.getThemeDir();
        const relativePath = decodeURIComponent(urlObj.pathname).replace(
          /^\/+/,
          "",
        );

        targetPath = path.join(themeDir, urlObj.hostname, relativePath);
      } catch (e) {
        logger.error("[Hash] Failed to parse asset virtual path:", filePath, e);
        return "";
      }
    } else if (!path.isAbsolute(filePath) || filePath.startsWith("/")) {
      // Normalize path to handle leading slashes correctly with path.join on Windows
      // path.join('C:\\a', '/b') results in 'C:\\b' on Windows, which we want to avoid.
      const normalizedFilePath = filePath.replace(/^\/+/, "");

      // Project root directory
      const projectRoot = app.isPackaged ? app.getAppPath() : process.cwd();

      // In dev mode, assets are served from /src/renderer/assets or /public
      // In prod mode, they are in the packaged app
      const possiblePaths = [
        path.join(process.env.VITE_PUBLIC || "", normalizedFilePath),
        path.join(projectRoot, "dist", normalizedFilePath),
        path.join(projectRoot, normalizedFilePath.replace(/\//g, path.sep)),
        path.join(
          projectRoot,
          "src/renderer",
          normalizedFilePath.replace(/\//g, path.sep),
        ),
      ];

      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          targetPath = p;
          break;
        } catch {
          continue;
        }
      }
    }

    const fileBuffer = await fs.readFile(targetPath);
    return crypto.createHash("md5").update(fileBuffer).digest("hex");
  } catch (error) {
    logger.error(`[Hash] Failed to get hash for ${filePath}:`, error);
    return "";
  }
});

// --- News Dashboard IPC Handlers ---
ipcMain.handle(
  "news:get",
  async (
    _event,
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => {
    if (category === "dev-notice") {
      return newsService.fetchDevNotices();
    }
    return newsService.fetchNewsList(game, service, category);
  },
);

ipcMain.handle(
  "news:get-cache",
  (
    _event,
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => {
    if (category === "dev-notice") {
      return newsService.getCacheItems("dev-notice");
    }
    return newsService.getCacheItems({ game, service, category });
  },
);

ipcMain.handle("news:get-content", async (_event, id: string, link: string) => {
  return newsService.fetchNewsContent(id, link);
});

ipcMain.handle("news:get-content-cache", (_event, id: string) => {
  return newsService.getContentFromCache(id);
});

ipcMain.handle("news:refresh-all", async () => {
  return newsService.refreshAllNews();
});

ipcMain.handle(
  "news:get-last-updated-at",
  (
    _event,
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) => {
    return newsService.getLastUpdatedAt({ game, service, category });
  },
);

ipcMain.handle("news:mark-as-read", async (_event, id: string) => {
  return newsService.markAsRead(id);
});

ipcMain.handle("news:mark-multiple-as-read", async (_event, ids: string[]) => {
  return newsService.markMultipleAsRead(ids);
});

ipcMain.handle("shell:open-external", async (_event, url: string) => {
  return shell.openExternal(url);
});

ipcMain.handle(
  "app:get-path",
  (_event, name: Parameters<typeof app.getPath>[0]) => {
    return app.getPath(name);
  },
);

ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
  return shell.openPath(targetPath);
});

ipcMain.on("uac-migration:confirm", async () => {
  logger.log("[Main] User confirmed UAC Migration.");
  await LegacyUacManager.cleanupLegacy();

  const key = "skipDaumGameStarterUac";
  const newValue = true;

  // Use setConfigWithEvent
  setConfigWithEvent(key, newValue);
});

// [UAC Migration] Handle Renderer Ready Signal
ipcMain.on("uac-migration:ready", async () => {
  if (await LegacyUacManager.detectLegacy()) {
    logger.log("[Main] Legacy UAC detected. Requesting migration modal...");
    context.mainWindow?.webContents.send("uac-migration:request");
    return;
  }

  if (await requestKakaoGameStarterMigrationIfNeeded()) {
    return;
  }

  await requestKakaoGamesStarterUacRepairIfNeeded();
});

// [Fix] Register Missing UAC Handlers
ipcMain.handle("uac:is-enabled", async () => {
  return await SimpleUacBypass.isRunAsInvokerEnabled();
});

ipcMain.handle("uac:enable", async () => {
  // Logic moved to UacHandler (triggered by setConfig)
  setConfigWithEvent("skipDaumGameStarterUac", true);
  return true; // Optimistic success (Handler will log error if fails)
});

ipcMain.handle("uac:disable", async () => {
  // Logic moved to UacHandler (triggered by setConfig)
  setConfigWithEvent("skipDaumGameStarterUac", false);
  return true; // Optimistic success
});

ipcMain.handle("kakao-starter-uac:confirm", async () => {
  logger.log("[Main] User confirmed KakaoGamesStarter UAC bypass repair.");
  return await SimpleUacBypass.setKakaoGamesStarterRunAsInvoker(true);
});

ipcMain.handle("kakao-starter-uac:decline", async () => {
  logger.log("[Main] User declined KakaoGamesStarter UAC bypass repair.");
  setConfigWithEvent("skipDaumGameStarterUac", false);
  return true;
});

ipcMain.handle("kakao-starter-migration:open-installer", async () => {
  logger.log("[Main] Opening Kakao Games starter installer link.");
  await shell.openExternal(KAKAO_GAMES_STARTER_INSTALLER_URL);
  return true;
});

ipcMain.handle("kakao-starter-migration:uninstall-daum", async () => {
  logger.log("[Main] User confirmed DaumGameStarter uninstall.");
  return await KakaoGameStarterMigration.uninstallDaumGameStarter();
});

ipcMain.handle("kakao-starter-migration:dismiss", async () => {
  logger.log("[Main] Kakao game starter migration prompt dismissed.");
  await requestKakaoGamesStarterUacRepairIfNeeded();
  return true;
});

async function requestKakaoGameStarterMigrationIfNeeded(): Promise<boolean> {
  const request = await KakaoGameStarterMigration.getRequest();

  if (!request) return false;

  logger.log(
    `[Main] Kakao game starter migration prompt requested: ${request.action}`,
  );
  context.mainWindow?.webContents.send(
    "kakao-starter-migration:request",
    request,
  );
  return true;
}

async function requestKakaoGamesStarterUacRepairIfNeeded(): Promise<void> {
  if (getEffectiveConfig("skipDaumGameStarterUac") !== true) return;

  if (!(await SimpleUacBypass.isKakaoGamesStarterMissingRunAsInvoker())) {
    return;
  }

  logger.log(
    "[Main] KakaoGamesStarter is installed but RUNASINVOKER is missing. Requesting UAC repair modal...",
  );
  context.mainWindow?.webContents.send("kakao-starter-uac:request");
}

// --- Constants ---
const PARTITIONS = {
  KAKAO: KAKAO_PARTITION,
  GGG: "persist:ggg_game",
};

// --- Admin IPC ---

ipcMain.handle("admin:is-admin", () => isAdmin());
ipcMain.handle("admin:ensure-session", () => ensureAdminSession());
ipcMain.handle("admin:is-session-active", () => isAdminSessionActive());
ipcMain.on("admin:relaunch", () => relaunchAsAdmin());

ipcMain.handle("session:logout", async () => {
  try {
    // 1. Reset Context
    gameSessionTracker.clear();
    pendingLoginUrls.delete("Kakao Games"); // Clear pending redirects for this service

    // 2. Close Game Window if exists (Prevents Auth Popups/Reloads)
    if (gameWindow && !gameWindow.isDestroyed()) {
      logger.log("[Main] Closing GameWindow for logout...");
      gameWindow.close();
      gameWindow = null;
      context.gameWindow = null;
    }

    // 3. Clear Storage (Specified Partition)
    const kakaoSession = session.fromPartition(PARTITIONS.KAKAO);
    await kakaoSession.clearStorageData({
      storages: [
        "cookies",
        "localstorage",
        "cachestorage",
        "indexdb",
        "serviceworkers",
      ],
    });
    logger.log(
      `[Main] Session storage cleared for partition: ${PARTITIONS.KAKAO}`,
    );

    // 4. Clear Account Cache & Notify Renderer
    setConfigWithEvent("kakaoAccountId", null);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("account:updated", {
        id: null,
        loginRequired: true,
      });
    }

    // 5. SECURE NEW LOGIN URL: Trigger validation immediately after logout
    // This ensures a fresh login redirect is available when the user clicks "Login".
    logger.log(
      "[Account] Post-logout validation triggered to secure login URL.",
    );
    runAccountValidation("Kakao Games").catch(logger.error);

    return true;
  } catch (error) {
    logger.error("[Main] Failed to clear session storage:", error);
    return false;
  }
});

// --- Remote Version IPC ---
ipcMain.handle(
  "version:resolveRemote",
  async (_event, gameId: AppConfig["activeGame"]) => {
    if (gameId !== "POE1" && gameId !== "POE2") return null;
    return RemoteVersionResolver.resolve(gameId);
  },
);

ipcMain.handle(
  "version:peekRemote",
  async (_event, gameId: AppConfig["activeGame"]) => {
    if (gameId !== "POE1" && gameId !== "POE2") return null;
    return RemoteVersionResolver.peekCache(gameId) ?? null;
  },
);

// --- Support Tools IPC ---
ipcMain.handle(
  "tool:force-repair-executable",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    manualVersion?: string,
    remoteWebRoot?: string,
  ) => {
    logger.log(
      `[Tool] Force Repair requested for ${gameId}/${serviceId} (ManualVersion: ${manualVersion || "N/A"}, RemoteWebRoot: ${!!remoteWebRoot})`,
    );

    const config = getConfig() as AppConfig;
    const key = `${gameId}_${serviceId}`;
    const versionInfo = config.knownGameVersions?.[key];

    let baseWebRoot: string;
    if (remoteWebRoot && versionInfo?.webRoot) {
      const remoteVer = LogParser.extractVersion(remoteWebRoot);
      const localVer = LogParser.extractVersion(versionInfo.webRoot);
      const cmp = LogParser.compareVersions(remoteVer, localVer);

      if (cmp >= 0) {
        logger.log(
          `[Tool] Using Remote WebRoot (Ver: ${remoteVer} >= Local: ${localVer})`,
        );
        baseWebRoot = remoteWebRoot;
      } else {
        logger.log(
          `[Tool] Using Local WebRoot (Ver: ${localVer} > Remote: ${remoteVer})`,
        );
        baseWebRoot = versionInfo.webRoot;
      }
    } else {
      baseWebRoot = remoteWebRoot || versionInfo?.webRoot || "";
    }

    if (!baseWebRoot) {
      logger.error("[Tool] No known web root found for this context.");
      return false;
    }

    const installPath = await getGameInstallPath(serviceId, gameId);
    if (!installPath) {
      logger.error("[Tool] Install path not found.");
      return false;
    }

    // Determine target webRoot
    let targetWebRoot = baseWebRoot;
    if (manualVersion) {
      targetWebRoot = LogParser.replaceVersion(targetWebRoot, manualVersion);
      logger.log(`[Tool] WebRoot overridden to: ${targetWebRoot}`);
    }

    // Trigger Patch Fix Modal in Progress Mode
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("UI:SHOW_PATCH_MODAL", {
        autoStart: true,
        serviceId,
        gameId,
      });
    }

    eventBus.emit(EventType.TOOL_FORCE_REPAIR, appContext, {
      installPath,
      serviceId,
      webRoot: targetWebRoot,
    });

    return true;
  },
);

// --- Navigation Trigger Context Registry ---
// Maps webContentsId to its trigger (e.g., 'ACCOUNT_VALIDATION', 'GAME_START_POE2')
const navigationTriggerContexts = new Map<number, string>();

/**
 * Sets the navigation context for a specific webContents
 */
function setNavigationTrigger(
  webContentsId: number,
  trigger: string | null | undefined,
) {
  if (trigger) {
    logger.log(`[Context] WebContents ${webContentsId} marked as: ${trigger}`);
    navigationTriggerContexts.set(webContentsId, trigger);
  } else {
    navigationTriggerContexts.delete(webContentsId);
  }
}

// Expose to global for access by handlers
global.setNavigationTrigger = setNavigationTrigger;

/**
 * Gets the navigation context, inheriting from opener if not set directly
 */
function getNavigationTrigger(webContentsId: number): string | null {
  return navigationTriggerContexts.get(webContentsId) || null;
}

// IPC Handlers for Context
ipcMain.handle("account:get-trigger-context", (event) => {
  const context = getNavigationTrigger(event.sender.id);
  logger.log(
    `[Context] Preload queried context for ${event.sender.id}: ${context}`,
  );
  return context;
});

// Cache for specific login URLs encountered during validation
const pendingLoginUrls = new Map<string, string>(); // ServiceId -> URL

ipcMain.on("account:clear-pending-login", (_event, serviceId?: string) => {
  if (serviceId) {
    logger.log(`[Account] Clearing pending login URL for ${serviceId}`);
    pendingLoginUrls.delete(serviceId);
  } else {
    logger.log("[Account] Clearing ALL pending login URLs");
    pendingLoginUrls.clear();
  }
});

ipcMain.on("account:clear-trigger", (event) => {
  logger.log(`[Context] Clearing trigger context for ${event.sender.id}`);
  navigationTriggerContexts.delete(event.sender.id);
});

// Track navigation status for each service to prevent concurrent loadURL calls
const isNavigating = new Set<string>();

// --- Account Validation Engine ---

async function runAccountValidation(serviceId: AppConfig["serviceChannel"]) {
  if (serviceId !== "Kakao Games") return; // GGG not implemented yet

  if (isNavigating.has(serviceId)) {
    logger.log(
      `[Account] Validation already in progress for ${serviceId}. Ignoring.`,
    );
    return;
  }

  logger.log(`[Account] Triggering validation for ${serviceId}...`);
  isNavigating.add(serviceId);
  setValidationMode(true);

  if (!appContext) {
    isNavigating.delete(serviceId);
    return;
  }

  // Clear stale redirect URL before starting new validation
  pendingLoginUrls.delete(serviceId);

  const targetUrl = `${BASE_URLS["Kakao Games"].POE1}#validateLogin`;
  const gw = appContext.ensureGameWindow({ service: "Kakao Games" });

  // Mark the game window for validation
  if (gw && !gw.isDestroyed()) {
    setNavigationTrigger(gw.webContents.id, "ACCOUNT_VALIDATION");

    try {
      // DO NOT show window yet
      await gw.loadURL(targetUrl);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      // Error code -3 is ERR_ABORTED, -2 is ERR_FAILED
      if (
        err.code === "ERR_ABORTED" ||
        err.errno === -3 ||
        err.code === "ERR_FAILED" ||
        err.errno === -2
      ) {
        logger.log(
          `[Account] Navigation interrupted for ${serviceId} (expected during background automation).`,
        );
      } else {
        logger.error(`[Account] Failed to load validation URL: ${targetUrl}`);
      }
    } finally {
      isNavigating.delete(serviceId);
    }
  } else {
    isNavigating.delete(serviceId);
  }
}

ipcMain.on(
  "account:trigger-validation",
  (_event, serviceId: AppConfig["serviceChannel"]) => {
    runAccountValidation(serviceId).catch((err) =>
      logger.error("[Account] Error running validation:", err),
    );
  },
);

function handleManualLoginNavigationError(
  source: "kept redirect URL" | "standard home URL",
  error: unknown,
) {
  if (isExpectedNavigationAbort(error)) {
    logger.log(
      `[Account] ${source} navigation interrupted (expected during manual login).`,
    );
    return;
  }

  logger.error(
    `[Account] Failed to load ${source} during manual login:`,
    error,
  );
}

ipcMain.on(
  "account:show-login-window",
  (_event, serviceId: AppConfig["serviceChannel"]) => {
    if (serviceId !== "Kakao Games") return;

    logger.log("[Account] Explicitly showing login window by user request.");
    setValidationMode(false); // Switch to manual mode so preload stops suppressing visibility

    // Ensure window exists (recreate if closed during logout)
    const gw = appContext.ensureGameWindow({ service: serviceId });

    if (gw && !gw.isDestroyed()) {
      // Mark as Manual Login context so preload knows to show it
      setNavigationTrigger(gw.webContents.id, "ACCOUNT_MANUAL_LOGIN");

      // Check if we have a 'kept' URL for this context
      const pendingUrl = pendingLoginUrls.get(serviceId);
      if (pendingUrl) {
        logger.log(`[Account] Loading kept redirect URL: ${pendingUrl}`);
        gw.loadURL(pendingUrl).catch((error: unknown) => {
          handleManualLoginNavigationError("kept redirect URL", error);
        });
        // Clear immediately after use (One-time use)
        pendingLoginUrls.delete(serviceId);
      } else {
        // Standard fallback: POE Home
        const homeUrl = BASE_URLS[serviceId].POE1;
        logger.log(
          `[Account] No pending URL, loading standard home: ${homeUrl}`,
        );
        gw.loadURL(homeUrl).catch((error: unknown) => {
          handleManualLoginNavigationError("standard home URL", error);
        });
      }

      gw.show();
      gw.focus();
    }
  },
);

ipcMain.on("kakao:account-id-fetched", (_event, id: string) => {
  logger.log(`[Account] Fetched ID for Kakao: ${id}`);
  setValidationMode(false);

  // Update Config Cache
  const config = getConfig() as AppConfig;
  config.kakaoAccountId = id;
  setConfigWithEvent("kakaoAccountId", id);

  // Notify Renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("account:updated", { id });
  }

  // Close hidden window if successful
  if (gameWindow && !gameWindow.isDestroyed()) {
    gameWindow.close();
  }
});

ipcMain.on("kakao:login-required", (event, data?: { url?: string }) => {
  logger.log("[Account] Login required for Kakao.");

  // If URL is provided during validation failure, 'keep' it for later
  if (data?.url) {
    logger.log(`[Account] Caching redirect URL for sync login: ${data.url}`);
    pendingLoginUrls.set("Kakao Games", data.url);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("account:updated", { loginRequired: true });
  }

  // Explicitly disable timeout when login is required to allow user to interact
  setValidationMode(false);

  // [Refinement] Close the background validation window if it's no longer needed
  // (User will explicitly open it via "Login" button if they want to)
  if (gameWindow && !gameWindow.isDestroyed()) {
    const context = getNavigationTrigger(gameWindow.webContents.id);
    if (context === "ACCOUNT_VALIDATION") {
      logger.log(
        "[Account] Closing background validation window (Login Required).",
      );
      gameWindow.close();
    }
  }
});

ipcMain.on("automation:update-timeout", (event, timeoutMs: number) => {
  lastActiveAutomationWebContentsId = event.sender.id; // Correctly track the caller
  startAutomationTimeout(timeoutMs);
  logger.log(
    `[Automation] Timer updated: ${timeoutMs}ms (Caller: ${event.sender.id})`,
  );
});

ipcMain.on("account:update-timeout", (event, timeoutMs: number) => {
  if (validationModeActive) {
    lastActiveAutomationWebContentsId = event.sender.id; // Track even in validation
    if (timeoutMs === -1) {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
        validationTimeout = null;
      }
      logger.log("[Account] Background validation timer paused.");
    } else {
      setValidationMode(true);
      logger.log("[Account] Background validation timer refreshed.");
    }
  }
});

// --- Shared Window Open Handler Factory ---
const createHandleWindowOpen =
  (parentWebContentsId: number, parentPartition?: string) =>
  (details: Electron.HandlerDetails) => {
    logger.log(
      `[Main] Window Open Request: ${details.url} (ParentWC: ${parentWebContentsId}, Partition: ${parentPartition || "default"})`,
    );

    const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
    const showInactive = getEffectiveConfig("show_inactive_windows") === true;
    const shouldShowAtInit = isDebugEnv || showInactive;

    // [Trigger Context Inheritance Preparation]
    // The actual setNavigationTrigger happens in 'web-contents-created' -> 'did-create-window'
    // but we can pass the parent context through if needed.
    const parentContext = getNavigationTrigger(parentWebContentsId);
    if (parentContext) {
      logger.log(
        `[Context] Window open triggered by parent with context: ${parentContext}`,
      );
    }

    return {
      action: "allow" as const,
      overrideBrowserWindowOptions: {
        width: 1024,
        height: 768,
        autoHideMenuBar: true,
        show: shouldShowAtInit,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: false,
          preload: path.join(__dirname, "kakao/preload.js"),
          partition: parentPartition,
        },
      },
    };
  };

// --- Visibility Control State ---
const forcedVisibleWindows = new Set<number>();

function hideAutomationWindow(window: BrowserWindow, reason: string) {
  if (!window || window.isDestroyed()) return;

  const isMainWindow =
    context.mainWindow && context.mainWindow.id === window.id;
  const isDebugWindow =
    context.debugWindow && context.debugWindow.id === window.id;

  if (isMainWindow || isDebugWindow) return;

  if (forcedVisibleWindows.delete(window.id)) {
    logger.log(
      `[Main] Window ${window.id} released FORCED VISIBILITY (${reason}).`,
    );
  }

  if (window.isVisible()) {
    const url = window.webContents.getURL();
    logger.log(
      `[Main] Hiding automation window ${window.id} (${reason}): ${url}`,
    );
    window.hide();
  }
}

// [IPC] Dynamic Visibility Request from Preload
ipcMain.on("window-visibility-request", async (event, isVisible: boolean) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return;

  const showInactive = getEffectiveConfig("show_inactive_windows") === true;
  const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
  const triggerContext = getNavigationTrigger(event.sender.id);
  const isValidation = triggerContext === "ACCOUNT_VALIDATION";

  if (isVisible) {
    if (isValidation) {
      logger.log(
        `[Main] Window ${window.id} requested visibility but SUPPRESSED (Validation Mode).`,
      );
      return;
    }

    if (!forcedVisibleWindows.has(window.id)) {
      forcedVisibleWindows.add(window.id);
      logger.log(`[Main] Window ${window.id} requested FORCED VISIBILITY.`);
    }

    if (!window.isVisible()) {
      window.show();
    }
    // [v22] Adjust size with 0.1s delay
    await resizeToFitContent(window);
    window.center();
    window.focus();
    window.moveTop();
    await dumpAutomationPage(window, {
      reason: "window-visibility-request",
      triggerContext: triggerContext ?? undefined,
      mainWindow,
      debugWindow,
    });
  } else {
    if (forcedVisibleWindows.has(window.id)) {
      forcedVisibleWindows.delete(window.id);
      logger.log(`[Main] Window ${window.id} released FORCED VISIBILITY.`);

      const isMainWindow =
        context.mainWindow && context.mainWindow.id === window.id;
      const isDebugWindow =
        context.debugWindow && context.debugWindow.id === window.id;

      if (
        shouldHideReleasedAutomationWindow({
          showInactive,
          isDebugEnv,
          isMainWindow: Boolean(isMainWindow),
          isDebugWindow: Boolean(isDebugWindow),
        })
      ) {
        logger.log(
          `[Main] Hiding window ${window.id} (Visibility released & inactive display disabled)`,
        );
        window.hide();
      }
    }
  }
});

// Global Context
let appContext: AppContext;

// Helper to ensure game window exists or create it
const ensureGameWindow = (options?: { service: string }) => {
  if (!gameWindow || gameWindow.isDestroyed()) {
    const service = options?.service || "Kakao Games"; // Default to Kakao for now
    let partition = PARTITIONS.KAKAO;
    let preloadPath = path.join(__dirname, "kakao/preload.js");

    if (service === "GGG") {
      partition = PARTITIONS.GGG;
      // TODO: Create ggg/preload.js when GGG support is fully implemented.
      // For now, use Kakao preload or a minimal one?
      // Actually, GGG web login might need different preload.
      // Let's use kakao preload as placeholder but isolated.
      preloadPath = path.join(__dirname, "kakao/preload.js");
    }

    gameWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      title: `POE2 Launcher (${service} Window)`,
      show: false, // 기본 숨김 처리 (플래시 방지)
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true, // Partitioned Game Window needs isolation? Usually yes.
        partition: partition, // Session Isolation based on Service
      },
    });

    // [Context Support] Register Window Open Handler with Opener Context
    gameWindow.webContents.setWindowOpenHandler(
      createHandleWindowOpen(gameWindow.webContents.id, partition),
    );

    // Update Context
    if (appContext) appContext.gameWindow = gameWindow;

    // Handle closing
    gameWindow.on("closed", () => {
      resetGameStatusIfInterrupted(gameWindow!);
      gameWindow = null;
      if (appContext) appContext.gameWindow = null;
    });
  }
  return gameWindow!;
};

// 2. Initialize Shared Context
const context: AppContext = {
  mainWindow: null,
  gameWindow: null,
  debugWindow: null,

  store,
  serviceManager: serviceManager as IServiceManager,
  isForcedVisible: (windowId: number) => forcedVisibleWindows.has(windowId),
  hideAutomationWindow,
  ensureGameWindow: ensureGameWindow,
  getConfig: (key?: string) => getEffectiveConfig(key),
  disableValidationMode: () => {
    logger.log("[Account] Explicitly disabling validation mode.");
    setValidationMode(false);
    clearAutomationTimeout();
  },
  getActiveAutomationWindow: () => {
    if (lastActiveAutomationWebContentsId) {
      const wc = webContents.fromId(lastActiveAutomationWebContentsId);
      if (wc) {
        const win = BrowserWindow.fromWebContents(wc);
        if (win && !win.isDestroyed()) return win;
      }
    }
    return gameWindow;
  },
};

function resetGameStatusIfInterrupted(_win: BrowserWindow) {
  const resetStatus = gameSessionTracker.getInterruptedResetStatus(appContext);

  if (!resetStatus) {
    return;
  }

  logger.log(
    `[Main] Critical window closed during ${resetStatus.interruptedStatus}. Resetting to idle.`,
  );

  eventBus.emit<GameStatusChangeEvent>(
    EventType.GAME_STATUS_CHANGE,
    appContext,
    resetStatus.payload,
  );
}

// 3. Register Global Store Observers
setupStoreObservers(context);

// 4. Register Event Handlers
registerCoreEventHandlers();

const mainEventHandlers = [
  {
    id: "UpdateWindowTitleHandler",
    targetEvent: EventType.UPDATE_WINDOW_TITLE,
    handle: async (_event: UpdateWindowTitleEvent, _context: AppContext) => {
      broadcastTitleUpdate();
    },
  },
  {
    id: "DisplaySettingsHandler",
    targetEvent: EventType.CONFIG_CHANGE,
    condition: (event: ConfigChangeEvent) =>
      event.payload.key === "autoResolution" ||
      event.payload.key === "resolutionMode",
    handle: async (event: ConfigChangeEvent, context: AppContext) => {
      // Typed
      const { mainWindow } = context;
      if (mainWindow && !mainWindow.isDestroyed()) {
        const config = getConfig() as AppConfig;
        logger.log(
          `[Main] Display Config Changed: ${event.payload.key} -> ${event.payload.newValue}`,
        );
        const changed = applyResolutionRules(mainWindow, config, (mode) => {
          // Sync back to config if auto-resolution is ON and mode changed
          if (config.autoResolution && config.resolutionMode !== mode) {
            logger.log(`[Main] Syncing auto-determined resolution: ${mode}`);
            setConfigWithEvent("resolutionMode", mode);
            // Optional: Emit event to sync UI (Renderer needs to know to update the select box value)
            eventBus.emit(EventType.CONFIG_CHANGE, context, {
              key: "resolutionMode",
              oldValue: config.resolutionMode,
              newValue: mode,
            });
          }
        });
        if (changed) {
          eventBus.emit(EventType.UPDATE_WINDOW_TITLE, context, undefined);
        }
        syncDebugWindow("ConfigChange");
      }
    },
  },
];

// --- Patch IPC ---
ipcMain.on("patch:start-manual", () => {
  if (appContext) {
    logger.log("[Main] Triggering Manual Patch via IPC");
    triggerPendingManualPatches(appContext);
  }
});

ipcMain.on("patch:cancel", () => {
  if (appContext) {
    logger.log("[Main] Cancelling Patch via IPC");
    cancelPendingPatches(appContext);
  }
});

// --- Update Check IPC ---
ipcMain.on("ui:update-check", () => {
  if (appContext) {
    eventBus.emit<UIUpdateCheckEvent>(
      EventType.UI_UPDATE_CHECK,
      appContext,
      undefined,
    );
  }
});

ipcMain.on("ui:update-download", () => {
  if (appContext) {
    eventBus.emit<UIUpdateDownloadEvent>(
      EventType.UI_UPDATE_DOWNLOAD,
      appContext,
      undefined,
    );
  }
});

ipcMain.on("ui:update-install", (_event, isSilent?: boolean) => {
  if (appContext) {
    eventBus.emit<UIUpdateInstallEvent>(
      EventType.UI_UPDATE_INSTALL,
      appContext,
      { isSilent },
    );
  }
});

mainEventHandlers.forEach((handler) => {
  eventBus.register(handler as EventHandler<AppEvent>);
});

// Track app quitting state to bypass "hide-on-close" behavior
let isQuitting = false;
const BASE_WIDTH = 1440;
const BASE_HEIGHT = 960;

/**
 * Dynamically adjusts window constraints (resizable, size, etc.) based on the current display environment.
 */
function applyIntelligentConstraints(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return;
  const config = getConfig() as AppConfig;
  const changed = applyResolutionRules(win, config, (mode) => {
    if (config.autoResolution && config.resolutionMode !== mode) {
      logger.log(`[Main] Syncing auto-determined resolution (Intell): ${mode}`);
      setConfigWithEvent("resolutionMode", mode);
    }
  });
  if (changed && appContext) {
    eventBus.emit(EventType.UPDATE_WINDOW_TITLE, appContext, undefined);
  }
  syncDebugWindow("IntelligentConstraints");
}

// Initialize Context Helper
function initAppContext() {
  appContext = context; // Assign the pre-defined context object
  eventBus.setContext(appContext);
  PowerShellManager.getInstance().setContext(appContext);
}

// Initialize Services
newsService.init(() => {
  mainWindow?.webContents.send("news-updated");
});

// [Unified] DevTools Visibility Sync Logic
// [Unified] DevTools Visibility Sync Trigger
const triggerDevToolsSync = () => {
  eventBus.emit(EventType.SYNC_DEVTOOLS_VISIBILITY, appContext, {
    source: "triggerDevToolsSync",
  });
};

// Cache for title to prevent spam
let lastBroadcastedTitle: string | null = null;

const TITLE_BAR_HEIGHT = 32;
const TOP_CENTER_HOVER_WIDTH = 220;

let isTopCenterTitlebarHovered = false;
let topCenterTitlebarHoverPollTimer: NodeJS.Timeout | null = null;

function isInTopCenterTitlebarHoverZone(
  win: BrowserWindow,
  x: number,
  y: number,
) {
  const [contentWidth] = win.getContentSize();
  const left = (contentWidth - TOP_CENTER_HOVER_WIDTH) / 2;
  return (
    x >= left &&
    x <= left + TOP_CENTER_HOVER_WIDTH &&
    y >= 0 &&
    y <= TITLE_BAR_HEIGHT
  );
}

function publishTopCenterTitlebarHover(win: BrowserWindow, hovered: boolean) {
  if (isTopCenterTitlebarHovered === hovered) return;

  isTopCenterTitlebarHovered = hovered;
  if (!win.webContents.isDestroyed()) {
    win.webContents.send("app:top-center-titlebar-hover", hovered);
  }
}

function stopTopCenterTitlebarHoverPolling() {
  if (!topCenterTitlebarHoverPollTimer) return;
  clearInterval(topCenterTitlebarHoverPollTimer);
  topCenterTitlebarHoverPollTimer = null;
}

function startTopCenterTitlebarHoverPolling(win: BrowserWindow) {
  if (topCenterTitlebarHoverPollTimer) return;

  topCenterTitlebarHoverPollTimer = setInterval(() => {
    if (win.isDestroyed()) {
      stopTopCenterTitlebarHoverPolling();
      return;
    }

    if (!win.isVisible()) {
      publishTopCenterTitlebarHover(win, false);
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const x = cursor.x - bounds.x;
    const y = cursor.y - bounds.y;

    publishTopCenterTitlebarHover(
      win,
      isInTopCenterTitlebarHoverZone(win, x, y),
    );
  }, 100);
  topCenterTitlebarHoverPollTimer.unref?.();
}

function setupTopCenterTitlebarHoverTracking(win: BrowserWindow) {
  if (process.platform !== "win32") return;

  const clearHover = () => {
    publishTopCenterTitlebarHover(win, false);
    stopTopCenterTitlebarHoverPolling();
  };

  startTopCenterTitlebarHoverPolling(win);
  win.on("show", () => startTopCenterTitlebarHoverPolling(win));
  win.on("hide", clearHover);
  win.on("closed", () => {
    isTopCenterTitlebarHovered = false;
    stopTopCenterTitlebarHoverPolling();
  });
}

/**
 * Calculates the current title based on global config/state and broadcasts it
 * to the Window, Tray, and Renderer (via Event).
 */
function broadcastTitleUpdate() {
  const version = app.getVersion();
  const activeGame = (getEffectiveConfig("activeGame") || "POE2") as string;
  const gameName = getGameName(activeGame);
  const appName = getAppName(gameName);

  // 1. Update Application Name (for Notifications, Taskbar/TaskManager)
  // This can be called even before the window is created
  app.setName(appName);

  if (!mainWindow || mainWindow.isDestroyed()) return;

  const resolutionMode = (getEffectiveConfig("resolutionMode") ||
    "1440x960") as string;
  const isLowRes = resolutionMode !== "1440x960";

  const title = getLauncherTitle(gameName, version, isLowRes);

  // 2. Update Window System Title
  mainWindow.setTitle(title);

  // 3. Update Tray Tooltip
  trayManager.updateTitle(title);

  // 4. Notify Renderer (for UI TitleBar)
  mainWindow.webContents.send("app:title-updated", title);

  // Spam Prevention: Log only if changed
  if (lastBroadcastedTitle !== title) {
    logger.log(`[Main] Title Broadcasted: ${title}`);
    lastBroadcastedTitle = title;
  }
}

async function createGamePathDiagnosticQaWindow(
  request: GamePathDiagnosticQaLaunchRequest,
) {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 683,
    minWidth: 1024,
    minHeight: 683,
    resizable: false,
    maximizable: false,
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(process.env.VITE_PUBLIC as string, "icon.ico"),
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      !isAllowedGamePathDiagnosticQaRendererUrl(
        url,
        request.devServerUrl,
        request.runId,
      )
    ) {
      event.preventDefault();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });

  await mainWindow.loadURL(buildGamePathDiagnosticQaRendererUrl(request));
}

async function createWindow() {
  // 1. Main Window (UI)
  mainWindow = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    minWidth: 1024,
    minHeight: 683,
    resizable: false, // Will be updated by applyIntelligentConstraints
    maximizable: false, // Will be updated by applyIntelligentConstraints
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(process.env.VITE_PUBLIC as string, "icon.ico"),
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  setupTopCenterTitlebarHoverTracking(mainWindow);

  // [Security] Force external links to open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      void openExternalSafely(url, mainWindow);
    }
    return { action: "deny" };
  });

  // [Security] Block internal navigation to external sites
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Only allow navigation to internal file:// or localhost (dev)
    const isInternal =
      url.startsWith("file://") ||
      (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL));

    if (!isInternal && (url.startsWith("http:") || url.startsWith("https:"))) {
      event.preventDefault();
      void openExternalSafely(url, mainWindow);
    }
  });

  // Apply initial constraints based on the display it will open on
  applyIntelligentConstraints(mainWindow);

  // Monitor for resolution/DPI changes OR moving between monitors
  screen.on("display-metrics-changed", () => {
    logger.log("[Main] Display metrics changed. Updating UI constraints...");
    applyIntelligentConstraints(mainWindow);
  });

  // Reveal window when ready-to-show
  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Check for --hidden arg (Start Minimized)
      const startHidden = process.argv.includes("--hidden");
      if (!startHidden) {
        mainWindow.show();
        // [Fix] Show Debug Console ONLY AFTER main window is shown to ensure correct Z-order/Focus
        initDebugWindow("AppStart");
      } else {
        logger.log("[Main] Starting hidden (minimized to tray).");
      }

      // [Fix] Defer Version Check until Window is Ready
      setTimeout(async () => {
        // Check for launcher update (version change)
        await checkLauncherVersionUpdate();
      }, 1000);
    }
  });

  // Handle Close Action
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      const config = getConfig() as AppConfig;
      if (config.closeAction === "minimize") {
        e.preventDefault();
        mainWindow?.hide();
        logger.log("[Main] Window hidden due to 'minimize' closeAction.");
        return;
      }
      // Keep the window usable if saving login cookies cancels shutdown.
      e.preventDefault();
      app.quit();
      return;
    }
    logger.log("[Main] Window closing (quitting).");
  });

  // Visibility Synchronization (Window Hiding/Showing Logic)
  const syncSubWindowsVisibility = (visible: boolean) => {
    const isDebugMode = getEffectiveConfig("dev_mode") === true;
    const showDebugConsole = getEffectiveConfig("debug_console") === true;
    const showInactiveWindows =
      getEffectiveConfig("show_inactive_windows") === true;

    // 1. Manage Debug Window Visibility
    if (debugWindow && !debugWindow.isDestroyed()) {
      if (visible && isDebugMode && showDebugConsole) {
        debugWindow.show();
      } else {
        debugWindow.hide();
      }
    }

    // 2. Manage other subordinate windows visibility
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win === mainWindow || win === debugWindow) return;
      if (win.isDestroyed()) return;

      if (visible) {
        // Removed isUserFacingPage: Visibility is now controlled by Preload IPC or Inactive Config
        const shouldShowWindow = isDebugMode && showInactiveWindows;

        if (shouldShowWindow && !win.isVisible()) {
          win.show();
        }
      } else {
        if (win.isVisible()) {
          win.hide();
        }
      }
    });

    // [Trigger Point 1] Sync DevTools whenever Window Visibility changes (Tray interaction)
    triggerDevToolsSync();
  };

  const getNewsRefreshContext = (reason: string) => {
    const config = getConfig() as AppConfig;
    return {
      game: config.activeGame,
      service: config.serviceChannel,
      reason,
    };
  };

  const refreshCurrentGameInstallStatusIfStale = (reason: string) => {
    void reconcileCurrentGameInstallStatusIfStale(appContext, { reason }).catch(
      (error) => {
        logger.warn(
          `[Main] Deferred game install status refresh failed; reason=${reason}; error=${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  };

  mainWindow.on("show", () => {
    newsService.setActive(true, getNewsRefreshContext("show"));
    syncSubWindowsVisibility(true);
    mainWindow?.webContents.send("app:window-show");
    syncDebugWindow("MainShow");
    refreshCurrentGameInstallStatusIfStale("window-show");
  });
  mainWindow.on("hide", () => {
    newsService.setActive(false);
    syncSubWindowsVisibility(false);
  });

  mainWindow.on("enter-full-screen", () => syncDebugWindow("FullScreenEnter"));
  mainWindow.on("leave-full-screen", () => syncDebugWindow("FullScreenLeave"));
  mainWindow.on("maximize", () => syncDebugWindow("Maximize"));
  mainWindow.on("unmaximize", () => syncDebugWindow("Unmaximize"));
  mainWindow.on("resize", () => syncDebugWindow("Resize"));
  mainWindow.on("move", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const config = getConfig() as AppConfig;
      enforceConstraints(mainWindow, config);
      syncDebugWindow("MainMove");
    }
  });

  // [Z-Order Sync] Keep debug console above launcher only when launcher is focused
  mainWindow.on("focus", () => {
    const win = mainWindow;
    if (
      win &&
      !win.isDestroyed() &&
      debugWindow &&
      !debugWindow.isDestroyed()
    ) {
      // In fullscreen/maximized, we need setAlwaysOnTop to stay above the host
      if (win.isFullScreen() || win.isMaximized()) {
        debugWindow.setAlwaysOnTop(true, "screen-saver");
        debugWindow.showInactive(); // Ensure visible without stealing focus
        debugWindow.moveTop();
      }
    }
  });

  mainWindow.on("blur", () => {
    if (debugWindow && !debugWindow.isDestroyed()) {
      // Release always-on-top so it can go behind other apps with the launcher
      debugWindow.setAlwaysOnTop(false);
    }
  });

  // Initialize Tray
  trayManager.init(mainWindow, context);

  // --- SECURITY: Block WebAuthn & Unwanted Permissions ---
  // This prevents Windows Security popups (Passkey) and other intrusive browser behaviors.
  // --- SECURITY: Block WebAuthn & Unwanted Permissions ---
  // This prevents Windows Security popups (Passkey) and other intrusive browser behaviors.

  // Apply to Default Session
  setupSessionSecurity(session.defaultSession, "default");

  // Initialize Kakao Partition (Security & Config)
  initKakaoSession();

  // Apply to GGG Partition (if exists)
  if (PARTITIONS.GGG) {
    setupSessionSecurity(session.fromPartition(PARTITIONS.GGG), PARTITIONS.GGG);
  }

  // Initialize Global Context
  initAppContext(); // Call the helper function to set appContext
  ContextProvider.set(appContext); // [New] Set Global Context Provider
  appContext.mainWindow = mainWindow;
  setupMainLogger(appContext, (event) => {
    eventBus.emit(event.type, appContext, event.payload);
  });
  scheduleAutomationDumpRetentionCleanup();

  // Register Handlers
  eventBus.register(ToolForceRepairHandler); // EventBus based

  printBanner();
  logger.log("[Main] Main Logger initialized.");

  // [New] Initial Game Version Scan: Recover if knownGameVersions is empty
  const runInitialGameVersionScan = async () => {
    const config = getConfig() as AppConfig;
    const knownVersions = config.knownGameVersions || {};

    if (Object.keys(knownVersions).length === 0) {
      logger.log(
        "[Main] knownGameVersions is empty. Scanning logs for recovery...",
      );
      const scannedResults = await GameVersionScanner.scanAll();

      if (Object.keys(scannedResults).length > 0) {
        logger.log(
          `[Main] Recovery scan successful. Found ${Object.keys(scannedResults).length} versions.`,
        );
        setConfigWithEvent("knownGameVersions", scannedResults);
      } else {
        logger.log("[Main] Recovery scan finished with no results.");
      }
    }
  };

  runInitialGameVersionScan().catch((e) =>
    logger.error("[Main] Failed during initial game version scan:", e),
  );

  // Perform initial installation check for ALL contexts
  const checkAllGameStatuses = async () => {
    logger.log("[Main] Checking initial status for all game contexts...");
    await reconcileAllGameInstallStatuses(appContext, {
      reason: "initial-status-check",
    });
  };

  // Sync Auto Launch Status
  // Sync Auto Launch Status
  // [Refactor] Use centralized handler to respect Admin/User mode and avoid double-launch
  syncAutoLaunch().catch((err) => {
    logger.error("[Main] Failed to sync auto-launch settings:", err);
  });

  const { processWatcher } = await initializeCoreServices(appContext);
  appContext.processWatcher = processWatcher;
  await checkAllGameStatuses();

  // --- ProcessWatcher Optimization & wake-up integrated in Class ---
  mainWindow.on("blur", () => {
    logger.log("[Main] Window blurred (Focus Lost).");
    newsService.setActive(false);
    getProcessWatcher()?.scheduleSuspension();
  });

  mainWindow.on("focus", () => {
    logger.log("[Main] Window focused.");
    newsService.setActive(true, getNewsRefreshContext("focus"));
    getProcessWatcher()?.cancelSuspension();
    refreshCurrentGameInstallStatusIfStale("window-focus");
  });

  // --- Main Window Loading ---
  if (VITE_DEV_SERVER_URL) {
    let rendererUrl = VITE_DEV_SERVER_URL;
    const qaRunId = process.env.ELECTRON_QA_RUN_ID;
    if (process.env.ELECTRON_START_HIDDEN === "true" && qaRunId) {
      const qaRendererUrl = new URL(rendererUrl);
      qaRendererUrl.searchParams.set("codexQaRun", qaRunId);
      rendererUrl = qaRendererUrl.toString();
    }
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST as string, "index.html"));
  }

  // [Dynamic Splash] First title broadcast to sync UI/Tray
  mainWindow.webContents.on("did-finish-load", () => {
    broadcastTitleUpdate();
  });

  // [New] Renderer explicitly requests title update when ready
  ipcMain.on("app:request-title", () => {
    logger.log("[Main] Renderer requested title update. Broadcasting...");
    broadcastTitleUpdate();
  });

  // Ensure app quits when main UI window is closed
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });
}

/**
 * Synchronizes the debug window's docking state, position, and height with the main window.
 */
function syncDebugWindow(triggerSource: string = "Dynamic") {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !debugWindow ||
    debugWindow.isDestroyed()
  ) {
    return;
  }

  const isFullScreen = mainWindow.isFullScreen();
  const isMaximized = mainWindow.isMaximized();
  const isDocked = !isFullScreen && !isMaximized;

  // Reduced logging during high-frequency move events
  if (triggerSource !== "MainMove") {
    logger.log(
      `[Main][${triggerSource}] Syncing Debug Window. Docked: ${isDocked}`,
    );
  }

  if (isDocked) {
    const mainBounds = mainWindow.getBounds();
    const debugBounds = debugWindow.getBounds();
    const targetX = mainBounds.x + mainBounds.width;

    // 1. Enforce Parent & Movability (Only if changed)
    if (debugWindow.getParentWindow() !== mainWindow) {
      debugWindow.setParentWindow(mainWindow);
    }
    if (debugWindow.isMovable()) {
      debugWindow.setMovable(false);
    }

    // 2. Sync Bounds (Position + Height)
    // We only update if there's a meaningful difference to avoid event loops
    if (
      debugBounds.x !== targetX ||
      debugBounds.y !== mainBounds.y ||
      debugBounds.height !== mainBounds.height
    ) {
      debugWindow.setBounds({
        x: targetX,
        y: mainBounds.y,
        height: mainBounds.height,
        width: debugBounds.width, // Preserve user-defined width
      });
    }

    // 3. Keep constraints (Only if changed)
    const [minW, minH] = debugWindow.getMinimumSize();
    if (minW !== 400 || minH !== mainBounds.height) {
      debugWindow.setMinimumSize(400, mainBounds.height);
    }
    const [maxW, maxH] = debugWindow.getMaximumSize();
    if (maxW !== 1000 || maxH !== mainBounds.height) {
      debugWindow.setMaximumSize(1000, mainBounds.height);
    }
  } else {
    // Detached Mode (Fullscreen or Flexible/Maximized)
    // 1. Release Parent & Allow movement (Only if changed)
    if (debugWindow.getParentWindow() !== null) {
      debugWindow.setParentWindow(null);
    }
    if (!debugWindow.isMovable()) {
      debugWindow.setMovable(true);
    }

    // 2. Remove height/size constraints (Only if changed)
    const [minW, minH] = debugWindow.getMinimumSize();
    if (minW !== 400 || minH !== 300) {
      debugWindow.setMinimumSize(400, 300);
    }
    const [maxW, maxH] = debugWindow.getMaximumSize();
    if (maxW !== 2000 || maxH !== 2000) {
      debugWindow.setMaximumSize(2000, 2000);
    }

    // 3. Move forward if it was behind (Optional UX)
    // [Fix] Removed moveTop() to prevent focus-stealing during state transitions (Fullscreen/Maximize)
    // which caused the "stuck in top-left" regression on Windows.
  }
}

let isInitInProgress = false; // Guard against recursive/redundant calls during creation

function destroyDebugWindowForRecovery(reason: string) {
  if (debugDestructionTimeout) {
    clearTimeout(debugDestructionTimeout);
    debugDestructionTimeout = null;
  }

  if (debugWindow && !debugWindow.isDestroyed()) {
    logger.warn(`[Main] Destroying Debug Window for recovery: ${reason}`);
    debugWindow.destroy();
  }

  debugWindow = null;
  context.debugWindow = null;
}

function scheduleDebugWindowRecovery(reason: string) {
  if (debugRecoveryTimeout) return;

  logger.warn(`[Main] Scheduling Debug Window recovery: ${reason}`);
  destroyDebugWindowForRecovery(reason);

  debugRecoveryTimeout = setTimeout(() => {
    debugRecoveryTimeout = null;
    if (
      getEffectiveConfig("dev_mode") === true &&
      getEffectiveConfig("debug_console") === true
    ) {
      initDebugWindow(`Recovery:${reason}`);
    }
  }, 250);
}

/**
 * Creates or destroys the debug window based on current configuration.
 * Can be called multiple times during runtime to toggle the window.
 */
function initDebugWindow(triggerSource: string = "Dynamic") {
  if (!mainWindow || mainWindow.isDestroyed()) {
    logger.log(
      `[Main][${triggerSource}] initDebugWindow skipped: mainWindow is missing/destroyed`,
    );
    return;
  }

  if (isInitInProgress) {
    logger.log(
      `[Main][${triggerSource}] initDebugWindow skipped: Initialization already in progress`,
    );
    return;
  }

  const isDevMode = getEffectiveConfig("dev_mode") === true;
  const isDebugConsole = getEffectiveConfig("debug_console") === true;
  const shouldShow = isDevMode && isDebugConsole;

  logger.log(`[Main][${triggerSource}] Debug Window State Check:`, {
    isDevMode,
    isDebugConsole,
    shouldShow,
    exists: !!debugWindow && !debugWindow.isDestroyed(),
  });

  if (shouldShow) {
    // 1. Cancel pending destruction if any
    if (debugDestructionTimeout) {
      clearTimeout(debugDestructionTimeout);
      debugDestructionTimeout = null;
      logger.log(
        `[Main][${triggerSource}] Cancelled pending destruction for Debug Window.`,
      );
      destroyDebugWindowForRecovery("Re-enabled while destruction was pending");
    }

    // 2. If doesn't exist or destroyed -> Create
    if (!debugWindow || debugWindow.isDestroyed()) {
      isInitInProgress = true;
      try {
        const mainBounds = mainWindow.getBounds();

        debugWindow = new BrowserWindow({
          width: 900,
          height: mainBounds.height,
          parent: mainWindow,
          title: DEBUG_APP_CONFIG.TITLE,
          frame: false,
          movable: false,
          resizable: true,
          minimizable: true,
          closable: true,
          autoHideMenuBar: true,
          show: false,
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
          },
        });

        // Reveal when ready
        debugWindow.once("ready-to-show", () => {
          if (debugWindow && !debugWindow.isDestroyed()) {
            debugWindow.show();
            syncDebugWindow("ReadyToShow");
          }
        });

        debugWindow.webContents.on("did-finish-load", () => {
          logger.log("[Main] Debug Window finished loading.");
        });

        debugWindow.webContents.on(
          "did-fail-load",
          (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            if (!isMainFrame) return;
            logger.error(
              `[Main] Debug Window failed to load: ${errorCode} ${errorDescription} (${validatedURL})`,
            );
            scheduleDebugWindowRecovery("LoadFailed");
          },
        );

        debugWindow.webContents.on("unresponsive", () => {
          logger.error("[Main] Debug Window renderer became unresponsive.");
          scheduleDebugWindowRecovery("RendererUnresponsive");
        });

        debugWindow.webContents.on("render-process-gone", (_event, details) => {
          logger.error(
            `[Main] Debug Window render process gone: ${details.reason}`,
          );
          scheduleDebugWindowRecovery("RenderProcessGone");
        });

        // Update Context
        context.debugWindow = debugWindow;

        const debugUrl = VITE_DEV_SERVER_URL
          ? `${VITE_DEV_SERVER_URL}${DEBUG_APP_CONFIG.HASH}`
          : `file://${path.join(process.env.DIST as string, "index.html")}${DEBUG_APP_CONFIG.HASH}`;

        debugWindow.loadURL(debugUrl);

        // --- ProcessWatcher Integration for Debug Window ---
        debugWindow.on("blur", () => {
          if (appContext?.processWatcher) {
            appContext.processWatcher.scheduleSuspension();
          }
        });

        debugWindow.on("focus", () => {
          if (appContext?.processWatcher) {
            appContext.processWatcher.cancelSuspension();
          }
        });

        // Enforce docking during debug window resize (only if docked)
        debugWindow.on("resize", () => {
          if (
            mainWindow &&
            !mainWindow.isDestroyed() &&
            debugWindow &&
            !debugWindow.isDestroyed() &&
            !mainWindow.isFullScreen() &&
            !mainWindow.isMaximized()
          ) {
            const mainBounds = mainWindow.getBounds();
            const debugBounds = debugWindow.getBounds();
            const targetX = mainBounds.x + mainBounds.width;

            // If X or Y drifted during resize, snap back
            if (debugBounds.x !== targetX || debugBounds.y !== mainBounds.y) {
              debugWindow.setPosition(targetX, mainBounds.y);
            }
            // Height MUST match
            if (debugBounds.height !== mainBounds.height) {
              debugWindow.setSize(debugBounds.width, mainBounds.height);
            }
          }
        });

        debugWindow.on("close", (e) => {
          // Prevent physical close to avoid process/HMR issues.
          // Instead, signal configuration change which triggers initDebugWindow (hide & delayed destroy).
          e.preventDefault();
          logger.log(
            "[Main] Debug Window close prevented. Signalling config change.",
          );
          setConfigWithEvent("debug_console", false);
        });

        debugWindow.on("closed", () => {
          logger.log("[Main] Debug Window Closed event fired.");
          debugWindow = null;
          context.debugWindow = null;
        });

        logger.log("[Main] Debug Console Creation Finalized.");
      } finally {
        isInitInProgress = false;
      }
    } else {
      // 3. Exists but might be hidden -> Show
      if (!debugWindow.isVisible()) {
        logger.log(`[Main][${triggerSource}] Showing existing Debug Window.`);
        debugWindow.show();
        syncDebugWindow("ManualShow");
      }
    }
  } else {
    // 4. Should hide/destroy (Delayed destruction for stability)
    if (debugWindow && !debugWindow.isDestroyed()) {
      if (debugWindow.isVisible()) {
        logger.log(
          `[Main][${triggerSource}] Hiding Debug Window and scheduling destruction.`,
        );
        debugWindow.hide();
      }

      // Schedule destruction if not already scheduled
      if (!debugDestructionTimeout) {
        debugDestructionTimeout = setTimeout(() => {
          if (debugWindow && !debugWindow.isDestroyed()) {
            logger.log(
              `[Main] Executing delayed destruction for Debug Window.`,
            );
            debugWindow.destroy();
          }
          debugDestructionTimeout = null;
        }, 1000);
      }
    }
  }
}

// IPC Handlers
ipcMain.on(
  "trigger-game-start",
  (_event, launchContext?: GameLaunchContext) => {
    logger.log('[Main] IPC "trigger-game-start" Received from Renderer');
    if (appContext) {
      const config = getConfig() as AppConfig;
      const gameId = launchContext?.gameId ?? config.activeGame;
      const serviceId = launchContext?.serviceId ?? config.serviceChannel;
      if (serviceId === "Kakao Games") {
        didReportKakaoStartFailure = false;
        startAutomationDumpSession({
          gameId,
          serviceId,
          triggerContext: `GAME_START_${gameId}`,
        });
      }

      eventBus.emit<UIEvent>(
        EventType.UI_GAME_START_CLICK,
        appContext,
        launchContext,
      );
    } else {
      logger.error("[Main] AppContext not initialized!");
    }
  },
);

// --- Patch Management IPC ---
// Keep track of the active patch manager for cancellation
let activeManualPatchManager: PatchManager | null = null;

ipcMain.on(
  "patch:trigger-manual",
  async (
    _event,
    serviceIdOverride?: AppConfig["serviceChannel"],
    gameIdOverride?: AppConfig["activeGame"],
  ) => {
    // Cancel previous instance if running?
    if (activeManualPatchManager) {
      try {
        activeManualPatchManager.cancelPatch();
      } catch {
        // Ignore
      }
    }

    activeManualPatchManager = new PatchManager(appContext);

    const serviceId =
      serviceIdOverride ||
      (appContext.getConfig("serviceChannel") as AppConfig["serviceChannel"]);
    const activeGame = (gameIdOverride ||
      appContext.getConfig("activeGame")) as AppConfig["activeGame"];
    const installPath = await getGameInstallPath(serviceId, activeGame);

    logger.log(
      `[Main] Triggering Manual Patch Fix for ${serviceId} / ${activeGame}`,
    );

    if (installPath) {
      // [FIX] Trigger UI Modal for Feedback
      mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
        autoStart: false,
        serviceId,
        gameId: activeGame,
      });

      activeManualPatchManager
        .startSelfDiagnosis(installPath, serviceId, activeGame)
        .finally(() => {
          // Cleanup reference if it finished (optional, but good for GC)
          // But we have to check if IT is the same instance
          // activeManualPatchManager = null;
        });
    } else {
      logger.error("Install path not found for manual patch fix.");
    }
  },
);

ipcMain.on(
  "patch:restore-local",
  async (
    _event,
    serviceIdOverride?: AppConfig["serviceChannel"],
    gameIdOverride?: AppConfig["activeGame"],
  ) => {
    // Cancel previous instance if running?
    if (activeManualPatchManager) {
      try {
        activeManualPatchManager.cancelPatch();
      } catch {
        // Ignore
      }
    }

    activeManualPatchManager = new PatchManager(appContext);

    const serviceId =
      serviceIdOverride ||
      (appContext.getConfig("serviceChannel") as AppConfig["serviceChannel"]);
    const activeGame = (gameIdOverride ||
      appContext.getConfig("activeGame")) as AppConfig["activeGame"];
    const installPath = await getGameInstallPath(serviceId, activeGame);

    logger.log(
      `[Main] Triggering Local Restore for ${serviceId} / ${activeGame}`,
    );

    if (installPath) {
      // Show UI Modal (Reuse logic but with autoStart=false to show progress)
      mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
        autoStart: false,
        serviceId,
        gameId: activeGame,
      });

      activeManualPatchManager.restoreLocalBackup(installPath).finally(() => {
        // Cleanup
        // activeManualPatchManager = null;
      });
    } else {
      logger.error("Install path not found for local restore.");
    }
  },
);

ipcMain.handle(
  "patch:check-backup",
  async (
    _event,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) => {
    try {
      const installPath = await getGameInstallPath(serviceId, gameId);

      if (!installPath) return false;

      const backupDir = path.join(installPath, ".patch_backups");
      try {
        const stats = await fs.stat(backupDir);
        if (!stats.isDirectory()) return false;

        const files = await fs.readdir(backupDir);
        if (files.length === 0) return false;

        // [NEW] Try to read metadata
        const metadataPath = path.join(backupDir, "backup-info.json");
        try {
          const content = await fs.readFile(metadataPath, "utf-8");
          const metadata = JSON.parse(content);
          return metadata; // Return BackupMetadata object
        } catch {
          // Legacy: No metadata file, but files exist. Return pseudo-metadata
          return {
            timestamp: stats.mtime.toISOString(),
            files,
            version: "legacy",
          };
        }
      } catch {
        return false;
      }
    } catch (error) {
      logger.error("[Main] Failed to check backup availability:", error);
      return false;
    }
  },
);

ipcMain.on("patch:cancel", () => {
  logger.log("[Main] Patch Cancel requested.");
  if (activeManualPatchManager) {
    activeManualPatchManager.cancelPatch();
  } else {
    logger.log("[Main] No active manual patch manager to cancel.");
  }
});

// --- Patch Reservation IPC ---
ipcMain.on("patch:reserve", (_event, reservation) => {
  logger.log(
    `[Main] Patch Reservation added: ${reservation.gameId} at ${reservation.targetTime}`,
  );
  if (appContext?.serviceManager) {
    const patchReservationService = getPatchReservationService();
    if (patchReservationService) {
      patchReservationService.addReservation(reservation);
    }
  }
});

ipcMain.on("patch:delete-reservation", (_event, id: string) => {
  logger.log(`[Main] Patch Reservation deleted: ${id}`);
  if (appContext?.serviceManager) {
    const patchReservationService = getPatchReservationService();
    if (patchReservationService) {
      patchReservationService.deleteReservation(id);
    }
  }
});

ipcMain.handle("patch:reserve-renewed", async (_event, reservation: unknown) =>
  createRenewedPatchReservation(appContext, reservation),
);

ipcMain.handle(
  "patch:delete-renewed-reservation",
  async (_event, id: unknown) => deleteRenewedPatchReservation(appContext, id),
);

// Utility for sync config access (Preload only)
ipcMain.on("config:get-sync", (event, key: string) => {
  event.returnValue = getConfig(key);
});

// Window Controls IPC
ipcMain.on("app:set-title", (_event, title: string) => {
  // Manual override if needed, but we mostly use broadcastTitleUpdate
  trayManager.updateTitle(title);
});

ipcMain.on("window-minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on("window-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win === mainWindow) {
      win.close();
    } else if (win === debugWindow) {
      // Just toggle the config, initDebugWindow will handle the hide().
      setConfigWithEvent("debug_console", false);
    } else {
      win.close();
    }
  }
});

// --- Visibility Management ---

// Internal API Interface to avoid raw 'any'
interface ExtendedWebContents extends Electron.WebContents {
  getWebPreferences(): Electron.WebPreferences;
}

// Global Listener for New Windows (Popups)
app.on("browser-window-created", (_, window) => {
  // 1. Enable recursive popup handling with Partition Inheritance
  // Cast to access internal getWebPreferences() method
  const webContents = window.webContents as unknown as ExtendedWebContents;
  const webPrefs = webContents.getWebPreferences?.();
  const currentPartition = webPrefs?.partition;

  // Propagate the trigger context from opener to the new window
  window.webContents.setWindowOpenHandler(
    createHandleWindowOpen(window.webContents.id, currentPartition),
  );

  // [Fix] Update gameWindow reference to track the latest active automation window
  if (
    window !== mainWindow &&
    window !== debugWindow &&
    (currentPartition === PARTITIONS.KAKAO ||
      currentPartition === PARTITIONS.GGG)
  ) {
    logger.log(`[Main] Tracking new automation window: ${window.id}`);
    const previousGameWindow = gameWindow; // Keep track of the "Parent" window
    gameWindow = window;
    if (appContext) appContext.gameWindow = window;

    // Handle reference cleanup if this specific window closes
    window.on("closed", () => {
      if (gameWindow === window) {
        logger.log(
          `[Main] Automation window ${window.id} closed. Falling back to previous window if exists.`,
        );
        // Fallback to previous window if it's still alive, otherwise null
        const fallbackWindow =
          previousGameWindow && !previousGameWindow.isDestroyed()
            ? previousGameWindow
            : null;

        gameWindow = fallbackWindow;
        if (appContext) appContext.gameWindow = fallbackWindow;
      }
    });
  }
  // [Log] Monitor Popup Closing
  window.on("close", () => {
    // Skip Main/Debug windows (handled separately)
    if (window === mainWindow || window === debugWindow) return;

    try {
      if (!window.isDestroyed()) {
        const url = window.webContents.getURL();
        const title = window.getTitle();
        // Filter out empty/initial windows
        if (url && url !== "about:blank") {
          logger.log(`[Main] Popup/Window closing: "${title}" (${url})`);
        }
      }
    } catch {
      // Ignore
    }
  });

  // 2. Monitor Navigation for dynamic visibility
  const checkAndShow = () => {
    // CRITICAL: Do not hide the Main UI Window or Debug Console!
    if (mainWindow && window === mainWindow) return;
    if (debugWindow && window === debugWindow) return;
    if (window.isDestroyed()) return;

    const url = window.webContents.getURL();
    // 0. Ignore empty/initial loading to prevent premature closing
    if (!url || url === "about:blank") return;

    const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
    const showInactive = getEffectiveConfig("show_inactive_windows") === true;

    // 1. Determine if window should be shown (Central Policy)
    // Removed isUserFacingPage: Visibility is now controlled by Preload IPC or Inactive Config
    const isForcedVisible = forcedVisibleWindows.has(window.id);

    // Priority: Forced > DebugEnv > InactiveConfig
    // Note: ForcedVisible might not be set yet during initial load (Preload not run yet)
    // But once preload runs, it will trigger the IPC and show the window.
    const shouldShow = isForcedVisible || isDebugEnv || showInactive;

    if (shouldShow) {
      if (!window.isVisible()) {
        logger.log(`[Main] Showing window: ${url}`);
        window.show();
        void (async () => {
          const triggerContext = getNavigationTrigger(window.webContents.id);
          await dumpAutomationPage(window, {
            reason: "check-and-show",
            triggerContext: triggerContext ?? undefined,
            mainWindow,
            debugWindow,
          });
        })();
      }
    } else {
      if (window.isVisible()) {
        logger.log(`[Main] Hiding prohibited/background window: ${url}`);
        window.hide();
      }
    }
  };

  window.webContents.on("did-navigate", checkAndShow);
  window.webContents.on("did-finish-load", () => {
    if (!window.isDestroyed()) {
      checkAndShow();
      // Seeding context to new windows if we are in a launch session
      const activeSessionContext = gameSessionTracker.getActiveSessionContext();
      if (activeSessionContext) {
        window.webContents.send("execute-game-start", activeSessionContext);
      }
    }
  });

  const wcId = window.webContents.id;

  // 3. Debugging Support
  const isDebugEnv = process.env.VITE_SHOW_GAME_WINDOW === "true";
  const showConsole =
    getEffectiveConfig("show_inactive_window_console") === true;

  if (isDebugEnv || showConsole) {
    if (!window.isDestroyed()) {
      window.webContents.openDevTools({ mode: "detach" });
      logger.log("[Main] DevTools opened for new window");
      window.setMenuBarVisibility(false);
    }
  }

  // Register context mapping for the new window (popup)
  const activeSessionContext = gameSessionTracker.getActiveSessionContext();
  if (activeSessionContext && !window.isDestroyed()) {
    windowContextMap.set(wcId, activeSessionContext);
  }

  // Cleanup mapping when window is destroyed
  window.on("closed", () => {
    resetGameStatusIfInterrupted(window);
    windowContextMap.delete(wcId);
  });
});

// [Trigger Context Inheritance]
// Automatically propagate the purpose of navigation to new windows
app.on("web-contents-created", (_, wc) => {
  wc.on("did-create-window", (window) => {
    // Reference by 'wc.id' as the parent that triggered the window creation
    const parentContext = getNavigationTrigger(wc.id);
    if (parentContext) {
      logger.log(
        `[Context] Propagating trigger '${parentContext}' from ${wc.id} -> ${window.webContents.id}`,
      );
      setNavigationTrigger(window.webContents.id, parentContext);
    }
  });
});

// Sync terminal context tracking with internal status changes
eventBus.register({
  id: "ActiveSessionTracker",
  targetEvent: EventType.GAME_STATUS_CHANGE,
  handle: async (event: GameStatusChangeEvent) => {
    gameSessionTracker.handleStatusChange(event.payload);
    await handleAutomationDumpGameStatus(event.payload);
  },
});

// Register Toggler for Debug Window (Show/Hide dynamically)
eventBus.register({
  id: "DebugWindowTicker",
  targetEvent: EventType.CONFIG_CHANGE,
  handle: async (event: ConfigChangeEvent) => {
    const { key } = event.payload;
    if (DEBUG_KEYS.includes(key)) {
      initDebugWindow(`ConfigUpdate:${key}`);
    }
  },
});

// Register Toggler for Auxiliary DevTools (Unified Event Handler)
eventBus.register({
  id: "DevToolsSyncManager",
  targetEvent: EventType.CONFIG_CHANGE,
  handle: async (event: ConfigChangeEvent) => {
    const { key } = event.payload;
    // [Trigger Point 2] Sync DevTools whenever Config changes
    // Dependencies: show_inactive_window_console relies on dev_mode.
    if (key === "show_inactive_window_console" || key === "dev_mode") {
      // Emit Sync Event
      eventBus.emit(EventType.SYNC_DEVTOOLS_VISIBILITY, appContext, {
        source: "ConfigChange",
      });
    }
  },
});

// Register Handler to update Window Title when configuration changes
eventBus.register({
  id: "WindowTitleSyncManager",
  targetEvent: EventType.CONFIG_CHANGE,
  handle: async (event: ConfigChangeEvent) => {
    const { key } = event.payload;
    if (key === "activeGame" || key === "resolutionMode") {
      broadcastTitleUpdate();
    }
  },
});

registerShutdownHandlers((quitting) => {
  isQuitting = quitting;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

// Set App User Model ID for Windows Taskbar Icon handling
const APP_USER_MODEL_ID = "com.nerdhead.poe2-launcher";
app.setAppUserModelId(
  app.isPackaged ? APP_USER_MODEL_ID : `${APP_USER_MODEL_ID}.dev`,
);

ipcMain.handle("changelog:get-all", async () => {
  const currentVersion = app.getVersion();
  // Empty previousVersion triggers 'fetch all' in service
  return changelogService.fetchChangelogs(currentVersion, "");
});

ipcMain.handle("theme:get-active", async (_event, game: "POE1" | "POE2") => {
  return await themeCacheManager.getActiveTheme(game);
});

ipcMain.handle("theme:get-all", async () => {
  return await themeCacheManager.getThemes();
});

ipcMain.handle("theme:sync-force", async () => {
  const isUpdated = await themeCacheManager.syncThemes(true);
  if (isUpdated) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send("theme:synced");
      }
    });
  }
  return isUpdated;
});

app.whenReady().then(async () => {
  const gamePathDiagnosticQaLaunch = resolveGamePathDiagnosticQaLaunch({
    isPackaged: app.isPackaged,
    devServerUrl: VITE_DEV_SERVER_URL,
    startHidden: process.env.ELECTRON_START_HIDDEN,
    runId: process.env.ELECTRON_QA_RUN_ID,
    userDataPath: process.env.ELECTRON_QA_USER_DATA_DIR,
    fixtureMode: process.env.ELECTRON_QA_GAME_PATH_FIXTURE,
  });
  if (gamePathDiagnosticQaLaunch.kind === "active") {
    await createGamePathDiagnosticQaWindow(gamePathDiagnosticQaLaunch.request);
    return;
  }

  diagnosticLogStore.initialize(app.getPath("logs"), getLogHistory());
  setupDiagnosticLogSink((payload) => diagnosticLogStore.append(payload));
  registerDiagnosticLogIpc(diagnosticLogStore);

  // Register Font IPC Handlers early to avoid race conditions
  FontIpcHandler.register();
  registerEventNotificationIpc(context);

  // Register custom protocol to load assets from %appdata%
  protocol.handle("asset", (request) => {
    try {
      // request.url is the abstract path e.g., asset://poe1/3.27/bg.webp
      const urlObj = new URL(request.url);

      // hostname becomes the game (e.g., 'poe1'), pathname is '/[theme]/[file]'
      const gameDir = urlObj.hostname;
      const relativePath = decodeURIComponent(urlObj.pathname).replace(
        /^\/+/,
        "",
      );

      const themeDir = themeCacheManager.getThemeDir();
      const localPath = path.join(themeDir, gameDir, relativePath);

      // Use pathToFileURL to generate standard file:/// URL
      return net.fetch(pathToFileURL(localPath).href);
    } catch (err) {
      logger.error("[Protocol] Failed to resolve asset URL:", request.url, err);
      return new Response("Not Found", { status: 404 });
    }
  });

  // [UAC Sync] Ensure RUNASINVOKER is applied if config is set
  if (getEffectiveConfig("skipDaumGameStarterUac") === true) {
    if (await SimpleUacBypass.isDaumGameStarterMissingRunAsInvoker()) {
      logger.log(
        "[Main] Re-applying DaumGameStarter RUNASINVOKER from config...",
      );
      await SimpleUacBypass.setDaumGameStarterRunAsInvoker(true);
    }
  }

  // Handle Uninstall Cleanup Flag
  await syncInstallLocation();
  // Ensure Auto-Launch path is updated (in case user moved the app)
  syncAutoLaunch();

  // Initial title/name broadcast before window creation
  broadcastTitleUpdate();

  await createWindow();

  // Load and cache remote themes explicitly.
  themeCacheManager.init();

  // Also check for theme updates when the window regains focus (respects 24h cooldown internally)
  app.on("browser-window-focus", () => {
    themeCacheManager.syncThemes().then((isUpdated) => {
      if (isUpdated) {
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("theme:synced");
          }
        });
      }
    });

    // Refresh remote version cache (10-min TTL) so renderer can compare with local log.
    for (const gameId of ["POE1", "POE2"] as const) {
      if (RemoteVersionResolver.isFresh(gameId)) continue;
      RemoteVersionResolver.resolve(gameId).then((entry) => {
        if (!entry) return;
        const payload = {
          gameId: entry.gameId,
          webRoot: entry.webRoot,
          version: entry.version,
          source: entry.source,
          fetchedAt: entry.fetchedAt,
        };
        if (appContext) {
          eventBus.emit(EventType.REMOTE_VERSION_UPDATED, appContext, payload);
        }
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send("remote-version:updated", payload);
          }
        });
      });
    }
  });
});

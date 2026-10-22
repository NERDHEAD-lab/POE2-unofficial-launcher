import { randomUUID } from "node:crypto";

import {
  normalizeInstallPath,
  sameVersionContext,
} from "../../../shared/game-version";
import {
  AppConfig,
  GameVersionContext,
  RemoteWebRootPayload,
} from "../../../shared/types";
import { PatchManager } from "../../services/PatchManager";
import { setConfigWithEvent } from "../../utils/config-utils";
import { LogParser } from "../../utils/LogParser";
import { PowerShellManager } from "../../utils/powershell";
import { eventBus } from "../EventBus";
import {
  AppContext,
  AppEvent,
  EventHandler,
  EventType,
  LogErrorDetectedEvent,
  LogSessionStartEvent,
  LogWebRootFoundEvent,
  LogBackupWebRootFoundEvent,
  LogGameStartupEvent,
  ProcessEvent,
  DebugLogEvent,
  ProcessWillTerminateEvent,
  PatchRetryRequestedEvent,
  PatchReservationFailedEvent,
  UIEvent,
} from "../types";

// --- Helper for UI Logging ---
function emitLog(
  context: AppContext,
  content: string,
  isError: boolean = false,
) {
  eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, context, {
    type: "auto_patch",
    content,
    isError,
    timestamp: Date.now(),
    typeColor: "#dcdcaa", // Beige for Logic
    textColor: isError ? "#f48771" : "#d4d4d4",
  });
}

// --- State Manager ---
interface SessionState {
  serviceId: AppConfig["serviceChannel"];
  gameId: AppConfig["activeGame"];
  webRoot?: string;
  backupWebRoot?: string;
  errorCount: number;
  startTime: number;
  alerted: boolean;
  isAutoPatch: boolean;
  intentionalStop: boolean;
  retryCount: number;
  runId?: string;
  installPath?: string;
  webRootIsHistorical?: boolean;
  webRootPid?: number;
  target?: RemoteWebRootPayload;
}

class AutoPatchStateManager {
  // Key: PID
  private sessions = new Map<number, SessionState>();
  // Key: serviceId (Pending manual confirmation)
  private pendingManualPatches = new Map<string, SessionState>();
  // Key: gameId_serviceId (Next session expectation)
  private autoPatchExpectations = new Map<
    string,
    { retryCount: number; runId?: string; target?: RemoteWebRootPayload }
  >();
  private activeAutoPatchRuns = new Map<
    string,
    { retryCount: number; runId?: string; target?: RemoteWebRootPayload }
  >();
  private claimedAutoPatchRuns = new Map<
    number,
    { retryCount: number; runId?: string; target?: RemoteWebRootPayload }
  >();

  private patchManager: PatchManager | null = null;

  public getPatchManager(context: AppContext) {
    if (!this.patchManager) {
      this.patchManager = new PatchManager(context);
    }
    return this.patchManager;
  }

  public startSession(
    pid: number,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    installPath?: string,
  ) {
    const run = this.claimedAutoPatchRuns.get(pid);

    this.sessions.set(pid, {
      serviceId,
      gameId,
      errorCount: 0,
      startTime: Date.now(),
      alerted: false,
      isAutoPatch: !!run,
      intentionalStop: false,
      retryCount: run?.retryCount || 0,
      runId: run?.runId,
      installPath,
      target: run?.target,
    });
  }

  public claimProcess(
    pid: number,
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ) {
    const key = `${gameId}_${serviceId}`;
    const expectation = this.autoPatchExpectations.get(key);
    const run = expectation ?? this.activeAutoPatchRuns.get(key);
    if (!run) return;

    this.claimedAutoPatchRuns.set(pid, run);
    if (expectation) {
      this.autoPatchExpectations.delete(key);
      this.activeAutoPatchRuns.set(key, expectation);
    }
  }

  public setIntentionalStop(pid: number) {
    const session = this.sessions.get(pid);
    if (session) {
      session.intentionalStop = true;
    }
  }

  public expectAutoPatch(
    gameId: string,
    serviceId: string,
    retryCount: number = 0,
    runId?: string,
    target?: RemoteWebRootPayload,
  ) {
    this.autoPatchExpectations.set(`${gameId}_${serviceId}`, {
      retryCount,
      runId,
      target,
    });
  }

  public setWebRoot(
    pid: number,
    webRoot: string,
    isHistorical?: boolean,
    sourcePid?: number,
  ) {
    const session = this.sessions.get(pid);
    if (session) {
      session.webRoot = webRoot;
      session.webRootIsHistorical = isHistorical !== false;
      session.webRootPid = sourcePid;
    }
  }

  public setBackupWebRoot(pid: number, backupWebRoot: string) {
    const session = this.sessions.get(pid);
    if (session) {
      session.backupWebRoot = backupWebRoot;
    }
  }

  public addError(pid: number, errorCount: number) {
    const session = this.sessions.get(pid);
    if (session) {
      session.errorCount = errorCount;
    }
  }

  public getSession(pid: number) {
    return this.sessions.get(pid);
  }

  public clearSession(pid: number) {
    this.sessions.delete(pid);
    this.claimedAutoPatchRuns.delete(pid);
  }

  public getRunIdForPid(pid: number) {
    return (
      this.sessions.get(pid)?.runId ?? this.claimedAutoPatchRuns.get(pid)?.runId
    );
  }

  public clearAutoPatchRun(runId: string) {
    for (const [key, run] of this.autoPatchExpectations) {
      if (run.runId === runId) this.autoPatchExpectations.delete(key);
    }
    for (const [key, run] of this.activeAutoPatchRuns) {
      if (run.runId === runId) this.activeAutoPatchRuns.delete(key);
    }
    for (const [pid, run] of this.claimedAutoPatchRuns) {
      if (run.runId === runId) this.claimedAutoPatchRuns.delete(pid);
    }
    for (const [pid, session] of this.sessions) {
      if (session.runId === runId) this.sessions.delete(pid);
    }
  }

  // --- Pending Manual Patch Management ---
  public setPendingManualPatch(serviceId: string, session: SessionState) {
    this.pendingManualPatches.set(serviceId, session);
  }

  public getAllPendingPatches() {
    return Array.from(this.pendingManualPatches.values());
  }

  public clearPendingPatch(serviceId: string) {
    this.pendingManualPatches.delete(serviceId);
  }
}

const stateManager = new AutoPatchStateManager();

// --- Exported Control Functions for IPC ---

export async function triggerPendingManualPatches(context: AppContext) {
  const patches = stateManager.getAllPendingPatches();

  if (patches.length === 0) {
    emitLog(context, "[AutoPatch] No pending patches found.");
    return;
  }

  for (const session of patches) {
    const { serviceId, gameId, webRoot, backupWebRoot } = session;
    const installPath = session.installPath;

    if (installPath) {
      emitLog(
        context,
        `[AutoPatch] Executing Manual Patch for ${serviceId}...`,
      );
      const manager = stateManager.getPatchManager(context);

      // Start safely
      manager
        .startSelfDiagnosis(installPath, serviceId, gameId, {
          webRoot,
          backupWebRoot,
          target: session.target,
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          emitLog(context, `[AutoPatch] Patch execution failed: ${msg}`, true);
        });
    } else {
      emitLog(
        context,
        `[AutoPatch] Install path not found for ${serviceId}`,
        true,
      );
    }

    // Clear after triggering
    stateManager.clearPendingPatch(serviceId);
  }
}

export function cancelPendingPatches(context: AppContext) {
  const patches = stateManager.getAllPendingPatches();
  patches.forEach((p) => stateManager.clearPendingPatch(p.serviceId));
  emitLog(context, "[AutoPatch] All pending patches cancelled.");
}

export function registerAutoPatchExpectation(
  gameId: string,
  serviceId: string,
  retryCount: number = 0,
  runId?: string,
  target?: RemoteWebRootPayload,
) {
  stateManager.expectAutoPatch(gameId, serviceId, retryCount, runId, target);
}

export function getAutoPatchRunIdForPid(pid: number) {
  return stateManager.getRunIdForPid(pid);
}

export function clearAutoPatchRun(runId: string) {
  stateManager.clearAutoPatchRun(runId);
}

// --- Handlers ---

export const AutoPatchProcessStartHandler: EventHandler<ProcessEvent> = {
  id: "AutoPatchProcessStartHandler",
  targetEvent: EventType.PROCESS_START,
  handle: async (event, _context) => {
    const { pid, serviceId, gameId } = event.payload;
    if (!serviceId || !gameId) return;
    stateManager.claimProcess(pid, serviceId, gameId);
  },
};

export const LogSessionHandler: EventHandler<LogSessionStartEvent> = {
  id: "LogSessionHandler",
  targetEvent: EventType.LOG_SESSION_START,
  handle: async (event, _context) => {
    const { pid, serviceId, gameId, installPath } = event.payload;
    stateManager.startSession(pid, serviceId, gameId, installPath);
  },
};

export const LogWebRootHandler: EventHandler<LogWebRootFoundEvent> = {
  id: "LogWebRootHandler",
  targetEvent: EventType.LOG_WEB_ROOT_FOUND,
  handle: async (event, context) => {
    const { pid, webRoot, isHistorical, installPath, sourcePid } =
      event.payload;
    const owner = stateManager.getSession(pid);
    if (
      !owner ||
      owner.gameId !== event.payload.gameId ||
      owner.serviceId !== event.payload.serviceId ||
      (owner.installPath &&
        installPath &&
        normalizeInstallPath(owner.installPath) !==
          normalizeInstallPath(installPath))
    )
      return;
    stateManager.setWebRoot(pid, webRoot, isHistorical, sourcePid);

    // [New] Persist Version Info
    const session = stateManager.getSession(pid);
    if (session) {
      const { gameId, serviceId } = session;
      if (installPath && !session.installPath)
        session.installPath = installPath;
      const key = `${gameId}_${serviceId}`;

      // Extract Version
      const version = LogParser.extractVersion(webRoot);

      const config = context.getConfig() as AppConfig;
      const knownVersions = config.knownGameVersions || {};

      // Only update if changed or new
      if (
        !knownVersions[key] ||
        knownVersions[key].webRoot !== webRoot ||
        knownVersions[key].version !== version ||
        knownVersions[key].installPath !== session.installPath ||
        isHistorical === false
      ) {
        emitLog(
          context,
          `[AutoPatch] New Version Detected: ${version} (${key})`,
        );
        const updated = {
          ...knownVersions,
          [key]: {
            ...knownVersions[key],
            version,
            webRoot,
            timestamp: Date.now(),
            installPath: session.installPath,
            observationSource: isHistorical ? "log-scan" : "live-log",
          },
        };
        // Use setConfigWithEvent to ensure UI updates
        setConfigWithEvent("knownGameVersions", updated);
      }

      // [New] Emit success if it's an auto-patch session to clear service-level timeout
      if (session.isAutoPatch) {
        eventBus.emit(EventType.PATCH_RESERVATION_SUCCESS, context, {
          gameId: session.gameId,
          serviceId: session.serviceId,
          runId: session.runId,
        });
      }
    }
  },
};

/** This result gates both persisted proof and the reservation terminal state. */
export function confirmGameVersionForPid(
  context: AppContext,
  pid: number,
  runId: string | undefined,
  evidence: "patch-done" | "game-startup",
  expected: GameVersionContext,
  startup?: LogGameStartupEvent["payload"],
): boolean {
  const session = stateManager.getSession(pid);
  if (
    !session?.webRoot ||
    !session.installPath ||
    session.runId !== runId ||
    !sameVersionContext(
      {
        gameId: session.gameId,
        serviceId: session.serviceId,
        installPath: session.installPath,
      },
      expected,
    )
  )
    return false;
  // Preserve explicit line provenance without changing LogWatcher's PID inference.
  // An old line attributed only by the monitor cannot prove this run's target.
  if (session.webRootPid !== undefined && session.webRootPid !== pid)
    return false;
  if (session.webRootIsHistorical && session.webRootPid !== pid) return false;
  if (evidence === "game-startup") {
    if (
      !startup ||
      startup.isHistorical !== false ||
      !startup.installPath ||
      !sameVersionContext(
        {
          gameId: startup.gameId,
          serviceId: startup.serviceId,
          installPath: startup.installPath,
        },
        expected,
      ) ||
      (startup.sourcePid !== undefined && startup.sourcePid !== pid) ||
      (session.webRootIsHistorical && startup.sourcePid !== pid)
    )
      return false;
  }
  const { gameId, serviceId, installPath } = session;
  if (
    session.target &&
    (!sameVersionContext(session.target, expected) ||
      session.target.webRoot !== session.webRoot)
  )
    return false;
  const config = context.getConfig() as AppConfig;
  const key = `${gameId}_${serviceId}`;
  const observed = config.knownGameVersions?.[key];
  if (
    !observed ||
    observed.webRoot !== session.webRoot ||
    !observed.installPath ||
    normalizeInstallPath(observed.installPath) !==
      normalizeInstallPath(installPath)
  )
    return false;
  try {
    setConfigWithEvent("knownGameVersions", {
      ...config.knownGameVersions,
      [key]: {
        ...observed,
        completed: {
          version: observed.version,
          webRoot: observed.webRoot,
          installPath,
          timestamp: Date.now(),
          runId: runId ?? randomUUID(),
          evidence,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

export const GameVersionCompletionHandler: EventHandler<LogGameStartupEvent> = {
  id: "GameVersionCompletionHandler",
  targetEvent: EventType.LOG_GAME_STARTUP,
  handle: async (event, context) => {
    const { pid, gameId, serviceId, installPath } = event.payload;
    const session = stateManager.getSession(pid);
    if (!installPath || !session) return;
    confirmGameVersionForPid(
      context,
      pid,
      session.runId,
      "game-startup",
      { gameId, serviceId, installPath },
      event.payload,
    );
  },
};

export const LogBackupWebRootHandler: EventHandler<LogBackupWebRootFoundEvent> =
  {
    id: "LogBackupWebRootHandler",
    targetEvent: EventType.LOG_BACKUP_WEB_ROOT_FOUND,
    handle: async (event, _context) => {
      const { pid, backupWebRoot } = event.payload;
      stateManager.setBackupWebRoot(pid, backupWebRoot);
    },
  };

export const LogErrorHandler: EventHandler<LogErrorDetectedEvent> = {
  id: "LogErrorHandler",
  targetEvent: EventType.LOG_ERROR_DETECTED,
  handle: async (event, context) => {
    const { pid, errorCount } = event.payload;
    stateManager.addError(pid, errorCount);

    emitLog(
      context,
      `[AutoPatch] Error count updated for PID ${pid}: ${errorCount}`,
    );

    const session = stateManager.getSession(pid);

    const aggressiveMode =
      context.getConfig("aggressivePatchMode") === true &&
      context.getConfig("autoFixPatchError") === true;
    const effectiveThreshold = aggressiveMode ? 1 : 10;

    if (errorCount >= effectiveThreshold && session && !session.alerted) {
      session.alerted = true;

      if (aggressiveMode) {
        // [Korean Mode] Aggressive Kill
        emitLog(
          context,
          `[AutoPatch] ⚡ Aggressive Mode: Error detected (Count: ${errorCount}). Killing process ${pid} immediately...`,
          true,
        );

        // Emit intentional stop event BEFORE killing
        eventBus.emit(EventType.PROCESS_WILL_TERMINATE, context, {
          pid,
        } as ProcessWillTerminateEvent["payload"]);

        // Execute TaskKill via PowerShell
        const uacBypassEnabled =
          context.getConfig("skipDaumGameStarterUac") === true;
        PowerShellManager.getInstance().execute(
          `taskkill /PID ${pid} /F /T`,
          !uacBypassEnabled, // Only use admin if bypass is disabled
        );
      } else {
        emitLog(
          context,
          `[AutoPatch] 🚨 Threshold reached for PID ${pid}. Waiting for process exit to trigger fix.`,
          true,
        );
      }
    }
  },
};

export const AutoPatchProcessStopHandler: EventHandler<ProcessEvent> = {
  id: "AutoPatchProcessStopHandler",
  targetEvent: EventType.PROCESS_STOP,
  handle: async (event, context) => {
    const pid = event.payload.pid;
    const session = stateManager.getSession(pid);

    if (session) {
      emitLog(
        context,
        `[AutoPatch] Process ${pid} stop detected. Intentional: ${session.intentionalStop}`,
      );

      // Check for Abnormal Exit (Crash/Closed without reaching WebRoot)
      if (!session.intentionalStop && session.isAutoPatch && !session.webRoot) {
        if (session.retryCount < 3) {
          emitLog(
            context,
            `[AutoPatch] ⚠️ Abnormal exit detected for auto-patch session (PID ${pid}). Requesting retry ${session.retryCount + 1}/3...`,
            true,
          );
          eventBus.emit(EventType.PATCH_RETRY_REQUESTED, context, {
            gameId: session.gameId,
            serviceId: session.serviceId,
            retryCount: session.retryCount + 1,
            runId: session.runId,
          } as PatchRetryRequestedEvent["payload"]);
          stateManager.clearSession(pid);
          return;
        } else {
          emitLog(
            context,
            `[AutoPatch] ❌ Max retries reached for ${session.gameId} (${session.serviceId}).`,
            true,
          );
          eventBus.emit(EventType.PATCH_RESERVATION_FAILED, context, {
            gameId: session.gameId,
            serviceId: session.serviceId,
            reason: "Max retries reached without log response.",
            runId: session.runId,
          } as PatchReservationFailedEvent["payload"]);
        }
      }

      const aggressiveMode =
        context.getConfig("aggressivePatchMode") === true &&
        context.getConfig("autoFixPatchError") === true;
      const THRESHOLD = aggressiveMode ? 1 : 10;

      if (session.errorCount >= THRESHOLD) {
        emitLog(
          context,
          `[AutoPatch] Process ${pid} exited with high error count (${session.errorCount}). Triggering Fix.`,
          true,
        );

        const autoFix = context.getConfig("autoFixPatchError") === true;
        const { serviceId, gameId, webRoot, backupWebRoot } = session;

        if (autoFix) {
          // Auto Fix
          const installPath = session.installPath;
          if (installPath) {
            // Ensure window is visible before showing modal and starting fix
            if (context.mainWindow) {
              context.mainWindow.show();
              context.mainWindow.focus();
            }

            context.mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
              autoStart: true,
            });

            const manager = stateManager.getPatchManager(context);

            const success = await manager.startSelfDiagnosis(
              installPath,
              serviceId,
              gameId,
              {
                webRoot,
                backupWebRoot,
                target: session.target,
              },
            );

            // Auto Game Start Logic
            const autoStartGame =
              context.getConfig("autoGameStartAfterFix") === true;
            if (success && autoStartGame) {
              emitLog(
                context,
                `[AutoPatch] Auto-Start enabled. Triggering Game Start for ${gameId} (${serviceId})...`,
              );
              eventBus.emit<UIEvent>(EventType.UI_GAME_START_CLICK, context, {
                gameId,
                serviceId,
              });
            }
          }
          stateManager.clearSession(pid); // Done
        } else {
          // Manual Fix Confirmation
          emitLog(
            context,
            `[AutoPatch] Requesting User Confirmation (Manual Mode)`,
          );

          // Ensure window is visible for manual confirmation
          if (context.mainWindow) {
            context.mainWindow.show();
            context.mainWindow.focus();
          }

          // Store in pending (PERSIST DATA for manual trigger)
          stateManager.setPendingManualPatch(serviceId, session);

          context.mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
            autoStart: false,
            serviceId,
            gameId,
          });

          stateManager.clearSession(pid); // Clear from active sessions
        }
      } else {
        emitLog(
          context,
          `[AutoPatch] Session ended normally (Errors: ${session.errorCount})`,
        );
        stateManager.clearSession(pid);
      }
    }
  },
};

export const PatchProgressHandler: EventHandler<AppEvent> = {
  // Using any/custom event type
  id: "PatchProgressHandler",
  targetEvent: EventType.PATCH_PROGRESS,
  handle: async (event, context) => {
    // Forward to UI
    if (context.mainWindow && !context.mainWindow.isDestroyed()) {
      context.mainWindow.webContents.send("patch:progress", event.payload);
    }
  },
};

export const ProcessWillTerminateHandler: EventHandler<ProcessWillTerminateEvent> =
  {
    id: "ProcessWillTerminateHandler",
    targetEvent: EventType.PROCESS_WILL_TERMINATE,
    handle: async (event, _context) => {
      stateManager.setIntentionalStop(event.payload.pid);
    },
  };

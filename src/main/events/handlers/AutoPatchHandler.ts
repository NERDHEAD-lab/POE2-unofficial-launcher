import { AppConfig } from "../../../shared/types";
import { PatchManager } from "../../services/PatchManager";
import { setConfigWithEvent } from "../../utils/config-utils";
import { LogParser } from "../../utils/LogParser";
import { PowerShellManager } from "../../utils/powershell";
import { getGameInstallPath } from "../../utils/registry";
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
  ProcessEvent,
  DebugLogEvent,
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
}

class AutoPatchStateManager {
  // Key: PID
  private sessions = new Map<number, SessionState>();
  // Key: serviceId (Pending manual confirmation)
  private pendingManualPatches = new Map<string, SessionState>();

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
  ) {
    this.sessions.set(pid, {
      serviceId,
      gameId,
      errorCount: 0,
      startTime: Date.now(),
      alerted: false,
    });
  }

  public setWebRoot(pid: number, webRoot: string) {
    const session = this.sessions.get(pid);
    if (session) {
      session.webRoot = webRoot;
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
    const installPath = await getGameInstallPath(serviceId, gameId);

    if (installPath) {
      emitLog(
        context,
        `[AutoPatch] Executing Manual Patch for ${serviceId}...`,
      );
      const manager = stateManager.getPatchManager(context);

      // Start safely
      manager
        .startSelfDiagnosis(installPath, serviceId, {
          webRoot,
          backupWebRoot,
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

// --- Handlers ---

export const LogSessionHandler: EventHandler<LogSessionStartEvent> = {
  id: "LogSessionHandler",
  targetEvent: EventType.LOG_SESSION_START,
  handle: async (event, _context) => {
    const { pid, serviceId, gameId } = event.payload;
    stateManager.startSession(pid, serviceId, gameId);
  },
};

export const LogWebRootHandler: EventHandler<LogWebRootFoundEvent> = {
  id: "LogWebRootHandler",
  targetEvent: EventType.LOG_WEB_ROOT_FOUND,
  handle: async (event, context) => {
    const { pid, webRoot } = event.payload;
    stateManager.setWebRoot(pid, webRoot);

    // [New] Persist Version Info
    const session = stateManager.getSession(pid);
    if (session) {
      const { gameId, serviceId } = session;
      const key = `${gameId}_${serviceId}`;

      // Extract Version
      const version = LogParser.extractVersion(webRoot);

      const config = context.getConfig() as AppConfig;
      const knownVersions = config.knownGameVersions || {};

      // Only update if changed or new
      if (
        !knownVersions[key] ||
        knownVersions[key].webRoot !== webRoot ||
        knownVersions[key].version !== version
      ) {
        emitLog(
          context,
          `[AutoPatch] New Version Detected: ${version} (${key})`,
        );
        const updated = {
          ...knownVersions,
          [key]: {
            version,
            webRoot,
            timestamp: Date.now(),
          },
        };
        // Use setConfigWithEvent to ensure UI updates
        setConfigWithEvent("knownGameVersions", updated);
      }
    }
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

    const aggressiveMode = context.getConfig("aggressivePatchMode") === true;
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

        // Execute TaskKill via PowerShell
        // If UAC Bypass is enabled, we don't need admin privileges to kill the process (useAdmin: false)
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
        `[AutoPatch] Process ${pid} stop detected. Checking session state...`,
      );

      const aggressiveMode = context.getConfig("aggressivePatchMode") === true;
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
          const installPath = await getGameInstallPath(serviceId, gameId);
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
              {
                webRoot,
                backupWebRoot,
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
              // Trigger Game Start (Assumes active config matches the patched game)
              eventBus.emit<UIEvent>(
                EventType.UI_GAME_START_CLICK,
                context,
                undefined,
              );
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

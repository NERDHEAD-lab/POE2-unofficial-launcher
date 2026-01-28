import { PatchManager } from "../../services/PatchManager";
import { AppConfig } from "../../shared/types";
import { getGameInstallPath } from "../../utils/registry";
import {
  AppContext,
  EventHandler,
  EventType,
  LogErrorDetectedEvent,
  LogSessionStartEvent,
  LogWebRootFoundEvent,
  LogBackupWebRootFoundEvent,
  ProcessEvent,
} from "../types";

// --- State Manager ---
interface SessionState {
  serviceId: AppConfig["serviceChannel"];
  gameId: AppConfig["activeGame"];
  webRoot?: string;
  backupWebRoot?: string;
  errorCount: number;
  startTime: number;
}

class AutoPatchStateManager {
  // Key: PID
  private sessions = new Map<number, SessionState>();
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
}

const stateManager = new AutoPatchStateManager();

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
  handle: async (event, _context) => {
    const { pid, webRoot } = event.payload;
    stateManager.setWebRoot(pid, webRoot);
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
  handle: async (event, _context) => {
    const { pid, errorCount } = event.payload;
    stateManager.addError(pid, errorCount);
  },
};

export const AutoPatchProcessStopHandler: EventHandler<ProcessEvent> = {
  id: "AutoPatchProcessStopHandler",
  targetEvent: EventType.PROCESS_STOP,
  handle: async (event, context) => {
    const pid = event.payload.pid;
    const session = stateManager.getSession(pid);

    if (session) {
      const THRESHOLD = 10;
      if (session.errorCount >= THRESHOLD) {
        console.log(
          `[AutoPatch] Process ${pid} exited with high error count (${session.errorCount}). Triggering Fix.`,
        );

        const autoFix = context.store.get("autoFixPatchError", false);
        const { serviceId, gameId, webRoot, backupWebRoot } = session;

        if (autoFix) {
          // Auto Fix
          const installPath = await getGameInstallPath(serviceId, gameId);
          if (installPath) {
            context.mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
              autoStart: true,
            });

            const manager = stateManager.getPatchManager(context);

            await manager.startSelfDiagnosis(installPath, serviceId, {
              webRoot,
              backupWebRoot,
            });
          }
        } else {
          // Manual Fix Confirmation
          context.mainWindow?.webContents.send("UI:SHOW_PATCH_MODAL", {
            autoStart: false,
            serviceId,
            gameId,
          });
        }
      }

      stateManager.clearSession(pid);
    }
  },
};

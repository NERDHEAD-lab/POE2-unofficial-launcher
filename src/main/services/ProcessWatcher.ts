import { eventBus } from "../events/EventBus";
import { SUPPORTED_PROCESS_NAMES } from "../events/handlers/GameProcessStatusHandler";
import { AppContext, EventType, ProcessEvent } from "../events/types";
import { Logger } from "../utils/logger";
import * as processUtils from "../utils/process";

const TARGET_PROCESSES = SUPPORTED_PROCESS_NAMES;

export class ProcessWatcher {
  private context: AppContext;
  private logger = new Logger({
    type: "PROCESS_WATCHER",
    typeColor: "#4ec9b0",
    priority: 4,
  });
  private timer: NodeJS.Timeout | null = null;
  /**
   * PID-based cache for currently running target processes.
   * Key: Process ID
   * Value: { name: Process Name, path: Executable Path }
   */
  private activePids: Map<number, { name: string; path: string }> = new Map();
  private suspendTimer: NodeJS.Timeout | null = null;

  constructor(context: AppContext) {
    this.context = context;
  }

  public startWatching(intervalMs: number = 3000) {
    if (this.timer) {
      // Already running (Idempotent)
      return;
    }
    this.logger.log("Starting Watcher Service (PID-based)...");
    this.runCheck(); // Initial check

    this.timer = setInterval(() => {
      this.runCheck();
    }, intervalMs);
  }

  public stopWatching() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log("Watcher Service Stopped.");
    }
  }

  /**
   * Check if a process with the given name is currently running.
   * @param name Process name (e.g., "PathOfExile.exe")
   * @param criteria Optional callback to filter by process info (e.g., checking path)
   */
  public isProcessRunning(
    name: string,
    criteria?: (info: { pid: number; path: string }) => boolean,
  ): boolean {
    for (const [pid, info] of this.activePids.entries()) {
      if (info.name.toLowerCase() === name.toLowerCase()) {
        if (!criteria || criteria({ pid, path: info.path })) {
          return true;
        }
      }
    }
    return false;
  }

  // --- Suspension Logic ---

  private isOptimizationEnabled(): boolean {
    // Optimization is enabled (resource saving) when NOT in "always-on" mode.
    // Default is "resource-saving", so this returns true unless explicitly set to "always-on".
    return this.context.getConfig("processWatchMode") !== "always-on";
  }

  public scheduleSuspension() {
    // If optimization is disabled, we never suspend the watcher.
    if (!this.isOptimizationEnabled()) {
      return;
    }

    // Start 1-minute timer to suspend watcher
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null; // Mark as suspended
      this.logger.log(
        "Inactivity detected (1m). Suspending to save resources.",
      );
      this.stopWatching();
    }, 60 * 1000);
  }

  public cancelSuspension() {
    // If optimization is disabled, we are already running and never suspended.
    if (!this.isOptimizationEnabled()) {
      return;
    }

    if (this.suspendTimer) {
      // Cancel pending suspension
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    } else if (!this.timer) {
      // Only log and start if it was actually stopped (timer is null)
      this.logger.log("Resuming from suspension.");
      this.startWatching();
    }
  }

  public wakeUp(reason: string) {
    // 1. If optimization is disabled, we should already be running.
    if (!this.isOptimizationEnabled()) {
      if (!this.timer) this.startWatching();
      return;
    }

    // 2. Cancel suspension timer if running
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }

    // 3. Restart/Resume Watcher if not running
    if (!this.timer) {
      this.logger.log(`Waking up for: ${reason}`);
      this.startWatching();
    }

    // 4. Reset Timer since app is still inactive (wakeUp is typically called from background events)
    const isMainFocused = this.context.mainWindow?.isFocused();
    const isDebugFocused = this.context.debugWindow?.isFocused();

    if (!isMainFocused && !isDebugFocused) {
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        this.logger.log("Wake-up period ended. Suspending again.");
        this.stopWatching();
      }, 60 * 1000);
    }
  }

  private async runCheck() {
    try {
      // 1. Fetch current target processes in a single call
      const currentProcesses =
        await processUtils.getProcessesInfo(TARGET_PROCESSES);
      const currentPidSet = new Set(currentProcesses.map((p) => p.pid));

      // 2. Identify NEW processes (PID not in cache)
      for (const p of currentProcesses) {
        if (!this.activePids.has(p.pid)) {
          // New Process Detected
          this.activePids.set(p.pid, { name: p.name, path: p.path });

          this.logger.log(
            `Process Started: ${p.name} (PID: ${p.pid}, Path: ${p.path || "Unknown"})`,
          );

          eventBus.emit<ProcessEvent>(EventType.PROCESS_START, this.context, {
            name: p.name,
            path: p.path,
            pid: p.pid,
          });
        }
      }

      // 3. Identify STOPPED processes (PID in cache but not in current list)
      for (const [pid, info] of this.activePids.entries()) {
        if (!currentPidSet.has(pid)) {
          // Process Stopped
          this.logger.log(`Process Stopped: ${info.name} (PID: ${pid})`);

          eventBus.emit<ProcessEvent>(EventType.PROCESS_STOP, this.context, {
            name: info.name,
            path: info.path,
            pid: pid, // Using the key from valid iteration
          });

          this.activePids.delete(pid);
        }
      }
    } catch (e) {
      this.logger.error(`Error during runCheck:`, e);
    }
  }
}

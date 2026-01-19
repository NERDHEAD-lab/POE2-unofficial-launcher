import { eventBus } from "../events/EventBus";
import { SUPPORTED_PROCESS_NAMES } from "../events/handlers/GameProcessStatusHandler";
import { AppContext, EventType, ProcessEvent } from "../events/types";
import * as processUtils from "../utils/process";

const TARGET_PROCESSES = SUPPORTED_PROCESS_NAMES;

export class ProcessWatcher {
  private context: AppContext;
  private timer: NodeJS.Timeout | null = null;
  /**
   * PID-based cache for currently running target processes.
   * Key: Process ID
   * Value: { name: Process Name, path: Executable Path }
   */
  private activePids: Map<number, { name: string; path: string }> = new Map();

  constructor(context: AppContext) {
    this.context = context;
  }

  public startWatching(intervalMs: number = 3000) {
    console.log("[ProcessWatcher] Starting Watcher Service (PID-based)...");
    this.runCheck(); // Initial check

    this.timer = setInterval(() => {
      this.runCheck();
    }, intervalMs);
  }

  public stopWatching() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[ProcessWatcher] Watcher Service Stopped.");
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

          console.log(
            `[ProcessWatcher] Process Started: ${p.name} (PID: ${p.pid}, Path: ${p.path || "Unknown"})`,
          );

          eventBus.emit<ProcessEvent>(EventType.PROCESS_START, this.context, {
            name: p.name,
            path: p.path,
          });
        }
      }

      // 3. Identify STOPPED processes (PID in cache but not in current list)
      for (const [pid, info] of this.activePids.entries()) {
        if (!currentPidSet.has(pid)) {
          // Process Stopped
          console.log(
            `[ProcessWatcher] Process Stopped: ${info.name} (PID: ${pid})`,
          );

          eventBus.emit<ProcessEvent>(EventType.PROCESS_STOP, this.context, {
            name: info.name,
            path: info.path,
          });

          this.activePids.delete(pid);
        }
      }
    } catch (e) {
      console.error(`[ProcessWatcher] Error during runCheck:`, e);
    }
  }
}

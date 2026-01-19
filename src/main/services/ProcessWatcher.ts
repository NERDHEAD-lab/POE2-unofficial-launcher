import { eventBus } from "../events/EventBus";
import { SUPPORTED_PROCESS_NAMES } from "../events/handlers/GameProcessStatusHandler";
import { AppContext, EventType, ProcessEvent } from "../events/types";
import { getProcessPaths } from "../utils/process";

const TARGET_PROCESSES = SUPPORTED_PROCESS_NAMES;

export class ProcessWatcher {
  private context: AppContext;
  private timer: NodeJS.Timeout | null = null;
  private processStates: Map<string, boolean> = new Map();

  constructor(context: AppContext) {
    this.context = context;
    // Initialize states
    TARGET_PROCESSES.forEach((name) => this.processStates.set(name, false));
  }

  public startWatching(intervalMs: number = 3000) {
    console.log("[ProcessWatcher] Starting Watcher Service...");
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
    // console.log("[ProcessWatcher] Running Check..."); // Too noisy?
    for (const processName of TARGET_PROCESSES) {
      // Use getProcessPaths instead of isProcessRunning to get path info
      try {
        const paths = await getProcessPaths(processName);
        const isRunning = paths.length > 0;

        const wasRunning = this.processStates.get(processName) || false;

        if (isRunning !== wasRunning) {
          console.log(
            `[ProcessWatcher] State Change for ${processName}: ${wasRunning} -> ${isRunning}`,
          );
          // State Changed
          this.processStates.set(processName, isRunning);

          const type = isRunning
            ? EventType.PROCESS_START
            : EventType.PROCESS_STOP;

          // Include path only on start (first found instance)
          const path = isRunning ? paths[0] : undefined;

          eventBus.emit<ProcessEvent>(type, this.context, {
            name: processName,
            path, // Propagate path
          });
        }
      } catch (e) {
        console.error(`[ProcessWatcher] Error checking ${processName}:`, e);
      }
    }
  }
}

import { eventBus } from "../events/EventBus";
import { AppContext, EventType, ProcessPayload } from "../events/types";
import { isProcessRunning } from "../utils/process";

const TARGET_PROCESSES = [
  "POE2_Launcher.exe",
  "PathOfExile_KG.exe",
  "PathOfExile.exe",
];

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
    for (const processName of TARGET_PROCESSES) {
      const isRunning = await isProcessRunning(processName);
      const wasRunning = this.processStates.get(processName) || false;

      if (isRunning !== wasRunning) {
        // State Changed
        this.processStates.set(processName, isRunning);

        const type = isRunning
          ? EventType.PROCESS_START
          : EventType.PROCESS_STOP;

        const payload: ProcessPayload = {
          name: processName,
        };

        console.log(
          `[ProcessWatcher] State Change Detected: ${processName} (${type})`,
        );
        eventBus.emit(type, this.context, payload);
      }
    }
  }
}

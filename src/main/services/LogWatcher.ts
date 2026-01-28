import fs from "fs";
import path from "path";

import { AppConfig } from "../../shared/types";
import { GAME_SERVICE_PROFILES } from "../config/GameServiceProfiles";
import { eventBus } from "../events/EventBus";
import {
  AppContext,
  EventType,
  ProcessEvent,
  LogErrorDetectedEvent,
  DebugLogEvent,
} from "../events/types";
import { getGameInstallPath } from "../utils/registry";

const ERROR_PATTERN = "Transferred a partial file";
const ERROR_THRESHOLD = 10;

export class LogWatcher {
  private context: AppContext;
  private watchTimer: NodeJS.Timeout | null = null;
  private currentLogPath: string | null = null;
  private lastSize: number = 0;
  private errorCount: number = 0;
  private isMonitoring: boolean = false;
  private lastCheckedGameId: AppConfig["activeGame"] | null = null;
  private lastCheckedServiceId: AppConfig["serviceChannel"] | null = null;
  private currentPid: number | null = null;

  constructor(context: AppContext) {
    this.context = context;
  }

  private emitLog(content: string, isError: boolean = false) {
    if (this.context) {
      eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, this.context, {
        type: "log_watcher",
        content,
        isError,
        timestamp: Date.now(),
        typeColor: "#4fc1ff", // Light Blue for LogWatcher
        textColor: isError ? "#f48771" : "#d4d4d4",
      });
    }
  }

  public init() {
    // ... (unchanged listeners)
    eventBus.on(EventType.PROCESS_START, async (event: ProcessEvent) => {
      const serviceId = this.context.store.get(
        "serviceChannel",
      ) as AppConfig["serviceChannel"];
      const activeGame = this.context.store.get(
        "activeGame",
      ) as AppConfig["activeGame"];

      if (this.isGameProcess(event.payload.name, serviceId)) {
        await this.startMonitoring(serviceId, activeGame, event.payload.pid);
      }
    });

    eventBus.on(EventType.PROCESS_STOP, (event: ProcessEvent) => {
      const serviceId = this.context.store.get(
        "serviceChannel",
      ) as AppConfig["serviceChannel"];

      if (this.isGameProcess(event.payload.name, serviceId)) {
        this.stopMonitoring();
      }
    });
  }

  private isGameProcess(
    name: string,
    serviceId: AppConfig["serviceChannel"],
  ): boolean {
    const profile = GAME_SERVICE_PROFILES[serviceId];
    if (!profile) return false;

    const lowerName = name.toLowerCase();
    return profile.processKeywords.some((keyword) =>
      lowerName.includes(keyword.toLowerCase()),
    );
  }

  public async startMonitoring(
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
    pid?: number,
  ) {
    if (this.isMonitoring) return;

    this.emitLog(`Starting log monitor for ${serviceId} / ${gameId}`);

    const installPath = await getGameInstallPath(serviceId, gameId);
    if (!installPath) {
      this.emitLog("Could not find install path. Skipping.", true);
      return;
    }

    const config = GAME_SERVICE_PROFILES[serviceId];
    if (!config) return;

    const logPath = path.join(installPath, "logs", config.logFileName);

    try {
      if (!fs.existsSync(logPath)) {
        this.emitLog(`Log file not found at ${logPath}`, true);
        return;
      }

      this.currentLogPath = logPath;
      this.lastCheckedGameId = gameId;
      this.lastCheckedServiceId = serviceId;
      this.currentPid = pid || null;

      const stats = await fs.promises.stat(logPath);

      const offset = await this.findMarkerOffset(
        logPath,
        config.logStartMarker,
        stats.size,
      );
      this.lastSize = offset;

      this.errorCount = 0;
      this.isMonitoring = true;

      this.watchTimer = setInterval(() => this.checkLog(), 1000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emitLog(`Failed to start: ${msg}`, true);
    }
  }

  public stopMonitoring() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    this.isMonitoring = false;
    this.currentLogPath = null;
    this.currentPid = null;
    this.emitLog("Monitoring stopped.");
  }

  private async findMarkerOffset(
    logPath: string,
    marker: string,
    totalSize: number,
  ): Promise<number> {
    const READ_SIZE = 2 * 1024 * 1024; // 2MB
    const startPos = Math.max(0, totalSize - READ_SIZE);
    const length = totalSize - startPos;

    if (length <= 0) return 0;

    try {
      const buffer = Buffer.alloc(length);
      const fd = await fs.promises.open(logPath, "r");
      await fd.read(buffer, 0, length, startPos);
      await fd.close();

      const markerBuf = Buffer.from(marker, "utf8");
      const bufIndex = buffer.lastIndexOf(markerBuf);

      if (bufIndex !== -1) {
        this.emitLog(`Found session marker at offset ${startPos + bufIndex}`);
        return startPos + bufIndex;
      }

      return totalSize;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emitLog(`Failed to seek marker: ${msg}`, true);
      return totalSize;
    }
  }

  private async checkLog() {
    if (!this.currentLogPath || !this.isMonitoring) return;

    try {
      const stats = await fs.promises.stat(this.currentLogPath);

      if (stats.size < this.lastSize) {
        this.lastSize = 0;
        this.errorCount = 0;
      }

      if (stats.size > this.lastSize) {
        const stream = fs.createReadStream(this.currentLogPath, {
          start: this.lastSize,
          end: stats.size,
          encoding: "utf8",
        });

        let newData = "";
        for await (const chunk of stream) {
          newData += chunk;
        }

        this.lastSize = stats.size;

        const lines = newData.split("\n");

        for (const line of lines) {
          const config = GAME_SERVICE_PROFILES[this.lastCheckedServiceId!];
          if (line.includes(config.logStartMarker)) {
            this.errorCount = 0;
            // ...
          }

          if (this.currentPid && !line.includes(`Client ${this.currentPid}`)) {
            if (!line.includes(config.logStartMarker)) continue;
          }

          if (line.includes(ERROR_PATTERN)) {
            this.errorCount++;
            this.emitLog(
              `Error Detected (${this.errorCount}/${ERROR_THRESHOLD})`,
              true,
            );
          }
        }

        if (this.errorCount >= ERROR_THRESHOLD) {
          this.emitLog(
            "ERROR THRESHOLD REACHED! Triggering Auto-Patch...",
            true,
          );

          eventBus.emit<LogErrorDetectedEvent>(
            EventType.LOG_ERROR_DETECTED,
            this.context,
            {
              gameId: this.lastCheckedGameId!,
              serviceId: this.lastCheckedServiceId!,
              errorCount: this.errorCount,
              logPath: this.currentLogPath,
            },
          );

          this.stopMonitoring();
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emitLog(`Error during check: ${msg}`, true);
      this.stopMonitoring();
    }
  }
}

import fs from "fs";
import path from "path";

import axios from "axios";

import { AppConfig, PatchProgress, FileProgress } from "../../shared/types";
import { GAME_SERVICE_PROFILES } from "../config/GameServiceProfiles";
import { eventBus } from "../events/EventBus";
import { AppContext, EventType, PatchProgressEvent } from "../events/types";
import { Logger } from "../utils/logger";
import { LogParser } from "../utils/LogParser";

interface ParsedLogInfo {
  webRoot: string | null;
  backupWebRoot: string | null;
  filesToDownload: string[];
}

export class PatchManager {
  private context: AppContext;
  private isPatching: boolean = false;
  private shouldStop: boolean = false;
  private abortController: AbortController | null = null;

  // State Tracking
  private fileStates: Map<string, FileProgress> = new Map();
  private totalFilesCount: number = 0;
  private completedFilesCount: number = 0;
  private logger = new Logger({
    type: "auto_patch",
    typeColor: "#dcdcaa",
  });

  constructor(context: AppContext) {
    this.context = context;
  }

  public cancelPatch() {
    if (this.isPatching) {
      this.shouldStop = true;
      if (this.abortController) {
        this.abortController.abort();
      }
      this.logger.log("Cancel requested.");
    }
  }

  public async startSelfDiagnosis(
    installPath: string,
    serviceId: AppConfig["serviceChannel"],
    overrides?: { webRoot?: string; backupWebRoot?: string },
  ): Promise<boolean> {
    // Prevent re-entrancy / double-execution
    if (this.isPatching) {
      this.logger.error(
        "Patch ALREADY in progress. Ignoring duplicate request.",
      );
      return false;
    }

    try {
      this.isPatching = true;
      this.shouldStop = false;
      this.abortController = new AbortController();
      this.fileStates.clear();
      this.totalFilesCount = 0;
      this.completedFilesCount = 0;

      const profile = GAME_SERVICE_PROFILES[serviceId];
      if (!profile) throw new Error(`Unknown service: ${serviceId}`);

      const config = {
        logName: profile.logFileName,
        startMarker: profile.logStartMarker,
      };

      const logPath = path.join(installPath, "logs", config.logName);

      this.emitGlobalStatus("waiting", "로그 분석 중...", 0);

      let logInfo: ParsedLogInfo;

      if (overrides?.webRoot) {
        const analyzed = await this.analyzeLog(
          serviceId,
          logPath,
          config.startMarker,
        );

        logInfo = {
          webRoot: analyzed.webRoot || overrides.webRoot || null,
          backupWebRoot:
            analyzed.backupWebRoot || overrides.backupWebRoot || null,
          filesToDownload: analyzed.filesToDownload,
        };
      } else {
        logInfo = await this.analyzeLog(serviceId, logPath, config.startMarker);
      }

      if (!logInfo.webRoot) {
        throw new Error("최근 로그에서 Web Root 정보를 찾을 수 없습니다.");
      }

      let targetFiles = logInfo.filesToDownload;
      if (targetFiles.length === 0) {
        targetFiles = [...profile.essentialExecutables];
      }
      targetFiles = [...new Set(targetFiles)]; // Dedup

      // Initialize State
      this.totalFilesCount = targetFiles.length;
      targetFiles.forEach((f) => {
        this.fileStates.set(f, {
          fileName: f,
          status: "waiting",
          progress: 0,
        });
      });

      this.emitGlobalStatus(
        "waiting",
        `대상 파일 확인: ${this.totalFilesCount}개`,
        0,
      );

      await this.processDownloads(
        installPath,
        logInfo.webRoot,
        targetFiles,
        logInfo.backupWebRoot,
      );

      this.emitGlobalStatus("done", "패치 복구 완료", 100);
      return true;
    } catch (e: unknown) {
      this.logger.error("Error during diagnosis:", e);
      const msg = e instanceof Error ? e.message : String(e);
      this.emitGlobalStatus("error", msg || "알 수 없는 오류", 0, msg);
      return false;
    } finally {
      this.isPatching = false;
      this.shouldStop = false;
    }
  }

  public async forceRestoration(
    installPath: string,
    serviceId: AppConfig["serviceChannel"],
    webRoot: string,
  ): Promise<boolean> {
    if (this.isPatching) {
      this.logger.error("Patch ALREADY in progress. Ignoring force request.");
      return false;
    }

    try {
      this.isPatching = true;
      this.shouldStop = false;
      this.abortController = new AbortController();
      this.fileStates.clear();
      this.completedFilesCount = 0;

      const profile = GAME_SERVICE_PROFILES[serviceId];
      if (!profile) throw new Error(`Unknown service: ${serviceId}`);

      // Force Target: Essential Executables Only
      const targetFiles = [...profile.essentialExecutables];
      this.totalFilesCount = targetFiles.length;

      // Initialize State
      targetFiles.forEach((f) => {
        this.fileStates.set(f, {
          fileName: f,
          status: "waiting",
          progress: 0,
        });
      });

      this.emitGlobalStatus(
        "waiting",
        `강제 복구 시작: ${this.totalFilesCount}개 파일`,
        0,
      );

      // Verify WebRoot availability roughly (optional, processDownloads handles 404s)
      this.logger.log(`Starting Force Restoration from ${webRoot}`);

      await this.processDownloads(installPath, webRoot, targetFiles, null);

      this.emitGlobalStatus("done", "강제 복구 완료", 100);
      return true;
    } catch (e: unknown) {
      this.logger.error("Error during force restoration:", e);
      const msg = e instanceof Error ? e.message : String(e);
      this.emitGlobalStatus("error", msg || "강제 복구 실패", 0, msg);
      return false;
    } finally {
      this.isPatching = false;
      this.shouldStop = false;
    }
  }

  private async analyzeLog(
    serviceId: AppConfig["serviceChannel"],
    logPath: string,
    startMarker: string,
  ): Promise<ParsedLogInfo> {
    if (!fs.existsSync(logPath)) {
      throw new Error("로그 파일이 존재하지 않습니다.");
    }

    const profile = GAME_SERVICE_PROFILES[serviceId];
    if (!profile) throw new Error("Unknown Service ID");

    const content = await LogParser.readLastPart(logPath, 2 * 1024 * 1024);

    const lines = content.split("\n");
    let webRoot: string | null = null;
    let backupWebRoot: string | null = null;
    let files: string[] = [];
    let currentPid: string | null = null;
    let hasError = false;

    let lastIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(startMarker)) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex === -1) lastIndex = 0;

    const recentLines = lines.slice(lastIndex);
    for (const line of recentLines) {
      const pid = LogParser.extractPid(line);
      if (pid) {
        currentPid = pid;
        break;
      }
    }

    for (const line of recentLines) {
      if (currentPid && !line.includes(`Client ${currentPid}`)) continue;
      if (line.includes("Transferred a partial file")) hasError = true;

      const webRootMatch = LogParser.extractWebRoot(line);
      const backupWebRootMatch = LogParser.extractBackupWebRoot(line);

      if (webRootMatch) webRoot = webRootMatch;
      if (backupWebRootMatch) backupWebRoot = backupWebRootMatch;

      const file = LogParser.extractFileToDownload(line, profile);
      if (file && !files.includes(file)) {
        files.push(file);
      }
    }

    if (!hasError) files = [];

    const hasEssential = files.some((f) =>
      profile.essentialExecutables.includes(f),
    );
    if (hasEssential) {
      for (const exe of profile.essentialExecutables) {
        if (!files.includes(exe)) files.push(exe);
      }
    }

    return {
      webRoot: webRoot || backupWebRoot,
      backupWebRoot,
      filesToDownload: files,
    };
  }

  private async processDownloads(
    installPath: string,
    webRoot: string,
    files: string[],
    backupWebRoot?: string | null,
  ) {
    const tempDir = path.join(installPath, ".patch_temp");
    const backupDir = path.join(installPath, ".patch_backups");
    const isBackupEnabled =
      this.context.getConfig("backupPatchFiles") !== false;

    if (!fs.existsSync(tempDir))
      await fs.promises.mkdir(tempDir, { recursive: true });

    if (isBackupEnabled) {
      if (fs.existsSync(backupDir)) {
        this.logger.log(`[Backup] Cleaning up previous backups...`);
        await fs.promises.rm(backupDir, { recursive: true, force: true });
      }
      await fs.promises.mkdir(backupDir, { recursive: true });
    }

    // Parallel Download Logic
    const CONCURRENCY_LIMIT = 2; // Fixed as requested
    const queue = [...files];
    const activePromises: Promise<void>[] = [];

    // Initial emit
    this.emitCurrentState("downloading");

    // Metadata Collection
    const backedUpFiles: string[] = [];

    // Extract version from Web Root (e.g. .../patch/4.4.0.5.2/)
    const currentVersion = LogParser.extractVersion(webRoot);

    const processFile = async (file: string) => {
      if (this.shouldStop) throw new Error("사용자에 의해 취소되었습니다.");

      this.updateFileStatus(file, "downloading", 0);
      const url = `${webRoot.endsWith("/") ? webRoot : webRoot + "/"}${file}`;
      const dest = path.join(tempDir, file);
      const finalDest = path.join(installPath, file);
      this.logger.log(`Downloading: ${file} ...`);

      try {
        await this.downloadFile(url, dest, file);

        if (isBackupEnabled && fs.existsSync(finalDest)) {
          const backupDest = path.join(backupDir, file);
          const backupSubDir = path.dirname(backupDest);
          if (!fs.existsSync(backupSubDir))
            await fs.promises.mkdir(backupSubDir, { recursive: true });

          await fs.promises.copyFile(finalDest, backupDest);
          backedUpFiles.push(file); // Track collected file
        }

        const finalSubDir = path.dirname(finalDest);
        if (!fs.existsSync(finalSubDir))
          await fs.promises.mkdir(finalSubDir, { recursive: true });
        await fs.promises.copyFile(dest, finalDest);

        this.updateFileStatus(file, "done", 100);
        this.completedFilesCount++;
        this.emitCurrentState("downloading");
      } catch (e: unknown) {
        this.logger.error(`Failed to download/install ${file} due to:`, e);

        // Backup URL Retry Logic
        if (backupWebRoot && backupWebRoot !== webRoot && !this.shouldStop) {
          const backupUrl = `${backupWebRoot.endsWith("/") ? backupWebRoot : backupWebRoot + "/"}${file}`;
          try {
            this.logger.log(`Retrying with backup: ${file}`);
            await this.downloadFile(backupUrl, dest, file);

            // Copy/Move Steps again
            const finalSubDir = path.dirname(finalDest);
            if (!fs.existsSync(finalSubDir))
              await fs.promises.mkdir(finalSubDir, { recursive: true });
            await fs.promises.copyFile(dest, finalDest);

            this.updateFileStatus(file, "done", 100);
            this.completedFilesCount++;
            this.emitCurrentState("downloading");
            return;
          } catch (_backupResult) {
            // Ignore backup failure, proceed to throw main error
          }
        }

        const msg = e instanceof Error ? e.message : String(e);
        this.updateFileStatus(file, "error", 0, msg);
        throw new Error(`${file} 처리 실패: ${msg}`, { cause: e });
      }
    };

    while (queue.length > 0) {
      if (this.shouldStop) break;

      if (activePromises.length < CONCURRENCY_LIMIT) {
        const file = queue.shift();
        if (!file) break;

        const p = processFile(file).finally(() => {
          const idx = activePromises.indexOf(p);
          if (idx !== -1) activePromises.splice(idx, 1);
        });
        activePromises.push(p);
      } else {
        await Promise.race(activePromises);
      }
    }

    await Promise.all(activePromises);

    // Write Backup Metadata
    if (isBackupEnabled && backedUpFiles.length > 0) {
      try {
        const metadataPath = path.join(backupDir, "backup-info.json");
        this.logger.log(
          `[Backup] Writing metadata... (Version: ${currentVersion}, Files: ${backedUpFiles.length})`,
        );

        const metadata = {
          timestamp: new Date().toISOString(),
          version: currentVersion,
          files: backedUpFiles,
        };
        await fs.promises.writeFile(
          metadataPath,
          JSON.stringify(metadata, null, 2),
          "utf-8",
        );
        this.logger.log(`[Backup] Metadata saved successfully.`);
      } catch (err) {
        this.logger.error("Failed to write backup metadata:", err);
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Backup] Failed to save metadata: ${msg}`);
      }
    }

    // Cleanup
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  private async downloadFile(url: string, dest: string, fileName: string) {
    if (this.shouldStop) throw new Error("취소됨");

    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });

    const writer = fs.createWriteStream(dest);
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      timeout: 30000,
      signal: this.abortController?.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Connection: "keep-alive",
        "Accept-Encoding": "identity",
      },
    });

    const totalLength = parseInt(response.headers["content-length"] || "0", 10);
    let transferred = 0;

    // Throttle progress updates (per file)
    let lastEmittedPct = 0;

    response.data.on("data", (chunk: Buffer) => {
      transferred += chunk.length;

      const pct =
        totalLength > 0 ? Math.floor((transferred / totalLength) * 100) : 0;

      // Throttle to 10% steps
      const currentStep = Math.floor(pct / 10) * 10;

      if (currentStep > lastEmittedPct) {
        lastEmittedPct = currentStep;
        this.updateFileStatus(fileName, "downloading", pct);
        this.emitCurrentState("downloading", true); // throttled
      }
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        this.updateFileStatus(fileName, "downloading", 100);
        resolve(null);
      });
      writer.on("error", (err) => {
        writer.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
      if (this.abortController) {
        this.abortController.signal.addEventListener("abort", () => {
          writer.close();
          writer.destroy();
          fs.unlink(dest, () => {});
          reject(new Error("사용자에 의해 취소되었습니다."));
        });
      }
    });
  }

  // --- Progress Helpers ---

  private updateFileStatus(
    fileName: string,
    status: FileProgress["status"],
    progress: number,
    error?: string,
  ) {
    const current = this.fileStates.get(fileName);
    if (current) {
      current.status = status;
      current.progress = progress;
      if (error) current.error = error;
    }
  }

  private lastEmitTime: number = 0;
  private emitCurrentState(
    globalStatus: PatchProgress["status"],
    throttle: boolean = false,
  ) {
    if (throttle) {
      const now = Date.now();
      if (now - this.lastEmitTime < 200) return; // 200ms global debounce
      this.lastEmitTime = now;
    } else {
      this.lastEmitTime = Date.now();
    }

    const files = Array.from(this.fileStates.values());
    const overall =
      this.totalFilesCount > 0
        ? Math.floor((this.completedFilesCount / this.totalFilesCount) * 100)
        : 0;

    const payload: PatchProgress = {
      status: globalStatus,
      total: this.totalFilesCount,
      current: this.completedFilesCount,
      overallProgress: overall,
      files,
    };

    eventBus.emit<PatchProgressEvent>(
      EventType.PATCH_PROGRESS,
      this.context,
      payload,
    );
  }

  // Fallback for simple single-message states
  private emitGlobalStatus(
    status: PatchProgress["status"],
    _message: string, // Not used in new structure but kept signature conceptually
    percent: number,
    error?: string,
  ) {
    const files = Array.from(this.fileStates.values());
    const payload: PatchProgress = {
      status, // waiting / done / error
      total: this.totalFilesCount,
      current: this.completedFilesCount,
      overallProgress: percent,
      files,
      error,
    };

    eventBus.emit<PatchProgressEvent>(
      EventType.PATCH_PROGRESS,
      this.context,
      payload,
    );
  }

  // --- Manual Local Restore Logic ---
  public async restoreLocalBackup(installPath: string): Promise<boolean> {
    if (this.isPatching) {
      this.logger.error(
        "Restore failed: Another patch operation is in progress.",
      );
      return false;
    }

    try {
      this.isPatching = true;
      this.shouldStop = false;
      this.fileStates.clear();
      this.totalFilesCount = 0;
      this.completedFilesCount = 0;

      const backupDir = path.join(installPath, ".patch_backups");
      if (!fs.existsSync(backupDir)) {
        throw new Error("백업 폴더가 존재하지 않습니다.");
      }

      // Recursive file getter
      const getFiles = async (dir: string): Promise<string[]> => {
        const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(
          dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            return dirent.isDirectory() ? getFiles(res) : res;
          }),
        );
        return Array.prototype.concat(...files);
      };

      const allBackupFiles = await getFiles(backupDir);
      // Filter out metadata file
      const restoreFiles = allBackupFiles.filter(
        (f) => path.basename(f) !== "backup-info.json",
      );

      if (restoreFiles.length === 0) {
        throw new Error("복구할 백업 파일이 없습니다.");
      }

      this.totalFilesCount = restoreFiles.length;

      // Initialize State
      restoreFiles.forEach((fullPath) => {
        const relativeName = path.relative(backupDir, fullPath); // Maintain relative path
        this.fileStates.set(relativeName, {
          fileName: relativeName,
          status: "waiting",
          progress: 0,
        });
      });

      this.emitGlobalStatus(
        "waiting",
        `백업 복구 준비: ${this.totalFilesCount}개 파일`,
        0,
      );

      // Restore Loop
      for (const fullPath of restoreFiles) {
        if (this.shouldStop) throw new Error("사용자에 의해 취소되었습니다.");

        const relativeName = path.relative(backupDir, fullPath);
        const targetPath = path.join(installPath, relativeName);

        this.updateFileStatus(relativeName, "downloading", 0); // Reuse "downloading" status for UI
        this.emitCurrentState("downloading");

        try {
          const targetDir = path.dirname(targetPath);
          if (!fs.existsSync(targetDir)) {
            await fs.promises.mkdir(targetDir, { recursive: true });
          }
          await fs.promises.copyFile(fullPath, targetPath);

          this.updateFileStatus(relativeName, "done", 100);
          this.completedFilesCount++;
          this.emitCurrentState("downloading");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.updateFileStatus(relativeName, "error", 0, msg);
          this.logger.error(`Failed to restore ${relativeName}:`, e);
        }
      }

      this.emitGlobalStatus("done", "백업 복구 완료", 100);
      return true;
    } catch (e: unknown) {
      this.logger.error("Error during local restore:", e);
      const msg = e instanceof Error ? e.message : String(e);
      this.emitGlobalStatus("error", msg || "알 수 없는 오류", 0, msg);
      return false;
    } finally {
      this.isPatching = false;
      this.shouldStop = false;
    }
  }
}

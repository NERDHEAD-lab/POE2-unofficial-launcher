import fs from "fs";
import path from "path";

import axios from "axios";

import { AppConfig, PatchProgress } from "../../shared/types";
import { GAME_SERVICE_PROFILES } from "../config/GameServiceProfiles";
import { eventBus } from "../events/EventBus";
import {
  AppContext,
  EventType,
  PatchProgressEvent,
  DebugLogEvent,
} from "../events/types";

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

  // ... (constructor and cancelPatch omitted - they are fine)
  // Wait, I am replacing from Top or just block?
  // Let's replace just the block in startSelfDiagnosis first, but I need access to import.
  // I will use `replace_file_content` to add import and update startSelfDiagnosis.

  // Actually, I can do it in chunks.
  // Chunk 1: Top of file (Imports).
  // Chunk 2: startSelfDiagnosis config lookup.
  // Chunk 3: startSelfDiagnosis defaults lookup.
  // Chunk 4: analyzeLog expand logic.

  // Let's use `multi_replace_file_content` in next step.
  // This step: Import only.

  constructor(context: AppContext) {
    this.context = context;
  }

  public cancelPatch() {
    if (this.isPatching) {
      this.shouldStop = true;
      if (this.abortController) {
        this.abortController.abort();
      }
      console.log("[PatchManager] Cancel requested.");
    }
  }

  public async startSelfDiagnosis(
    installPath: string,
    serviceId: AppConfig["serviceChannel"],
    overrides?: { webRoot?: string; backupWebRoot?: string },
  ): Promise<void> {
    try {
      this.isPatching = true;
      this.shouldStop = false;
      this.abortController = new AbortController();

      const profile = GAME_SERVICE_PROFILES[serviceId];
      if (!profile) throw new Error(`Unknown service: ${serviceId}`);

      const config = {
        logName: profile.logFileName,
        startMarker: profile.logStartMarker,
      };

      const logPath = path.join(installPath, "logs", config.logName);

      this.emitProgress("waiting", "로그 분석 중...", 0);

      // Check if we have overrides to skip full analysis or augment it
      let logInfo: ParsedLogInfo;

      if (overrides?.webRoot) {
        // We have WebRoot from LogWatcher, but we still might need to check queued files
        // OR we just use defaults if no queue info passed.
        // For robustness, let's still analyze log to find QUEUED files,
        // but use the provided WebRoot as fallback or primary if log doesn't have it (e.g. rotated).
        // Actually, LogWatcher found it, so it's reliable.

        // Let's call analyzeLog but pass the known WebRoot hint?
        // Or just implement a lighter check.
        // To keep it simple and robust: Run analyzeLog. If it fails to find WebRoot, use override.

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
        // Fallback or Error
        // For self diagnosis, if no error found, we might want to ask user if they want force check
        // but for now let's just error out if no WebRoot found.
        throw new Error("최근 로그에서 Web Root 정보를 찾을 수 없습니다.");
      }

      // If no files to download detected, we can either say "All Good" or assume user wants to force fix known executables?
      // The user tool logic: If auto-fix or manual 'F' press, it adds executables manually.
      // Let's adopt 'Force Fix' behavior if this is triggered manually, OR strict behavior.
      // For now, let's include default executables if list is empty to be safe (Force Mode).

      let targetFiles = logInfo.filesToDownload;
      if (targetFiles.length === 0) {
        // Force Mode defaults
        targetFiles = [...profile.essentialExecutables];
      }

      // Remove Duplicates
      targetFiles = [...new Set(targetFiles)];

      this.emitProgress(
        "waiting",
        `대상 파일 확인: ${targetFiles.length}개`,
        10,
      );

      await this.processDownloads(
        installPath,
        logInfo.webRoot,
        targetFiles,
        logInfo.backupWebRoot,
      );

      this.emitProgress("done", "패치 복구 완료", 100);
    } catch (e: unknown) {
      console.error("[PatchManager] Error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      this.emitProgress("error", msg || "알 수 없는 오류", 0, msg);
    } finally {
      this.isPatching = false;
      this.shouldStop = false;
    }
  }

  // Reuse logic from LogWatcher/Tool for parsing
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

    const stats = await fs.promises.stat(logPath);
    const size = stats.size;
    const READ_SIZE = 2 * 1024 * 1024; // 2MB

    let content = "";

    // Read Logic matching logParser.ts
    // If small enough, read whole file. If large, read last 2MB.
    if (size <= READ_SIZE) {
      content = await fs.promises.readFile(logPath, "utf-8");
    } else {
      const buffer = Buffer.alloc(READ_SIZE);
      const fd = await fs.promises.open(logPath, "r");
      await fd.read(buffer, 0, READ_SIZE, size - READ_SIZE);
      await fd.close();
      content = buffer.toString("utf8");
    }

    const lines = content.split("\n");

    let webRoot: string | null = null;
    let backupWebRoot: string | null = null;
    let files: string[] = [];
    let currentPid: string | null = null;
    let hasError = false; // logic import from logParser

    // Find last session start
    let lastIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(startMarker)) {
        lastIndex = i;
        break;
      }
    }
    // If marker not found (or log rotated within 2MB?), parse from start of buffer
    if (lastIndex === -1) lastIndex = 0;

    const recentLines = lines.slice(lastIndex);

    // 1. Detect PID
    const pidRegex = /\[(?:INFO|WARN|ERROR)\s+Client\s+(\d+)\]/;
    for (const line of recentLines) {
      const match = line.match(pidRegex);
      if (match) {
        currentPid = match[1];
        break;
      }
    }

    // 2. Scan lines
    for (const line of recentLines) {
      // Filter by PID
      if (currentPid && !line.includes(`Client ${currentPid}`)) {
        continue;
      }

      // Check Error
      if (line.includes("Transferred a partial file")) {
        hasError = true;
      }

      // Extract Web Root
      if (line.includes("Web root:")) {
        const match = line.match(/Web root: (https?:\/\/[^\s]+)/);
        if (match) webRoot = match[1];
      } else if (line.includes("Backup Web root:")) {
        const match = line.match(/Backup Web root: (https?:\/\/[^\s]+)/);
        if (match) backupWebRoot = match[1];
      }

      // Extract Queue files
      const queuePattern = "Queue file to download:";
      if (line.includes(queuePattern)) {
        const parts = line.split(queuePattern);
        if (parts.length > 1) {
          const f = parts[1].trim();
          // Validation
          if (f && !f.includes(" ")) {
            const isExtMatch =
              f.endsWith(".exe") ||
              f.endsWith(".dat") ||
              f.endsWith(".bundle") ||
              f.endsWith(".dll");
            const isEssential = profile.essentialExecutables.includes(f);

            if (isExtMatch || isEssential) {
              if (!files.includes(f)) files.push(f);
            }
          }
        }
      }
    }

    // Logic: If NO error detected in logs, we shouldn't rely on "Queue file" lines
    // because they might be from successful downloads (queued then done).
    // logParser checks: if (!hasError) filesToDownload = [];
    // However, for Manual Repair in PatchManager, we might WANT to download whatever was last queued if we suspect issues.
    // But adhering to logParser logic:
    if (!hasError) {
      files = [];
    }

    // Expansion Logic (Mirroring logParser / current PatchManager)
    // If Kakao/Essential file involved, expand to check all essentials
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
      this.context.store.get("backupPatchFiles") !== false; // Default true

    if (!fs.existsSync(tempDir))
      await fs.promises.mkdir(tempDir, { recursive: true });
    if (isBackupEnabled && !fs.existsSync(backupDir))
      await fs.promises.mkdir(backupDir, { recursive: true });

    const total = files.length;
    let completed = 0;

    for (const file of files) {
      if (this.shouldStop) throw new Error("사용자에 의해 취소되었습니다.");

      const url = `${webRoot.endsWith("/") ? webRoot : webRoot + "/"}${file}`;
      const dest = path.join(tempDir, file);
      const finalDest = path.join(installPath, file);

      this.emitProgress(
        "downloading",
        file,
        Math.floor((completed / total) * 100),
        undefined,
        total,
        completed,
      );

      this.emitLog(`Downloading: ${file} (${completed + 1}/${total})`);

      try {
        // 1. Download to Temp
        await this.downloadFile(url, dest);

        // 2. Backup if exists
        if (isBackupEnabled && fs.existsSync(finalDest)) {
          const backupDest = path.join(backupDir, file);
          // Ensure subdirs if any
          const backupSubDir = path.dirname(backupDest);
          if (!fs.existsSync(backupSubDir))
            await fs.promises.mkdir(backupSubDir, { recursive: true });

          await fs.promises.copyFile(finalDest, backupDest);
        }

        // 3. Move/Overwrite
        // Ensure subdirs
        const finalSubDir = path.dirname(finalDest);
        if (!fs.existsSync(finalSubDir))
          await fs.promises.mkdir(finalSubDir, { recursive: true });

        await fs.promises.copyFile(dest, finalDest);

        completed++;
      } catch (e: unknown) {
        console.error(`Failed to download/install ${file} due to:`, e);

        // Fallback Logic
        if (backupWebRoot && backupWebRoot !== webRoot && !this.shouldStop) {
          console.warn(
            `[PatchManager] Retrying ${file} with Backup Web Root: ${backupWebRoot}`,
          );
          const backupUrl = `${backupWebRoot.endsWith("/") ? backupWebRoot : backupWebRoot + "/"}${file}`;
          try {
            await this.downloadFile(backupUrl, dest);

            // If Success, proceed with backup/move steps (duplicated logic or shared?)
            // To avoid duplication, we could wrap the backup/move part.
            // But let's just re-run the post-download steps here for safety.

            // 2. Backup if exists
            if (isBackupEnabled && fs.existsSync(finalDest)) {
              const backupDest = path.join(backupDir, file);
              const backupSubDir = path.dirname(backupDest);
              if (!fs.existsSync(backupSubDir))
                await fs.promises.mkdir(backupSubDir, { recursive: true });
              await fs.promises.copyFile(finalDest, backupDest);
            }

            // 3. Move/Overwrite
            const finalSubDir = path.dirname(finalDest);
            if (!fs.existsSync(finalSubDir))
              await fs.promises.mkdir(finalSubDir, { recursive: true });
            await fs.promises.copyFile(dest, finalDest);

            completed++;
            continue; // Success, next file
          } catch (backupError: unknown) {
            console.error(
              `Backup download also failed for ${file}:`,
              backupError,
            );
            // Should we just fall through to error throw?
          }
        }

        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`${file} 처리 실패: ${msg}`);
      }
    }

    // Cleanup Temp
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }

  private async downloadFile(url: string, dest: string) {
    if (this.shouldStop) {
      throw new Error("취소됨");
    }

    const writer = fs.createWriteStream(dest);

    // Ensure dir exists (already done in processDownloads but safe)
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });

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

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", (err) => {
        writer.close();
        fs.unlink(dest, () => {}); // cleanup
        reject(err);
      });

      // Handle abort if signal fires during stream
      if (this.abortController) {
        this.abortController.signal.addEventListener("abort", () => {
          writer.close();
          writer.destroy();
          fs.unlink(dest, () => {}); // cleanup
          reject(new Error("사용자에 의해 취소되었습니다."));
        });
      }
    });
  }

  private emitProgress(
    status: PatchProgress["status"],
    fileName: string,
    percent: number,
    error?: string,
    total?: number,
    current?: number,
  ) {
    const payload: PatchProgress = {
      fileName,
      status,
      progress: percent,
      total,
      current,
      error,
    };

    eventBus.emit<PatchProgressEvent>(
      EventType.PATCH_PROGRESS,
      this.context,
      payload,
    );
  }

  private emitLog(content: string, isError: boolean = false) {
    eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, this.context, {
      type: "auto_patch",
      content,
      isError,
      timestamp: Date.now(),
      typeColor: "#dcdcaa",
      textColor: isError ? "#f48771" : "#d4d4d4",
    });
  }
}

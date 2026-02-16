import fs from "node:fs/promises";

import { compareVersions } from "../../shared/version";
import { GameServiceProfile } from "../config/GameServiceProfiles";

export class LogParser {
  /**
   * Reads the last N bytes of a file as a string.
   */
  public static async readLastPart(
    logPath: string,
    readSize: number = 2 * 1024 * 1024,
  ): Promise<string> {
    try {
      const stats = await fs.stat(logPath);
      const totalSize = stats.size;
      const startPos = Math.max(0, totalSize - readSize);
      const length = totalSize - startPos;

      if (length <= 0) return "";

      const buffer = Buffer.alloc(length);
      const fd = await fs.open(logPath, "r");
      await fd.read(buffer, 0, length, startPos);
      await fd.close();

      return buffer.toString("utf8");
    } catch (_e) {
      return "";
    }
  }

  /**
   * Finds the byte offset of the last occurrence of a marker in a file.
   * If not found, returns the total size of the file.
   */
  public static async findLastMarkerOffset(
    logPath: string,
    marker: string,
    readSize: number = 2 * 1024 * 1024,
  ): Promise<number> {
    try {
      const stats = await fs.stat(logPath);
      const totalSize = stats.size;
      const startPos = Math.max(0, totalSize - readSize);
      const length = totalSize - startPos;

      if (length <= 0) return 0;

      const buffer = Buffer.alloc(length);
      const fd = await fs.open(logPath, "r");
      await fd.read(buffer, 0, length, startPos);
      await fd.close();

      const markerBuf = Buffer.from(marker, "utf8");
      const bufIndex = buffer.lastIndexOf(markerBuf);

      if (bufIndex !== -1) {
        return startPos + bufIndex;
      }

      return totalSize;
    } catch (_e) {
      // If file not found or error, return 0 (start from beginning) or totalSize
      try {
        const stats = await fs.stat(logPath);
        return stats.size;
      } catch {
        return 0;
      }
    }
  }

  /**
   * Extracts Web Root URL from a log line
   */
  public static extractWebRoot(line: string): string | null {
    const match = line.match(/Web root: (https?:\/\/[^\s]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extracts Backup Web Root URL from a log line
   */
  public static extractBackupWebRoot(line: string): string | null {
    const match = line.match(/Backup Web root: (https?:\/\/[^\s]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extracts Version string from a Web Root URL
   */
  public static extractVersion(webRoot: string): string {
    const match = webRoot.match(/\/patch\/([\d.]+)\/?/);
    return match && match[1] ? match[1] : "unknown";
  }

  /**
   * Extracts PID from a log line
   */
  public static extractPid(line: string): string | null {
    const pidRegex = /\[(?:INFO|WARN|ERROR)\s+Client\s+(\d+)\]/;
    const match = line.match(pidRegex);
    return match ? match[1] : null;
  }

  /**
   * Extracts a filename to download from a log line
   */
  public static extractFileToDownload(
    line: string,
    profile: GameServiceProfile,
  ): string | null {
    const queuePattern = "Queue file to download:";
    if (!line.includes(queuePattern)) return null;

    const parts = line.split(queuePattern);
    if (parts.length <= 1) return null;

    const f = parts[1].trim();
    if (!f || f.includes(" ")) return null;

    const isExtMatch =
      f.endsWith(".exe") ||
      f.endsWith(".dat") ||
      f.endsWith(".bundle") ||
      f.endsWith(".dll");
    const isEssential = profile.essentialExecutables.includes(f);

    return isExtMatch || isEssential ? f : null;
  }

  /**
   * Replaces the version part in a Web Root URL with a new version
   */
  public static replaceVersion(webRoot: string, newVersion: string): string {
    if (!newVersion) return webRoot;
    // Find /patch/XXXX/ or /patch/XXXX
    const regex = /(\/patch\/)([\d.]+)(\/?)/;
    if (regex.test(webRoot)) {
      return webRoot.replace(regex, `$1${newVersion}$3`);
    }
    return webRoot;
  }

  public static compareVersions = compareVersions;
}

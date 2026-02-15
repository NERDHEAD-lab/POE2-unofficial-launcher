import fs from "node:fs/promises";
import path from "node:path";

import { AppConfig } from "../../shared/types";
import { GAME_SERVICE_PROFILES } from "../config/GameServiceProfiles";
import { Logger } from "../utils/logger";
import { LogParser } from "../utils/LogParser";
import { getGameInstallPath } from "../utils/registry";

const logger = new Logger({
  type: "VERSION_SCANNER",
  typeColor: "#BD93F9",
  priority: 5,
});

export class GameVersionScanner {
  /**
   * Scans all installed games for version info in logs
   */
  public static async scanAll(): Promise<AppConfig["knownGameVersions"]> {
    const results: AppConfig["knownGameVersions"] = {};
    const services: AppConfig["serviceChannel"][] = ["Kakao Games", "GGG"];
    const games: AppConfig["activeGame"][] = ["POE1", "POE2"];

    for (const serviceId of services) {
      for (const gameId of games) {
        try {
          const info = await this.scanGame(serviceId, gameId);
          if (info) {
            results[`${gameId}_${serviceId}`] = info;
            logger.log(
              `[Scan] Found version for ${gameId}/${serviceId}: ${info.version}`,
            );
          }
        } catch (e) {
          logger.error(`[Scan] Failed to scan ${gameId}/${serviceId}:`, e);
        }
      }
    }

    return results;
  }

  private static async scanGame(
    serviceId: AppConfig["serviceChannel"],
    gameId: AppConfig["activeGame"],
  ): Promise<{ version: string; webRoot: string; timestamp: number } | null> {
    const installPath = await getGameInstallPath(serviceId, gameId);
    if (!installPath) return null;

    const profile = GAME_SERVICE_PROFILES[serviceId];
    const logPath = path.join(installPath, "logs", profile.logFileName);

    try {
      const stats = await fs.stat(logPath);
      const content = await LogParser.readLastPart(logPath, 1024 * 1024); // 1MB

      const lines = content.split("\n").reverse(); // Check from newest to oldest

      for (const line of lines) {
        const webRoot = LogParser.extractWebRoot(line);
        if (webRoot) {
          const version = LogParser.extractVersion(webRoot);

          return {
            version,
            webRoot,
            timestamp: stats.mtimeMs, // Use file modification time as approximate
          };
        }
      }
    } catch (_e) {
      // Log file might not exist or be locked, which is fine for a background scan
      return null;
    }

    return null;
  }
}

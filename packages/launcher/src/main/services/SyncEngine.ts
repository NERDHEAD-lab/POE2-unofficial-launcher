import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import axios from "axios";
import { app } from "electron";

import type { RemoteFontItem } from "@poe2-launcher/shared/types";

import { Logger } from "../utils/logger";

export type { RemoteFontItem };

const logger = new Logger({ type: "sync-engine", typeColor: "#3498db" });

export class SyncEngine {
  private static instance: SyncEngine;
  private readonly baseUrl =
    "https://nerdhead-lab.github.io/POE2-unofficial-launcher";
  private readonly customFontsDir: string;
  private readonly catalogCachePath: string;

  private constructor() {
    this.customFontsDir = path.join(app.getPath("userData"), "CustomFonts");
    this.catalogCachePath = path.join(this.customFontsDir, "list.json.bak");
  }

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  /**
   * 원격 폰트 카탈로그(list.json)를 가져옵니다.
   * @param options.force 강제 업데이트 여부 (true일 경우 만료 체크 무시)
   */
  public async fetchCatalog(
    options: { force?: boolean } = {},
  ): Promise<RemoteFontItem[]> {
    const { force = false } = options;
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    try {
      // 1. 만료 여부 체크 (force가 아닐 때만)
      if (!force) {
        try {
          const stats = await fs.stat(this.catalogCachePath);
          const isExpired = now - stats.mtimeMs > ONE_DAY_MS;

          if (!isExpired) {
            logger.info("Using cached font catalog (matches 24h policy).");
            const cached = await fs.readFile(this.catalogCachePath, "utf-8");
            return JSON.parse(cached) as RemoteFontItem[];
          }
        } catch (_e) {
          // 캐시 파일이 없으면 무시하고 진행
        }
      }

      // 2. 원격 데이터 요청
      logger.info(
        force
          ? "Force fetching font catalog..."
          : "Catalog expired. Fetching remote catalog...",
      );
      const response = await axios.get<RemoteFontItem[]>(
        `${this.baseUrl}/fonts/list.json`,
        {
          timeout: 5000,
          headers: { "Cache-Control": "no-cache" },
        },
      );

      const catalog = response.data;
      // 로컬 캐시 갱신
      await fs.writeFile(
        this.catalogCachePath,
        JSON.stringify(catalog, null, 2),
        "utf-8",
      );
      logger.info(
        `Successfully synchronized catalog with ${catalog.length} items.`,
      );
      return catalog;
    } catch (err) {
      logger.warn(
        `Failed to synchronize catalog, falling back to cache: ${err}`,
      );
      try {
        const cached = await fs.readFile(this.catalogCachePath, "utf-8");
        return JSON.parse(cached) as RemoteFontItem[];
      } catch (_cacheErr) {
        logger.error("No font catalog available (Server offline & No cache).");
        return [];
      }
    }
  }

  public async downloadFont(
    item: RemoteFontItem,
    onProgress?: (progress: number) => void,
  ): Promise<boolean> {
    const destPath = path.join(this.customFontsDir, item.fileName);
    const tempPath = `${destPath}.tmp`;

    // UI용 이름 추출 (한국어 우선)
    const displayName = item.fullNames.ko || item.fullNames.en || item.id;

    try {
      logger.info(`Downloading font: ${displayName} (${item.id})`);

      const response = await axios({
        url: `${this.baseUrl}/fonts/${item.fileName}`,
        method: "GET",
        responseType: "arraybuffer",
        timeout: 60000,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onProgress(percent);
          }
        },
      });

      const buffer = Buffer.from(response.data);

      // 무결성 검증 (SHA-256) - 이제 아이디가 곧 해시입니다.
      const downloadHash = crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");
      if (downloadHash !== item.id) {
        throw new Error(
          `Hash mismatch! Expected: ${item.id}, Got: ${downloadHash}`,
        );
      }

      // 원자적 쓰기: 임시 파일 생성 후 이름 변경
      await fs.writeFile(tempPath, buffer);
      await fs.rename(tempPath, destPath);

      logger.info(`Successfully downloaded and verified: ${displayName}`);
      return true;
    } catch (err) {
      logger.error(`Failed to download font ${displayName}: ${err}`);
      if (await this.exists(tempPath)) await fs.unlink(tempPath);
      return false;
    }
  }

  /**
   * 폰트 미리보기 이미지 URL 반환 (gh-pages 경로)
   */
  public getPreviewUrl(previewPath: string): string {
    return `${this.baseUrl}/fonts/${previewPath}`;
  }

  /**
   * 로컬에 없는 캐시 정리 가이드 (Smart Cleanup)
   * list.json에 없는 물리 파일들을 삭제합니다.
   */
  public async clearOrphaned(keptFileNames: string[]): Promise<void> {
    try {
      const files = await fs.readdir(this.customFontsDir);
      const keptSet = new Set(keptFileNames);

      let count = 0;
      for (const file of files) {
        // 보호 대상 파일 제외
        if (file === "list.json.bak") continue;

        // 보존 목록에 없는 파일은 삭제
        if (!keptSet.has(file)) {
          await fs.unlink(path.join(this.customFontsDir, file));
          count++;
        }
      }

      if (count > 0) {
        logger.info(`Cleaned up ${count} orphaned font files from disk.`);
      }
    } catch (err) {
      logger.error(`Error during orphaned cleanup: ${err}`);
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

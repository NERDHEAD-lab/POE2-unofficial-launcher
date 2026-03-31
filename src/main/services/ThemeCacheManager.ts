import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import {
  ThemeDefinition,
  ThemesRemoteData,
  ThemeAssets,
  AppConfig,
} from "../../shared/types";
import { SUPPORT_URLS } from "../../shared/urls";
import { IService } from "../events/types";
import { getConfig } from "../store";
import { setConfigWithEvent } from "../utils/config-utils";
import { Logger } from "../utils/logger";

/**
 * Manages remote theme assets caching in %appdata%
 * Logic: Sync -> Load from Cache -> Fallback
 */
export class ThemeCacheManager implements IService {
  public readonly id = "ThemeCacheManager";
  private logger = new Logger({ type: "THEME_CACHE", typeColor: "#4ec9b0" });
  private themeDir: string;
  private themesData: ThemesRemoteData | null = null;

  // Cache to avoid redundant file system checks and logging
  private lastResolvedThemes: Map<
    string,
    Omit<ThemeDefinition, "assets"> & {
      assets: Record<string, string>;
      isRemote: boolean;
      _assetsHash: string;
    }
  > = new Map();
  private lastAppliedThemeIds: Map<string, string> = new Map();

  constructor() {
    // userData path matches main/store.ts
    const userData = path.join(
      app.getPath("appData"),
      "POE2 Unofficial Launcher",
    );
    this.themeDir = path.join(userData, "themes");
  }

  getThemeDir(): string {
    return this.themeDir;
  }

  /**
   * Initialize and perform initial sync
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.themeDir, { recursive: true });

      // 1. Always load local cache first to ensure immediate UI feedback based on cache/fallback
      await this.loadThemesFromLocalStorage();

      // 2. Sync from remote (respecting 24h cooldown)
      await this.syncThemes();
    } catch (error) {
      this.logger.error("Failed to initialize ThemeCacheManager:", error);
    }
  }

  public async stop(): Promise<void> {
    // No background timers to stop for now,
    // but implemented for IService compliance.
    this.logger.log("ThemeCacheManager service stopped.");
  }

  /**
   * Fetch themes.json and download missing assets
   */
  async syncThemes(force = false): Promise<boolean> {
    this.logger.log("Checking for remote theme updates...");

    const settings = getConfig(
      "remoteThemeSettings",
    ) as AppConfig["remoteThemeSettings"];
    const lastModified = settings?.lastModified;
    const lastSync = settings?.lastSync || 0;
    const now = Date.now();

    // 4-hour cooldown check: If we have cache and it's been less than 4h (14400000ms), and not forced
    if (!force && this.themesData && now - lastSync < 4 * 60 * 60 * 1000) {
      this.logger.log("Themes are still fresh (< 24h). Skipping remote sync.");
      return false;
    }

    try {
      const headers: Record<string, string> = {
        "Cache-Control": "no-cache",
      };
      if (lastModified) {
        headers["If-Modified-Since"] = lastModified;
      }

      const response = await fetch(SUPPORT_URLS.THEMES_JSON, { headers });

      if (response.status === 304) {
        this.logger.log("Themes are up to date (304 Not Modified).");
        // Update lastSync time so we wait another 24 hours
        setConfigWithEvent("remoteThemeSettings", {
          ...settings,
          lastSync: now,
        });
        return false;
      }

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = (await response.json()) as ThemesRemoteData;
      const newLastModified = response.headers.get("Last-Modified");

      this.themesData = data;

      // Save to local file for offline access
      await fs.writeFile(
        path.join(this.themeDir, "themes.json"),
        JSON.stringify(data, null, 2),
      );

      // Update config metadata
      setConfigWithEvent("remoteThemeSettings", {
        ...settings,
        lastModified: newLastModified || lastModified,
        lastSync: now,
      });

      this.logger.log("Themes synced and metadata updated.");

      // Proactively cache ALL assets for all themes in themes.json
      await this.cacheAllThemes(data);

      // True indicates new data is available, UI should refresh
      return true;
    } catch (error) {
      this.logger.error("Sync failed:", error);
      return false;
    }
  }

  private async loadThemesFromLocalStorage() {
    try {
      const themesPath = path.join(this.themeDir, "themes.json");
      const content = await fs.readFile(themesPath, "utf-8");
      this.themesData = JSON.parse(content);
      this.logger.log("Loaded themes from local themes.json.");

      // Even if loading from local storage, try to ensure all assets exist
      if (this.themesData) {
        this.cacheAllThemes(this.themesData).catch((err) => {
          this.logger.error("Background pre-caching failed:", err);
        });
      }
    } catch (_e) {
      this.logger.warn("No local themes.json found.");
    }
  }

  /**
   * Iterate through ALL themes and download their assets
   */
  private async cacheAllThemes(data: ThemesRemoteData) {
    this.logger.log("Starting full theme asset pre-caching...");

    const allPoe1 = data.poe1 || [];
    const allPoe2 = data.poe2 || [];

    for (const theme of allPoe1) {
      await this.downloadThemeAssets("POE1", theme, false);
    }
    for (const theme of allPoe2) {
      await this.downloadThemeAssets("POE2", theme, false);
    }

    this.logger.log("Full theme asset pre-caching completed.");
  }

  /**
   * Robustly parse date strings from themes.json
   */
  private parseThemeDate(dateStr: string, isLocal: boolean): Date {
    if (isLocal) {
      // "YYYY-MM-DD HH:mm:ss" -> Parse as Local
      try {
        const [d, t] = dateStr.split(" ");
        const [y, m, day] = d.split("-").map(Number);
        const [h, min, s] = t.split(":").map(Number);
        return new Date(y, m - 1, day, h, min, s);
      } catch (e) {
        this.logger.error(`Failed to parse local date: ${dateStr}`, e);
        return new Date(0);
      }
    } else {
      // Parse as UTC
      return new Date(dateStr.replace(" ", "T") + "Z");
    }
  }

  /**
   * Find the most appropriate theme based on current time
   */
  private findActiveTheme(themes: ThemeDefinition[]): ThemeDefinition | null {
    const now = new Date();

    const correctlyFiltered = themes.filter((t) => {
      if (!t.startDate) return true; // Default themes without date always match

      const isLocal = !!t.isLocalTime;
      const start = this.parseThemeDate(t.startDate, isLocal);
      const end = t.endDate
        ? this.parseThemeDate(t.endDate, isLocal)
        : new Date(8640000000000000);

      return now >= start && now <= end;
    });

    if (correctlyFiltered.length === 0) return null;

    // Select the one with the latest startDate (Priority)
    return correctlyFiltered.sort((a, b) => {
      const isLocalA = !!a.isLocalTime;
      const isLocalB = !!b.isLocalTime;
      const startA = a.startDate
        ? this.parseThemeDate(a.startDate, isLocalA).getTime()
        : 0;
      const startB = b.startDate
        ? this.parseThemeDate(b.startDate, isLocalB).getTime()
        : 0;
      return startB - startA;
    })[0];
  }

  /**
   * Download assets for a specific theme if missing
   */
  private async downloadThemeAssets(
    game: string,
    theme: ThemeDefinition,
    force = false,
  ) {
    const targetDir = path.join(this.themeDir, game.toLowerCase(), theme.id);
    await fs.mkdir(targetDir, { recursive: true });

    const assets = theme.assets;
    for (const [key, relPath] of Object.entries(assets)) {
      const fileName = path.basename(relPath);
      const localPath = path.join(targetDir, fileName);

      try {
        await fs.access(localPath);

        // Hash check logic
        const serverHash = theme.assetsHashes?.[key as keyof ThemeAssets];
        if (serverHash && !force) {
          const fileBuffer = await fs.readFile(localPath);
          const localHash = crypto
            .createHash("md5")
            .update(fileBuffer)
            .digest("hex")
            .substring(0, 8);

          if (localHash === serverHash) {
            this.logger
              .silent()
              .log(`Asset hash matches, skipping: ${localPath}`);
            continue;
          }
          this.logger.log(
            `Hash mismatch for ${fileName} (${localHash} vs ${serverHash}). Re-downloading...`,
          );
        } else if (!force) {
          // If no hash provided by server, fallback to existence check
          this.logger
            .silent()
            .log(`Asset already exists (no hash provided): ${localPath}`);
          continue;
        }
      } catch {
        // File does not exist, proceed to download
      }

      const url = SUPPORT_URLS.ASSETS_BASE + relPath;
      this.logger.log(`Downloading asset: ${url} -> ${localPath}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to download ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(localPath, buffer);
    }
  }

  /**
   * Get public URLs for theme assets (for Renderer)
   * Uses file:// protocol or local asset mapping
   */
  async getActiveTheme(game: "POE1" | "POE2", force = false) {
    if (!this.themesData) await this.loadThemesFromLocalStorage();

    const themes =
      game === "POE1" ? this.themesData?.poe1 : this.themesData?.poe2;
    if (!themes) {
      if (this.lastAppliedThemeIds.has(game)) {
        this.logger.log(
          `[Theme] ${game}: No themes data found in cache. Using default fallback.`,
        );
        this.lastAppliedThemeIds.delete(game);
        this.lastResolvedThemes.delete(game);
      }
      return null;
    }

    // Check user selection first
    const settings = getConfig(
      "remoteThemeSettings",
    ) as AppConfig["remoteThemeSettings"];
    const selectedId = settings?.selectedThemes?.[game];

    let activeTheme: ThemeDefinition | null = null;

    if (selectedId && selectedId !== "auto") {
      activeTheme = themes.find((t) => t.id === selectedId) || null;
      // If a selected theme is not found, reset to auto-apply
      if (!activeTheme) {
        this.logger.warn(
          `Selected theme '${selectedId}' for ${game} not found. Resetting to auto-apply.`,
        );
        setConfigWithEvent("remoteThemeSettings", {
          ...settings,
          selectedThemes: {
            ...settings?.selectedThemes,
            [game]: "auto",
          },
        });
      }
    }

    // If no theme is explicitly selected or auto-apply is enabled, find the active theme
    if (!activeTheme || (settings?.autoApply && selectedId === "auto")) {
      activeTheme = this.findActiveTheme(themes);
    }

    if (!activeTheme) {
      if (this.lastAppliedThemeIds.has(game)) {
        this.logger.log(
          `[Theme] ${game}: No active date-matched or selected theme found. Using default fallback.`,
        );
        this.lastAppliedThemeIds.delete(game);
        this.lastResolvedThemes.delete(game);
      }
      return null;
    }

    // 1. Check Memory Cache: If theme ID and its definition haven't changed, return cached result
    const cached = this.lastResolvedThemes.get(game);
    if (cached && cached.id === activeTheme.id) {
      const settingsHash = JSON.stringify(activeTheme.assets);
      if (cached._assetsHash === settingsHash) {
        return cached;
      }
    }

    // Ensure assets are downloaded for the active theme
    // (This handles cases where a theme is manually selected but wasn't pre-cached because it's not the "date-active" one)
    try {
      await this.downloadThemeAssets(game, activeTheme, force);
    } catch (err) {
      this.logger.error(
        `[Theme] ${game}: Failed to download assets for theme '${activeTheme.id}'. Falling back.`,
        err,
      );
      return null;
    }

    // Try to map to local paths
    const assets: Record<string, string> = {};
    const baseDir = path.join(
      this.themeDir,
      game.toLowerCase(),
      activeTheme.id,
    );

    try {
      for (const [key, relPath] of Object.entries(activeTheme.assets)) {
        const fileName = path.basename(relPath);
        const localPath = path.join(baseDir, fileName);
        await fs.access(localPath);

        // Abstract asset URL: asset://[game]/[themeId]/[filename]
        assets[key] =
          `asset://${game.toLowerCase()}/${activeTheme.id}/${fileName}`;
      }

      const result = {
        ...activeTheme,
        assets,
        isRemote: true,
        _assetsHash: JSON.stringify(activeTheme.assets),
      } as Omit<ThemeDefinition, "assets"> & {
        assets: Record<string, string>;
        isRemote: boolean;
        _assetsHash: string;
      };

      // Update memory cache
      this.lastResolvedThemes.set(game, result);

      // Log only on theme change
      if (this.lastAppliedThemeIds.get(game) !== activeTheme.id) {
        this.logger.log(
          `[Theme] ${game}: Successfully applied remote theme '${activeTheme.id}'.`,
        );
        this.lastAppliedThemeIds.set(game, activeTheme.id);
      }

      return result;
    } catch (err) {
      this.logger.error(
        `[Theme] ${game}: Asset resolution failed for theme '${activeTheme.id}', falling back. Error:`,
        err,
      );
      this.lastAppliedThemeIds.delete(game);
      this.lastResolvedThemes.delete(game);
      return null;
    }
  }

  /**
   * Get all themes data
   */
  async getThemes(): Promise<ThemesRemoteData | null> {
    if (!this.themesData) await this.loadThemesFromLocalStorage();
    return this.themesData;
  }
}

export const themeCacheManager = new ThemeCacheManager();

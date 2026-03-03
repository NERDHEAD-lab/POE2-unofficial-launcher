import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import {
  ThemeDefinition,
  ThemesRemoteData,
  AppConfig,
} from "../../shared/types";
import { SUPPORT_URLS } from "../../shared/urls";
import { getConfig } from "../store";
import { setConfigWithEvent } from "../utils/config-utils";
import { Logger } from "../utils/logger";

/**
 * Manages remote theme assets caching in %appdata%
 * Logic: Sync -> Load from Cache -> Fallback
 */
export class ThemeCacheManager {
  private logger = new Logger({ type: "THEME_CACHE", typeColor: "#4ec9b0" });
  private themeDir: string;
  private themesData: ThemesRemoteData | null = null;

  constructor() {
    // userData path matches main/store.ts
    const userData = path.join(
      app.getPath("appData"),
      "POE2 Unofficial Launcher",
    );
    this.themeDir = path.join(userData, "themes");
  }

  /**
   * Initialize and perform initial sync
   */
  async init() {
    try {
      await fs.mkdir(this.themeDir, { recursive: true });
      await this.syncThemes();
    } catch (error) {
      this.logger.error("Failed to initialize ThemeCacheManager:", error);
    }
  }

  /**
   * Fetch themes.json and download missing assets
   */
  async syncThemes() {
    this.logger.log("Syncing themes from remote...");

    const settings = getConfig(
      "remoteThemeSettings",
    ) as AppConfig["remoteThemeSettings"];
    const lastModified = settings?.lastModified;

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
        // Load from local fallback if we don't have it in memory yet
        await this.loadThemesFromLocalStorage();
        return;
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

      // Update lastModified in config
      if (newLastModified) {
        setConfigWithEvent("remoteThemeSettings", {
          ...settings,
          lastModified: newLastModified,
        });
      }

      this.logger.log("Themes synced and metadata updated.");

      // Proactively cache assets for active themes
      await this.cacheActiveThemes(data);
    } catch (error) {
      this.logger.error("Sync failed, falling back to local cache:", error);
      await this.loadThemesFromLocalStorage();
    }
  }

  private async loadThemesFromLocalStorage() {
    try {
      const themesPath = path.join(this.themeDir, "themes.json");
      const content = await fs.readFile(themesPath, "utf-8");
      this.themesData = JSON.parse(content);
      this.logger.log("Loaded themes from local themes.json.");
    } catch (_e) {
      this.logger.warn("No local themes.json found.");
    }
  }

  /**
   * Identify active themes and download their assets
   */
  private async cacheActiveThemes(data: ThemesRemoteData) {
    const activePoe1 = this.findActiveTheme(data.poe1);
    const activePoe2 = this.findActiveTheme(data.poe2);

    if (activePoe1) await this.downloadThemeAssets("POE1", activePoe1);
    if (activePoe2) await this.downloadThemeAssets("POE2", activePoe2);
  }

  /**
   * Find the most appropriate theme based on current UTC time
   */
  private findActiveTheme(themes: ThemeDefinition[]): ThemeDefinition | null {
    const now = new Date();

    const correctlyFiltered = themes.filter((t) => {
      const start = t.startDate
        ? new Date(t.startDate.replace(" ", "T") + "Z")
        : new Date(0);
      const end = t.endDate
        ? new Date(t.endDate.replace(" ", "T") + "Z")
        : new Date(8640000000000000);

      return now >= start && now <= end;
    });

    if (correctlyFiltered.length === 0) return null;

    // Select the one with the latest startDate (Priority)
    return correctlyFiltered.sort((a, b) => {
      const startA = a.startDate
        ? new Date(a.startDate.replace(" ", "T") + "Z").getTime()
        : 0;
      const startB = b.startDate
        ? new Date(b.startDate.replace(" ", "T") + "Z").getTime()
        : 0;
      return startB - startA;
    })[0];
  }

  /**
   * Download assets for a specific theme if missing
   */
  private async downloadThemeAssets(game: string, theme: ThemeDefinition) {
    const targetDir = path.join(this.themeDir, game.toLowerCase(), theme.id);
    await fs.mkdir(targetDir, { recursive: true });

    const assets = theme.assets;
    for (const relPath of Object.values(assets)) {
      const fileName = path.basename(relPath);
      const localPath = path.join(targetDir, fileName);

      try {
        await fs.access(localPath);
        this.logger.silent().log(`Asset already exists: ${localPath}`);
      } catch {
        const url = SUPPORT_URLS.ASSETS_BASE + relPath;
        this.logger.log(`Downloading asset: ${url} -> ${localPath}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download ${url}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(localPath, buffer);
      }
    }
  }

  /**
   * Get public URLs for theme assets (for Renderer)
   * Uses file:// protocol or local asset mapping
   */
  async getActiveTheme(game: "POE1" | "POE2") {
    if (!this.themesData) await this.loadThemesFromLocalStorage();

    const themes =
      game === "POE1" ? this.themesData?.poe1 : this.themesData?.poe2;
    if (!themes) return null;

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

    if (!activeTheme) return null;

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
        // Convert to asset:// protocol for electron to load securely
        assets[key] = `asset://${localPath}`;
      }

      return {
        ...activeTheme,
        assets,
        isRemote: true,
      };
    } catch (_e) {
      this.logger.warn(
        `Assets for theme ${activeTheme.id} missing in cache. Fallback triggered.`,
      );
      return null;
    }
  }
}

export const themeCacheManager = new ThemeCacheManager();

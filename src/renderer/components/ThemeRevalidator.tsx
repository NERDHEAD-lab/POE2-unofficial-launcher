import React, { useEffect } from "react";

import { CONFIG_KEYS } from "../../shared/config";
import {
  AppConfig,
  RevalidateThemeColorsEventDetail,
} from "../../shared/types";
import { logger } from "../utils/logger";
import { extractThemeColors } from "../utils/theme";

/**
 * Silent component that listens for theme revalidation events
 * and handles background extraction and caching.
 */
const ThemeRevalidator: React.FC = () => {
  useEffect(() => {
    const handleRevalidate = async (event: Event) => {
      const customEvent =
        event as CustomEvent<RevalidateThemeColorsEventDetail>;
      const { game, assetPath } = customEvent.detail;

      if (!window.electronAPI) return;

      try {
        // 1. Get current hash from main process
        const fsHash = await window.electronAPI.getFileHash(assetPath);

        // 2. Get current config to check cache
        const currentConfig =
          (await window.electronAPI.getConfig()) as AppConfig;
        const themeCache = currentConfig.themeCache || {};
        const cached = themeCache[game];

        // 3. Skip if hash and assetPath match (Optional: match assetPath for debug clarity)
        if (
          cached &&
          cached.hash === fsHash &&
          cached.assetPath === assetPath
        ) {
          logger.log(`[Theme] ${game} theme is already up-to-date in cache.`);
          return;
        }

        // 4. Extract new colors
        logger.log(
          `[Theme] Extracting colors (Revalidate) for ${game} from: ${assetPath}`,
        );
        const colors = await extractThemeColors(assetPath);

        // 5. Update global config cache
        // Fetch the latest config again to minimize race condition window
        const latestConfig =
          (await window.electronAPI.getConfig()) as AppConfig;
        const currentCache = latestConfig.themeCache || {};

        const updatedCache = {
          ...currentCache,
          [game]: { ...colors, hash: fsHash, assetPath },
        };

        await window.electronAPI.setConfig(
          CONFIG_KEYS.THEME_CACHE,
          updatedCache,
        );
        logger.log(`[Theme] ${game} theme cache re-validated and updated.`);
      } catch (err) {
        logger.error(`[Theme] Failed to revalidate ${game} theme:`, err);
      }
    };

    window.addEventListener("REVALIDATE_THEME_COLORS", handleRevalidate);
    return () => {
      window.removeEventListener("REVALIDATE_THEME_COLORS", handleRevalidate);
    };
  }, []);

  return null;
};

export default ThemeRevalidator;

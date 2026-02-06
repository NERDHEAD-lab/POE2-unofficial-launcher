import axios from "axios";

import { ChangelogItem } from "../../shared/types";
import { logger } from "../utils/logger";

const REPO_OWNER = "NERDHEAD-lab";
const REPO_NAME = "POE2-unofficial-launcher";

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
}

export const changelogService = {
  async fetchChangelogs(
    currentVersion: string,
    previousVersion: string,
  ): Promise<ChangelogItem[]> {
    try {
      logger.log(
        `[ChangelogService] Fetching releases diff: ${previousVersion} -> ${currentVersion}`,
      );

      // 1. Fetch Releases from GitHub API
      // Note: Unauthenticated requests are limited to 60 per hour per IP.
      const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;
      const response = await axios.get<GitHubRelease[]>(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "POE2-Unofficial-Launcher",
        },
        timeout: 5000,
      });

      const releases = response.data;

      // 2. Filter Releases
      const newReleases = releases.filter((release) => {
        if (release.draft) return false;

        // If no previous version, we want EVERYTHING up to current (or just everything)
        if (!previousVersion) return true;

        // Remove 'v' prefix if exists
        const version = release.tag_name.replace(/^v/, "");
        const prev = previousVersion.replace(/^v/, "");
        const curr = currentVersion.replace(/^v/, "");

        return (
          compareVersions(version, prev) > 0 &&
          compareVersions(version, curr) <= 0
        );
      });

      // 3. Map to ChangelogItem
      const changelogs: ChangelogItem[] = newReleases.map((r) => ({
        version: r.tag_name,
        date: r.published_at,
        body: r.body,
        htmlUrl: r.html_url,
      }));

      // Sort by version descending (newest first) - typically GitHub returns sorted, but ensure it.
      changelogs.sort((a, b) =>
        compareVersions(
          b.version.replace(/^v/, ""),
          a.version.replace(/^v/, ""),
        ),
      );

      logger.log(`[ChangelogService] Found ${changelogs.length} new releases.`);
      return changelogs;
    } catch (error) {
      logger.error("[ChangelogService] Failed to fetch changelogs:", error);
      return [];
    }
  },
};

/**
 * Compare two semantic version strings.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 == v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

import { SUPPORT_URLS } from "../../shared/urls";
import { compareVersions } from "../../shared/version";

export interface RemoteVersionInfo {
  version: string;
  webRoot: string;
  timestamp: number;
}

export type RemoteVersions = Record<string, RemoteVersionInfo>;

export class VersionService {
  /**
   * Fetches latest version data from gh-pages
   */
  public static async fetchRemoteVersions(): Promise<RemoteVersions | null> {
    try {
      // Use cache busting to ensure we get the latest data
      const response = await fetch(
        `${SUPPORT_URLS.LATEST_VERSIONS_JSON}?t=${Date.now()}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch remote versions: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("[VersionService] Error fetching remote versions:", error);
      return null;
    }
  }

  /**
   * Gets specific remote version for a game
   */
  public static getRemoteVersionForGame(
    versions: RemoteVersions | null,
    gameId: string,
  ): RemoteVersionInfo | null {
    if (!versions) return null;
    return versions[gameId] || null;
  }

  public static compareVersions = compareVersions;
}

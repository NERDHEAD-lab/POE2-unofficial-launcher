/**
 * Centralized utility for formatting game names and launcher titles.
 */

/**
 * Returns the human-readable game name based on the internal activeGame ID.
 * @param activeGame Internal game ID (e.g., "POE1", "POE2").
 * @returns Formatted game name (e.g., "PoE", "PoE 2").
 */
export function getGameName(activeGame: string): string {
  if (activeGame === "POE2") {
    return "PoE 2";
  }
  // Default to PoE for POE1 or unknown
  return "PoE";
}

/**
 * Constructs the full launcher window/tray title string.
 * @param gameName Formatted game name (e.g., from getGameName).
 * @param version Current application version.
 * @param isLowRes Whether low-resolution mode is active.
 * @returns Full title string.
 */
export function getLauncherTitle(
  gameName: string,
  version: string,
  isLowRes: boolean,
): string {
  const resolutionInfo = isLowRes ? " [저해상도 모드]" : "";
  return `${gameName} Unofficial Launcher v${version}${resolutionInfo}`;
}

/**
 * Compares two version strings (e.g., 4.4.0.6.6 vs 3.27.0.8.2)
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(
  v1: string | undefined,
  v2: string | undefined,
): number {
  if (!v1 || v1 === "unknown") return -1;
  if (!v2 || v2 === "unknown") return 1;

  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  const length = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < length; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

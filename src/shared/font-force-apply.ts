import type { FontForceApplyState, FontForceApplyTarget } from "./types";

export const FONT_FORCE_APPLY_TARGETS = [
  "PathOfExile_KG.exe",
  "PathOfExile.exe",
] as const satisfies readonly FontForceApplyTarget[];

/** Old configs, incomplete maps and invalid persisted values are display-unknown, never OFF. */
export function normalizeFontForceApplyState(
  value: unknown,
): FontForceApplyState {
  const input = value && typeof value === "object" ? value : {};
  const read = (target: FontForceApplyTarget): boolean | null => {
    const state = Object.prototype.hasOwnProperty.call(input, target)
      ? (input as Record<string, unknown>)[target]
      : null;
    return typeof state === "boolean" ? state : null;
  };
  return {
    "PathOfExile_KG.exe": read("PathOfExile_KG.exe"),
    "PathOfExile.exe": read("PathOfExile.exe"),
  };
}

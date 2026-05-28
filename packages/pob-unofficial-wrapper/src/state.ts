import type { PobGame } from "@poe2-launcher/shared/types";

export const POB_WRAPPER_STATE_CONFIG_KEY = "pobWrapper";

export const POB_WRAPPER_BUILD_MODES = [
  "TREE",
  "SKILLS",
  "ITEMS",
  "CALCS",
  "PARTY",
  "NOTES",
] as const;

export type PobWrapperBuildMode = (typeof POB_WRAPPER_BUILD_MODES)[number];

export interface PobWrapperLastLocation {
  game: PobGame;
  subPath: string;
  buildName: string | null;
  buildMode: PobWrapperBuildMode;
}

export interface PobWrapperState {
  lastLocation: PobWrapperLastLocation | null;
}

const buildModes = new Set<string>(POB_WRAPPER_BUILD_MODES);

const isPobGame = (value: unknown): value is PobGame =>
  value === "POE1" || value === "POE2";

const isBuildMode = (value: unknown): value is PobWrapperBuildMode =>
  typeof value === "string" && buildModes.has(value);

const normalizePathPart = (value: unknown): string =>
  typeof value === "string" ? value : "";

export const normalizePobWrapperState = (value: unknown): PobWrapperState => {
  if (!value || typeof value !== "object") {
    return { lastLocation: null };
  }
  const candidate = value as Partial<PobWrapperState>;
  const lastLocation = candidate.lastLocation;
  if (!lastLocation || typeof lastLocation !== "object") {
    return { lastLocation: null };
  }
  const location = lastLocation as Partial<PobWrapperLastLocation>;
  if (!isPobGame(location.game) || !isBuildMode(location.buildMode)) {
    return { lastLocation: null };
  }
  return {
    lastLocation: {
      game: location.game,
      subPath: normalizePathPart(location.subPath),
      buildName:
        typeof location.buildName === "string" ? location.buildName : null,
      buildMode: location.buildMode,
    },
  };
};

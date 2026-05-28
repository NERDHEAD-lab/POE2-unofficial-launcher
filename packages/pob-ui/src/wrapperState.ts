import type { PobGame } from "@poe2-launcher/shared/types";

import type { BuildMode } from "./views/buildModes";
import type { BuildTarget } from "./views/folderTree";

export const POB_WRAPPER_BUILD_MODE_BY_UI_MODE: Record<
  BuildMode,
  PobWrapperBuildMode
> = {
  tree: "TREE",
  skills: "SKILLS",
  items: "ITEMS",
  calcs: "CALCS",
  party: "PARTY",
  notes: "NOTES",
};

const UI_MODE_BY_WRAPPER_MODE: Record<PobWrapperBuildMode, BuildMode | null> = {
  TREE: "tree",
  SKILLS: "skills",
  ITEMS: "items",
  CALCS: "calcs",
  PARTY: "party",
  NOTES: "notes",
};

export type PobWrapperBuildMode =
  | "TREE"
  | "SKILLS"
  | "ITEMS"
  | "CALCS"
  | "PARTY"
  | "NOTES";

export interface PobWrapperLastLocation {
  game: PobGame;
  subPath: string;
  buildName: string | null;
  buildMode: PobWrapperBuildMode;
}

export interface PobWrapperHostAPI {
  hostMode: "standalone";
  state?: {
    getLastLocation: () => Promise<PobWrapperLastLocation | null>;
    setLastLocation: (
      lastLocation: PobWrapperLastLocation | null,
    ) => Promise<PobWrapperLastLocation | null>;
  };
}

export interface RestoredWrapperLocation {
  target: BuildTarget;
  activeMode: BuildMode;
}

export const createWrapperLastLocation = (
  game: PobGame,
  target: BuildTarget,
  activeMode: BuildMode,
): PobWrapperLastLocation => ({
  game,
  subPath: target.subPath,
  buildName: target.fileName,
  buildMode: POB_WRAPPER_BUILD_MODE_BY_UI_MODE[activeMode],
});

export const restoreWrapperLocation = (
  location: PobWrapperLastLocation | null,
  game: PobGame,
): RestoredWrapperLocation | null => {
  if (!location || location.game !== game) return null;
  const activeMode = UI_MODE_BY_WRAPPER_MODE[location.buildMode];
  if (!activeMode) return null;
  return {
    target: {
      subPath: location.subPath,
      fileName: location.buildName,
    },
    activeMode,
  };
};

declare global {
  interface Window {
    pobWrapper?: PobWrapperHostAPI;
  }
}

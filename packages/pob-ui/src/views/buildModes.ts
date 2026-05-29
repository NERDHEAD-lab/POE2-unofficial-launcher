import {
  POB_ORIGINAL_BUILD_MODES,
  type PobOriginalBuildMode,
} from "@poe2-launcher/shared/pobOriginalContract";

export const POB_BUILD_MODES = POB_ORIGINAL_BUILD_MODES;

export type BuildMode = PobOriginalBuildMode;

export const getBuildModePreloadOrder = (
  activeMode: BuildMode,
): BuildMode[] => [
  activeMode,
  ...POB_BUILD_MODES.filter((mode) => mode !== activeMode),
];

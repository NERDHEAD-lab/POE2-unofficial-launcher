import type { PobTreeTooltipLine } from "@poe2-launcher/shared/types";

import {
  createPobAssetUrl,
  getPobTooltipBackgroundAsset,
  getPobTooltipHeaderAssets,
} from "./pobTooltipAssets";

import type { CSSProperties } from "react";

export interface PobTooltipHeaderTitleEntry {
  line: PobTreeTooltipLine;
  index: number;
}

export const buildPobTooltipSharedAssetStyle = (
  vaultPath: string | null | undefined,
): CSSProperties | null => {
  const gemModBg = getPobTooltipBackgroundAsset("GemHoverModBg");
  const gemModBgUrl = gemModBg ? createPobAssetUrl(vaultPath, gemModBg) : null;
  return gemModBgUrl
    ? ({
        ["--pob-tooltip-gem-mod-bg"]: `url("${gemModBgUrl}")`,
      } as CSSProperties)
    : null;
};

export const buildPobTooltipHeaderAssetStyle = (
  vaultPath: string | null | undefined,
  header: string | null | undefined,
): CSSProperties | null => {
  const headerAssets = getPobTooltipHeaderAssets(header);
  const headerLeftUrl = headerAssets
    ? createPobAssetUrl(vaultPath, headerAssets.left)
    : null;
  const headerMiddleUrl = headerAssets
    ? createPobAssetUrl(vaultPath, headerAssets.middle)
    : null;
  const headerRightUrl = headerAssets
    ? createPobAssetUrl(vaultPath, headerAssets.right)
    : null;
  return headerAssets && headerLeftUrl && headerMiddleUrl && headerRightUrl
    ? ({
        ["--pob-tooltip-header-height"]: `${headerAssets.height}px`,
        ["--pob-tooltip-header-side-width"]: `${headerAssets.sideWidth}px`,
        ["--pob-tooltip-header-middle-width"]: `${headerAssets.middleWidth}px`,
        ["--pob-tooltip-header-left"]: `url("${headerLeftUrl}")`,
        ["--pob-tooltip-header-middle"]: `url("${headerMiddleUrl}")`,
        ["--pob-tooltip-header-right"]: `url("${headerRightUrl}")`,
      } as CSSProperties)
    : null;
};

export const collectPobTooltipHeaderTitleEntries = (
  lines: PobTreeTooltipLine[],
  enabled: boolean,
): PobTooltipHeaderTitleEntry[] => {
  if (!enabled) return [];
  const firstSeparatorIndex = lines.findIndex(
    (line) => line.kind === "separator",
  );
  if (firstSeparatorIndex <= 0) return [];
  return lines
    .slice(0, firstSeparatorIndex)
    .map((line, index) => ({ line, index }))
    .filter(
      (entry) =>
        entry.line.kind === "line" && entry.line.text.trim().length > 0,
    );
};

export interface PobTooltipHeaderAssets {
  left: string;
  middle: string;
  right: string;
  height: number;
  sideWidth: number;
  middleWidth: number;
}

interface TooltipAssetTheme {
  prefix: string;
  height: number;
  sideWidth: number;
  middleWidth: number;
}

const itemTooltipAssetThemeByHeader: Record<string, string> = {
  relic: "foil",
  unique: "unique",
  rare: "rare",
  magic: "magic",
  normal: "white",
  gem: "gem",
};

const passiveTooltipAssetThemeByHeader: Record<string, string> = {
  passive: "normal",
  notable: "notable",
  keystone: "keystone",
  ascendancy: "ascendancy",
  jewel: "jewel",
  "oracle-passive": "oraclenormal",
  "oracle-notable": "oraclenotable",
  "oracle-keystone": "oraclekeystone",
};

const normalizeTooltipToken = (value: string | null | undefined): string => {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
};

const getTooltipAssetTheme = (
  header: string | null | undefined,
): TooltipAssetTheme | null => {
  const key = normalizeTooltipToken(header);
  const itemTheme = itemTooltipAssetThemeByHeader[key];
  if (itemTheme) {
    const large =
      itemTheme === "foil" || itemTheme === "unique" || itemTheme === "rare";
    return {
      prefix: `itemsheader${itemTheme}`,
      height: large ? 58 : 38,
      sideWidth: large ? 47 : 32,
      middleWidth: large ? 47 : 32,
    };
  }
  const passiveTheme = passiveTooltipAssetThemeByHeader[key];
  return passiveTheme
    ? {
        prefix: `${passiveTheme}passiveheader`,
        height: 88,
        sideWidth: 71,
        middleWidth: 71,
      }
    : null;
};

export const createPobAssetUrl = (
  vaultPath: string | null | undefined,
  assetPath: string,
): string | null => {
  if (!vaultPath) return null;
  const normalizedVaultPath = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return `pob-asset://asset/?path=${encodeURIComponent(
    `${normalizedVaultPath}/${assetPath}`,
  )}`;
};

export const getPobTooltipHeaderAssets = (
  header: string | null | undefined,
): PobTooltipHeaderAssets | null => {
  const theme = getTooltipAssetTheme(header);
  if (!theme) return null;
  return {
    left: `Assets/${theme.prefix}left.png`,
    middle: `Assets/${theme.prefix}middle.png`,
    right: `Assets/${theme.prefix}right.png`,
    height: theme.height,
    sideWidth: theme.sideWidth,
    middleWidth: theme.middleWidth,
  };
};

export const getPobTooltipSeparatorAsset = (
  theme: string | null | undefined,
): string | null => {
  const assetTheme =
    itemTooltipAssetThemeByHeader[normalizeTooltipToken(theme)];
  return assetTheme ? `Assets/itemsseparator${assetTheme}.png` : null;
};

export const getPobTooltipBackgroundAsset = (
  background: string | null | undefined,
): string | null =>
  normalizeTooltipToken(background) === "gemhovermodbg"
    ? "Assets/gemhovermodbg.png"
    : null;

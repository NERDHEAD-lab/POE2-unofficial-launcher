import type { PobTreeTooltipLine } from "@poe2-launcher/shared/types";

const metadataToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const headerSeparatorSkipThemes = new Set([
  "relic",
  "unique",
  "rare",
  "magic",
  "gem",
  "passive",
  "notable",
  "keystone",
  "ascendancy",
  "jewel",
  "oracle-passive",
  "oracle-notable",
  "oracle-keystone",
]);

export const tooltipHeaderClasses = (
  baseClass: string,
  header: string | null | undefined,
): string => {
  if (!header) return baseClass;
  return `${baseClass} is-tooltip-header-${metadataToken(header)}`;
};

export const tooltipLineClasses = (
  baseClass: string,
  line: PobTreeTooltipLine,
): string => {
  const classes = [baseClass];
  if (line.size !== null && line.size >= 20) classes.push("is-title");
  if (!line.text.trim()) classes.push("is-empty");
  if (line.colour) classes.push(`is-colour-${line.colour.toLowerCase()}`);
  if (line.center) classes.push("is-centered");
  if (line.font) classes.push(`is-font-${metadataToken(line.font)}`);
  if (line.block !== null && line.block !== undefined && line.block > 1) {
    classes.push("is-comparison-block");
  }
  if (/\b(Equipping|Removing)\b/.test(line.text)) {
    classes.push("is-comparison-heading");
  }
  if (line.background) {
    classes.push("has-background");
    classes.push(`has-background-${metadataToken(line.background)}`);
  }
  return classes.join(" ");
};

export const tooltipSeparatorClasses = (
  baseClass: string,
  line: PobTreeTooltipLine,
  fallbackHeader: string | null | undefined,
): string => {
  const theme = line.separatorTheme ?? fallbackHeader;
  if (!theme) return baseClass;
  return `${baseClass} is-separator-${metadataToken(theme)}`;
};

export const shouldSkipHeaderSeparator = (
  header: string | null | undefined,
): boolean => {
  if (!header) return false;
  return headerSeparatorSkipThemes.has(metadataToken(header));
};

export const tooltipInfluenceClasses = (
  baseClass: string,
  influence: string,
  side: "left" | "right",
): string => `${baseClass} is-${side} is-influence-${metadataToken(influence)}`;

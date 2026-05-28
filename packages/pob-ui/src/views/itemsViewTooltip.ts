import type {
  PobItemDbSummary,
  PobItemSummary,
} from "@poe2-launcher/shared/types";

export type ItemTooltipTone =
  | "name"
  | "base"
  | "meta"
  | "implicit"
  | "explicit"
  | "flag";

export interface ItemTooltipLine {
  text: string;
  tone: ItemTooltipTone;
}

export interface ItemTooltipSection {
  id: "header" | "properties" | "implicit" | "explicit" | "flags";
  lines: ItemTooltipLine[];
}

export interface ItemTooltipLabels {
  baseType: string;
  itemLevel: string;
  quality: string;
  corrupted: string;
  mirrored: string;
  shaper: string;
  elder: string;
  fractured: string;
}

type ItemLike = PobItemSummary | PobItemDbSummary;

const stripVariantSuffix = (value: string): string =>
  value.replace(/ \(.+\)$/, "");

export function buildItemTooltipSections(
  item: ItemLike,
  labels: ItemTooltipLabels,
): ItemTooltipSection[] {
  const sections: ItemTooltipSection[] = [];
  const baseName = item.baseName ? stripVariantSuffix(item.baseName) : null;
  const title = item.title && item.title !== item.name ? item.title : null;

  const headerLines: ItemTooltipLine[] = [];
  if (title) {
    headerLines.push({ text: title, tone: "name" });
    if (baseName) headerLines.push({ text: baseName, tone: "base" });
  } else {
    headerLines.push({ text: item.name, tone: "name" });
  }
  sections.push({ id: "header", lines: headerLines });

  const propertyLines: ItemTooltipLine[] = [];
  if (baseName && !title) {
    propertyLines.push({
      text: `${labels.baseType}: ${baseName}`,
      tone: "meta",
    });
  }
  if (item.quality !== null && item.quality > 0) {
    propertyLines.push({
      text: `${labels.quality}: +${item.quality}%`,
      tone: "meta",
    });
  }
  if (item.itemLevel !== null) {
    propertyLines.push({
      text: `${labels.itemLevel}: ${item.itemLevel}`,
      tone: "meta",
    });
  }
  if (propertyLines.length > 0) {
    sections.push({ id: "properties", lines: propertyLines });
  }

  if (item.implicitLines.length > 0) {
    sections.push({
      id: "implicit",
      lines: item.implicitLines.map((text) => ({ text, tone: "implicit" })),
    });
  }

  if (item.explicitLines.length > 0) {
    sections.push({
      id: "explicit",
      lines: item.explicitLines.map((text) => ({ text, tone: "explicit" })),
    });
  }

  const flags: string[] = [];
  if (item.corrupted) flags.push(labels.corrupted);
  if (item.mirrored) flags.push(labels.mirrored);
  if (item.shaper) flags.push(labels.shaper);
  if (item.elder) flags.push(labels.elder);
  if (item.fractured) flags.push(labels.fractured);
  if (flags.length > 0) {
    sections.push({
      id: "flags",
      lines: flags.map((text) => ({ text, tone: "flag" })),
    });
  }

  return sections;
}

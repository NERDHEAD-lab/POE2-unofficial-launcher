import type {
  PobItemDbSummary,
  PobItemsTooltip,
  PobItemsSnapshot,
  PobItemSummary,
  PobRepoeTranslationsSnapshot,
  PobSkillGem,
  PobSkillGemCatalogEntry,
  PobSkillsGemTooltip,
  PobSkillsSnapshot,
  PobTreeSnapshot,
  PobTreeTooltipLine,
} from "@poe2-launcher/shared/types";

export const EMPTY_REPOE_TRANSLATIONS: PobRepoeTranslationsSnapshot = {
  locale: "ko",
  available: false,
  nodeNamesById: {},
  nodeStatLinesById: {},
  statLinesByEnglishLine: {},
  statLineTemplates: [],
  itemNamesById: {},
  itemNamesByEnglishName: {},
  gemNamesById: {},
  gemNamesBySkillId: {},
  gemNamesByEnglishName: {},
};

const translatedByName = (
  translations: PobRepoeTranslationsSnapshot,
  value: string | null | undefined,
  map: Record<string, string>,
): string | null => {
  if (!value) return null;
  return map[value] ?? null;
};

interface CompiledStatLineTemplate {
  regex: RegExp;
  indexes: number[];
  localized: string;
}

const statTemplateCache = new WeakMap<
  PobRepoeTranslationsSnapshot,
  CompiledStatLineTemplate[]
>();

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compileStatTemplate = (
  english: string,
  localized: string,
): CompiledStatLineTemplate | null => {
  const indexes: number[] = [];
  let pattern = "^";
  let cursor = 0;
  for (const match of english.matchAll(/\{(\d+)\}/g)) {
    pattern += escapeRegex(english.slice(cursor, match.index));
    pattern += "(.+?)";
    indexes.push(Number(match[1]));
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (indexes.length === 0) return null;
  pattern += `${escapeRegex(english.slice(cursor))}$`;
  return { regex: new RegExp(pattern), indexes, localized };
};

const compiledStatTemplates = (
  translations: PobRepoeTranslationsSnapshot,
): CompiledStatLineTemplate[] => {
  const cached = statTemplateCache.get(translations);
  if (cached) return cached;

  const compiled = translations.statLineTemplates.flatMap((template) => {
    const value = compileStatTemplate(template.english, template.localized);
    return value ? [value] : [];
  });
  statTemplateCache.set(translations, compiled);
  return compiled;
};

export const translateStatLine = (
  text: string,
  translations: PobRepoeTranslationsSnapshot,
): string => {
  if (!translations.available || !text) return text;
  const exact = translations.statLinesByEnglishLine[text];
  if (exact) return exact;

  for (const template of compiledStatTemplates(translations)) {
    const match = template.regex.exec(text);
    if (!match) continue;

    const values = new Map<number, string>();
    template.indexes.forEach((index, captureIndex) => {
      values.set(index, match[captureIndex + 1] ?? "");
    });
    return template.localized.replace(
      /\{(\d+)\}/g,
      (_token, index: string) => values.get(Number(index)) ?? "",
    );
  }

  return text;
};

export const translateStatLines = (
  lines: string[],
  translations: PobRepoeTranslationsSnapshot,
): string[] => lines.map((line) => translateStatLine(line, translations));

const translatedItemName = (
  item: PobItemSummary | PobItemDbSummary,
  translations: PobRepoeTranslationsSnapshot,
): string =>
  translations.itemNamesById[String(item.id)] ??
  translatedByName(
    translations,
    item.name,
    translations.itemNamesByEnglishName,
  ) ??
  item.name;

const translatedBaseName = (
  item: PobItemSummary | PobItemDbSummary,
  translations: PobRepoeTranslationsSnapshot,
): string | null =>
  translatedByName(
    translations,
    item.baseName,
    translations.itemNamesByEnglishName,
  ) ??
  translatedByName(
    translations,
    item.baseType,
    translations.itemNamesByEnglishName,
  ) ??
  item.baseName;

export function translateTreeSnapshot(
  snapshot: PobTreeSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobTreeSnapshot {
  if (!translations.available) return snapshot;
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      name: translations.nodeNamesById[String(node.id)] ?? node.name,
      statLines:
        translations.nodeStatLinesById[String(node.id)] ??
        translateStatLines(node.statLines ?? [], translations),
    })),
  };
}

export function translateItemSummary<
  T extends PobItemSummary | PobItemDbSummary,
>(item: T, translations: PobRepoeTranslationsSnapshot): T {
  if (!translations.available) return item;
  return {
    ...item,
    name: translatedItemName(item, translations),
    baseName: translatedBaseName(item, translations),
    implicitLines: translateStatLines(item.implicitLines, translations),
    explicitLines: translateStatLines(item.explicitLines, translations),
    title:
      translatedByName(
        translations,
        item.title,
        translations.itemNamesByEnglishName,
      ) ?? item.title,
  };
}

export function translateItemsSnapshot(
  snapshot: PobItemsSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobItemsSnapshot {
  if (!translations.available) return snapshot;
  return {
    ...snapshot,
    items: snapshot.items.map((item) =>
      translateItemSummary(item, translations),
    ),
    sharedItems: snapshot.sharedItems.map((item) =>
      translateItemSummary(item, translations),
    ),
  };
}

export function translateItemDbEntries(
  entries: PobItemDbSummary[],
  translations: PobRepoeTranslationsSnapshot,
): PobItemDbSummary[] {
  if (!translations.available) return entries;
  return entries.map((entry) => translateItemSummary(entry, translations));
}

const searchableText = (
  item: PobItemSummary | PobItemDbSummary | undefined,
): string[] => {
  if (!item) return [];
  return [
    String(item.id),
    item.name,
    item.baseName,
    item.baseType,
    item.baseSubType,
    item.title,
    item.raw,
    ...item.implicitLines,
    ...item.explicitLines,
  ].flatMap((value) =>
    typeof value === "string" && value.trim() ? [value] : [],
  );
};

export function filterTranslatedItemDbEntries(
  displayEntries: PobItemDbSummary[],
  sourceEntries: PobItemDbSummary[],
  query: string,
): PobItemDbSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return displayEntries;

  const sourceById = new Map(sourceEntries.map((entry) => [entry.id, entry]));
  return displayEntries.filter((entry) =>
    [...searchableText(entry), ...searchableText(sourceById.get(entry.id))]
      .join("\n")
      .toLocaleLowerCase()
      .includes(needle),
  );
}

const translatedGemName = (
  gem: PobSkillGem,
  translations: PobRepoeTranslationsSnapshot,
): string =>
  translatedByName(translations, gem.gemId, translations.gemNamesById) ??
  translatedByName(translations, gem.skillId, translations.gemNamesBySkillId) ??
  translatedByName(
    translations,
    gem.displayName,
    translations.gemNamesByEnglishName,
  ) ??
  translatedByName(
    translations,
    gem.nameSpec,
    translations.gemNamesByEnglishName,
  ) ??
  gem.displayName;

const translateGemCatalogEntry = (
  entry: PobSkillGemCatalogEntry,
  translations: PobRepoeTranslationsSnapshot,
): PobSkillGemCatalogEntry => ({
  ...entry,
  name:
    translatedByName(translations, entry.id, translations.gemNamesById) ??
    translatedByName(
      translations,
      entry.name,
      translations.gemNamesByEnglishName,
    ) ??
    entry.name,
});

export function translateSkillsSnapshot(
  snapshot: PobSkillsSnapshot,
  translations: PobRepoeTranslationsSnapshot,
): PobSkillsSnapshot {
  if (!translations.available) return snapshot;
  return {
    ...snapshot,
    groups: snapshot.groups.map((group) => ({
      ...group,
      displayLabel:
        translatedByName(
          translations,
          group.displayLabel,
          translations.gemNamesByEnglishName,
        ) ?? group.displayLabel,
      gems: group.gems.map((gem) => ({
        ...gem,
        displayName: translatedGemName(gem, translations),
        globalEffects: gem.globalEffects.map((effect) => ({
          ...effect,
          name:
            translatedByName(
              translations,
              effect.name,
              translations.gemNamesByEnglishName,
            ) ?? effect.name,
        })),
      })),
      activeSkills: group.activeSkills.map((skill) => ({
        ...skill,
        label:
          translatedByName(
            translations,
            skill.label,
            translations.gemNamesByEnglishName,
          ) ?? skill.label,
        skillPartName:
          translatedByName(
            translations,
            skill.skillPartName,
            translations.gemNamesByEnglishName,
          ) ?? skill.skillPartName,
      })),
    })),
    availableGems: snapshot.availableGems.map((entry) =>
      translateGemCatalogEntry(entry, translations),
    ),
  };
}

const translateTooltipLines = (
  lines: PobTreeTooltipLine[],
  translations: PobRepoeTranslationsSnapshot,
): PobTreeTooltipLine[] => {
  if (!translations.available) return lines;
  return lines.map((line) =>
    line.kind === "line"
      ? { ...line, text: translateStatLine(line.text, translations) }
      : line,
  );
};

export function translateItemTooltip(
  tooltip: PobItemsTooltip,
  translations: PobRepoeTranslationsSnapshot,
): PobItemsTooltip {
  if (!translations.available) return tooltip;
  return {
    ...tooltip,
    lines: translateTooltipLines(tooltip.lines, translations),
  };
}

export function translateSkillsGemTooltip(
  tooltip: PobSkillsGemTooltip,
  translations: PobRepoeTranslationsSnapshot,
): PobSkillsGemTooltip {
  if (!translations.available) return tooltip;
  return {
    ...tooltip,
    lines: translateTooltipLines(tooltip.lines, translations),
  };
}

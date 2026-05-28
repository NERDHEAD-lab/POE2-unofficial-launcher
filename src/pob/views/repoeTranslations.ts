import type {
  PobItemDbSummary,
  PobItemsSnapshot,
  PobItemSummary,
  PobRepoeTranslationsSnapshot,
  PobSkillGem,
  PobSkillGemCatalogEntry,
  PobSkillsSnapshot,
  PobTreeSnapshot,
} from "../../shared/types";

export const EMPTY_REPOE_TRANSLATIONS: PobRepoeTranslationsSnapshot = {
  locale: "ko",
  available: false,
  nodeNamesById: {},
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

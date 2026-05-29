import type {
  PobRepoeLocale,
  PobRepoeStatLineTemplate,
  PobRepoeTranslationsSnapshot,
} from "@poe2-launcher/shared/types";

export const REPOE_STAT_DESCRIPTION_PATHS = [
  "stat_translations/stat_descriptions.json",
  "stat_translations/passive_skill_stat_descriptions.json",
  "stat_translations/passive_skill_aura_stat_descriptions.json",
  "stat_translations/skill_stat_descriptions.json",
  "stat_translations/gem_stat_descriptions.json",
  "stat_translations/active_skill_gem_stat_descriptions.json",
  "stat_translations/advanced_mod_stat_descriptions.json",
  "stat_translations/character_panel_stat_descriptions.json",
] as const;

interface RePoeStatCondition {
  min?: number | null;
  max?: number | null;
  negated?: boolean | null;
}

interface RePoeStatTranslationVariant {
  condition?: RePoeStatCondition[];
  string?: string | null;
}

interface RePoeStatTranslationEntry {
  ids?: string[];
  English?: RePoeStatTranslationVariant[] | null;
  Korean?: RePoeStatTranslationVariant[] | null;
}

interface IndexedStatVariant {
  condition?: RePoeStatCondition[];
  localized: string;
}

export interface RePoeStatDescriptionIndex {
  exactLines: Record<string, string>;
  templates: PobRepoeStatLineTemplate[];
  byId: Map<string, IndexedStatVariant[]>;
}

const localeField = (locale: PobRepoeLocale): "English" | "Korean" =>
  locale === "ko" ? "Korean" : "English";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const asEntries = (value: unknown): RePoeStatTranslationEntry[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is RePoeStatTranslationEntry =>
        isRecord(entry),
      )
    : [];

const idsSignature = (entry: RePoeStatTranslationEntry): string =>
  (entry.ids ?? []).join("\0");

const conditionSignature = (
  variant: RePoeStatTranslationVariant | undefined,
): string => JSON.stringify(variant?.condition ?? []);

const normalizeTemplate = (template: string, locale: PobRepoeLocale): string =>
  template.replace(/\[([^|\]]+)\|([^\]]+)\]/g, locale === "ko" ? "$2" : "$1");

function indexBySignature(
  resources: unknown[],
): Map<string, RePoeStatTranslationEntry> {
  const index = new Map<string, RePoeStatTranslationEntry>();
  for (const resource of resources) {
    for (const entry of asEntries(resource)) {
      const signature = idsSignature(entry);
      if (signature) {
        index.set(signature, entry);
      }
    }
  }
  return index;
}

function pairedLocalizedVariant(
  localizedVariants: RePoeStatTranslationVariant[],
  sourceVariant: RePoeStatTranslationVariant,
  index: number,
): RePoeStatTranslationVariant | undefined {
  const signature = conditionSignature(sourceVariant);
  return (
    localizedVariants.find(
      (candidate) => conditionSignature(candidate) === signature,
    ) ?? localizedVariants[index]
  );
}

function conditionMatches(
  conditions: RePoeStatCondition[] | undefined,
  values: number[],
): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition, index) => {
    const value = values[index] ?? 0;
    if (
      condition.min !== null &&
      condition.min !== undefined &&
      value < condition.min
    ) {
      return false;
    }
    if (
      condition.max !== null &&
      condition.max !== undefined &&
      value > condition.max
    ) {
      return false;
    }
    return true;
  });
}

function formatTemplate(template: string, values: number[]): string {
  return template.replace(
    /\{(\d+)(?::([^}]+))?\}/g,
    (_match, index: string, format: string | undefined) => {
      const value = values[Number(index)];
      if (value === undefined) return "";
      return format?.startsWith("+") && value > 0 ? `+${value}` : String(value);
    },
  );
}

const putIdVariant = (
  byId: Map<string, IndexedStatVariant[]>,
  id: string,
  variant: IndexedStatVariant,
): void => {
  const variants = byId.get(id) ?? [];
  variants.push(variant);
  byId.set(id, variants);
};

export const statDescriptionsOverride = {
  enabled: true,

  createIndex(
    sourceResources: unknown[],
    localizedResources: unknown[],
    locale: PobRepoeLocale,
  ): RePoeStatDescriptionIndex {
    const exactLines: Record<string, string> = {};
    const templates: PobRepoeStatLineTemplate[] = [];
    const byId = new Map<string, IndexedStatVariant[]>();

    if (!this.enabled || locale === "en") {
      return { exactLines, templates, byId };
    }

    const localizedBySignature = indexBySignature(localizedResources);
    for (const sourceEntry of indexBySignature(sourceResources).values()) {
      const signature = idsSignature(sourceEntry);
      const localizedEntry = localizedBySignature.get(signature);
      if (!localizedEntry) continue;

      const sourceVariants = sourceEntry.English ?? [];
      const localizedVariants = localizedEntry[localeField(locale)] ?? [];
      sourceVariants.forEach((sourceVariant, index) => {
        const sourceTemplate = stringValue(sourceVariant.string);
        const localizedTemplate = stringValue(
          pairedLocalizedVariant(localizedVariants, sourceVariant, index)
            ?.string,
        );
        if (!sourceTemplate || !localizedTemplate) return;

        const english = normalizeTemplate(sourceTemplate, "en");
        const localized = normalizeTemplate(localizedTemplate, locale);
        if (english.includes("{")) {
          templates.push({ english, localized });
        } else {
          exactLines[english] = localized;
        }

        for (const id of sourceEntry.ids ?? []) {
          putIdVariant(byId, id, {
            condition: sourceVariant.condition,
            localized,
          });
        }
      });
    }

    return { exactLines, templates, byId };
  },

  indexSnapshot(
    snapshot: PobRepoeTranslationsSnapshot,
    index: RePoeStatDescriptionIndex,
  ): void {
    if (!this.enabled) return;
    Object.assign(snapshot.statLinesByEnglishLine, index.exactLines);
    snapshot.statLineTemplates.push(...index.templates);
  },

  translateById(
    index: RePoeStatDescriptionIndex,
    statId: string,
    values: number[] = [],
  ): string | null {
    if (!this.enabled) return null;
    const variants = index.byId.get(statId);
    const variant = variants?.find((candidate) =>
      conditionMatches(candidate.condition, values),
    );
    return variant ? formatTemplate(variant.localized, values) : null;
  },
};

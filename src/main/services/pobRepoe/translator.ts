import type { RePoeLocale } from "./fetcher";

interface RePoeNamedRecord {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  label?: unknown;
  base_item?: {
    id?: unknown;
    display_name?: unknown;
  };
  active_skill?: {
    id?: unknown;
    display_name?: unknown;
  };
  grants_skills?: unknown;
  skill_name?: unknown;
  support_name?: unknown;
}

interface RePoePassiveTree {
  passives?: Record<string, RePoeNamedRecord>;
}

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

export interface RePoeTranslatorData {
  passiveTree?: RePoePassiveTree;
  statTranslations?: RePoeStatTranslationEntry[];
  baseItems?: Record<string, RePoeNamedRecord>;
  uniques?: Record<string, RePoeNamedRecord>;
  skillGems?: Record<string, RePoeNamedRecord>;
  skills?: Record<string, RePoeNamedRecord>;
}

const localeField = (locale: RePoeLocale): "English" | "Korean" =>
  locale === "ko" ? "Korean" : "English";

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

function buildNameIndex(
  records: Record<string, RePoeNamedRecord> | undefined,
  names: (record: RePoeNamedRecord) => Array<string | null>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const [key, record] of Object.entries(records ?? {})) {
    const name = names(record).find((candidate) => candidate !== null);
    if (!name) {
      continue;
    }

    index.set(key, name);
    const recordId = stringValue(record.id);
    if (recordId) {
      index.set(recordId, name);
    }
  }
  return index;
}

function buildPassiveNameIndex(
  tree: RePoePassiveTree | undefined,
): Map<string, string> {
  return buildNameIndex(tree?.passives, (record) => [stringValue(record.name)]);
}

function buildItemNameIndex(data: RePoeTranslatorData): Map<string, string> {
  const index = buildNameIndex(data.uniques, (record) => [
    stringValue(record.name),
    stringValue(record.display_name),
  ]);
  for (const [key, value] of buildNameIndex(data.baseItems, (record) => [
    stringValue(record.name),
    stringValue(record.display_name),
  ])) {
    index.set(key, value);
  }
  return index;
}

function buildGemNameIndex(data: RePoeTranslatorData): Map<string, string> {
  const index = buildNameIndex(data.skillGems, (record) => [
    stringValue(record.base_item?.display_name),
    stringValue(record.skill_name),
    stringValue(record.support_name),
    stringValue(record.name),
  ]);

  for (const record of Object.values(data.skillGems ?? {})) {
    const name =
      stringValue(record.base_item?.display_name) ??
      stringValue(record.skill_name) ??
      stringValue(record.support_name);
    if (!name || !Array.isArray(record.grants_skills)) {
      continue;
    }
    for (const skillId of record.grants_skills) {
      const id = stringValue(skillId);
      if (id) {
        index.set(id, name);
      }
    }
  }

  for (const [key, value] of buildNameIndex(data.skills, (record) => [
    stringValue(record.active_skill?.display_name),
    stringValue(record.label),
    stringValue(record.name),
  ])) {
    index.set(key, value);
  }
  return index;
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

function formatTemplate(
  template: string,
  values: number[],
  locale: RePoeLocale,
): string {
  return template
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, locale === "ko" ? "$2" : "$1")
    .replace(/\{(\d+)\}/g, (_match, index: string) => {
      const value = values[Number(index)];
      return value === undefined ? "" : String(value);
    });
}

export class Translator {
  private readonly locale: RePoeLocale;
  private readonly nodeNames: Map<string, string>;
  private readonly itemNames: Map<string, string>;
  private readonly gemNames: Map<string, string>;
  private readonly statTranslations: RePoeStatTranslationEntry[];

  constructor(locale: RePoeLocale, data: RePoeTranslatorData = {}) {
    this.locale = locale;
    this.nodeNames = buildPassiveNameIndex(data.passiveTree);
    this.itemNames = buildItemNameIndex(data);
    this.gemNames = buildGemNameIndex(data);
    this.statTranslations = data.statTranslations ?? [];
  }

  translateNodeName(nodeId: string, fallback = nodeId): string {
    return this.nodeNames.get(nodeId) ?? fallback;
  }

  translateStatLine(statIdOrLine: string, values: number[] = []): string {
    const entry = this.statTranslations.find((translation) =>
      translation.ids?.includes(statIdOrLine),
    );
    const variants = entry?.[localeField(this.locale)] ?? null;
    const variant = variants?.find((candidate) =>
      conditionMatches(candidate.condition, values),
    );
    const template = stringValue(variant?.string);
    if (!template) {
      return statIdOrLine;
    }

    return formatTemplate(template, values, this.locale);
  }

  translateItemName(uniqueId: string, fallback = uniqueId): string {
    return this.itemNames.get(uniqueId) ?? fallback;
  }

  translateGemName(gemId: string, fallback = gemId): string {
    return this.gemNames.get(gemId) ?? fallback;
  }
}

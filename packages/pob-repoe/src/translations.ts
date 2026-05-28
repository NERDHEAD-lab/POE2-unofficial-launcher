import type {
  PobRepoeLocale,
  PobRepoeTranslationsSnapshot,
} from "@poe2-launcher/shared/types";

import { RePoeCache, repoeCache } from "./cache";
import {
  passiveTreeTextOverride,
  type RePoePassiveTreeTextSource,
} from "./overrides/passiveTreeText";
import {
  REPOE_STAT_DESCRIPTION_PATHS,
  statDescriptionsOverride,
} from "./overrides/statDescriptions";

const PASSIVE_TREE_PATH = "passive_skill_trees/Default.json";
const BASE_ITEMS_PATH = "base_items.json";
const SKILL_GEMS_PATH = "skill_gems.json";
const SKILLS_PATH = "skills.json";
const UNIQUES_PATH = "uniques.json";

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

type NameSelector = (record: RePoeNamedRecord) => unknown;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const put = (
  map: Record<string, string>,
  key: string | null,
  value: string,
): void => {
  if (key) {
    map[key] = value;
  }
};

const firstName = (
  record: RePoeNamedRecord | undefined,
  selectors: NameSelector[],
): string | null => {
  if (!record) return null;
  for (const select of selectors) {
    const value = stringValue(select(record));
    if (value) return value;
  }
  return null;
};

const sourceNames = (
  record: RePoeNamedRecord | undefined,
  selectors: NameSelector[],
): string[] => {
  if (!record) return [];
  const names = new Set<string>();
  for (const select of selectors) {
    const value = stringValue(select(record));
    if (value) names.add(value);
  }
  return Array.from(names);
};

const asNamedRecords = (value: unknown): Record<string, RePoeNamedRecord> => {
  if (!isRecord(value)) return {};
  return value as Record<string, RePoeNamedRecord>;
};

async function readNamedResource(
  cache: RePoeCache,
  locale: PobRepoeLocale,
  resourcePath: string,
): Promise<Record<string, RePoeNamedRecord>> {
  return asNamedRecords(await cache.readJsonResource(locale, resourcePath));
}

async function readPassiveTree(
  cache: RePoeCache,
  locale: PobRepoeLocale,
): Promise<RePoePassiveTreeTextSource | null> {
  const value = await cache.readJsonResource(locale, PASSIVE_TREE_PATH);
  return isRecord(value) ? (value as RePoePassiveTreeTextSource) : null;
}

async function readStatResources(
  cache: RePoeCache,
  locale: PobRepoeLocale,
): Promise<unknown[]> {
  return Promise.all(
    REPOE_STAT_DESCRIPTION_PATHS.map((resourcePath) =>
      cache.readJsonResource(locale, resourcePath),
    ),
  );
}

function indexPairedNames(
  targetById: Record<string, string>,
  targetByEnglishName: Record<string, string>,
  sourceRecords: Record<string, RePoeNamedRecord>,
  localizedRecords: Record<string, RePoeNamedRecord>,
  nameSelectors: NameSelector[],
  idSelectors: NameSelector[] = [],
): void {
  for (const [key, localizedRecord] of Object.entries(localizedRecords)) {
    const sourceRecord = sourceRecords[key];
    const localizedName = firstName(localizedRecord, nameSelectors);
    if (!localizedName) continue;

    put(targetById, key, localizedName);
    for (const select of idSelectors) {
      put(targetById, stringValue(select(localizedRecord)), localizedName);
      put(targetById, stringValue(select(sourceRecord ?? {})), localizedName);
    }

    for (const name of sourceNames(sourceRecord, nameSelectors)) {
      targetByEnglishName[name] = localizedName;
    }
  }
}

function indexSkillGemNames(
  snapshot: PobRepoeTranslationsSnapshot,
  sourceGems: Record<string, RePoeNamedRecord>,
  localizedGems: Record<string, RePoeNamedRecord>,
): void {
  const nameSelectors: NameSelector[] = [
    (record) => record.base_item?.display_name,
    (record) => record.skill_name,
    (record) => record.support_name,
    (record) => record.display_name,
    (record) => record.name,
  ];

  indexPairedNames(
    snapshot.gemNamesById,
    snapshot.gemNamesByEnglishName,
    sourceGems,
    localizedGems,
    nameSelectors,
    [(record) => record.id, (record) => record.base_item?.id],
  );

  for (const [key, localizedRecord] of Object.entries(localizedGems)) {
    const localizedName = firstName(localizedRecord, nameSelectors);
    if (!localizedName) continue;

    put(snapshot.gemNamesBySkillId, key, localizedName);
    const grantIds = Array.isArray(localizedRecord.grants_skills)
      ? localizedRecord.grants_skills
      : [];
    for (const skillId of grantIds) {
      put(snapshot.gemNamesBySkillId, stringValue(skillId), localizedName);
    }

    const sourceGrantIds = Array.isArray(sourceGems[key]?.grants_skills)
      ? sourceGems[key].grants_skills
      : [];
    for (const skillId of sourceGrantIds) {
      put(snapshot.gemNamesBySkillId, stringValue(skillId), localizedName);
    }
  }
}

function indexSkillNames(
  snapshot: PobRepoeTranslationsSnapshot,
  sourceSkills: Record<string, RePoeNamedRecord>,
  localizedSkills: Record<string, RePoeNamedRecord>,
): void {
  const nameSelectors: NameSelector[] = [
    (record) => record.active_skill?.display_name,
    (record) => record.label,
    (record) => record.display_name,
    (record) => record.name,
  ];

  indexPairedNames(
    snapshot.gemNamesBySkillId,
    snapshot.gemNamesByEnglishName,
    sourceSkills,
    localizedSkills,
    nameSelectors,
    [(record) => record.id, (record) => record.active_skill?.id],
  );
}

function hasAnyTranslation(snapshot: PobRepoeTranslationsSnapshot): boolean {
  return (
    [
      snapshot.nodeNamesById,
      snapshot.nodeStatLinesById,
      snapshot.statLinesByEnglishLine,
      snapshot.itemNamesById,
      snapshot.itemNamesByEnglishName,
      snapshot.gemNamesById,
      snapshot.gemNamesBySkillId,
      snapshot.gemNamesByEnglishName,
    ].some((map) => Object.keys(map).length > 0) ||
    snapshot.statLineTemplates.length > 0
  );
}

export function createEmptyRePoeTranslations(
  locale: PobRepoeLocale,
): PobRepoeTranslationsSnapshot {
  return {
    locale,
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
}

export async function loadRePoeTranslations(
  locale: PobRepoeLocale,
  cache: RePoeCache = repoeCache,
): Promise<PobRepoeTranslationsSnapshot> {
  const snapshot = createEmptyRePoeTranslations(locale);
  if (locale === "en") {
    return { ...snapshot, available: true };
  }

  const [
    localizedTree,
    sourceBaseItems,
    localizedBaseItems,
    sourceUniques,
    localizedUniques,
    sourceGems,
    localizedGems,
    sourceSkills,
    localizedSkills,
    sourceStatResources,
    localizedStatResources,
  ] = await Promise.all([
    readPassiveTree(cache, locale),
    readNamedResource(cache, "en", BASE_ITEMS_PATH),
    readNamedResource(cache, locale, BASE_ITEMS_PATH),
    readNamedResource(cache, "en", UNIQUES_PATH),
    readNamedResource(cache, locale, UNIQUES_PATH),
    readNamedResource(cache, "en", SKILL_GEMS_PATH),
    readNamedResource(cache, locale, SKILL_GEMS_PATH),
    readNamedResource(cache, "en", SKILLS_PATH),
    readNamedResource(cache, locale, SKILLS_PATH),
    readStatResources(cache, "en"),
    readStatResources(cache, locale),
  ]);

  const statDescriptionIndex = statDescriptionsOverride.createIndex(
    sourceStatResources,
    localizedStatResources,
    locale,
  );
  statDescriptionsOverride.indexSnapshot(snapshot, statDescriptionIndex);
  passiveTreeTextOverride.indexSnapshot(
    snapshot,
    localizedTree,
    (statId, values) =>
      statDescriptionsOverride.translateById(
        statDescriptionIndex,
        statId,
        values,
      ),
  );

  const itemSelectors: NameSelector[] = [
    (record) => record.name,
    (record) => record.display_name,
    (record) => record.base_item?.display_name,
  ];
  const itemIdSelectors: NameSelector[] = [
    (record) => record.id,
    (record) => record.base_item?.id,
  ];
  indexPairedNames(
    snapshot.itemNamesById,
    snapshot.itemNamesByEnglishName,
    sourceUniques,
    localizedUniques,
    itemSelectors,
    itemIdSelectors,
  );
  indexPairedNames(
    snapshot.itemNamesById,
    snapshot.itemNamesByEnglishName,
    sourceBaseItems,
    localizedBaseItems,
    itemSelectors,
    itemIdSelectors,
  );
  indexSkillGemNames(snapshot, sourceGems, localizedGems);
  indexSkillNames(snapshot, sourceSkills, localizedSkills);

  return { ...snapshot, available: hasAnyTranslation(snapshot) };
}

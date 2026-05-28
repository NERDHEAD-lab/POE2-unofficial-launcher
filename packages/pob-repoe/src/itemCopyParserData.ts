import type { PobRepoeLocale } from "@poe2-launcher/shared/types";

import { RePoeCache, repoeCache } from "./cache";
import {
  buildRePoeResourceTargets,
  fetchRePoeJsonResource,
  type RePoeFetch,
} from "./fetcher";

import type { PobItemCopyParserData } from "./itemCopyParser";

const BASE_ITEMS_PATH = "base_items.json";
const ITEM_CLASSES_PATH = "item_classes.json";
const UNIQUES_PATH = "uniques.json";
const STAT_TRANSLATION_PATHS = [
  "stat_translations/stat_descriptions.json",
  "stat_translations/advanced_mod_stat_descriptions.json",
] as const;
const ITEM_COPY_PARSER_RESOURCE_PATHS = [
  BASE_ITEMS_PATH,
  ITEM_CLASSES_PATH,
  UNIQUES_PATH,
  ...STAT_TRANSLATION_PATHS,
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

interface StatTranslationEntry {
  ids?: string[];
  English?: unknown;
  Korean?: unknown;
}

function statSignature(entry: StatTranslationEntry): string {
  return (entry.ids ?? []).join("\0");
}

function mergeStatTranslations(
  englishResources: unknown[],
  koreanResources: unknown[],
): StatTranslationEntry[] {
  const bySignature = new Map<string, StatTranslationEntry>();

  for (const resource of englishResources) {
    if (!Array.isArray(resource)) continue;
    for (const entry of resource) {
      if (!isRecord(entry)) continue;
      const stat = entry as StatTranslationEntry;
      const signature = statSignature(stat);
      if (!signature) continue;
      bySignature.set(signature, {
        ids: stat.ids,
        English: stat.English ?? stat.Korean,
      });
    }
  }

  for (const resource of koreanResources) {
    if (!Array.isArray(resource)) continue;
    for (const entry of resource) {
      if (!isRecord(entry)) continue;
      const stat = entry as StatTranslationEntry;
      const signature = statSignature(stat);
      if (!signature) continue;
      const existing = bySignature.get(signature) ?? { ids: stat.ids };
      existing.Korean = stat.Korean ?? stat.English;
      bySignature.set(signature, existing);
    }
  }

  return Array.from(bySignature.values()).filter(
    (entry) => entry.English && entry.Korean,
  );
}

async function readResource(
  cache: RePoeCache,
  locale: PobRepoeLocale,
  path: string,
): Promise<unknown | null> {
  return cache.readJsonResource(locale, path);
}

export async function ensureItemCopyParserResources(
  cache: RePoeCache = repoeCache,
  fetcher: RePoeFetch = fetch,
): Promise<void> {
  const targets = buildRePoeResourceTargets(
    ["en", "ko"],
    ITEM_COPY_PARSER_RESOURCE_PATHS,
  );
  const missing = [];
  for (const target of targets) {
    const existing = await cache.readJsonResource(target.locale, target.path);
    if (existing === null) {
      missing.push(target);
    }
  }

  if (missing.length === 0) {
    await cache.markChecked("ko");
    return;
  }

  const resources = await Promise.all(
    missing.map((target) => fetchRePoeJsonResource(target, fetcher)),
  );
  for (const resource of resources) {
    await cache.writeJsonResource(resource);
  }
  await cache.markChecked("ko");
}

export async function loadItemCopyParserData(
  cache: RePoeCache = repoeCache,
): Promise<PobItemCopyParserData> {
  const [
    enBaseItems,
    koBaseItems,
    enItemClasses,
    koItemClasses,
    enUniques,
    koUniques,
  ] = await Promise.all([
    readResource(cache, "en", BASE_ITEMS_PATH),
    readResource(cache, "ko", BASE_ITEMS_PATH),
    readResource(cache, "en", ITEM_CLASSES_PATH),
    readResource(cache, "ko", ITEM_CLASSES_PATH),
    readResource(cache, "en", UNIQUES_PATH),
    readResource(cache, "ko", UNIQUES_PATH),
  ]);

  const [englishStats, koreanStats] = await Promise.all([
    Promise.all(
      STAT_TRANSLATION_PATHS.map((path) => readResource(cache, "en", path)),
    ),
    Promise.all(
      STAT_TRANSLATION_PATHS.map((path) => readResource(cache, "ko", path)),
    ),
  ]);

  return {
    en: {
      baseItems: asRecord(enBaseItems),
      itemClasses: asRecord(enItemClasses),
      uniques: asRecord(enUniques),
    },
    ko: {
      baseItems: asRecord(koBaseItems),
      itemClasses: asRecord(koItemClasses),
      uniques: asRecord(koUniques),
    },
    statTranslations: mergeStatTranslations(englishStats, koreanStats),
  } as PobItemCopyParserData;
}

export async function loadOrFetchItemCopyParserData(
  cache: RePoeCache = repoeCache,
  fetcher: RePoeFetch = fetch,
): Promise<PobItemCopyParserData> {
  await ensureItemCopyParserResources(cache, fetcher);
  return loadItemCopyParserData(cache);
}

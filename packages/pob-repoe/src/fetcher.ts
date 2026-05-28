import type { PobRepoeLocale } from "@poe2-launcher/shared/types";

import { GGPK_POE2_VERSION_URL, REPOE_POE2_BASE_URL } from "./cdnBaseline";

export type RePoeLocale = PobRepoeLocale;

export interface RePoeHttpValidators {
  etag?: string;
  lastModified?: string;
}

export interface RePoeVersionResult {
  status: "ok";
  version: string;
  etag: string | null;
  lastModified: string | null;
}

export interface RePoeNotModifiedResult {
  status: "not_modified";
  etag: string | null;
  lastModified: string | null;
}

export type RePoeVersionFetchResult =
  | RePoeVersionResult
  | RePoeNotModifiedResult;

export interface RePoeResourceTarget {
  id: string;
  locale: RePoeLocale;
  path: string;
  url: string;
}

export interface RePoeFetchedJsonResource extends RePoeResourceTarget {
  json: unknown;
  etag: string | null;
  lastModified: string | null;
}

type RePoeFetch = typeof fetch;

const KOREAN_PREFIX = "Korean";

export const REPOE_POE2_RESOURCE_PATHS = [
  "passive_skill_trees/Default.json",
  "stat_translations/stat_descriptions.json",
  "stat_translations/passive_skill_stat_descriptions.json",
  "stat_translations/passive_skill_aura_stat_descriptions.json",
  "stat_translations/skill_stat_descriptions.json",
  "stat_translations/gem_stat_descriptions.json",
  "stat_translations/active_skill_gem_stat_descriptions.json",
  "stat_translations/advanced_mod_stat_descriptions.json",
  "stat_translations/character_panel_stat_descriptions.json",
  "base_items.json",
  "item_classes.json",
  "mods.json",
  "mods_by_base.json",
  "skill_gems.json",
  "skills.json",
  "uniques.json",
] as const;

export const REPOE_POE2_VERSION_URL = `${REPOE_POE2_BASE_URL}/version.txt`;

export function buildRePoeResourceUrl(
  path: string,
  locale: RePoeLocale,
): string {
  const normalizedPath = path.replace(/^\/+/, "");
  if (locale === "ko") {
    return `${REPOE_POE2_BASE_URL}/${KOREAN_PREFIX}/${normalizedPath}`;
  }
  return `${REPOE_POE2_BASE_URL}/${normalizedPath}`;
}

export function buildRePoeResourceTargets(
  locales: RePoeLocale[] = ["en", "ko"],
  paths: readonly string[] = REPOE_POE2_RESOURCE_PATHS,
): RePoeResourceTarget[] {
  return locales.flatMap((locale) =>
    paths.map((path) => ({
      id: `${locale}:${path}`,
      locale,
      path,
      url: buildRePoeResourceUrl(path, locale),
    })),
  );
}

export function buildValidatorHeaders(
  validators?: RePoeHttpValidators,
): HeadersInit {
  const headers: Record<string, string> = {};
  if (validators?.etag) {
    headers["If-None-Match"] = validators.etag;
  }
  if (validators?.lastModified) {
    headers["If-Modified-Since"] = validators.lastModified;
  }
  return headers;
}

export async function fetchRePoeVersion(
  validators?: RePoeHttpValidators,
  fetcher: RePoeFetch = fetch,
): Promise<RePoeVersionFetchResult> {
  const response = await fetcher(REPOE_POE2_VERSION_URL, {
    method: "GET",
    headers: buildValidatorHeaders(validators),
  });

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (response.status === 304) {
    return { status: "not_modified", etag, lastModified };
  }
  if (!response.ok) {
    throw new Error(
      `Failed to fetch RePoE version: ${response.status} ${response.statusText}`,
    );
  }

  return {
    status: "ok",
    version: (await response.text()).trim(),
    etag,
    lastModified,
  };
}

export async function fetchRePoeJsonResource(
  target: RePoeResourceTarget,
  fetcher: RePoeFetch = fetch,
): Promise<RePoeFetchedJsonResource> {
  const response = await fetcher(target.url, { method: "GET" });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch RePoE resource ${target.id}: ${response.status} ${response.statusText}`,
    );
  }

  return {
    ...target,
    json: await response.json(),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

export async function fetchGgpkPoe2VersionUrl(
  fetcher: RePoeFetch = fetch,
): Promise<string> {
  const response = await fetcher(GGPK_POE2_VERSION_URL, { method: "GET" });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ggpk PoE2 version: ${response.status} ${response.statusText}`,
    );
  }

  const value = await response.text();
  return value.trim().replace(/^"|"$/g, "");
}

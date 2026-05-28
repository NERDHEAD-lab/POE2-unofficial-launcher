import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import type { RePoeFetchedJsonResource, RePoeLocale } from "./fetcher";

export const REPOE_CACHE_MANIFEST_FILE = "cache_manifest.json";

export interface RePoeCachedResourceMetadata {
  cached_at: number;
  etag: string | null;
  last_modified: string | null;
}

export interface RePoeCachedLocaleMetadata {
  cached_at: number;
  tree_version: string | null;
  version_file_etag: string | null;
  version_file_last_modified: string | null;
  resources: Record<string, RePoeCachedResourceMetadata>;
}

export interface RePoeCacheManifest {
  last_check_timestamp: number;
  active_locale: RePoeLocale;
  cached_locales: Partial<Record<RePoeLocale, RePoeCachedLocaleMetadata>>;
}

export interface RePoeCacheOptions {
  root?: string;
  now?: () => number;
}

export function createEmptyRePoeCacheManifest(
  activeLocale: RePoeLocale = "ko",
): RePoeCacheManifest {
  return {
    last_check_timestamp: 0,
    active_locale: activeLocale,
    cached_locales: {},
  };
}

function assertSafeRelativePath(resourcePath: string): string {
  const normalized = path.normalize(resourcePath);
  if (
    path.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`Unsafe RePoE cache resource path: ${resourcePath}`);
  }
  return normalized;
}

export class RePoeCache {
  private readonly root?: string;
  private readonly now: () => number;

  constructor(options: RePoeCacheOptions = {}) {
    this.root = options.root;
    this.now = options.now ?? Date.now;
  }

  getRoot(): string {
    return this.root ?? path.join(app.getPath("userData"), "pob-i18n-cache");
  }

  getLocaleRoot(locale: RePoeLocale): string {
    return path.join(this.getRoot(), locale);
  }

  getManifestPath(): string {
    return path.join(this.getRoot(), REPOE_CACHE_MANIFEST_FILE);
  }

  async readManifest(): Promise<RePoeCacheManifest> {
    const raw = await fs
      .readFile(this.getManifestPath(), "utf8")
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return "";
        }
        throw error;
      });

    if (!raw.trim()) {
      return createEmptyRePoeCacheManifest();
    }

    return JSON.parse(raw) as RePoeCacheManifest;
  }

  async writeManifest(manifest: RePoeCacheManifest): Promise<void> {
    await fs.mkdir(this.getRoot(), { recursive: true });
    await fs.writeFile(
      this.getManifestPath(),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  async readJsonResource(
    locale: RePoeLocale,
    resourcePath: string,
  ): Promise<unknown | null> {
    const safePath = assertSafeRelativePath(resourcePath);
    const raw = await fs
      .readFile(path.join(this.getLocaleRoot(locale), safePath), "utf8")
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return "";
        }
        throw error;
      });

    return raw.trim() ? JSON.parse(raw) : null;
  }

  async writeJsonResource(
    resource: RePoeFetchedJsonResource,
  ): Promise<RePoeCacheManifest> {
    const safePath = assertSafeRelativePath(resource.path);
    const outputPath = path.join(this.getLocaleRoot(resource.locale), safePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(
      outputPath,
      `${JSON.stringify(resource.json, null, 2)}\n`,
      "utf8",
    );

    const manifest = await this.readManifest();
    const localeMetadata = this.ensureLocaleMetadata(manifest, resource.locale);
    localeMetadata.cached_at = this.now();
    localeMetadata.resources[resource.path] = {
      cached_at: localeMetadata.cached_at,
      etag: resource.etag,
      last_modified: resource.lastModified,
    };
    await this.writeManifest(manifest);
    return manifest;
  }

  async updateLocaleMetadata(
    locale: RePoeLocale,
    patch: Partial<
      Omit<RePoeCachedLocaleMetadata, "resources"> & {
        resources: Record<string, RePoeCachedResourceMetadata>;
      }
    >,
  ): Promise<RePoeCacheManifest> {
    const manifest = await this.readManifest();
    const localeMetadata = this.ensureLocaleMetadata(manifest, locale);
    Object.assign(localeMetadata, patch);
    await this.writeManifest(manifest);
    return manifest;
  }

  async markChecked(activeLocale: RePoeLocale): Promise<RePoeCacheManifest> {
    const manifest = await this.readManifest();
    manifest.last_check_timestamp = this.now();
    manifest.active_locale = activeLocale;
    await this.writeManifest(manifest);
    return manifest;
  }

  private ensureLocaleMetadata(
    manifest: RePoeCacheManifest,
    locale: RePoeLocale,
  ): RePoeCachedLocaleMetadata {
    const existing = manifest.cached_locales[locale];
    if (existing) {
      return existing;
    }

    const created: RePoeCachedLocaleMetadata = {
      cached_at: 0,
      tree_version: null,
      version_file_etag: null,
      version_file_last_modified: null,
      resources: {},
    };
    manifest.cached_locales[locale] = created;
    return created;
  }
}

export const repoeCache = new RePoeCache();

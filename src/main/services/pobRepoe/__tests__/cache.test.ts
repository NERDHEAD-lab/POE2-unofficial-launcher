import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RePoeCache, REPOE_CACHE_MANIFEST_FILE } from "../cache";

let tempRoot: string;

describe("RePoeCache", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-repoe-cache-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("returns an empty manifest when no cache exists", async () => {
    const cache = new RePoeCache({ root: tempRoot });

    await expect(cache.readManifest()).resolves.toEqual({
      last_check_timestamp: 0,
      active_locale: "ko",
      cached_locales: {},
    });
  });

  it("writes and reads the cache manifest", async () => {
    const cache = new RePoeCache({ root: tempRoot });
    await cache.writeManifest({
      last_check_timestamp: 1779774000,
      active_locale: "ko",
      cached_locales: {
        ko: {
          cached_at: 1779770000,
          tree_version: "4.4.0.14",
          version_file_etag: '"version"',
          version_file_last_modified: "Thu, 28 May 2026 00:00:00 GMT",
          resources: {},
        },
      },
    });

    await expect(cache.readManifest()).resolves.toMatchObject({
      last_check_timestamp: 1779774000,
      active_locale: "ko",
      cached_locales: {
        ko: {
          tree_version: "4.4.0.14",
          version_file_etag: '"version"',
        },
      },
    });
    await expect(
      fs.stat(path.join(tempRoot, REPOE_CACHE_MANIFEST_FILE)),
    ).resolves.toBeTruthy();
  });

  it("writes JSON resources under the locale directory and updates metadata", async () => {
    const cache = new RePoeCache({ root: tempRoot, now: () => 1779774000 });

    const manifest = await cache.writeJsonResource({
      id: "ko:passive_skill_trees/Default.json",
      locale: "ko",
      path: "passive_skill_trees/Default.json",
      url: "https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json",
      json: { passives: { "4": { name: "Shock Chance" } } },
      etag: '"tree"',
      lastModified: "Thu, 28 May 2026 00:00:00 GMT",
    });

    await expect(
      cache.readJsonResource("ko", "passive_skill_trees/Default.json"),
    ).resolves.toEqual({ passives: { "4": { name: "Shock Chance" } } });
    expect(manifest.cached_locales.ko?.resources).toMatchObject({
      "passive_skill_trees/Default.json": {
        cached_at: 1779774000,
        etag: '"tree"',
        last_modified: "Thu, 28 May 2026 00:00:00 GMT",
      },
    });
  });

  it("returns null for missing JSON resources", async () => {
    const cache = new RePoeCache({ root: tempRoot });

    await expect(cache.readJsonResource("en", "missing.json")).resolves.toBe(
      null,
    );
  });

  it("rejects unsafe resource paths", async () => {
    const cache = new RePoeCache({ root: tempRoot });

    await expect(
      cache.readJsonResource("ko", "../secret.json"),
    ).rejects.toThrow("Unsafe RePoE cache resource path: ../secret.json");
    await expect(
      cache.writeJsonResource({
        id: "ko:../secret.json",
        locale: "ko",
        path: "../secret.json",
        url: "https://repoe-fork.github.io/poe2/Korean/../secret.json",
        json: {},
        etag: null,
        lastModified: null,
      }),
    ).rejects.toThrow("Unsafe RePoE cache resource path: ../secret.json");
  });

  it("updates locale metadata without removing resource metadata", async () => {
    const cache = new RePoeCache({ root: tempRoot, now: () => 1779774000 });
    await cache.writeJsonResource({
      id: "en:skills.json",
      locale: "en",
      path: "skills.json",
      url: "https://repoe-fork.github.io/poe2/skills.json",
      json: { skills: {} },
      etag: '"skills"',
      lastModified: null,
    });

    const manifest = await cache.updateLocaleMetadata("en", {
      tree_version: "4.4.0.14",
      version_file_etag: '"version"',
      version_file_last_modified: "Thu, 28 May 2026 00:00:00 GMT",
    });

    expect(manifest.cached_locales.en).toMatchObject({
      cached_at: 1779774000,
      tree_version: "4.4.0.14",
      version_file_etag: '"version"',
      resources: {
        "skills.json": {
          etag: '"skills"',
        },
      },
    });
  });

  it("marks a cache check timestamp and active locale", async () => {
    const cache = new RePoeCache({ root: tempRoot, now: () => 1779774000 });

    await expect(cache.markChecked("en")).resolves.toMatchObject({
      last_check_timestamp: 1779774000,
      active_locale: "en",
    });
  });
});

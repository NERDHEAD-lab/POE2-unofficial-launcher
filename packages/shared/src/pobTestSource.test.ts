import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPobTestSourceAvailable,
  POB_INSTALL_LOCATION_ENV,
  POB_SOURCE_REQUIRED_ENV,
  POB_SOURCE_SENTINEL,
  resolvePobTestSource,
  shouldRunPobSourceTest,
} from "./pobTestSource";

const sentinel = (root: string) => path.join(root, POB_SOURCE_SENTINEL);

describe("resolvePobTestSource", () => {
  it("uses POB_INSTALL_LOCATION when that source tree is available", () => {
    const envSource = path.resolve("env-pob", "src");
    const cacheSource = path.resolve(".cache", "pob-source", "src");
    const resolved = resolvePobTestSource({
      env: { [POB_INSTALL_LOCATION_ENV]: envSource },
      cacheSourceRoot: cacheSource,
      exists: (targetPath) => targetPath === sentinel(envSource),
    });

    expect(resolved.sourceRoot).toBe(envSource);
    expect(resolved.sourceAvailable).toBe(true);
  });

  it("uses the gitignored cache before the legacy local checkout", () => {
    const cacheSource = path.resolve(".cache", "pob-source", "src");
    const legacySource = path.resolve("legacy-pob", "src");
    const resolved = resolvePobTestSource({
      env: {},
      cacheSourceRoot: cacheSource,
      legacySourceRoot: legacySource,
      exists: (targetPath) => targetPath === sentinel(cacheSource),
    });

    expect(resolved.sourceRoot).toBe(cacheSource);
    expect(resolved.searchedRoots).toEqual([cacheSource, legacySource]);
  });

  it("lets CI fail instead of skipping when PoB source is required", () => {
    const cacheSource = path.resolve(".cache", "pob-source", "src");
    const legacySource = path.resolve("legacy-pob", "src");
    const resolved = resolvePobTestSource({
      env: { [POB_SOURCE_REQUIRED_ENV]: "1" },
      cacheSourceRoot: cacheSource,
      legacySourceRoot: legacySource,
      exists: () => false,
    });

    expect(resolved.sourceAvailable).toBe(false);
    expect(shouldRunPobSourceTest(resolved)).toBe(true);
    expect(() => assertPobTestSourceAvailable(resolved)).toThrow(
      /npm run pob:source:prepare/,
    );
  });
});

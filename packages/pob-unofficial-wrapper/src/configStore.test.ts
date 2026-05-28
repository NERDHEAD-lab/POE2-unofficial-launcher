import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_POB_SETTINGS } from "@poe2-launcher/shared/pobSettings";

import {
  createJsonPobWrapperConfigStore,
  getPobInstallEntry,
  getPobSettings,
  getPobWrapperState,
  normalizePobWrapperConfig,
  setPobInstallEntry,
  setPobSettings,
  setPobWrapperLastLocation,
} from "./configStore";

describe("pob-unofficial-wrapper config store", () => {
  it("normalizes settings, install entries, and wrapper state", () => {
    const config = normalizePobWrapperConfig({
      pob: {
        poe1: { installLocation: "C:\\PoB1", source: "manual" },
        poe2: { installLocation: 123, source: "manual" },
        settings: { autosaveDrafts: true, vaultGenerationLimit: 99 },
      },
      pobWrapper: {
        lastLocation: {
          game: "POE2",
          subPath: "Ranger",
          buildName: "Imported Build2",
          buildMode: "CALCS",
        },
      },
    });

    expect(config.pob?.poe1).toEqual({
      installLocation: "C:\\PoB1",
      source: "manual",
    });
    expect(config.pob?.poe2).toBeUndefined();
    expect(config.pob?.settings).toEqual({
      ...DEFAULT_POB_SETTINGS,
      autosaveDrafts: true,
      vaultGenerationLimit: 5,
    });
    expect(config.pobWrapper?.lastLocation?.buildMode).toBe("CALCS");
  });

  it("persists pob settings and per-game install entries in wrapper config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pob-wrapper-"));
    const store = createJsonPobWrapperConfigStore(
      path.join(dir, "config.json"),
    );

    expect(await getPobSettings(store)).toEqual(DEFAULT_POB_SETTINGS);

    const settings = await setPobSettings(store, {
      sidebarCollapsed: true,
      vaultGenerationLimit: 3,
    });
    await setPobInstallEntry(store, "POE2", {
      installLocation: "D:\\PoB2",
      source: "HKCU",
    });

    expect(settings).toEqual({
      ...DEFAULT_POB_SETTINGS,
      sidebarCollapsed: true,
      vaultGenerationLimit: 3,
    });
    expect(await getPobInstallEntry(store, "POE2")).toEqual({
      installLocation: "D:\\PoB2",
      source: "HKCU",
    });
  });

  it("persists the wrapper last build and component location", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pob-wrapper-"));
    const store = createJsonPobWrapperConfigStore(
      path.join(dir, "config.json"),
    );

    await setPobWrapperLastLocation(store, {
      game: "POE2",
      subPath: "Mercenary",
      buildName: "Imported Build2",
      buildMode: "ITEMS",
    });

    expect(await getPobWrapperState(store)).toEqual({
      lastLocation: {
        game: "POE2",
        subPath: "Mercenary",
        buildName: "Imported Build2",
        buildMode: "ITEMS",
      },
    });

    await setPobWrapperLastLocation(store, null);

    expect(await getPobWrapperState(store)).toEqual({ lastLocation: null });
  });
});

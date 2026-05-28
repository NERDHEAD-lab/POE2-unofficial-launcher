import { describe, expect, it, vi } from "vitest";

import type { PobGame, PobInstallEntry } from "@poe2-launcher/shared/types";

import {
  getPobInstallEntry,
  type PobWrapperConfig,
  type PobWrapperConfigStore,
} from "./configStore";
import { createPobWrapperInstallLocationService } from "./installLocation";

const createMemoryStore = (
  initial: PobWrapperConfig = {},
): PobWrapperConfigStore => {
  let current = initial;
  return {
    read: async () => current,
    write: async (next) => {
      current = next;
    },
  };
};

const createVerifier =
  (...validPaths: string[]) =>
  async (installLocation: string) => ({
    ok: validPaths.includes(installLocation),
    missing: validPaths.includes(installLocation) ? [] : ["Modules/Build.lua"],
  });

describe("pob-unofficial-wrapper install location service", () => {
  it("uses a valid stored location before registry detection", async () => {
    const store = createMemoryStore({
      pob: {
        poe2: { installLocation: "D:\\PoB2", source: "manual" },
      },
    });
    const detect = vi.fn();
    const service = createPobWrapperInstallLocationService({
      store,
      detectInstallLocation: detect,
      verifyInstallation: createVerifier("D:\\PoB2"),
    });

    await expect(service.resolve("POE2")).resolves.toEqual({
      installLocation: "D:\\PoB2",
      source: null,
    });
    expect(detect).not.toHaveBeenCalled();
  });

  it("clears an invalid stored location and returns verified detected location", async () => {
    const store = createMemoryStore({
      pob: {
        poe2: { installLocation: "D:\\Broken", source: "manual" },
      },
    });
    const service = createPobWrapperInstallLocationService({
      store,
      detectInstallLocation: async (game: PobGame) => ({
        installLocation: game === "POE2" ? "D:\\DetectedPoB2" : null,
        source: game === "POE2" ? "HKCU" : null,
      }),
      verifyInstallation: createVerifier("D:\\DetectedPoB2"),
    });

    await expect(service.resolve("POE2")).resolves.toEqual({
      installLocation: "D:\\DetectedPoB2",
      source: "HKCU",
    });
    await expect(getPobInstallEntry(store, "POE2")).resolves.toBeUndefined();
  });

  it("does not return unverified registry locations", async () => {
    const store = createMemoryStore();
    const service = createPobWrapperInstallLocationService({
      store,
      detectInstallLocation: async () => ({
        installLocation: "D:\\Broken",
        source: "HKLM",
      }),
      verifyInstallation: createVerifier("D:\\Other"),
    });

    await expect(service.detect("POE2")).resolves.toEqual({
      installLocation: null,
      source: null,
    });
  });

  it("validates manual and detected saves before writing config", async () => {
    const store = createMemoryStore();
    const service = createPobWrapperInstallLocationService({
      store,
      verifyInstallation: createVerifier("D:\\PoB2"),
    });

    await expect(
      service.saveManual("POE2", "D:\\Broken"),
    ).resolves.toMatchObject({
      status: "invalid",
      path: "D:\\Broken",
    });
    await expect(service.saveManual("POE2", "D:\\PoB2")).resolves.toEqual({
      status: "ok",
      path: "D:\\PoB2",
    });
    await expect(getPobInstallEntry(store, "POE2")).resolves.toEqual({
      installLocation: "D:\\PoB2",
      source: "manual",
    } satisfies PobInstallEntry);

    await expect(
      service.confirmDetected({
        game: "POE2",
        installLocation: "D:\\PoB2",
        source: "HKLM",
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(getPobInstallEntry(store, "POE2")).resolves.toEqual({
      installLocation: "D:\\PoB2",
      source: "HKLM",
    } satisfies PobInstallEntry);
  });
});

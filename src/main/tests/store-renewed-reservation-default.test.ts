import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Conf from "conf";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../shared/config";

import type { AppConfig } from "../../shared/types";

describe("renewedPatchReservations store default", () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  });

  it("preserves existing values while adding the new default key", async () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "poe2-launcher-store-"));
    const userData = path.join(tempRoot, "POE2 Unofficial Launcher");
    mkdirSync(userData, { recursive: true });
    const configPath = path.join(userData, "config.json");
    const existingReservation = {
      id: "legacy-existing",
      gameId: "POE2",
      serviceId: "Kakao Games",
      targetTime: "2026-07-25T03:00:00.000Z",
      createdAt: "2026-07-24T03:00:00.000Z",
    };
    writeFileSync(
      configPath,
      JSON.stringify({
        patchReservations: [existingReservation],
        silentPatchNotification: true,
      }),
    );

    const store = new Conf<AppConfig>({
      cwd: userData,
      configName: "config",
      defaults: DEFAULT_CONFIG,
    });
    const persisted = JSON.parse(readFileSync(configPath, "utf8")) as Record<
      string,
      unknown
    >;

    expect(store.get("patchReservations")).toEqual([existingReservation]);
    expect(store.get("silentPatchNotification")).toBe(true);
    expect(store.get("renewedPatchReservations")).toEqual([]);
    expect(persisted.patchReservations).toEqual([existingReservation]);
    expect(persisted.silentPatchNotification).toBe(true);
    expect(persisted.renewedPatchReservations).toEqual([]);
  });
});

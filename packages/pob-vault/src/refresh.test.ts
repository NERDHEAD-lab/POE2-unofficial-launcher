import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refreshPobVault } from "./refresh";
import { PoBVault } from "./vault";

import type { PobVaultSmokeTestResult } from "./validator";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
}));

const OK_SMOKE: PobVaultSmokeTestResult = {
  ok: true,
  vaultPath: "",
  steps: [
    {
      id: "ping",
      label: "PoB RPC ping",
      ok: true,
      durationMs: 1,
      detail: null,
    },
    {
      id: "build-dps",
      label: "Fixture build DPS",
      ok: true,
      durationMs: 1,
      detail: null,
    },
    {
      id: "xml-roundtrip",
      label: "XML export roundtrip",
      ok: true,
      durationMs: 1,
      detail: null,
    },
    {
      id: "build-code-decode",
      label: "Build code inflate",
      ok: true,
      durationMs: 1,
      detail: null,
    },
  ],
};

let tempRoot: string;

const writeFakePobInstall = async (
  installRoot: string,
  version: string,
): Promise<void> => {
  await fs.mkdir(path.join(installRoot, "Modules"), { recursive: true });
  await fs.writeFile(
    path.join(installRoot, "manifest.xml"),
    `<PoBVersion><Version number="${version}" /></PoBVersion>`,
  );
  await fs.writeFile(path.join(installRoot, "Modules", "Build.lua"), "");
};

describe("refreshPobVault", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-refresh-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("respects auto-update off unless the request is forced", async () => {
    const oldInstall = path.join(tempRoot, "old-install");
    const newInstall = path.join(tempRoot, "new-install");
    const vault = new PoBVault({ root: path.join(tempRoot, "vault") });
    await writeFakePobInstall(oldInstall, "0.16.0");
    await writeFakePobInstall(newInstall, "0.17.0");
    await vault.promote(await vault.stage(oldInstall), { generationLimit: 5 });
    const runSmokeTest = vi.fn(async () => OK_SMOKE);

    const deferred = await refreshPobVault({
      installLocation: newInstall,
      settings: { autoVaultUpdate: false, vaultGenerationLimit: 2 },
      vault,
      validator: { runSmokeTest },
    });
    expect(deferred.status).toBe("update-available");
    expect(runSmokeTest).not.toHaveBeenCalled();

    const forced = await refreshPobVault({
      installLocation: newInstall,
      settings: { autoVaultUpdate: false, vaultGenerationLimit: 2 },
      force: true,
      vault,
      validator: { runSmokeTest },
    });
    expect(forced.status).toBe("promoted");
    expect(runSmokeTest).toHaveBeenCalledOnce();
  });

  it("rejects refresh when PoB install path is not configured", async () => {
    await expect(
      refreshPobVault({
        installLocation: null,
        settings: { autoVaultUpdate: true, vaultGenerationLimit: 2 },
        vault: new PoBVault({ root: path.join(tempRoot, "vault") }),
        validator: { runSmokeTest: vi.fn(async () => OK_SMOKE) },
      }),
    ).rejects.toThrow("PoB install location is not configured");
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readVaultMetadata } from "./metadata";
import { PobVaultUpdateFlow } from "./updateFlow";
import { PoBVault } from "./vault";

import type { PobVaultSmokeTestResult } from "./validator";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
  BrowserWindow: {
    fromWebContents: () => null,
  },
  ipcMain: {
    handle: vi.fn(),
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

const FAIL_SMOKE: PobVaultSmokeTestResult = {
  ok: false,
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
      ok: false,
      durationMs: 1,
      detail: "Main skill DPS drifted",
    },
  ],
};

let tempRoot: string;

const writeFakePobInstall = async (
  installRoot: string,
  version: string | null,
): Promise<void> => {
  await fs.mkdir(path.join(installRoot, "Modules"), { recursive: true });
  if (version) {
    await fs.writeFile(
      path.join(installRoot, "manifest.xml"),
      `<PoBVersion><Version number="${version}" /></PoBVersion>`,
    );
  }
  await fs.writeFile(path.join(installRoot, "Modules", "Build.lua"), "");
  await fs.writeFile(
    path.join(installRoot, "Path of Building-PoE2.exe"),
    "pob",
  );
};

const listStagingDirs = async (vaultRoot: string): Promise<string[]> =>
  fs
    .readdir(vaultRoot)
    .then((entries) => entries.filter((entry) => entry.startsWith(".staging-")))
    .catch(() => []);

describe("PobVaultUpdateFlow", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-update-flow-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("skips staging and smoke test when the active vault already matches the install version", async () => {
    const installRoot = path.join(tempRoot, "install");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(installRoot, "0.16.0");
    const vault = new PoBVault({ root: vaultRoot });
    await vault.promote(await vault.stage(installRoot), {
      generationLimit: 5,
    });
    const runSmokeTest = vi.fn(async () => OK_SMOKE);

    const result = await new PobVaultUpdateFlow({
      vault,
      validator: { runSmokeTest },
    }).run(installRoot);

    expect(result.status).toBe("up-to-date");
    expect(result.active?.version).toBe("0.16.0");
    expect(runSmokeTest).not.toHaveBeenCalled();
    await expect(listStagingDirs(vaultRoot)).resolves.toEqual([]);
  });

  it("reports an update without staging when automatic updates are disabled", async () => {
    const oldInstallRoot = path.join(tempRoot, "install-old");
    const newInstallRoot = path.join(tempRoot, "install-new");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(oldInstallRoot, "0.16.0");
    await writeFakePobInstall(newInstallRoot, "0.17.0");
    const vault = new PoBVault({ root: vaultRoot });
    await vault.promote(await vault.stage(oldInstallRoot), {
      generationLimit: 5,
    });
    const runSmokeTest = vi.fn(async () => OK_SMOKE);

    const result = await new PobVaultUpdateFlow({
      vault,
      validator: { runSmokeTest },
    }).run(newInstallRoot, { autoUpdate: false });

    expect(result.status).toBe("update-available");
    expect(result.installVersion.version).toBe("0.17.0");
    expect(result.active?.version).toBe("0.16.0");
    expect(runSmokeTest).not.toHaveBeenCalled();
    await expect(fs.stat(path.join(vaultRoot, "0.17.0"))).rejects.toThrow();
  });

  it("promotes a staged install only after smoke test passes", async () => {
    const installRoot = path.join(tempRoot, "install");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(installRoot, "0.17.0");
    const vault = new PoBVault({ root: vaultRoot });
    const smokeTestPassedAt = "2026-05-28T00:00:00.000Z";

    const result = await new PobVaultUpdateFlow({
      vault,
      validator: { runSmokeTest: vi.fn(async () => OK_SMOKE) },
      now: () => smokeTestPassedAt,
    }).run(installRoot);

    expect(result.status).toBe("promoted");
    expect(result.promoted).toEqual({
      version: "0.17.0",
      vaultPath: path.join(vaultRoot, "0.17.0"),
    });
    await expect(vault.getActive()).resolves.toMatchObject({
      version: "0.17.0",
    });
    await expect(
      readVaultMetadata(path.join(vaultRoot, "0.17.0")),
    ).resolves.toMatchObject({ smokeTestPassedAt });
    await expect(listStagingDirs(vaultRoot)).resolves.toEqual([]);
  });

  it("discards staging and keeps the previous active vault when smoke test fails", async () => {
    const oldInstallRoot = path.join(tempRoot, "install-old");
    const newInstallRoot = path.join(tempRoot, "install-new");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(oldInstallRoot, "0.16.0");
    await writeFakePobInstall(newInstallRoot, "0.17.0");
    const vault = new PoBVault({ root: vaultRoot });
    await vault.promote(await vault.stage(oldInstallRoot), {
      generationLimit: 5,
    });

    const result = await new PobVaultUpdateFlow({
      vault,
      validator: { runSmokeTest: vi.fn(async () => FAIL_SMOKE) },
    }).run(newInstallRoot);

    expect(result.status).toBe("fallback");
    expect(result.error).toBe("Main skill DPS drifted");
    expect(result.active?.version).toBe("0.16.0");
    await expect(vault.getActive()).resolves.toMatchObject({
      version: "0.16.0",
    });
    await expect(fs.stat(path.join(vaultRoot, "0.17.0"))).rejects.toThrow();
    await expect(listStagingDirs(vaultRoot)).resolves.toEqual([]);
  });

  it("uses executable fallback versions consistently when manifest.xml is missing", async () => {
    const installRoot = path.join(tempRoot, "install");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(installRoot, null);
    const vault = new PoBVault({ root: vaultRoot });

    const result = await new PobVaultUpdateFlow({
      vault,
      validator: { runSmokeTest: vi.fn(async () => OK_SMOKE) },
      now: () => "2026-05-28T00:00:00.000Z",
    }).run(installRoot);

    expect(result.status).toBe("promoted");
    expect(result.installVersion.source).toBe("executable");
    expect(result.installVersion.version).toMatch(/^exe-\d+-3$/);
    expect(result.active?.version).toBe(result.installVersion.version);
    await expect(vault.getActive()).resolves.toMatchObject({
      version: result.installVersion.version,
    });
    await expect(fs.stat(path.join(vaultRoot, "unknown"))).rejects.toThrow();
  });
});

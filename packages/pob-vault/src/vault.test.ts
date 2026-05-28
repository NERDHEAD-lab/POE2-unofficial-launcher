import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readVaultMetadata } from "./metadata";
import { readPobVersion } from "./snapshot";
import { PoBVault } from "./vault";

let tempRoot: string;

const writeFakePobInstall = async (
  installRoot: string,
  version = "0.15.0",
): Promise<void> => {
  await fs.mkdir(path.join(installRoot, "Modules"), { recursive: true });
  await fs.writeFile(
    path.join(installRoot, "manifest.xml"),
    `<PoBVersion><Version number="${version}" branch="release" platform="win32"/></PoBVersion>`,
  );
  await fs.writeFile(path.join(installRoot, "Modules", "Build.lua"), "");
};

describe("PoBVault", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-vault-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("reads the version from manifest.xml", async () => {
    const installRoot = path.join(tempRoot, "install");
    await writeFakePobInstall(installRoot, "0.16.1");

    await expect(readPobVersion(installRoot)).resolves.toBe("0.16.1");
  });

  it("copies an install snapshot and promotes it as active", async () => {
    const installRoot = path.join(tempRoot, "install");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(installRoot);

    const vault = new PoBVault({ root: vaultRoot });
    const snapshot = await vault.ensureSnapshot(installRoot);

    expect(snapshot.version).toBe("0.15.0");
    await expect(
      fs.stat(path.join(snapshot.vaultPath, "Modules", "Build.lua")),
    ).resolves.toBeTruthy();
    await expect(vault.getActive()).resolves.toEqual(snapshot);

    const metadata = await readVaultMetadata(snapshot.vaultPath);
    expect(metadata).toMatchObject({
      version: "0.15.0",
      sourceInstallLocation: installRoot,
      smokeTestPassedAt: null,
      hash: null,
    });
  });

  it("stages an install snapshot without changing the active generation", async () => {
    const installRoot = path.join(tempRoot, "install");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(installRoot, "0.16.0");

    const vault = new PoBVault({ root: vaultRoot });
    const staged = await vault.stage(installRoot);

    expect(staged.version).toBe("0.16.0");
    await expect(
      fs.stat(path.join(staged.stagingPath, "Modules", "Build.lua")),
    ).resolves.toBeTruthy();
    await expect(vault.getActive()).resolves.toBeNull();
    await expect(fs.stat(path.join(vaultRoot, "0.16.0"))).rejects.toThrow();
  });

  it("promotes a staged snapshot with smoke-test metadata", async () => {
    const installRoot = path.join(tempRoot, "install");
    const vaultRoot = path.join(tempRoot, "vault");
    await writeFakePobInstall(installRoot, "0.16.0");

    const vault = new PoBVault({ root: vaultRoot });
    const staged = await vault.stage(installRoot);
    const smokeTestPassedAt = "2026-05-28T00:00:00.000Z";

    const promoted = await vault.promote(staged, { smokeTestPassedAt });

    expect(promoted).toEqual({
      version: "0.16.0",
      vaultPath: path.join(vaultRoot, "0.16.0"),
    });
    await expect(vault.getActive()).resolves.toEqual(promoted);
    await expect(fs.stat(staged.stagingPath)).rejects.toThrow();
    await expect(readVaultMetadata(promoted.vaultPath)).resolves.toMatchObject({
      version: "0.16.0",
      sourceInstallLocation: installRoot,
      smokeTestPassedAt,
    });
  });

  it("rolls back to the newest non-active generation", async () => {
    const vaultRoot = path.join(tempRoot, "vault");
    const vault = new PoBVault({ root: vaultRoot });
    const installA = path.join(tempRoot, "install-a");
    const installB = path.join(tempRoot, "install-b");
    await writeFakePobInstall(installA, "0.16.0");
    await writeFakePobInstall(installB, "0.17.0");

    await vault.promote(await vault.stage(installA), {
      smokeTestPassedAt: "2026-05-28T00:00:00.000Z",
      generationLimit: 5,
    });
    await vault.promote(await vault.stage(installB), {
      smokeTestPassedAt: "2026-05-29T00:00:00.000Z",
      generationLimit: 5,
    });

    await expect(vault.rollback()).resolves.toMatchObject({
      version: "0.16.0",
    });
    await expect(vault.getActive()).resolves.toMatchObject({
      version: "0.16.0",
    });
  });

  it("prunes the oldest non-active generations while preserving active", async () => {
    const vaultRoot = path.join(tempRoot, "vault");
    const vault = new PoBVault({ root: vaultRoot });
    const smokeTestPassedAtByVersion = {
      "0.15.0": "2026-05-26T00:00:00.000Z",
      "0.16.0": "2026-05-27T00:00:00.000Z",
      "0.17.0": "2026-05-28T00:00:00.000Z",
    } as const;

    for (const version of Object.keys(smokeTestPassedAtByVersion) as Array<
      keyof typeof smokeTestPassedAtByVersion
    >) {
      const installRoot = path.join(tempRoot, `install-${version}`);
      await writeFakePobInstall(installRoot, version);
      await vault.promote(await vault.stage(installRoot), {
        smokeTestPassedAt: smokeTestPassedAtByVersion[version],
        generationLimit: 5,
      });
    }

    await vault.pruneOldest(2);

    const generations = await vault.listGenerations();
    expect(generations.map((generation) => generation.version)).toEqual([
      "0.17.0",
      "0.16.0",
    ]);
    await expect(vault.getActive()).resolves.toMatchObject({
      version: "0.17.0",
    });
    await expect(fs.stat(path.join(vaultRoot, "0.15.0"))).rejects.toThrow();
  });
});

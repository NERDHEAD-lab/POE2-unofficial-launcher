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
});

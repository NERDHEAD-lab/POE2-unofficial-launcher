import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import { readVaultMetadata } from "./metadata";
import { createSnapshot, readPobVersion } from "./snapshot";

const ACTIVE_FILE = "active.txt";

export interface PobVaultEntry {
  version: string;
  vaultPath: string;
}

export interface PoBVaultOptions {
  root?: string;
}

export class PoBVault {
  private readonly root?: string;

  constructor(options: PoBVaultOptions = {}) {
    this.root = options.root;
  }

  getRoot(): string {
    return this.root ?? path.join(app.getPath("userData"), "pob-vault");
  }

  async getActive(): Promise<PobVaultEntry | null> {
    const root = this.getRoot();
    const version = await fs
      .readFile(path.join(root, ACTIVE_FILE), "utf8")
      .then((raw) => raw.trim())
      .catch(() => "");
    if (!version) return null;

    const vaultPath = path.join(root, version);
    const stat = await fs.stat(vaultPath).catch(() => null);
    return stat?.isDirectory() ? { version, vaultPath } : null;
  }

  async ensureSnapshot(installLocation: string): Promise<PobVaultEntry> {
    const root = this.getRoot();
    const version = await readPobVersion(installLocation);
    const vaultPath = path.join(root, version);
    const existing = await readVaultMetadata(vaultPath);
    if (existing) {
      await this.promote(version);
      return { version, vaultPath };
    }

    const snapshot = await createSnapshot({
      installLocation,
      vaultRoot: root,
      version,
    });
    await this.promote(snapshot.version);
    return { version: snapshot.version, vaultPath: snapshot.vaultPath };
  }

  async promote(version: string): Promise<void> {
    const root = this.getRoot();
    const vaultPath = path.join(root, version);
    const stat = await fs.stat(vaultPath);
    if (!stat.isDirectory()) {
      throw new Error(`PoB vault version is not a directory: ${version}`);
    }
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, ACTIVE_FILE), `${version}\n`);
  }
}

export const pobVault = new PoBVault();

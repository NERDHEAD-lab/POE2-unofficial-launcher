import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import {
  PobVaultMetadata,
  readVaultMetadata,
  writeVaultMetadata,
} from "./metadata";
import { createSnapshot, readPobVersion, stageSnapshot } from "./snapshot";

const ACTIVE_FILE = "active.txt";
const DEFAULT_GENERATION_LIMIT = 2;

export interface PobVaultEntry {
  version: string;
  vaultPath: string;
}

export interface PobVaultStagedEntry {
  version: string;
  stagingPath: string;
  metadata: PobVaultMetadata;
}

export interface PobVaultGeneration extends PobVaultEntry {
  metadata: PobVaultMetadata | null;
  sizeBytes: number;
}

export interface PoBVaultOptions {
  root?: string;
}

export interface PobVaultPromoteOptions {
  smokeTestPassedAt?: string;
  generationLimit?: number;
}

const clampGenerationLimit = (limit: number): number =>
  Math.min(5, Math.max(1, Math.trunc(limit)));

const directorySize = async (dir: string): Promise<number> => {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(fullPath);
    } else if (entry.isFile()) {
      total += await fs.stat(fullPath).then((stat) => stat.size);
    }
  }
  return total;
};

const generationTime = (generation: PobVaultGeneration): number => {
  const timestamp =
    generation.metadata?.smokeTestPassedAt ?? generation.metadata?.copiedAt;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

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

  async stage(
    installLocation: string,
    versionOverride?: string,
  ): Promise<PobVaultStagedEntry> {
    const root = this.getRoot();
    const version = versionOverride ?? (await readPobVersion(installLocation));
    const snapshot = await stageSnapshot({
      installLocation,
      vaultRoot: root,
      version,
    });
    return {
      version: snapshot.version,
      stagingPath: snapshot.stagingPath,
      metadata: snapshot.metadata,
    };
  }

  async promote(
    target: string | PobVaultStagedEntry,
    options: PobVaultPromoteOptions = {},
  ): Promise<PobVaultEntry> {
    const root = this.getRoot();
    const version = typeof target === "string" ? target : target.version;
    const vaultPath = path.join(root, version);
    if (typeof target !== "string") {
      await fs.rm(vaultPath, { recursive: true, force: true });
      await fs.rename(target.stagingPath, vaultPath);
      await writeVaultMetadata(vaultPath, {
        ...target.metadata,
        smokeTestPassedAt:
          options.smokeTestPassedAt ?? new Date().toISOString(),
      });
    }

    const stat = await fs.stat(vaultPath);
    if (!stat.isDirectory()) {
      throw new Error(`PoB vault version is not a directory: ${version}`);
    }
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, ACTIVE_FILE), `${version}\n`);
    await this.pruneOldest(options.generationLimit ?? DEFAULT_GENERATION_LIMIT);
    return { version, vaultPath };
  }

  async rollback(): Promise<PobVaultEntry | null> {
    const active = await this.getActive();
    const generations = await this.listGenerations();
    const candidate = generations
      .filter((generation) => generation.version !== active?.version)
      .sort((left, right) => generationTime(right) - generationTime(left))[0];
    if (!candidate) return active;
    return this.promote(candidate.version);
  }

  async listGenerations(): Promise<PobVaultGeneration[]> {
    const root = this.getRoot();
    const entries = await fs
      .readdir(root, { withFileTypes: true })
      .catch(() => []);
    const generations = await Promise.all(
      entries
        .filter(
          (entry) => entry.isDirectory() && !entry.name.startsWith(".staging-"),
        )
        .map(async (entry) => {
          const vaultPath = path.join(root, entry.name);
          return {
            version: entry.name,
            vaultPath,
            metadata: await readVaultMetadata(vaultPath),
            sizeBytes: await directorySize(vaultPath),
          };
        }),
    );
    return generations.sort(
      (left, right) => generationTime(right) - generationTime(left),
    );
  }

  async pruneOldest(maxGenerations = DEFAULT_GENERATION_LIMIT): Promise<void> {
    const limit = clampGenerationLimit(maxGenerations);
    const active = await this.getActive();
    const generations = await this.listGenerations();
    if (generations.length <= limit) return;

    const removable = generations
      .filter((generation) => generation.version !== active?.version)
      .sort((left, right) => generationTime(left) - generationTime(right));
    let count = generations.length;
    for (const generation of removable) {
      if (count <= limit) break;
      await fs.rm(generation.vaultPath, { recursive: true, force: true });
      count -= 1;
    }
  }
}

export const pobVault = new PoBVault();

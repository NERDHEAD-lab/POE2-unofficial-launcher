import fs from "node:fs/promises";
import path from "node:path";

import { PobVaultMetadata, writeVaultMetadata } from "./metadata";

const VERSION_FALLBACK = "unknown";
const INVALID_VERSION_PATH_CHARS = new Set([
  "<",
  ">",
  ":",
  '"',
  "/",
  "\\",
  "|",
  "?",
  "*",
]);

const sanitizeVersion = (version: string): string => {
  const safe = Array.from(version.trim(), (char) =>
    INVALID_VERSION_PATH_CHARS.has(char) || char.charCodeAt(0) < 32
      ? "_"
      : char,
  ).join("");
  return safe || VERSION_FALLBACK;
};

export const readPobVersion = async (
  installLocation: string,
): Promise<string> => {
  const manifestPath = path.join(installLocation, "manifest.xml");
  const manifest = await fs.readFile(manifestPath, "utf8").catch(() => "");
  const match = /\bVersion\b[^>]*\bnumber="([^"]+)"/i.exec(manifest);
  return sanitizeVersion(match?.[1] ?? VERSION_FALLBACK);
};

export interface CreateSnapshotOptions {
  installLocation: string;
  vaultRoot: string;
  version: string;
}

export interface CreateSnapshotResult {
  version: string;
  vaultPath: string;
  metadata: PobVaultMetadata;
}

export const createSnapshot = async ({
  installLocation,
  vaultRoot,
  version,
}: CreateSnapshotOptions): Promise<CreateSnapshotResult> => {
  const vaultPath = path.join(vaultRoot, version);
  const stagingPath = path.join(
    vaultRoot,
    `.staging-${version}-${process.pid}-${Date.now()}`,
  );

  await fs.rm(stagingPath, { recursive: true, force: true });
  await fs.mkdir(vaultRoot, { recursive: true });
  await fs.cp(installLocation, stagingPath, { recursive: true });

  const metadata: PobVaultMetadata = {
    version,
    sourceInstallLocation: installLocation,
    copiedAt: new Date().toISOString(),
    smokeTestPassedAt: null,
    hash: null,
  };
  await writeVaultMetadata(stagingPath, metadata);

  try {
    await fs.rename(stagingPath, vaultPath);
  } catch (err) {
    await fs.rm(stagingPath, { recursive: true, force: true });
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "ENOTEMPTY") throw err;
  }

  return { version, vaultPath, metadata };
};

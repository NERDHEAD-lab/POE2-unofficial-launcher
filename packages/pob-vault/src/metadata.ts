import fs from "node:fs/promises";
import path from "node:path";

export const POB_VAULT_METADATA_FILE = "metadata.json";

export interface PobVaultMetadata {
  version: string;
  sourceInstallLocation: string;
  copiedAt: string;
  smokeTestPassedAt: string | null;
  hash: string | null;
}

export const readVaultMetadata = async (
  vaultPath: string,
): Promise<PobVaultMetadata | null> => {
  try {
    const raw = await fs.readFile(
      path.join(vaultPath, POB_VAULT_METADATA_FILE),
      "utf8",
    );
    return JSON.parse(raw) as PobVaultMetadata;
  } catch {
    return null;
  }
};

export const writeVaultMetadata = async (
  vaultPath: string,
  metadata: PobVaultMetadata,
): Promise<void> => {
  await fs.writeFile(
    path.join(vaultPath, POB_VAULT_METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
};

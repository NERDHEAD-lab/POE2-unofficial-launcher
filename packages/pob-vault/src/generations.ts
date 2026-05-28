import type { PobVaultGenerationSnapshot } from "@poe2-launcher/shared/types";

import type { PoBVault } from "./vault";

export async function getPobVaultGenerations(
  vault: PoBVault,
): Promise<PobVaultGenerationSnapshot[]> {
  const [active, generations] = await Promise.all([
    vault.getActive(),
    vault.listGenerations(),
  ]);

  return generations.map((generation) => ({
    version: generation.version,
    vaultPath: generation.vaultPath,
    sizeBytes: generation.sizeBytes,
    active: generation.version === active?.version,
    copiedAt: generation.metadata?.copiedAt ?? null,
    smokeTestPassedAt: generation.metadata?.smokeTestPassedAt ?? null,
  }));
}

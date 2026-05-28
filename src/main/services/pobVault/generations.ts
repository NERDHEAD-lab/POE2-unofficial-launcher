import type { PoBVault } from "./vault";
import type { PobVaultGenerationSnapshot } from "../../../shared/types";

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

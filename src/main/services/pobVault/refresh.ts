import { createDefaultPobVaultContractValidator } from "./smokeFixture";
import { PobVaultUpdateFlow } from "./updateFlow";
import { pobVault } from "./vault";
import { normalizePobVaultGenerationLimit } from "../../../shared/pobSettings";

import type { PobVaultUpdateResult } from "./updateFlow";
import type { PobVaultSmokeTestResult } from "./validator";
import type { PoBVault } from "./vault";
import type { PobSettings } from "../../../shared/types";

export interface RefreshPobVaultOptions {
  installLocation: string | null;
  settings: Pick<PobSettings, "autoVaultUpdate" | "vaultGenerationLimit">;
  force?: boolean;
  vault?: PoBVault;
  validator?: {
    runSmokeTest(vaultPath: string): Promise<PobVaultSmokeTestResult>;
  };
}

export async function refreshPobVault({
  installLocation,
  settings,
  force = false,
  vault = pobVault,
  validator,
}: RefreshPobVaultOptions): Promise<PobVaultUpdateResult> {
  if (!installLocation) {
    throw new Error("PoB install location is not configured");
  }

  const flow = new PobVaultUpdateFlow({
    vault,
    validator: validator ?? (await createDefaultPobVaultContractValidator()),
  });
  return flow.run(installLocation, {
    autoUpdate: force ? true : settings.autoVaultUpdate,
    generationLimit: normalizePobVaultGenerationLimit(
      settings.vaultGenerationLimit,
    ),
  });
}

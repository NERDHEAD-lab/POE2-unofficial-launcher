import { normalizePobVaultGenerationLimit } from "@poe2-launcher/shared/pobSettings";
import type { PobSettings } from "@poe2-launcher/shared/types";

import { PobVaultUpdateFlow } from "./updateFlow";
import { pobVault } from "./vault";

import type { PobVaultUpdateResult } from "./updateFlow";
import type { PobVaultSmokeTestResult } from "./validator";
import type { PoBVault } from "./vault";

export interface RefreshPobVaultOptions {
  installLocation: string | null;
  settings: Pick<PobSettings, "autoVaultUpdate" | "vaultGenerationLimit">;
  force?: boolean;
  vault?: PoBVault;
  validator: {
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
    validator,
  });
  return flow.run(installLocation, {
    autoUpdate: force ? true : settings.autoVaultUpdate,
    generationLimit: normalizePobVaultGenerationLimit(
      settings.vaultGenerationLimit,
    ),
  });
}

import type {
  PobVaultStatusSnapshot,
  PobVaultStatusState,
} from "@poe2-launcher/shared/types";

import {
  detectPobInstallVersion,
  type PobVaultDetectedVersion,
} from "./validator";
import { PoBVault } from "./vault";

export interface PobVaultStatusOptions {
  vault: PoBVault;
  installLocation: string | null;
  detectVersion?: (installLocation: string) => Promise<PobVaultDetectedVersion>;
  now?: () => string;
}

const resolveStatusState = (
  activeVersion: string | null,
  installVersion: string | null,
): PobVaultStatusState => {
  if (!installVersion) return "not-configured";
  if (!activeVersion) return "uninitialized";
  return activeVersion === installVersion ? "ok" : "fallback";
};

export async function getPobVaultStatus({
  vault,
  installLocation,
  detectVersion = detectPobInstallVersion,
  now = () => new Date().toISOString(),
}: PobVaultStatusOptions): Promise<PobVaultStatusSnapshot> {
  const active = await vault.getActive();
  const installVersion = installLocation
    ? await detectVersion(installLocation)
    : null;

  return {
    state: resolveStatusState(
      active?.version ?? null,
      installVersion?.version ?? null,
    ),
    installLocation,
    installVersion,
    active,
    checkedAt: now(),
  };
}

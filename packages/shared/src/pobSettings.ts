import type { PobSettings } from "./types";

export const POB_VAULT_GENERATION_MIN = 1;
export const POB_VAULT_GENERATION_MAX = 5;

export const DEFAULT_POB_SETTINGS: PobSettings = {
  autosaveDrafts: false,
  sidebarCollapsed: false,
  autoVaultUpdate: true,
  vaultGenerationLimit: 2,
};

export const normalizePobVaultGenerationLimit = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric))
    return DEFAULT_POB_SETTINGS.vaultGenerationLimit;
  return Math.min(
    POB_VAULT_GENERATION_MAX,
    Math.max(POB_VAULT_GENERATION_MIN, Math.trunc(numeric)),
  );
};

export const normalizePobSettings = (
  settings: Partial<PobSettings> | undefined,
): PobSettings => ({
  autosaveDrafts:
    typeof settings?.autosaveDrafts === "boolean"
      ? settings.autosaveDrafts
      : DEFAULT_POB_SETTINGS.autosaveDrafts,
  sidebarCollapsed:
    typeof settings?.sidebarCollapsed === "boolean"
      ? settings.sidebarCollapsed
      : DEFAULT_POB_SETTINGS.sidebarCollapsed,
  autoVaultUpdate:
    typeof settings?.autoVaultUpdate === "boolean"
      ? settings.autoVaultUpdate
      : DEFAULT_POB_SETTINGS.autoVaultUpdate,
  vaultGenerationLimit: normalizePobVaultGenerationLimit(
    settings?.vaultGenerationLimit,
  ),
});

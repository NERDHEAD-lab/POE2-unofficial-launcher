import { setConfigWithEvent } from "./config-utils";
import { normalizeInstallPath } from "../../shared/game-version";
import { AppConfig } from "../../shared/types";
import { AppContext } from "../events/types";

/** Replacing files invalidates full-installation proof; restoring executables
 * alone must never produce that proof. Preserve the last observation. */
export function invalidateInstallationEvidence(
  context: AppContext,
  installPath: string,
) {
  const known = (context.getConfig() as AppConfig).knownGameVersions || {};
  const next = { ...known };
  let changed = false;
  for (const [key, info] of Object.entries(known)) {
    if (
      info.completed &&
      !info.completed.invalidatedAt &&
      normalizeInstallPath(info.completed.installPath) ===
        normalizeInstallPath(installPath)
    ) {
      next[key] = {
        ...info,
        completed: { ...info.completed, invalidatedAt: Date.now() },
      };
      changed = true;
    }
  }
  if (changed) setConfigWithEvent("knownGameVersions", next);
}

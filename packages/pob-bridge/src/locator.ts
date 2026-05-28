import { PobGame } from "@poe2-launcher/shared/types";

export type PobRegistrySource = "HKCU" | "HKLM";

export interface PobInstallLocation {
  installLocation: string | null;
  source: PobRegistrySource | null;
}

export type PobInstallLocator = (game: PobGame) => Promise<PobInstallLocation>;

export const resolvePobInstallLocation = async (
  game: PobGame,
  locator?: PobInstallLocator,
): Promise<PobInstallLocation> =>
  locator
    ? locator(game)
    : {
        installLocation: null,
        source: null,
      };

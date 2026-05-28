import { BrowserWindow, dialog, ipcMain, shell } from "electron";

import type { PobGame } from "@poe2-launcher/shared/types";

import {
  getPobSettings,
  getPobWrapperState,
  setPobSettings,
  setPobWrapperLastLocation,
  type PobWrapperConfigStore,
} from "./configStore";

import type { PobWrapperInstallLocationService } from "./installLocation";
import type { PobWrapperLastLocation } from "./state";

const POB_OFFICIAL_SITE = "https://pathofbuilding.community/";

const isValidPobGame = (value: unknown): value is PobGame =>
  value === "POE1" || value === "POE2";

const readGame = (value: unknown): PobGame =>
  isValidPobGame(value) ? value : "POE2";

export interface RegisterPobWrapperHandlersOptions {
  store: PobWrapperConfigStore;
  installLocations: PobWrapperInstallLocationService;
}

export const registerPobWrapperHandlers = ({
  store,
  installLocations,
}: RegisterPobWrapperHandlersOptions): void => {
  ipcMain.handle("pob-wrapper:settings-get", () => getPobSettings(store));

  ipcMain.handle("pob-wrapper:settings-set", (_event, settings: unknown) =>
    setPobSettings(
      store,
      settings && typeof settings === "object" ? settings : {},
    ),
  );

  ipcMain.handle("pob-wrapper:last-location-get", async () => {
    const state = await getPobWrapperState(store);
    return state.lastLocation;
  });

  ipcMain.handle(
    "pob-wrapper:last-location-set",
    async (_event, lastLocation: unknown) => {
      const state = await setPobWrapperLastLocation(
        store,
        lastLocation && typeof lastLocation === "object"
          ? (lastLocation as PobWrapperLastLocation)
          : null,
      );
      return state.lastLocation;
    },
  );

  ipcMain.handle("pob-wrapper:install-location-get", (_event, game: unknown) =>
    installLocations.resolve(readGame(game)),
  );

  ipcMain.handle(
    "pob-wrapper:install-location-detect",
    (_event, game: unknown) => installLocations.detect(readGame(game)),
  );

  ipcMain.handle(
    "pob-wrapper:install-location-clear",
    (_event, game: unknown) => installLocations.clear(readGame(game)),
  );

  ipcMain.handle(
    "pob-wrapper:install-location-confirm-detected",
    (_event, payload: unknown) => installLocations.confirmDetected(payload),
  );

  ipcMain.handle(
    "pob-wrapper:install-location-pick",
    async (event, game: unknown) => {
      const targetWin = BrowserWindow.fromWebContents(event.sender);
      if (!targetWin || targetWin.isDestroyed()) {
        return { status: "error", reason: "no-window" } as const;
      }

      const { canceled, filePaths } = await dialog.showOpenDialog(targetWin, {
        title: "Path of Building 설치 폴더를 선택해주세요",
        properties: ["openDirectory"],
      });
      if (canceled || filePaths.length === 0) {
        return { status: "cancelled" } as const;
      }
      return installLocations.saveManual(readGame(game), filePaths[0]);
    },
  );

  ipcMain.handle("pob-wrapper:open-official-site", () =>
    shell.openExternal(POB_OFFICIAL_SITE),
  );
};

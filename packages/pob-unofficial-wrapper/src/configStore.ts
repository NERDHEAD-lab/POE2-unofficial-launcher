import fs from "node:fs/promises";
import path from "node:path";

import { normalizePobSettings } from "@poe2-launcher/shared/pobSettings";
import type {
  PobGame,
  PobInstallEntry,
  PobSettings,
} from "@poe2-launcher/shared/types";

import {
  normalizePobWrapperState,
  type PobWrapperLastLocation,
  type PobWrapperState,
} from "./state";

const POB_KEY_BY_GAME = {
  POE1: "poe1",
  POE2: "poe2",
} as const;

export interface PobWrapperPobConfig {
  poe1?: PobInstallEntry;
  poe2?: PobInstallEntry;
  settings?: Partial<PobSettings>;
}

export interface PobWrapperConfig {
  pob?: PobWrapperPobConfig;
  pobWrapper?: PobWrapperState;
}

export interface PobWrapperConfigStore {
  read(): Promise<PobWrapperConfig>;
  write(config: PobWrapperConfig): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isInstallSource = (value: unknown): value is PobInstallEntry["source"] =>
  value === "manual" || value === "HKCU" || value === "HKLM";

const normalizeInstallEntry = (value: unknown): PobInstallEntry | undefined => {
  if (!isRecord(value)) return undefined;
  if (typeof value.installLocation !== "string") return undefined;
  if (!isInstallSource(value.source)) return undefined;
  return {
    installLocation: value.installLocation,
    source: value.source,
  };
};

export const normalizePobWrapperConfig = (value: unknown): PobWrapperConfig => {
  if (!isRecord(value)) return {};
  const pob = isRecord(value.pob) ? value.pob : {};
  return {
    pob: {
      poe1: normalizeInstallEntry(pob.poe1),
      poe2: normalizeInstallEntry(pob.poe2),
      settings: normalizePobSettings(
        isRecord(pob.settings) ? pob.settings : undefined,
      ),
    },
    pobWrapper: normalizePobWrapperState(value.pobWrapper),
  };
};

export const createJsonPobWrapperConfigStore = (
  filePath: string,
): PobWrapperConfigStore => ({
  async read() {
    try {
      const text = await fs.readFile(filePath, "utf8");
      return normalizePobWrapperConfig(JSON.parse(text));
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return {};
      }
      return {};
    }
  },
  async write(config) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      `${JSON.stringify(normalizePobWrapperConfig(config), null, 2)}\n`,
      "utf8",
    );
  },
});

export const getPobSettings = async (
  store: PobWrapperConfigStore,
): Promise<PobSettings> => {
  const config = await store.read();
  return normalizePobSettings(config.pob?.settings);
};

export const setPobSettings = async (
  store: PobWrapperConfigStore,
  settings: Partial<PobSettings>,
): Promise<PobSettings> => {
  const config = await store.read();
  const nextSettings = normalizePobSettings({
    ...config.pob?.settings,
    ...settings,
  });
  await store.write({
    ...config,
    pob: {
      ...config.pob,
      settings: nextSettings,
    },
  });
  return nextSettings;
};

export const getPobInstallEntry = async (
  store: PobWrapperConfigStore,
  game: PobGame,
): Promise<PobInstallEntry | undefined> => {
  const config = await store.read();
  return config.pob?.[POB_KEY_BY_GAME[game]];
};

export const setPobInstallEntry = async (
  store: PobWrapperConfigStore,
  game: PobGame,
  entry: PobInstallEntry,
): Promise<void> => {
  const config = await store.read();
  await store.write({
    ...config,
    pob: {
      ...config.pob,
      [POB_KEY_BY_GAME[game]]: entry,
    },
  });
};

export const clearPobInstallEntry = async (
  store: PobWrapperConfigStore,
  game: PobGame,
): Promise<void> => {
  const config = await store.read();
  await store.write({
    ...config,
    pob: {
      ...config.pob,
      [POB_KEY_BY_GAME[game]]: undefined,
    },
  });
};

export const getPobWrapperState = async (
  store: PobWrapperConfigStore,
): Promise<PobWrapperState> => {
  const config = await store.read();
  return normalizePobWrapperState(config.pobWrapper);
};

export const setPobWrapperLastLocation = async (
  store: PobWrapperConfigStore,
  lastLocation: PobWrapperLastLocation | null,
): Promise<PobWrapperState> => {
  const config = await store.read();
  const pobWrapper = normalizePobWrapperState({
    ...config.pobWrapper,
    lastLocation,
  });
  await store.write({
    ...config,
    pobWrapper,
  });
  return pobWrapper;
};

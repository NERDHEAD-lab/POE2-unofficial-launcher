import type {
  PobConfirmDetectedResult,
  PobDetectedPayload,
  PobGame,
  PobInstallEntry,
  PobPickResult,
} from "@poe2-launcher/shared/types";

import {
  clearPobInstallEntry,
  getPobInstallEntry,
  setPobInstallEntry,
  type PobWrapperConfigStore,
} from "./configStore";

export type PobWrapperRegistrySource = "HKCU" | "HKLM";

export interface PobWrapperInstallLocation {
  installLocation: string | null;
  source: PobWrapperRegistrySource | null;
}

export interface PobWrapperVerifyResult {
  ok: boolean;
  missing: string[];
}

export type PobWrapperInstallLocator = (
  game: PobGame,
) => Promise<PobWrapperInstallLocation>;

export type PobWrapperInstallVerifier = (
  installLocation: string,
  game: PobGame,
) => Promise<PobWrapperVerifyResult>;

export interface PobWrapperInstallLocationService {
  resolve: PobWrapperInstallLocator;
  detect: PobWrapperInstallLocator;
  saveManual: (
    game: PobGame,
    installLocation: string,
  ) => Promise<PobPickResult>;
  confirmDetected: (payload: unknown) => Promise<PobConfirmDetectedResult>;
  clear: (game: PobGame) => Promise<void>;
}

interface PobWrapperInstallLocationOptions {
  store: PobWrapperConfigStore;
  detectInstallLocation?: PobWrapperInstallLocator;
  verifyInstallation: PobWrapperInstallVerifier;
}

const isValidPobGame = (value: unknown): value is PobGame =>
  value === "POE1" || value === "POE2";

const isRegistrySource = (value: unknown): value is PobWrapperRegistrySource =>
  value === "HKCU" || value === "HKLM";

const toRegistryLocation = (
  entry: PobInstallEntry | undefined,
): PobWrapperInstallLocation => ({
  installLocation: entry?.installLocation ?? null,
  source:
    entry?.source === "HKCU" || entry?.source === "HKLM" ? entry.source : null,
});

const missingReason = (missing: string[]): string =>
  `선택한 폴더에서 다음 파일을 찾지 못했습니다: ${missing.join(", ")}`;

export const createPobWrapperInstallLocationService = ({
  store,
  detectInstallLocation = async () => ({
    installLocation: null,
    source: null,
  }),
  verifyInstallation,
}: PobWrapperInstallLocationOptions): PobWrapperInstallLocationService => {
  const detect = async (game: PobGame): Promise<PobWrapperInstallLocation> => {
    const detected = await detectInstallLocation(game);
    if (!detected.installLocation || !detected.source) {
      return { installLocation: null, source: null };
    }
    const verified = await verifyInstallation(detected.installLocation, game);
    return verified.ok ? detected : { installLocation: null, source: null };
  };

  const resolve = async (game: PobGame): Promise<PobWrapperInstallLocation> => {
    const stored = await getPobInstallEntry(store, game);
    if (stored?.installLocation) {
      const verified = await verifyInstallation(stored.installLocation, game);
      if (verified.ok) return toRegistryLocation(stored);
      await clearPobInstallEntry(store, game);
    }
    return detect(game);
  };

  const saveManual = async (
    game: PobGame,
    installLocation: string,
  ): Promise<PobPickResult> => {
    const verified = await verifyInstallation(installLocation, game);
    if (!verified.ok) {
      return {
        status: "invalid",
        reason: missingReason(verified.missing),
        path: installLocation,
      };
    }
    await setPobInstallEntry(store, game, {
      installLocation,
      source: "manual",
    });
    return { status: "ok", path: installLocation };
  };

  const confirmDetected = async (
    payload: unknown,
  ): Promise<PobConfirmDetectedResult> => {
    if (!payload || typeof payload !== "object") {
      return { status: "invalid", reason: "잘못된 요청 payload" };
    }
    const candidate = payload as Partial<PobDetectedPayload>;
    if (!isValidPobGame(candidate.game)) {
      return { status: "invalid", reason: "알 수 없는 게임 식별자" };
    }
    if (
      !candidate.installLocation ||
      typeof candidate.installLocation !== "string"
    ) {
      return { status: "invalid", reason: "잘못된 설치 경로" };
    }
    if (!isRegistrySource(candidate.source)) {
      return { status: "invalid", reason: "알 수 없는 source" };
    }

    const verified = await verifyInstallation(
      candidate.installLocation,
      candidate.game,
    );
    if (!verified.ok) {
      return {
        status: "invalid",
        reason: `폴더 검증 실패: ${verified.missing.join(", ")}`,
      };
    }
    await setPobInstallEntry(store, candidate.game, {
      installLocation: candidate.installLocation,
      source: candidate.source,
    });
    return { status: "ok" };
  };

  return {
    resolve,
    detect,
    saveManual,
    confirmDetected,
    clear: (game) => clearPobInstallEntry(store, game),
  };
};

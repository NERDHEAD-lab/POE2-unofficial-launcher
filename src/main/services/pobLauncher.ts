import path from "node:path";

import { BrowserWindow, dialog, ipcMain, shell } from "electron";

import { verifyPobInstallation } from "./pobInstallVerifier";
import { disposePobSession } from "./pobSession";
import {
  AppConfig,
  PobConfirmDetectedResult,
  PobDetectedPayload,
  PobGame,
  PobInstallEntry,
  PobOpenResult,
  PobPickResult,
} from "../../shared/types";
import store from "../store";
import { logger } from "../utils/logger";
import { getPobInstallPath } from "../utils/registry";

const POB_OFFICIAL_SITE = "https://pathofbuilding.community/";

const pobWindows = new Map<PobGame, BrowserWindow>();

const createPobWindow = (game: PobGame): BrowserWindow => {
  const existing = pobWindows.get(game);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const preloadPath = path.join(__dirname, "pob-preload.js");
  logger.log(`[PoB] creating window for ${game}, preload=${preloadPath}`);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "PoB 2 Unofficial Wrapper",
    backgroundColor: "#1a1a1a",
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenu(null);

  const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
  const baseUrl = VITE_DEV_SERVER_URL?.endsWith("/")
    ? VITE_DEV_SERVER_URL
    : `${VITE_DEV_SERVER_URL}/`;
  if (VITE_DEV_SERVER_URL) {
    const url = `${baseUrl}pob.html#game=${game}`;
    logger.log(`[PoB] loadURL ${url}`);
    win.loadURL(url).catch((err) => {
      logger.error(`[PoB] loadURL failed:`, err);
    });
  } else {
    const file = path.join(process.env.DIST as string, "pob.html");
    logger.log(`[PoB] loadFile ${file}`);
    win.loadFile(file, { hash: `game=${game}` }).catch((err) => {
      logger.error(`[PoB] loadFile failed:`, err);
    });
  }

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    logger.error(`[PoB] did-fail-load code=${code} ${desc} url=${url}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    logger.error(`[PoB] render-process-gone:`, details);
  });
  win.once("ready-to-show", () => {
    logger.log(`[PoB] ready-to-show, showing window`);
    win.show();
    win.focus();
  });

  // Block external navigation.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.on("closed", () => {
    pobWindows.delete(game);
    void disposePobSession(game);
  });

  pobWindows.set(game, win);
  return win;
};

const STORE_KEY_BY_GAME: Record<PobGame, string> = {
  POE1: "pob.poe1",
  POE2: "pob.poe2",
};

const isValidPobGame = (value: unknown): value is PobGame =>
  value === "POE1" || value === "POE2";

const getStoredEntry = (game: PobGame): PobInstallEntry | undefined => {
  return store.get(STORE_KEY_BY_GAME[game] as keyof AppConfig) as
    | PobInstallEntry
    | undefined;
};

const setStoredEntry = (game: PobGame, entry: PobInstallEntry): void => {
  store.set(
    STORE_KEY_BY_GAME[game] as keyof AppConfig,
    entry as AppConfig[keyof AppConfig],
  );
};

const clearStoredEntry = (game: PobGame): void => {
  store.delete(STORE_KEY_BY_GAME[game] as keyof AppConfig);
};

export function registerPobLauncherHandlers(): void {
  ipcMain.handle(
    "pob:open",
    async (event, gameArg: unknown): Promise<PobOpenResult> => {
      const game: PobGame = isValidPobGame(gameArg) ? gameArg : "POE2";

      // 1) Store 에 등록된 경로가 있으면 검증만 하고 통과.
      const stored = getStoredEntry(game);
      if (stored?.installLocation) {
        const verified = await verifyPobInstallation(
          stored.installLocation,
          game,
        );
        if (verified.ok) {
          logger.log(
            `[PoB] using stored location ${stored.installLocation} (${stored.source})`,
          );
          createPobWindow(game);
          return { status: "ready", installLocation: stored.installLocation };
        }
        logger.warn(
          `[PoB] stored location failed verification (missing: ${verified.missing.join(", ")}). Re-detecting.`,
        );
        clearStoredEntry(game);
      }

      // 2) Store 비어있으면 레지스트리 자동 감지.
      const detected = await getPobInstallPath(game);
      if (detected.installLocation && detected.source) {
        const verified = await verifyPobInstallation(
          detected.installLocation,
          game,
        );
        if (verified.ok) {
          // 검증 통과 → 사용자에게 확인 모달 띄우라고 renderer 에 알림.
          const sender = BrowserWindow.fromWebContents(event.sender);
          if (sender && !sender.isDestroyed()) {
            const payload: PobDetectedPayload = {
              game,
              installLocation: detected.installLocation,
              source: detected.source,
            };
            sender.webContents.send("pob:show-detected-confirm", payload);
          }
          logger.log(
            `[PoB] auto-detected ${detected.installLocation} (${detected.source}) — awaiting user confirm`,
          );
          return {
            status: "detected",
            installLocation: detected.installLocation,
            source: detected.source,
          };
        }
        logger.warn(
          `[PoB] detected ${detected.installLocation} but missing: ${verified.missing.join(", ")}`,
        );
      }

      // 3) 감지 실패 → InstallerModal.
      const sender = BrowserWindow.fromWebContents(event.sender);
      if (sender && !sender.isDestroyed()) {
        sender.webContents.send("pob:show-installer-modal", { game });
      }
      return { status: "missing" };
    },
  );

  ipcMain.handle("pob:open-official-site", async () => {
    return shell.openExternal(POB_OFFICIAL_SITE);
  });

  ipcMain.handle(
    "pob:pick-install-location",
    async (event, gameArg: unknown): Promise<PobPickResult> => {
      const game: PobGame = isValidPobGame(gameArg) ? gameArg : "POE2";
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

      const selected = filePaths[0];
      const verified = await verifyPobInstallation(selected, game);
      if (!verified.ok) {
        return {
          status: "invalid",
          reason: `선택한 폴더에서 다음 파일을 찾지 못했습니다: ${verified.missing.join(", ")}`,
          path: selected,
        } as const;
      }

      setStoredEntry(game, { installLocation: selected, source: "manual" });
      logger.log(`[PoB] manual install location saved (${game}): ${selected}`);
      createPobWindow(game);
      return { status: "ok", path: selected } as const;
    },
  );

  ipcMain.handle(
    "pob:confirm-detected-location",
    async (_event, payload: unknown): Promise<PobConfirmDetectedResult> => {
      if (
        !payload ||
        typeof payload !== "object" ||
        !("installLocation" in payload) ||
        !("source" in payload) ||
        !("game" in payload)
      ) {
        return { status: "invalid", reason: "잘못된 요청 payload" };
      }
      const { installLocation, source, game } = payload as PobDetectedPayload;
      if (!isValidPobGame(game)) {
        return { status: "invalid", reason: "알 수 없는 게임 식별자" };
      }
      if (source !== "HKCU" && source !== "HKLM") {
        return { status: "invalid", reason: "알 수 없는 source" };
      }

      const verified = await verifyPobInstallation(installLocation, game);
      if (!verified.ok) {
        return {
          status: "invalid",
          reason: `폴더 검증 실패: ${verified.missing.join(", ")}`,
        };
      }

      setStoredEntry(game, { installLocation, source });
      logger.log(
        `[PoB] detected location confirmed (${game}): ${installLocation} (${source})`,
      );
      createPobWindow(game);
      return { status: "ok" };
    },
  );
}

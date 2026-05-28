import fs from "node:fs/promises";
import path from "node:path";

import { BrowserWindow, dialog, ipcMain, shell } from "electron";

import store from "../store";
import { logger } from "../utils/logger";

const POB_EXE_NAME = "Path of Building-PoE2.exe";
const POB_INSTALL_KEY = "pob.installLocation";
const POB_OFFICIAL_SITE = "https://pathofbuilding.community/";

export interface PobLocateResult {
  installLocation: string | null;
  source: "store" | "registry" | "none";
}

/**
 * PR-1 mock: always returns null. PR-2 replaces this with registry + store
 * lookup. Kept here so the IPC surface is stable across PRs.
 */
async function mockLocate(): Promise<PobLocateResult> {
  return { installLocation: null, source: "none" };
}

async function isValidPobFolder(folder: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(folder, POB_EXE_NAME));
    return stat.isFile();
  } catch {
    return false;
  }
}

export function registerPobLauncherHandlers(): void {
  ipcMain.handle("pob:open", async (event) => {
    const located = await mockLocate();
    if (located.installLocation) {
      // PR-3 will spawn the PoB BrowserWindow here. PR-1 keeps the flow short.
      logger.log(
        `[PoB] located at ${located.installLocation} (${located.source})`,
      );
      return { status: "ready", installLocation: located.installLocation };
    }

    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender && !sender.isDestroyed()) {
      sender.webContents.send("pob:show-installer-modal");
    }
    return { status: "missing" };
  });

  ipcMain.handle("pob:open-official-site", async () => {
    return shell.openExternal(POB_OFFICIAL_SITE);
  });

  ipcMain.handle("pob:pick-install-location", async (event) => {
    const targetWin = BrowserWindow.fromWebContents(event.sender);
    if (!targetWin || targetWin.isDestroyed()) {
      return { status: "error", reason: "no-window" } as const;
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(targetWin, {
      title: "Path of Building (PoE2) 설치 폴더를 선택해주세요",
      properties: ["openDirectory"],
    });

    if (canceled || filePaths.length === 0) {
      return { status: "cancelled" } as const;
    }

    const selected = filePaths[0];
    const ok = await isValidPobFolder(selected);
    if (!ok) {
      return {
        status: "invalid",
        reason: `${POB_EXE_NAME} 가 선택한 폴더에 없습니다.`,
        path: selected,
      } as const;
    }

    store.set(POB_INSTALL_KEY, selected);
    logger.log(`[PoB] manual install location saved: ${selected}`);
    return { status: "ok", path: selected } as const;
  });
}

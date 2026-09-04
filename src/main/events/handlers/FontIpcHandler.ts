import fs from "node:fs/promises";

import { ipcMain } from "electron";

import { FontManager } from "../../services/FontManager";
import { ProcessFontMitigationService } from "../../services/ProcessFontMitigationService";
import { Logger } from "../../utils/logger";

import type { RemoteFontItem, ImportSelection } from "../../../shared/types";

const logger = new Logger({ type: "ipc-font", typeColor: "#3498db" });

export class FontIpcHandler {
  private static registered = false;

  public static register() {
    if (this.registered) {
      logger.log("Font IPC Handlers already registered. Skipping.");
      return;
    }

    ipcMain.handle("font:get-force-apply-policy", () =>
      ProcessFontMitigationService.getInstance().getPolicy(),
    );
    ipcMain.handle(
      "font:set-force-apply-policy",
      async (_, enabled: unknown) => {
        if (typeof enabled !== "boolean")
          throw new Error("폰트 정책 값은 boolean이어야 합니다.");
        return ProcessFontMitigationService.getInstance().setPolicy(enabled);
      },
    );

    ipcMain.handle("font:get-fonts", () => {
      try {
        const fm = FontManager.getInstance();
        return fm.getFonts();
      } catch (err) {
        logger.error("Failed to get fonts", err);
        throw err;
      }
    });

    ipcMain.handle("font:get-unified-fonts", async () => {
      try {
        const fm = FontManager.getInstance();
        return await fm.getUnifiedFonts();
      } catch (err) {
        logger.error("Failed to get unified fonts", err);
        throw err;
      }
    });

    ipcMain.handle("font:get-catalog", async () => {
      try {
        const fm = FontManager.getInstance();
        return await fm.getCatalog();
      } catch (err) {
        logger.error("Failed to get font catalog", err);
        throw err;
      }
    });

    // [v11] 파일 선분석 - 별칭 입력 전 중복 체크용
    ipcMain.handle("font:analyze-file", async (_event, filePath: string) => {
      try {
        const fm = FontManager.getInstance();
        return await fm.extractMetadata(filePath);
      } catch (err) {
        logger.error(`Failed to analyze font file: ${filePath}`, err);
        throw err;
      }
    });

    ipcMain.handle("font:sync-catalog", async (_, force: boolean = false) => {
      try {
        const fm = FontManager.getInstance();
        await fm.syncWithRemote(force);
        return fm.getCatalog();
      } catch (err) {
        logger.error("Failed to sync font catalog", err);
        throw err;
      }
    });

    ipcMain.handle(
      "font:download-remote",
      async (_, item: RemoteFontItem, customAlias?: string) => {
        try {
          const fm = FontManager.getInstance();
          // [v14] 객체 및 별칭 전달 보장
          return await fm.downloadAndInstallRemoteFont(item, customAlias);
        } catch (err) {
          logger.error(
            `Failed to download remote font ${customAlias || item.id}`,
            err,
          );
          throw err;
        }
      },
    );

    ipcMain.handle("font:read-file", async (_, filePath: string) => {
      try {
        const buffer = await fs.readFile(filePath);
        return buffer; // Uint8Array로 렌더러에 전달됨
      } catch (err) {
        logger.error("Failed to read font file", err);
        throw err;
      }
    });

    ipcMain.handle(
      "font:add-font",
      async (
        _,
        filePath: string,
        previewDataUrl?: string,
        customAlias?: string,
      ) => {
        try {
          if (!filePath) throw new Error("파일 경로가 유효하지 않습니다.");
          const fm = FontManager.getInstance();
          // [v14] 객체 기반 파라미터로 명확하게 전달
          return await fm.addFont(filePath, previewDataUrl, customAlias);
        } catch (err) {
          logger.error("Failed to add font", err);
          throw err;
        }
      },
    );

    ipcMain.handle("font:pick-file", async (event) => {
      const win = import("electron").then(({ BrowserWindow }) =>
        BrowserWindow.fromWebContents(event.sender),
      );
      const targetWin = await win;
      if (!targetWin) return null;

      const { dialog } = await import("electron");
      const { canceled, filePaths } = await dialog.showOpenDialog(targetWin, {
        title: "새 폰트 선택",
        filters: [{ name: "Font Files", extensions: ["ttf", "otf"] }],
        properties: ["openFile"],
      });

      if (canceled || filePaths.length === 0) return null;
      return filePaths[0];
    });

    ipcMain.handle("font:remove-font", async (_, id: string) => {
      try {
        const fm = FontManager.getInstance();
        await fm.removeFont(id);
      } catch (err) {
        logger.error(`Failed to remove font ${id}`, err);
        throw err;
      }
    });

    ipcMain.handle(
      "font:update-alias",
      async (_, id: string, newAlias: string) => {
        try {
          const fm = FontManager.getInstance();
          await fm.updateAlias(id, newAlias);
        } catch (err) {
          logger.error(`Failed to update alias for ${id}`, err);
          throw err;
        }
      },
    );

    ipcMain.handle(
      "font:apply-batch",
      async (_, assignments: Record<string, string | null>) => {
        try {
          const fm = FontManager.getInstance();
          await fm.applyBatch(assignments);
        } catch (err) {
          logger.error("Failed to apply batch fonts", err);
          throw err;
        }
      },
    );

    ipcMain.handle("font:reapply", async () => {
      try {
        const fm = FontManager.getInstance();
        await fm.reapplyAppliedFonts();
      } catch (err) {
        logger.error("Failed to reapply fonts", err);
        throw err;
      }
    });

    // 부팅 시 렌더러가 호출. 변조 스키마 마이그레이션 안내 필요 여부 반환.
    // 적용된 커스텀 폰트가 없으면 내부에서 스키마만 기록하고 prompt=false.
    ipcMain.handle("font:check-migration", async () => {
      try {
        const fm = FontManager.getInstance();
        return await fm.checkFontMigration();
      } catch (err) {
        logger.error("Failed to check font migration", err);
        return { prompt: false };
      }
    });

    // 사용자가 재적용을 확인했을 때. 성공 시에만 스키마 기록(멱등).
    ipcMain.handle("font:complete-migration", async () => {
      try {
        const fm = FontManager.getInstance();
        await fm.completeFontMigration();
      } catch (err) {
        logger.error("Failed to complete font migration", err);
        throw err;
      }
    });

    ipcMain.handle("font:open-folder", () => {
      const fm = FontManager.getInstance();
      fm.openCustomFontsFolder();
    });

    ipcMain.handle("font:import-external", async (_, service: string) => {
      try {
        const fm = FontManager.getInstance();
        return await fm.importExternalFont(service);
      } catch (err) {
        logger.error(`Failed to import external font for ${service}`, err);
        throw err;
      }
    });

    ipcMain.handle("font:cleanup-external", async (_, service: string) => {
      try {
        const fm = FontManager.getInstance();
        await fm.cleanupExternalFont(service);
      } catch (err) {
        logger.error(`Failed to cleanup external font for ${service}`, err);
        throw err;
      }
    });

    // [Interactive Wizard APIs]
    ipcMain.handle("font:detect-external-detail", async () => {
      try {
        const fm = FontManager.getInstance();
        return await fm.detectExternalFontsDetail();
      } catch (err) {
        logger.error("Failed to detect external fonts detail", err);
        throw err;
      }
    });

    ipcMain.handle(
      "font:import-selected-external",
      async (_, selection: ImportSelection[]) => {
        try {
          const fm = FontManager.getInstance();
          await fm.importSelectedExternalFonts(selection);
        } catch (err) {
          logger.error("Failed to import selected external fonts", err);
          throw err;
        }
      },
    );

    logger.log("Font IPC Handlers registered");
    this.registered = true;
  }
}

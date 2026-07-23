import fs from "node:fs/promises";
import path from "node:path";

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import JSZip from "jszip";

import type {
  LauncherLogAvailability,
  LauncherLogSaveResult,
} from "../../shared/types";

const AVAILABILITY_CHANNEL = "launcher-log:get-export-availability";
const SAVE_CHANNEL = "launcher-log:save-for-timestamp";

interface DiagnosticLogAvailability {
  dateKey: string;
  segmentCount: number;
  totalBytes: number;
}

interface DiagnosticLogSnapshot {
  dateKey: string;
  segments: Array<{ name: string; content: Buffer }>;
  totalBytes: number;
}

export interface DiagnosticLogStorePort {
  getDateAvailability(
    timestamp: number,
  ): DiagnosticLogAvailability | null | Promise<DiagnosticLogAvailability | null>;
  createDateSnapshot(
    timestamp: number,
  ): DiagnosticLogSnapshot | null | Promise<DiagnosticLogSnapshot | null>;
}

export function registerDiagnosticLogIpc(store: DiagnosticLogStorePort): void {
  ipcMain.handle(
    AVAILABILITY_CHANNEL,
    async (_event, timestamp: unknown): Promise<LauncherLogAvailability> => {
      if (!isFiniteTimestamp(timestamp)) {
        return { status: "invalid" };
      }

      try {
        const availability = await store.getDateAvailability(timestamp);
        if (!availability) {
          return { status: "missing", dateKey: toLocalDateKey(timestamp) };
        }

        return { status: "available", ...availability };
      } catch {
        return { status: "unavailable" };
      }
    },
  );

  ipcMain.handle(
    SAVE_CHANNEL,
    async (event, timestamp: unknown): Promise<LauncherLogSaveResult> => {
      if (!isFiniteTimestamp(timestamp)) {
        return { status: "failed" };
      }

      try {
        const sourceWindow = BrowserWindow.fromWebContents(event.sender);
        if (!sourceWindow) {
          return { status: "failed" };
        }

        const availability = await store.getDateAvailability(timestamp);
        if (!availability) {
          return { status: "missing" };
        }

        const archiveName = `poe2-unofficial-launcher-logs-${availability.dateKey}.zip`;
        const { canceled, filePath } = await dialog.showSaveDialog(sourceWindow, {
          title: "런처 로그 저장",
          defaultPath: archiveName,
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (canceled || !filePath) {
          return { status: "canceled" };
        }

        if (isPathInsideDirectory(app.getPath("logs"), filePath)) {
          return { status: "failed" };
        }

        const snapshot = await store.createDateSnapshot(timestamp);
        if (!snapshot) {
          return { status: "missing" };
        }

        const zip = new JSZip();
        [...snapshot.segments]
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((segment) => {
            zip.file(segment.name, segment.content);
          });

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
        await fs.writeFile(filePath, zipBuffer);
        return { status: "saved" };
      } catch {
        return { status: "failed" };
      }
    },
  );
}

function isFiniteTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function toLocalDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPathInsideDirectory(directory: string, targetPath: string): boolean {
  const relative = path.relative(
    path.resolve(directory),
    path.resolve(targetPath),
  );
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

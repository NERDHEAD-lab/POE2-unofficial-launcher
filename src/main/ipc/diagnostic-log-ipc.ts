import { app, BrowserWindow, dialog, ipcMain } from "electron";
import JSZip from "jszip";

import { toLocalDateKey } from "../services/DiagnosticLogStore";
import {
  assertSaveDestinationOutsideManagedDirectory,
  writeFileWithAtomicReplacement,
} from "../utils/safe-save-file";

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
      const parsedTimestamp = parseTimestamp(timestamp);
      if (!parsedTimestamp) {
        return { status: "invalid" };
      }

      try {
        const availability = await store.getDateAvailability(
          parsedTimestamp.timestamp,
        );
        if (!availability) {
          return { status: "missing", dateKey: parsedTimestamp.dateKey };
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
      const parsedTimestamp = parseTimestamp(timestamp);
      if (!parsedTimestamp) {
        return { status: "failed" };
      }

      try {
        const sourceWindow = BrowserWindow.fromWebContents(event.sender);
        if (!sourceWindow) {
          return { status: "failed" };
        }

        const availability = await store.getDateAvailability(
          parsedTimestamp.timestamp,
        );
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

        const logDirectory = app.getPath("logs");
        await assertSaveDestinationOutsideManagedDirectory(
          logDirectory,
          filePath,
        );

        const snapshot = await store.createDateSnapshot(
          parsedTimestamp.timestamp,
        );
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
        await writeFileWithAtomicReplacement(
          logDirectory,
          filePath,
          zipBuffer,
        );
        return { status: "saved" };
      } catch {
        return { status: "failed" };
      }
    },
  );
}

function parseTimestamp(
  value: unknown,
): { timestamp: number; dateKey: string } | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const dateKey = toLocalDateKey(value);
  return dateKey ? { timestamp: value, dateKey } : null;
}

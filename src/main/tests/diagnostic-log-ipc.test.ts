import fs from "node:fs/promises";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerDiagnosticLogIpc,
  type DiagnosticLogStorePort,
} from "../ipc/diagnostic-log-ipc";

vi.mock("node:fs/promises", () => ({
  default: {
    writeFile: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "D:\\AppData\\POE2 Unofficial Launcher\\logs"),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
  dialog: {
    showSaveDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

const getHandler = (channel: string) => {
  const registration = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
  if (!registration) {
    throw new Error(`IPC handler was not registered: ${channel}`);
  }
  return registration[1];
};

const createStore = (): DiagnosticLogStorePort => ({
  getDateAvailability: vi.fn(() => ({
    dateKey: "2026-07-24",
    segmentCount: 2,
    totalBytes: 8,
  })),
  createDateSnapshot: vi.fn(() => ({
    dateKey: "2026-07-24",
    segments: [
      { name: "launcher-2026-07-24.002.log", content: Buffer.from("two") },
      { name: "launcher-2026-07-24.001.log", content: Buffer.from("one") },
    ],
    totalBytes: 6,
  })),
});

describe("registerDiagnosticLogIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers exactly the availability and save channels", () => {
    registerDiagnosticLogIpc(createStore());

    expect(vi.mocked(ipcMain.handle).mock.calls.map(([channel]) => channel)).toEqual([
      "launcher-log:get-export-availability",
      "launcher-log:save-for-timestamp",
    ]);
  });

  it("validates timestamps before querying the store", async () => {
    const store = createStore();
    registerDiagnosticLogIpc(store);
    const availabilityHandler = getHandler(
      "launcher-log:get-export-availability",
    );

    await expect(
      availabilityHandler({} as IpcMainInvokeEvent, Number.NaN),
    ).resolves.toEqual({ status: "invalid" });
    await expect(
      availabilityHandler({} as IpcMainInvokeEvent, Number.MAX_VALUE),
    ).resolves.toEqual({ status: "invalid" });
    expect(store.getDateAvailability).not.toHaveBeenCalled();
  });

  it("returns typed availability and unavailable results", async () => {
    const store = createStore();
    registerDiagnosticLogIpc(store);
    const availabilityHandler = getHandler(
      "launcher-log:get-export-availability",
    );

    await expect(
      availabilityHandler({} as IpcMainInvokeEvent, 1_721_808_000_000),
    ).resolves.toEqual({
      status: "available",
      dateKey: "2026-07-24",
      segmentCount: 2,
      totalBytes: 8,
    });

    vi.mocked(store.getDateAvailability).mockRejectedValueOnce(
      new Error("unavailable"),
    );
    await expect(
      availabilityHandler({} as IpcMainInvokeEvent, 1_721_808_000_000),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("does not create a snapshot when the save dialog is canceled", async () => {
    const store = createStore();
    registerDiagnosticLogIpc(store);
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({} as BrowserWindow);
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: true,
      filePath: "",
    });
    const saveHandler = getHandler("launcher-log:save-for-timestamp");

    await expect(
      saveHandler(
        { sender: {} } as IpcMainInvokeEvent,
        1_721_808_000_000,
      ),
    ).resolves.toEqual({ status: "canceled" });
    expect(store.createDateSnapshot).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("rechecks the snapshot after dialog selection and preserves missing", async () => {
    const store = createStore();
    vi.mocked(store.createDateSnapshot).mockResolvedValueOnce(null);
    registerDiagnosticLogIpc(store);
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({} as BrowserWindow);
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: "D:\\Downloads\\logs.zip",
    });
    const saveHandler = getHandler("launcher-log:save-for-timestamp");

    await expect(
      saveHandler(
        { sender: {} } as IpcMainInvokeEvent,
        1_721_808_000_000,
      ),
    ).resolves.toEqual({ status: "missing" });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("does not overwrite files inside the managed log directory", async () => {
    const store = createStore();
    registerDiagnosticLogIpc(store);
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({} as BrowserWindow);
    vi.mocked(app.getPath).mockReturnValue(
      "D:\\AppData\\POE2 Unofficial Launcher\\logs",
    );
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath:
        "D:\\AppData\\POE2 Unofficial Launcher\\logs\\launcher-2026-07-24.001.log",
    });
    const saveHandler = getHandler("launcher-log:save-for-timestamp");

    await expect(
      saveHandler(
        { sender: {} } as IpcMainInvokeEvent,
        1_721_808_000_000,
      ),
    ).resolves.toEqual({ status: "failed" });
    expect(store.createDateSnapshot).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("writes all snapshot segments to a deterministic zip", async () => {
    const store = createStore();
    registerDiagnosticLogIpc(store);
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({} as BrowserWindow);
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: "D:\\Downloads\\logs.zip",
    });
    const saveHandler = getHandler("launcher-log:save-for-timestamp");

    await expect(
      saveHandler(
        { sender: {} } as IpcMainInvokeEvent,
        1_721_808_000_000,
      ),
    ).resolves.toEqual({ status: "saved" });

    const written = vi.mocked(fs.writeFile).mock.calls[0]?.[1] as Buffer;
    const archive = await JSZip.loadAsync(written);
    expect(Object.keys(archive.files)).toEqual([
      "launcher-2026-07-24.001.log",
      "launcher-2026-07-24.002.log",
    ]);
    await expect(
      archive.file("launcher-2026-07-24.001.log")?.async("string"),
    ).resolves.toBe("one");
    await expect(
      archive.file("launcher-2026-07-24.002.log")?.async("string"),
    ).resolves.toBe("two");
  });
});

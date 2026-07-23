import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import JSZip from "jszip";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  registerDiagnosticLogIpc,
  type DiagnosticLogStorePort,
} from "../ipc/diagnostic-log-ipc";
import { DiagnosticLogStore } from "../services/DiagnosticLogStore";
import {
  assertSaveDestinationOutsideManagedDirectory,
  writeFileWithAtomicReplacement,
} from "../utils/safe-save-file";

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

vi.mock("../utils/safe-save-file", () => ({
  assertSaveDestinationOutsideManagedDirectory: vi.fn(),
  writeFileWithAtomicReplacement: vi.fn(),
}));

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "diagnostic-log-ipc-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

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
    vi.mocked(
      assertSaveDestinationOutsideManagedDirectory,
    ).mockResolvedValue();
    vi.mocked(writeFileWithAtomicReplacement).mockResolvedValue();
  });

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
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
    await expect(
      availabilityHandler(
        {} as IpcMainInvokeEvent,
        new Date(10_000, 0, 1).getTime(),
      ),
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

  it("maps real store availability I/O failures to unavailable", async () => {
    const directory = createTemporaryDirectory();
    const store = new DiagnosticLogStore();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Expected fail-closed diagnostic.
    });
    store.initialize(directory, []);
    rmSync(directory, { recursive: true, force: true });
    registerDiagnosticLogIpc(store);
    const availabilityHandler = getHandler(
      "launcher-log:get-export-availability",
    );

    await expect(
      availabilityHandler({} as IpcMainInvokeEvent, Date.now()),
    ).resolves.toEqual({ status: "unavailable" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
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
    expect(writeFileWithAtomicReplacement).not.toHaveBeenCalled();
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
    expect(writeFileWithAtomicReplacement).not.toHaveBeenCalled();
  });

  it("maps a real store snapshot I/O failure after dialog selection to failed", async () => {
    const directory = createTemporaryDirectory();
    const timestamp = Date.now();
    const store = new DiagnosticLogStore({ now: () => timestamp });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Expected fail-closed diagnostic.
    });
    store.initialize(directory, []);
    store.append({
      type: "TEST",
      content: "available before dialog",
      isError: true,
      timestamp,
    });
    registerDiagnosticLogIpc(store);
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({} as BrowserWindow);
    vi.mocked(dialog.showSaveDialog).mockImplementationOnce(async () => {
      rmSync(directory, { recursive: true, force: true });
      return {
        canceled: false,
        filePath: "D:\\Downloads\\logs.zip",
      };
    });
    const saveHandler = getHandler("launcher-log:save-for-timestamp");

    await expect(
      saveHandler({ sender: {} } as IpcMainInvokeEvent, timestamp),
    ).resolves.toEqual({ status: "failed" });
    expect(writeFileWithAtomicReplacement).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
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
    vi.mocked(
      assertSaveDestinationOutsideManagedDirectory,
    ).mockRejectedValueOnce(new Error("managed destination"));
    const saveHandler = getHandler("launcher-log:save-for-timestamp");

    await expect(
      saveHandler(
        { sender: {} } as IpcMainInvokeEvent,
        1_721_808_000_000,
      ),
    ).resolves.toEqual({ status: "failed" });
    expect(store.createDateSnapshot).not.toHaveBeenCalled();
    expect(writeFileWithAtomicReplacement).not.toHaveBeenCalled();
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

    const written = vi.mocked(writeFileWithAtomicReplacement).mock
      .calls[0]?.[2] as Buffer;
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
    expect(writeFileWithAtomicReplacement).toHaveBeenCalledWith(
      "D:\\AppData\\POE2 Unofficial Launcher\\logs",
      "D:\\Downloads\\logs.zip",
      expect.any(Buffer),
    );
  });
});

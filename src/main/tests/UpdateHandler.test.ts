import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EventType,
  type AppContext,
  type UIUpdateDownloadEvent,
  type UIUpdateInstallEvent,
} from "../events/types";

type AutoUpdaterListener = (...args: unknown[]) => void;

const mocks = vi.hoisted(() => ({
  app: {
    getPath: vi.fn((name: string) =>
      name === "appData"
        ? "C:\\Users\\test\\AppData\\Roaming"
        : "C:\\test\\app.exe",
    ),
    getVersion: vi.fn(() => "1.3.3"),
    isPackaged: true,
    quit: vi.fn(),
  },
  autoUpdaterListeners: new Map<string, AutoUpdaterListener>(),
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
    once: vi.fn(),
  },
  axiosGet: vi.fn(),
  axiosIsAxiosError: vi.fn(),
  fetchChangelogs: vi.fn(),
  prepareForShutdown: vi.fn(),
  showErrorBox: vi.fn(),
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: mocks.app,
  dialog: { showErrorBox: mocks.showErrorBox },
}));

vi.mock("../app-shutdown", () => ({
  prepareForShutdown: mocks.prepareForShutdown,
}));

vi.mock("electron-updater", () => ({
  autoUpdater: mocks.autoUpdater,
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.axiosGet,
    isAxiosError: mocks.axiosIsAxiosError,
  },
}));

vi.mock("../services/ChangelogService", () => ({
  changelogService: {
    fetchChangelogs: mocks.fetchChangelogs,
  },
}));

vi.mock("../utils/logger", () => ({
  logger: mocks.logger,
}));

vi.mock("../utils/powershell", () => ({
  PowerShellManager: {
    getInstance: vi.fn(() => ({
      cleanup: vi.fn(),
    })),
  },
}));

const context = {
  mainWindow: null,
} as unknown as AppContext;

const downloadEvent: UIUpdateDownloadEvent = {
  type: EventType.UI_UPDATE_DOWNLOAD,
  payload: undefined,
};

const installEvent: UIUpdateInstallEvent = {
  type: EventType.UI_UPDATE_INSTALL,
  payload: { isSilent: false },
};

const createWindowContext = () => {
  const send = vi.fn();
  const windowContext = {
    mainWindow: {
      isDestroyed: () => false,
      webContents: { send },
    },
  } as unknown as AppContext;

  return { context: windowContext, send };
};

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
};

const emitAutoUpdaterEvent = (event: string, payload: unknown) => {
  const listener = mocks.autoUpdaterListeners.get(event);
  expect(listener, `Missing autoUpdater listener for ${event}`).toBeDefined();
  return listener?.(payload);
};

async function loadUpdateHandler() {
  vi.resetModules();
  return import("../events/handlers/UpdateHandler");
}

describe("UpdateHandler", () => {
  beforeEach(() => {
    delete process.env.VITE_DEV_SERVER_URL;
    vi.clearAllMocks();
    mocks.autoUpdaterListeners.clear();
    mocks.autoUpdater.on.mockImplementation(
      (event: string, listener: AutoUpdaterListener) => {
        mocks.autoUpdaterListeners.set(event, listener);
        return mocks.autoUpdater;
      },
    );
    mocks.autoUpdater.downloadUpdate.mockResolvedValue(undefined);
    mocks.prepareForShutdown.mockResolvedValue(undefined);
    mocks.autoUpdater.quitAndInstall.mockReset();
    mocks.autoUpdater.once.mockImplementation(
      (event: string, listener: AutoUpdaterListener) => {
        mocks.autoUpdaterListeners.set(`once:${event}`, listener);
        return mocks.autoUpdater;
      },
    );
    mocks.fetchChangelogs.mockResolvedValue([]);
    mocks.app.isPackaged = true;
    mocks.app.getVersion.mockReturnValue("1.3.3");
    mocks.autoUpdater.checkForUpdates.mockResolvedValue(undefined);
    mocks.axiosIsAxiosError.mockImplementation(
      (error: unknown) =>
        typeof error === "object" && error !== null && "isAxiosError" in error,
    );
  });

  it("waits for shutdown preparation before installing and ignores duplicate requests", async () => {
    const pending = createDeferred();
    mocks.prepareForShutdown.mockReturnValueOnce(pending.promise);
    const { UpdateDownloadHandler, UpdateInstallHandler } =
      await loadUpdateHandler();
    await UpdateDownloadHandler.handle(downloadEvent, context);
    emitAutoUpdaterEvent("update-downloaded", { version: "1.3.4" });

    const first = UpdateInstallHandler.handle(installEvent, context);
    await UpdateInstallHandler.handle(installEvent, context);
    expect(mocks.prepareForShutdown).toHaveBeenCalledTimes(1);
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    pending.resolve();
    await first;
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(
      false,
      true,
    );
  });

  it("keeps the downloaded update available for retry after storage preparation fails", async () => {
    mocks.prepareForShutdown.mockRejectedValueOnce(
      new Error("storage failure"),
    );
    const { UpdateDownloadHandler, UpdateInstallHandler } =
      await loadUpdateHandler();
    await UpdateDownloadHandler.handle(downloadEvent, context);
    emitAutoUpdaterEvent("update-downloaded", { version: "1.3.4" });

    await UpdateInstallHandler.handle(installEvent, context);
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(mocks.app.quit).not.toHaveBeenCalled();
    expect(mocks.showErrorBox).toHaveBeenCalledTimes(1);

    await UpdateInstallHandler.handle(installEvent, context);
    expect(mocks.prepareForShutdown).toHaveBeenCalledTimes(2);
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("does not stop the app for an install request without a completed download", async () => {
    const { UpdateInstallHandler } = await loadUpdateHandler();
    await UpdateInstallHandler.handle(installEvent, context);
    expect(mocks.prepareForShutdown).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it.each(["event", "throw"])(
    "quits without auto-install retry after installer startup failure (%s)",
    async (mode) => {
      const { UpdateDownloadHandler, UpdateInstallHandler } =
        await loadUpdateHandler();
      await UpdateDownloadHandler.handle(downloadEvent, context);
      emitAutoUpdaterEvent("update-downloaded", { version: "1.3.4" });
      mocks.autoUpdater.quitAndInstall.mockImplementationOnce(() => {
        const error = new Error("installer missing");
        if (mode === "throw") throw error;
        emitAutoUpdaterEvent("once:error", error);
      });

      await UpdateInstallHandler.handle(installEvent, context);
      expect(mocks.showErrorBox).toHaveBeenCalledTimes(1);
      expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(false);
      expect(mocks.app.quit).toHaveBeenCalledTimes(1);
    },
  );

  it("falls back without logging an error when the smart update check times out", async () => {
    const timeoutError = Object.assign(
      new Error("timeout of 5000ms exceeded"),
      {
        code: "ECONNABORTED",
        isAxiosError: true,
      },
    );
    mocks.axiosGet.mockRejectedValueOnce(timeoutError);

    const { triggerUpdateCheck } = await loadUpdateHandler();
    await triggerUpdateCheck(context, true);

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Smart Check could not reach update server"),
    );
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("does not promote standard update connectivity failures to error logs", async () => {
    mocks.axiosGet.mockResolvedValueOnce({
      status: 200,
      data: {
        tag_name: "v1.3.4",
      },
    });
    mocks.autoUpdater.checkForUpdates.mockRejectedValueOnce(
      Object.assign(new Error("net::ERR_INTERNET_DISCONNECTED"), {
        code: "ERR_NETWORK",
      }),
    );

    const { triggerUpdateCheck } = await loadUpdateHandler();
    await triggerUpdateCheck(context, true);

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Update check could not reach update server"),
    );
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it("broadcasts requesting immediately and ignores duplicate downloads until completion", async () => {
    const deferred = createDeferred();
    mocks.autoUpdater.downloadUpdate.mockReturnValueOnce(deferred.promise);

    const { UpdateDownloadHandler } = await loadUpdateHandler();
    const { context: windowContext, send } = createWindowContext();

    const firstRequest = UpdateDownloadHandler.handle(
      downloadEvent,
      windowContext,
    );
    const duplicateRequest = UpdateDownloadHandler.handle(
      downloadEvent,
      windowContext,
    );
    await duplicateRequest;

    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "requesting",
        progress: 0,
      }),
    );

    emitAutoUpdaterEvent("download-progress", { percent: 7.25 });
    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "downloading",
        progress: 7.25,
      }),
    );

    emitAutoUpdaterEvent("update-downloaded", { version: "1.3.4" });
    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "downloaded",
        version: "1.3.4",
      }),
    );

    deferred.resolve();
    await firstRequest;
  });

  it("unlocks after a download failure so the user can retry", async () => {
    mocks.autoUpdater.downloadUpdate.mockRejectedValueOnce(
      new Error("download failed"),
    );

    const { UpdateDownloadHandler } = await loadUpdateHandler();
    const { context: windowContext, send } = createWindowContext();

    await UpdateDownloadHandler.handle(downloadEvent, windowContext);

    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "error",
        message: "다운로드를 시작하지 못했습니다. 다시 시도해주세요.",
      }),
    );

    const retry = createDeferred();
    mocks.autoUpdater.downloadUpdate.mockReturnValueOnce(retry.promise);
    const retryRequest = UpdateDownloadHandler.handle(
      downloadEvent,
      windowContext,
    );

    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "requesting",
        progress: 0,
      }),
    );

    emitAutoUpdaterEvent("update-downloaded", { version: "1.3.4" });
    retry.resolve();
    await retryRequest;
  });

  it("does not let overlapping update checks downgrade an active download", async () => {
    const first = createDeferred();
    mocks.autoUpdater.downloadUpdate.mockReturnValueOnce(first.promise);

    const { triggerUpdateCheck, UpdateDownloadHandler } =
      await loadUpdateHandler();
    const { context: windowContext, send } = createWindowContext();
    const firstRequest = UpdateDownloadHandler.handle(
      downloadEvent,
      windowContext,
    );

    emitAutoUpdaterEvent("checking-for-update", undefined);
    emitAutoUpdaterEvent("update-not-available", { version: "1.3.3" });
    emitAutoUpdaterEvent("error", new Error("overlapping check failed"));
    await triggerUpdateCheck(windowContext, true);

    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "requesting",
        progress: 0,
      }),
    );
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();

    first.reject(new Error("download failed"));
    await firstRequest;
    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "error",
        message: "다운로드를 시작하지 못했습니다. 다시 시도해주세요.",
      }),
    );
  });

  it("does not publish a late available state over a completed download", async () => {
    mocks.axiosGet.mockResolvedValueOnce({
      status: 200,
      data: { tag_name: "v1.3.3" },
    });
    const changelogs = createDeferred<never[]>();
    mocks.fetchChangelogs.mockReturnValueOnce(changelogs.promise);

    const { triggerUpdateCheck, UpdateDownloadHandler } =
      await loadUpdateHandler();
    const { context: windowContext, send } = createWindowContext();
    await triggerUpdateCheck(windowContext, true);

    const availableEvent = emitAutoUpdaterEvent("update-available", {
      version: "1.3.4",
    });
    const download = createDeferred();
    mocks.autoUpdater.downloadUpdate.mockReturnValueOnce(download.promise);
    const downloadRequest = UpdateDownloadHandler.handle(
      downloadEvent,
      windowContext,
    );

    emitAutoUpdaterEvent("update-downloaded", { version: "1.3.4" });
    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "downloaded",
        version: "1.3.4",
      }),
    );

    changelogs.resolve([]);
    await availableEvent;
    expect(send).toHaveBeenLastCalledWith(
      "update-status-change",
      expect.objectContaining({
        state: "downloaded",
        version: "1.3.4",
      }),
    );

    download.resolve();
    await downloadRequest;
  });
});

import { describe, expect, it, vi } from "vitest";

import { CORE_EVENT_HANDLERS } from "../events/register-handlers";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) =>
      name === "appData"
        ? "C:\\Users\\test\\AppData\\Roaming"
        : "C:\\test\\app.exe",
    ),
    getVersion: vi.fn(() => "0.0.0"),
    isPackaged: false,
    quit: vi.fn(),
    setLoginItemSettings: vi.fn(),
    setPath: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock("electron-store", () => ({
  default: class MockStore {
    public store = {};
    public delete = vi.fn();
    public get = vi.fn();
    public set = vi.fn();
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

const CORE_HANDLER_IDS = [
  "DebugLogHandler",
  "ConfigChangeSyncHandler",
  "ConfigDeleteSyncHandler",
  "StartPoe1KakaoHandler",
  "StartPoe2KakaoHandler",
  "StartPoeGggHandler",
  "CleanupLauncherWindowHandler",
  "GameStatusSyncHandler",
  "GameProcessStartHandler",
  "GameProcessStopHandler",
  "GameInstallCheckHandler",
  "SystemWakeUpHandler",
  "UpdateCheckHandler",
  "UpdateDownloadHandler",
  "UpdateInstallHandler",
  "AutoPatchProcessStartHandler",
  "LogSessionHandler",
  "LogWebRootHandler",
  "LogErrorHandler",
  "AutoPatchProcessStopHandler",
  "PatchProgressHandler",
  "AutoLaunchHandler",
  "ProcessWillTerminateHandler",
  "DevToolsVisibilityHandler",
  "ChangelogCheckHandler",
  "ChangelogUISyncHandler",
  "UacHandler",
  "InactiveWindowVisibilityHandler",
  "KakaoMaintenanceUISyncHandler",
  "RenewedPatchReservationCreateHandler",
  "RenewedPatchReservationDeleteHandler",
  "EventNotificationSettingsHandler",
  "EventNotificationSettingsDeleteHandler",
  "EventNotificationUISyncHandler",
  "EventNotificationDismissHandler",
] as const;

describe("CORE_EVENT_HANDLERS", () => {
  it("preserves the main-process registration order", () => {
    expect(CORE_EVENT_HANDLERS.map((handler) => handler.id)).toEqual(
      CORE_HANDLER_IDS,
    );
  });

  it("does not register duplicate handler ids", () => {
    const ids = CORE_EVENT_HANDLERS.map((handler) => handler.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

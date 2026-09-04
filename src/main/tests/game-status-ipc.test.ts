import { ipcMain, type IpcMainEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { eventBus } from "../events/EventBus";
import { EventType, type AppContext } from "../events/types";
import { registerGameStatusIpc } from "../ipc/game-status-ipc";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock("../events/EventBus", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

const getRegisteredListener = (channel: string) => {
  const call = vi
    .mocked(ipcMain.on)
    .mock.calls.find(([registeredChannel]) => registeredChannel === channel);

  if (!call) {
    throw new Error(`IPC listener was not registered: ${channel}`);
  }

  return call[1];
};

describe("registerGameStatusIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not accept game status from a deferred or stale Kakao document", () => {
    registerGameStatusIpc({
      getAppContext: () => ({}) as AppContext,
      getActiveSessionContext: () => null,
      getWindowContext: () => undefined,
      acceptsPage: () => false,
    });
    getRegisteredListener("game-status-update")(
      { sender: { id: 42 } } as IpcMainEvent,
      "ready",
      null,
      7,
    );
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it("registers game status IPC channels", () => {
    registerGameStatusIpc({
      getAppContext: () => ({}) as AppContext,
      getActiveSessionContext: () => null,
      getWindowContext: () => undefined,
    });

    expect(ipcMain.handle).toHaveBeenCalledWith(
      "game:get-status",
      expect.any(Function),
    );
    expect(ipcMain.on).toHaveBeenCalledWith(
      "game-status-update",
      expect.any(Function),
    );
  });

  it("emits game status changes with window context priority", () => {
    const appContext = {} as AppContext;

    registerGameStatusIpc({
      getAppContext: () => appContext,
      getActiveSessionContext: () => ({
        gameId: "POE1",
        serviceId: "GGG",
      }),
      getWindowContext: (webContentsId) =>
        webContentsId === 42
          ? {
              gameId: "POE2",
              serviceId: "Kakao Games",
            }
          : undefined,
    });

    const listener = getRegisteredListener("game-status-update");
    listener({ sender: { id: 42 } } as IpcMainEvent, "ready", null);

    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      appContext,
      {
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "ready",
      },
    );
  });
});

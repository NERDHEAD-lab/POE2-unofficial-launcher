import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameStatusSyncHandler } from "../events/handlers/GameStatusSyncHandler";
import { EventType } from "../events/types";
import {
  getGameStatus,
  isLaunchBlockingStatus,
  resetGameStatusCacheForTests,
  shouldPreserveRuntimeGameStatus,
  shouldResetStatusOnAutomationWindowClosed,
  updateGameStatusCache,
} from "../state/GameStatusStore";

import type { AppContext, GameStatusChangeEvent } from "../events/types";

describe("GameStatusStore", () => {
  beforeEach(() => {
    resetGameStatusCacheForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns idle for an unknown game context", () => {
    expect(getGameStatus("POE2", "Kakao Games")).toMatchObject({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "idle",
    });
  });

  it("stores every status update with a timestamp", () => {
    const status = updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "ready",
    });

    expect(status.timestamp).toBe(Date.now());
    expect(getGameStatus("POE2", "Kakao Games")).toEqual(status);
  });

  it("preserves install-path health across unrelated runtime status changes", () => {
    const installPathHealth = {
      installationStatus: "installed" as const,
      checkedAt: 100,
      registryAdvisory: { state: "absent" as const },
    };
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "idle",
      installPathHealth,
    });

    const runtime = updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "running",
    });

    expect(runtime.installPathHealth).toEqual(installPathHealth);
  });

  it("lets a completed install reconciliation replace or clear its context health", () => {
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "idle",
      installPathHealth: {
        installationStatus: "installed",
        checkedAt: 100,
        registryAdvisory: { state: "invalid" },
      },
    });

    const healthy = updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "idle",
      installPathHealth: {
        installationStatus: "installed",
        checkedAt: 200,
      },
    });

    expect(healthy.installPathHealth).toEqual({
      installationStatus: "installed",
      checkedAt: 200,
    });
  });

  it("does not let an older carried snapshot overwrite newer health", () => {
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "idle",
      installPathHealth: {
        installationStatus: "installed",
        checkedAt: 200,
      },
    });

    const delayedRuntimeEvent = updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "running",
      installPathHealth: {
        installationStatus: "installed",
        checkedAt: 100,
        registryAdvisory: { state: "absent" },
      },
    });

    expect(delayedRuntimeEvent.installPathHealth).toEqual({
      installationStatus: "installed",
      checkedAt: 200,
    });
  });

  it("never spreads install-path health to another service or game context", () => {
    updateGameStatusCache({
      gameId: "POE1",
      serviceId: "Kakao Games",
      status: "idle",
      installPathHealth: {
        installationStatus: "installed",
        checkedAt: 100,
        registryAdvisory: { state: "unknown" },
      },
    });

    expect(
      updateGameStatusCache({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "running",
      }).installPathHealth,
    ).toBeUndefined();
    expect(
      updateGameStatusCache({
        gameId: "POE1",
        serviceId: "GGG",
        status: "idle",
      }).installPathHealth,
    ).toBeUndefined();
  });

  it("broadcasts the preserved advisory for runtime events and the replaced health for reconciliation events", async () => {
    const send = vi.fn();
    const context = {
      mainWindow: {
        isDestroyed: () => false,
        webContents: { send },
      },
    } as unknown as AppContext;
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "idle",
      installPathHealth: {
        installationStatus: "installed",
        checkedAt: 100,
        registryAdvisory: { state: "absent" },
      },
    });

    await GameStatusSyncHandler.handle(
      {
        type: EventType.GAME_STATUS_CHANGE,
        payload: {
          gameId: "POE2",
          serviceId: "Kakao Games",
          status: "running",
        },
      } as GameStatusChangeEvent,
      context,
    );
    expect(send).toHaveBeenLastCalledWith(
      "game-status-update",
      expect.objectContaining({
        status: "running",
        installPathHealth: expect.objectContaining({
          registryAdvisory: { state: "absent" },
        }),
      }),
    );

    await GameStatusSyncHandler.handle(
      {
        type: EventType.GAME_STATUS_CHANGE,
        payload: {
          gameId: "POE2",
          serviceId: "Kakao Games",
          status: "idle",
          installPathHealth: {
            installationStatus: "installed",
            checkedAt: 200,
          },
        },
      } as GameStatusChangeEvent,
      context,
    );
    expect(send).toHaveBeenLastCalledWith(
      "game-status-update",
      expect.objectContaining({
        status: "idle",
        installPathHealth: {
          installationStatus: "installed",
          checkedAt: 200,
        },
      }),
    );
  });

  it("identifies statuses that keep a launch session active", () => {
    expect(isLaunchBlockingStatus("ready")).toBe(true);
    expect(isLaunchBlockingStatus("running")).toBe(true);
    expect(isLaunchBlockingStatus("stopping")).toBe(false);
    expect(isLaunchBlockingStatus("install_check_blocked")).toBe(false);
    expect(isLaunchBlockingStatus("idle")).toBe(false);
  });

  it("preserves active runtime statuses during install reconciliation", () => {
    expect(
      shouldPreserveRuntimeGameStatus({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "running",
      }),
    ).toBe(true);
    expect(
      shouldPreserveRuntimeGameStatus({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "processing",
      }),
    ).toBe(true);
    expect(
      shouldPreserveRuntimeGameStatus({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "idle",
      }),
    ).toBe(false);
  });

  it("resets an interrupted automation window only when the game is not already tracked", () => {
    expect(shouldResetStatusOnAutomationWindowClosed("processing", false)).toBe(
      true,
    );
    expect(shouldResetStatusOnAutomationWindowClosed("ready", false)).toBe(
      true,
    );
    expect(shouldResetStatusOnAutomationWindowClosed("ready", true)).toBe(
      false,
    );
    expect(shouldResetStatusOnAutomationWindowClosed("running", false)).toBe(
      false,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG, CONFIG_KEYS } from "../../shared/config";
import { eventBus } from "../events/EventBus";
import {
  EventType,
  type AppContext,
  type ConfigChangeEvent,
} from "../events/types";
import {
  GAME_INSTALL_STATUS_REFRESH_TTL_MS,
  getGameInstallStatusContextsForConfigChange,
  reconcileAllGameInstallStatuses,
  reconcileCurrentGameInstallStatusIfStale,
  reconcileGameInstallStatus,
  resetGameInstallStatusReconcilerForTests,
  runManualGameInstallPathAction,
  setGameInstallStatusClockForTests,
} from "../game/GameInstallStatusReconciler";
import {
  resetGameStatusCacheForTests,
  updateGameStatusCache,
} from "../state/GameStatusStore";
import { getGameInstallPathHealth } from "../utils/registry";

import type { GameInstallPathHealth } from "../../shared/types";

const mocks = vi.hoisted(() => ({
  eventBusEmit: vi.fn(),
  getGameInstallPathHealth: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../events/EventBus", () => ({
  eventBus: {
    emit: mocks.eventBusEmit,
  },
}));

vi.mock("../utils/logger", () => ({
  logger: {
    log: mocks.loggerLog,
    warn: mocks.loggerWarn,
    error: vi.fn(),
  },
}));

vi.mock("../utils/registry", () => ({
  getGameInstallPathHealth: mocks.getGameInstallPathHealth,
}));

const createContext = (processRunning = false) =>
  ({
    getConfig: vi.fn(() => ({
      activeGame: "POE2",
      serviceChannel: "Kakao Games",
    })),
    processWatcher: {
      isProcessRunning: vi.fn(() => processRunning),
    },
  }) as unknown as AppContext;

describe("GameInstallStatusReconciler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGameStatusCacheForTests();
    resetGameInstallStatusReconcilerForTests();
    vi.mocked(getGameInstallPathHealth).mockImplementation(
      async (_serviceId, _gameId, checkedAt) => ({
        installationStatus: "installed",
        checkedAt: checkedAt ?? Date.now(),
      }),
    );
  });

  it("emits idle when the install path is valid", async () => {
    const context = createContext();

    await reconcileGameInstallStatus(context, "Kakao Games", "POE2");

    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "idle",
        installPathHealth: expect.objectContaining({
          installationStatus: "installed",
        }),
      }),
    );
  });

  it("emits install_check_blocked when install status cannot be verified", async () => {
    vi.mocked(getGameInstallPathHealth).mockResolvedValue({
      installationStatus: "unknown",
      checkedAt: Date.now(),
    });
    const context = createContext();

    await reconcileGameInstallStatus(context, "Kakao Games", "POE2");

    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "install_check_blocked",
        errorCode: "INSTALL_CHECK_UNKNOWN",
      }),
    );
  });

  it("refreshes install-path health without downgrading a running status", async () => {
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "running",
    });
    vi.mocked(getGameInstallPathHealth).mockResolvedValue({
      installationStatus: "installed",
      checkedAt: 123,
      registryAdvisory: { state: "absent" },
    });
    const context = createContext();

    await reconcileGameInstallStatus(context, "Kakao Games", "POE2");

    expect(getGameInstallPathHealth).toHaveBeenCalledOnce();
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        status: "running",
        installPathHealth: expect.objectContaining({
          registryAdvisory: { state: "absent" },
        }),
      }),
    );
  });

  it("refreshes health while keeping a detected running process stronger than install status", async () => {
    const context = createContext(true);

    await reconcileGameInstallStatus(context, "Kakao Games", "POE2");

    expect(getGameInstallPathHealth).toHaveBeenCalledOnce();
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "running",
        installPathHealth: expect.objectContaining({
          installationStatus: "installed",
        }),
      }),
    );
  });

  it("refreshes health and TTL while preserving a preparing status", async () => {
    let currentTime = 2_000;
    setGameInstallStatusClockForTests(() => currentTime);
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "preparing",
    });
    vi.mocked(getGameInstallPathHealth).mockResolvedValue({
      installationStatus: "installed",
      checkedAt: currentTime,
      registryAdvisory: { state: "unknown" },
    });
    const context = createContext();

    await reconcileGameInstallStatus(context, "Kakao Games", "POE2");
    currentTime += 1;
    await reconcileCurrentGameInstallStatusIfStale(context, {
      reason: "window-focus",
    });

    expect(getGameInstallPathHealth).toHaveBeenCalledOnce();
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        status: "preparing",
        installPathHealth: expect.objectContaining({
          registryAdvisory: { state: "unknown" },
        }),
      }),
    );
  });

  it("recovers stale uninstalled status after confirming the same config path", async () => {
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "uninstalled",
    });
    const context = createContext();
    const action = vi.fn().mockResolvedValue({ ok: true as const });

    await expect(
      runManualGameInstallPathAction(
        context,
        "Kakao Games",
        "POE2",
        "manual-config-path-set",
        action,
      ),
    ).resolves.toEqual({ ok: true });

    expect(action).toHaveBeenCalledOnce();
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "idle",
      }),
    );
  });

  it("reconciles installation status after a successful registry sync", async () => {
    const context = createContext();

    await runManualGameInstallPathAction(
      context,
      "Kakao Games",
      "POE2",
      "manual-path-conflict-sync-registry",
      async () => ({ ok: true as const, action: "sync-registry" as const }),
    );

    expect(getGameInstallPathHealth).toHaveBeenCalledWith(
      "Kakao Games",
      "POE2",
      expect.any(Number),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({ status: "idle" }),
    );
  });

  it("clears advisory and refreshes TTL after a successful manual action while running", async () => {
    let currentTime = 20_000;
    setGameInstallStatusClockForTests(() => currentTime);
    updateGameStatusCache({
      gameId: "POE2",
      serviceId: "Kakao Games",
      status: "running",
      installPathHealth: {
        installationStatus: "installed",
        checkedAt: 10_000,
        registryAdvisory: { state: "invalid" },
      },
    });
    vi.mocked(getGameInstallPathHealth).mockImplementation(
      async (_serviceId, _gameId, checkedAt) => ({
        installationStatus: "installed",
        checkedAt: checkedAt ?? currentTime,
      }),
    );
    const context = createContext();

    await runManualGameInstallPathAction(
      context,
      "Kakao Games",
      "POE2",
      "manual-path-conflict-sync-registry",
      async () => ({ ok: true as const }),
    );
    currentTime += 1;
    await reconcileCurrentGameInstallStatusIfStale(context, {
      reason: "window-focus",
    });

    expect(getGameInstallPathHealth).toHaveBeenCalledOnce();
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        status: "running",
        installPathHealth: {
          installationStatus: "installed",
          checkedAt: 20_000,
        },
      }),
    );
  });

  it("keeps a successful manual action result when reconciliation fails", async () => {
    vi.mocked(getGameInstallPathHealth).mockRejectedValue(
      new Error("install check failed"),
    );

    await expect(
      runManualGameInstallPathAction(
        createContext(),
        "Kakao Games",
        "POE2",
        "manual-config-path-set",
        async () => ({ ok: true as const, path: "C:\\Games\\POE2" }),
      ),
    ).resolves.toEqual({ ok: true, path: "C:\\Games\\POE2" });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining(
        "Manual path action succeeded but reconciliation failed",
      ),
    );
  });

  it("does not reconcile after a failed manual action", async () => {
    await expect(
      runManualGameInstallPathAction(
        createContext(),
        "Kakao Games",
        "POE2",
        "manual-config-path-set",
        async () => ({ ok: false as const, error: "save failed" }),
      ),
    ).resolves.toEqual({ ok: false, error: "save failed" });

    expect(getGameInstallPathHealth).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it("discards an older install check that finishes after a newer one", async () => {
    let resolveOlderCheck:
      ((health: GameInstallPathHealth) => void) | undefined;
    vi.mocked(getGameInstallPathHealth)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlderCheck = resolve;
          }),
      )
      .mockResolvedValueOnce({
        installationStatus: "installed",
        checkedAt: Date.now(),
      });
    const context = createContext();

    const older = reconcileGameInstallStatus(context, "Kakao Games", "POE2", {
      reason: "older",
    });
    await vi.waitFor(() => {
      expect(getGameInstallPathHealth).toHaveBeenCalledTimes(1);
    });

    await reconcileGameInstallStatus(context, "Kakao Games", "POE2", {
      reason: "newer",
    });
    resolveOlderCheck?.({
      installationStatus: "uninstalled",
      checkedAt: Date.now(),
    });
    await older;

    expect(eventBus.emit).toHaveBeenCalledTimes(1);
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({ status: "idle" }),
    );
    expect(mocks.loggerLog).toHaveBeenCalledWith(
      expect.stringContaining("Discarding stale install check"),
    );
  });

  it("forces startup reconciliation for every supported context", async () => {
    const context = createContext();

    await reconcileAllGameInstallStatuses(context, {
      reason: "initial-status-check",
    });

    expect(getGameInstallPathHealth).toHaveBeenCalledTimes(4);
    expect(getGameInstallPathHealth).toHaveBeenNthCalledWith(
      1,
      "Kakao Games",
      "POE1",
      expect.any(Number),
    );
    expect(getGameInstallPathHealth).toHaveBeenNthCalledWith(
      4,
      "GGG",
      "POE2",
      expect.any(Number),
    );
  });

  it("still completes startup health checks when a game process is detected", async () => {
    const context = createContext(true);

    await reconcileAllGameInstallStatuses(context, {
      reason: "initial-status-check",
    });

    expect(getGameInstallPathHealth).toHaveBeenCalledTimes(4);
    expect(eventBus.emit).toHaveBeenCalledTimes(4);
    expect(eventBus.emit).toHaveBeenLastCalledWith(
      EventType.GAME_STATUS_CHANGE,
      context,
      expect.objectContaining({
        gameId: "POE2",
        serviceId: "GGG",
        status: "running",
        installPathHealth: expect.objectContaining({
          installationStatus: "installed",
        }),
      }),
    );
  });

  it("skips current-context show or focus refresh below the 30-minute TTL", async () => {
    let currentTime = 1_000;
    setGameInstallStatusClockForTests(() => currentTime);
    const context = createContext();

    await reconcileGameInstallStatus(context, "Kakao Games", "POE2", {
      reason: "initial-status-check",
    });
    currentTime += 30 * 60 * 1000 - 1;

    await expect(
      reconcileCurrentGameInstallStatusIfStale(context, {
        reason: "window-focus",
      }),
    ).resolves.toBe(false);
    expect(getGameInstallPathHealth).toHaveBeenCalledTimes(1);
  });

  it("refreshes only the selected context once its TTL expires", async () => {
    let currentTime = 1_000;
    setGameInstallStatusClockForTests(() => currentTime);
    const context = createContext();

    await reconcileAllGameInstallStatuses(context, {
      reason: "initial-status-check",
    });
    currentTime += 30 * 60 * 1000;

    await expect(
      reconcileCurrentGameInstallStatusIfStale(context, {
        reason: "window-show",
      }),
    ).resolves.toBe(true);
    expect(getGameInstallPathHealth).toHaveBeenCalledTimes(5);
    expect(getGameInstallPathHealth).toHaveBeenLastCalledWith(
      "Kakao Games",
      "POE2",
      currentTime,
    );
  });

  it("coalesces overlapping show and focus refreshes for the current context", async () => {
    let resolveHealth!: (health: GameInstallPathHealth) => void;
    vi.mocked(getGameInstallPathHealth).mockImplementationOnce(
      (_serviceId, _gameId, checkedAt) =>
        new Promise((resolve) => {
          resolveHealth = resolve;
          expect(checkedAt).toBe(10_000);
        }),
    );
    setGameInstallStatusClockForTests(() => 10_000);
    const context = createContext();

    const show = reconcileCurrentGameInstallStatusIfStale(context, {
      reason: "window-show",
    });
    const focus = reconcileCurrentGameInstallStatusIfStale(context, {
      reason: "window-focus",
    });
    await vi.waitFor(() => {
      expect(getGameInstallPathHealth).toHaveBeenCalledTimes(1);
    });

    resolveHealth({ installationStatus: "installed", checkedAt: 10_000 });
    await expect(show).resolves.toBe(true);
    await expect(focus).resolves.toBe(false);
    expect(getGameInstallPathHealth).toHaveBeenCalledTimes(1);
  });

  it("uses a successful manual force-refresh as the current TTL baseline", async () => {
    let currentTime = 5_000;
    setGameInstallStatusClockForTests(() => currentTime);
    const context = createContext();

    await runManualGameInstallPathAction(
      context,
      "Kakao Games",
      "POE2",
      "manual-config-path-set",
      async () => ({ ok: true as const }),
    );
    currentTime += 1;

    await reconcileCurrentGameInstallStatusIfStale(context, {
      reason: "window-focus",
    });
    expect(getGameInstallPathHealth).toHaveBeenCalledTimes(1);
  });

  it("lets a pending manual action own consecutive show and focus races", async () => {
    let currentTime = 10_000;
    let resolveAction!: (result: { ok: true }) => void;
    setGameInstallStatusClockForTests(() => currentTime);
    const context = createContext();
    const action = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveAction = resolve;
        }),
    );

    const manual = runManualGameInstallPathAction(
      context,
      "Kakao Games",
      "POE2",
      "manual-config-path-set",
      action,
    );
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());

    await expect(
      reconcileCurrentGameInstallStatusIfStale(context, {
        reason: "window-show",
      }),
    ).resolves.toBe(false);
    await expect(
      reconcileCurrentGameInstallStatusIfStale(context, {
        reason: "window-focus",
      }),
    ).resolves.toBe(false);
    expect(getGameInstallPathHealth).not.toHaveBeenCalled();

    resolveAction({ ok: true });
    await manual;
    expect(getGameInstallPathHealth).toHaveBeenCalledOnce();

    currentTime += GAME_INSTALL_STATUS_REFRESH_TTL_MS - 1;
    await expect(
      reconcileCurrentGameInstallStatusIfStale(context, {
        reason: "window-show",
      }),
    ).resolves.toBe(false);
    expect(getGameInstallPathHealth).toHaveBeenCalledOnce();

    currentTime += 1;
    await expect(
      reconcileCurrentGameInstallStatusIfStale(context, {
        reason: "window-focus",
      }),
    ).resolves.toBe(true);
    expect(getGameInstallPathHealth).toHaveBeenCalledTimes(2);
  });

  it("targets only service/game pairs whose saved install path changed", () => {
    const nextPaths = {
      ...DEFAULT_CONFIG.gameInstallPaths,
      "Kakao Games": {
        ...DEFAULT_CONFIG.gameInstallPaths["Kakao Games"],
        POE2: String.raw`D:\Games\Path of Exile 2`,
      },
    };
    const event: ConfigChangeEvent = {
      type: EventType.CONFIG_CHANGE,
      payload: {
        key: CONFIG_KEYS.GAME_INSTALL_PATHS,
        oldValue: DEFAULT_CONFIG.gameInstallPaths,
        newValue: nextPaths,
      },
    };

    expect(
      getGameInstallStatusContextsForConfigChange(event, createContext()),
    ).toEqual([{ serviceId: "Kakao Games", gameId: "POE2" }]);
  });
});

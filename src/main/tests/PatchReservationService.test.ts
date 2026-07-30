import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eventBus } from "../events/EventBus";
import { AppContext, AppEvent, EventHandler, EventType } from "../events/types";
import { PatchReservationService } from "../services/PatchReservationService";
import {
  resetGameStatusCacheForTests,
  updateGameStatusCache,
} from "../state/GameStatusStore";
import { setConfigWithEvent } from "../utils/config-utils";
import { logger } from "../utils/logger";
import { RemoteVersionResolver } from "../utils/RemoteVersionResolver";

import type {
  AppConfig,
  PatchReservation,
  RenewedPatchReservation,
} from "../../shared/types";

const autoPatchCorrelation = vi.hoisted(() => ({
  expectedRunId: undefined as string | undefined,
  pidRunIds: new Map<number, string>(),
}));

const notificationMocks = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  create: vi.fn(),
  show: vi.fn(),
}));

const powerShellMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("electron", () => ({
  Notification: class {
    static isSupported = notificationMocks.isSupported;

    constructor(options: unknown) {
      notificationMocks.create(options);
    }

    show() {
      notificationMocks.show();
    }
  },
}));

vi.mock("../events/EventBus", () => ({
  eventBus: {
    emit: vi.fn(async () => undefined),
    off: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock("../events/handlers/AutoPatchHandler", () => ({
  registerAutoPatchExpectation: vi.fn(
    (
      _gameId: string,
      _serviceId: string,
      _retryCount: number,
      runId?: string,
    ) => {
      autoPatchCorrelation.expectedRunId = runId;
    },
  ),
  getAutoPatchRunIdForPid: vi.fn(
    (pid: number) =>
      autoPatchCorrelation.pidRunIds.get(pid) ??
      autoPatchCorrelation.expectedRunId,
  ),
  clearAutoPatchRun: vi.fn((runId: string) => {
    if (autoPatchCorrelation.expectedRunId === runId) {
      autoPatchCorrelation.expectedRunId = undefined;
    }
    for (const [pid, mappedRunId] of autoPatchCorrelation.pidRunIds) {
      if (mappedRunId === runId) autoPatchCorrelation.pidRunIds.delete(pid);
    }
  }),
}));

vi.mock("../utils/RemoteVersionResolver", () => ({
  RemoteVersionResolver: {
    resolveFresh: vi.fn(),
  },
}));

vi.mock("../utils/config-utils", () => ({
  setConfigWithEvent: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  Logger: class {
    error = vi.fn();
    log = vi.fn();
    warn = vi.fn();
  },
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../utils/powershell", () => ({
  PowerShellManager: {
    getInstance: vi.fn(() => ({
      execute: powerShellMocks.execute,
    })),
  },
}));

const NOW = new Date("2026-07-19T12:55:00.000Z");
const GAME_ID = "POE1";
const SERVICE_ID = "Kakao Games";

const createReservation = (id: string): PatchReservation => ({
  id,
  gameId: GAME_ID,
  serviceId: SERVICE_ID,
  targetTime: NOW.toISOString(),
  createdAt: NOW.toISOString(),
});

describe("PatchReservationService inactivity watchdog", () => {
  const handlers = new Map<string, EventHandler<AppEvent>>();
  let config: AppConfig;
  let context: AppContext;
  let service: PatchReservationService | null;

  const handlerKey = (type: EventType, id: string) => `${type}:${id}`;

  const dispatch = async (type: EventType, payload: unknown) => {
    if (
      type === EventType.PROCESS_START &&
      autoPatchCorrelation.expectedRunId
    ) {
      autoPatchCorrelation.pidRunIds.set(
        (payload as { pid: number }).pid,
        autoPatchCorrelation.expectedRunId,
      );
    }
    const event = { type, payload, timestamp: Date.now() } as AppEvent;
    const matching = [...handlers.values()].filter(
      (handler) => handler.targetEvent === type,
    );

    for (const handler of matching) {
      if (!handler.condition || handler.condition(event, context)) {
        await handler.handle(event, context);
      }
    }

    await Promise.resolve();
  };

  const startService = async (
    reservations = [createReservation("patch-1")],
  ) => {
    config = {
      patchReservations: reservations,
      silentPatchNotification: true,
      terminateAfterPatch: false,
    } as unknown as AppConfig;
    context = {
      getConfig: vi.fn((key?: keyof AppConfig) =>
        key === undefined ? config : config[key],
      ),
    } as unknown as AppContext;

    service = new PatchReservationService(context);
    await service.init();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
  };

  const startRenewedService = async (
    renewedReservations: RenewedPatchReservation[],
  ) => {
    config = {
      patchReservations: [],
      renewedPatchReservations: renewedReservations,
      knownGameVersions: {
        [`${GAME_ID}_${SERVICE_ID}`]: {
          version: "4.4.0.10",
          webRoot: "https://local/4.4.0.10/",
          timestamp: NOW.getTime(),
        },
      },
      silentPatchNotification: true,
      terminateAfterPatch: false,
    } as unknown as AppConfig;
    context = {
      getConfig: vi.fn((key?: keyof AppConfig) =>
        key === undefined ? config : config[key],
      ),
    } as unknown as AppContext;

    service = new PatchReservationService(context);
    await service.init();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
  };

  const remoteVersion = (version: string) => ({
    gameId: GAME_ID as "POE1",
    webRoot: `https://remote/${version}/`,
    version,
    source: "master-socket" as const,
    fetchedAt: NOW.getTime(),
  });

  const processPayload = (pid: number) => ({
    pid,
    name: "PathOfExile_KG.exe",
    path: "G:\\Daum Games\\Path of Exile\\PathOfExile_KG.exe",
    gameId: GAME_ID,
    serviceId: SERVICE_ID,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    handlers.clear();
    autoPatchCorrelation.expectedRunId = undefined;
    autoPatchCorrelation.pidRunIds.clear();
    powerShellMocks.execute.mockResolvedValue({
      stdout: "none",
      stderr: "",
      code: 0,
    });
    service = null;
    resetGameStatusCacheForTests();

    vi.mocked(eventBus.register).mockImplementation((handler) => {
      const captured = handler as EventHandler<AppEvent>;
      handlers.set(handlerKey(captured.targetEvent, captured.id), captured);
    });
    vi.mocked(eventBus.off).mockImplementation((type, id) => {
      handlers.delete(handlerKey(type, id));
    });
    vi.mocked(setConfigWithEvent).mockImplementation((key, value) => {
      const oldValue = (config as unknown as Record<string, unknown>)[key];
      (config as unknown as Record<string, unknown>)[key] = value;
      void dispatch(EventType.CONFIG_CHANGE, {
        key,
        oldValue,
        newValue: value,
      });
    });
  });

  afterEach(async () => {
    await service?.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps the observed POE1 patch flow alive until the Done title", async () => {
    await startService();

    await vi.advanceTimersByTimeAsync(27_000);
    await dispatch(EventType.PROCESS_START, processPayload(217_932));

    await vi.advanceTimersByTimeAsync(10_000);
    await dispatch(EventType.LOG_SESSION_START, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 112_884,
    });
    await dispatch(EventType.PATCH_RESERVATION_SUCCESS, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      runId: autoPatchCorrelation.expectedRunId,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    await dispatch(EventType.PROCESS_START, processPayload(235_412));
    await dispatch(EventType.PROCESS_STOP, processPayload(112_884));

    await vi.advanceTimersByTimeAsync(5_000);
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 235_412,
    });

    for (const [delay, title] of [
      [11_000, "26.91%  속도: 87.81MB/s"],
      [12_000, "55.35%  속도: 90.55MB/s"],
      [10_000, "83.17%  속도: 50.49MB/s"],
      [9_000, "완료"],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay);
      await dispatch(EventType.PATCH_UI_TITLE_TICK, {
        processName: "PathOfExile_KG",
        pid: 235_412,
        title,
        gameId: GAME_ID,
        serviceId: SERVICE_ID,
      });
    }

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("패치 예약 동작이 성공적으로 완료되었습니다"),
    );
  });

  it("fails only after 60 seconds without activity in TRIGGERED", async () => {
    await startService();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(logger.error).not.toHaveBeenCalled();

    await dispatch(EventType.PROCESS_START, processPayload(100));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(logger.error).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("FINAL FAILURE"),
    );
  });

  it("allows an arbitrarily long patch while the current PID remains responsive", async () => {
    await startService();
    await dispatch(EventType.PROCESS_START, processPayload(200));
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 200,
    });

    for (let index = 0; index < 3; index += 1) {
      await vi.advanceTimersByTimeAsync(59_000);
      await dispatch(EventType.PATCH_UI_TITLE_TICK, {
        processName: "PathOfExile_KG",
        pid: 200,
        title: "공간을 확보하는 중…",
        gameId: GAME_ID,
        serviceId: SERVICE_ID,
      });
      expect(logger.error).not.toHaveBeenCalled();
    }

    await vi.advanceTimersByTimeAsync(60_000);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("FINAL FAILURE"),
    );
  });

  it("gives the current process 60 seconds to rotate to a new PID", async () => {
    await startService();
    await dispatch(EventType.PROCESS_START, processPayload(300));
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 300,
    });
    await dispatch(EventType.PROCESS_STOP, processPayload(300));

    await vi.advanceTimersByTimeAsync(59_999);
    expect(logger.error).not.toHaveBeenCalled();

    await dispatch(EventType.PROCESS_START, processPayload(301));
    await dispatch(EventType.PROCESS_STOP, processPayload(300));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(logger.error).not.toHaveBeenCalled();

    await dispatch(EventType.PATCH_UI_TITLE_TICK, {
      processName: "PathOfExile_KG",
      pid: 301,
      title: "50%",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("FINAL FAILURE"),
    );
  });

  it("does not let the previous task timeout fail the next queued task", async () => {
    await startService([
      createReservation("patch-1"),
      createReservation("patch-2"),
    ]);

    await vi.advanceTimersByTimeAsync(10_000);
    await dispatch(EventType.LOG_GAME_STARTUP, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 400,
    });

    vi.mocked(logger.error).mockClear();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(logger.error).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("FINAL FAILURE"),
    );
  });

  it("fails the current task immediately on an explicit reservation failure", async () => {
    await startService();

    await dispatch(EventType.PATCH_RESERVATION_FAILED, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      reason: "Max retries reached without log response.",
      runId: autoPatchCorrelation.expectedRunId,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("FINAL FAILURE"),
    );
  });

  it("checks a one-time range immediately and stops at the inclusive end", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(null);
    const reservation = {
      id: "renewed-range",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-range",
        startsAt: NOW.toISOString(),
        endsAt: new Date(NOW.getTime() + 120_000).toISOString(),
        intervalMinutes: 1,
      },
      action: { kind: "notify" },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    expect(RemoteVersionResolver.resolveFresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(RemoteVersionResolver.resolveFresh).toHaveBeenCalledTimes(3);
    expect(config.renewedPatchReservations).toEqual([]);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "동안 새 업데이트가 확인되지 않아 예약 패치 확인을 종료했습니다",
      ),
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(RemoteVersionResolver.resolveFresh).toHaveBeenCalledTimes(3);
  });

  it("notifies a recurring reservation only once for the same version", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const due = new Date(NOW.getTime() + 1_000);
    const localTime = [due.getHours(), due.getMinutes(), due.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const reservation = {
      id: "renewed-daily-notify",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "daily", localTime },
      action: { kind: "notify", onlyNewVersion: true },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(config.renewedPatchReservations[0]).toMatchObject({
      lastNotifiedVersion: "4.4.0.13",
    });

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);

    const updateNotifications = vi
      .mocked(logger.log)
      .mock.calls.filter(([message]) =>
        String(message).includes("4.4.0.13 업데이트가 확인되었습니다"),
      );
    expect(RemoteVersionResolver.resolveFresh).toHaveBeenCalledTimes(2);
    expect(updateNotifications).toHaveLength(1);
    expect(eventBus.emit).not.toHaveBeenCalledWith(
      EventType.UI_GAME_START_CLICK,
      expect.anything(),
      expect.anything(),
    );
  });

  it("notifies every recurring occurrence when only-new-version is disabled", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const due = new Date(NOW.getTime() + 1_000);
    const localTime = [due.getHours(), due.getMinutes(), due.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const reservation = {
      id: "renewed-daily-notify-every-time",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "daily", localTime },
      action: { kind: "notify", onlyNewVersion: false },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    config.silentPatchNotification = false;
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);

    expect(RemoteVersionResolver.resolveFresh).toHaveBeenCalledTimes(2);
    expect(notificationMocks.create).toHaveBeenCalledTimes(2);
    expect(config.renewedPatchReservations[0]).not.toHaveProperty(
      "lastNotifiedVersion",
    );
  });

  it("suppresses native notifications when silent patch notifications are enabled", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const reservation = {
      id: "renewed-silent-notify",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "notify" },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(notificationMocks.isSupported).not.toHaveBeenCalled();
    expect(notificationMocks.create).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("4.4.0.13 업데이트가 확인되었습니다"),
    );
  });

  it("skips automatic update when the target game is already active", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    updateGameStatusCache({
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      status: "running",
    });
    const reservation = {
      id: "renewed-running",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "auto-update", launchAfterUpdate: true },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(RemoteVersionResolver.resolveFresh).not.toHaveBeenCalled();
    expect(config.renewedPatchReservations).toEqual([]);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "실행 중이거나 시작 중이어서 예약 업데이트를 시작하지 않았습니다",
      ),
    );
  });

  it("continues a one-time range after a busy check is skipped", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    updateGameStatusCache({
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      status: "running",
    });
    const reservation = {
      id: "renewed-running-range",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-range",
        startsAt: NOW.toISOString(),
        endsAt: new Date(NOW.getTime() + 60_000).toISOString(),
        intervalMinutes: 1,
      },
      action: { kind: "auto-update", launchAfterUpdate: false },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    expect(config.renewedPatchReservations).toEqual([reservation]);
    expect(RemoteVersionResolver.resolveFresh).not.toHaveBeenCalled();

    updateGameStatusCache({
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      status: "idle",
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(RemoteVersionResolver.resolveFresh).toHaveBeenCalledTimes(1);
    expect(config.renewedPatchReservations).toEqual([]);
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.UI_GAME_START_CLICK,
      context,
      expect.objectContaining({ gameId: GAME_ID, serviceId: SERVICE_ID }),
    );
  });

  it("launches the game after a successful one-time automatic update", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const reservation = {
      id: "renewed-auto-launch",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "auto-update", launchAfterUpdate: true },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    await dispatch(EventType.PROCESS_START, processPayload(501));
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 501,
    });
    await dispatch(EventType.PATCH_UI_TITLE_TICK, {
      processName: "PathOfExile_KG",
      pid: 501,
      title: "완료",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
    });

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(2);
    expect(launchEvents[1]?.[2]).toMatchObject({
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
    });
  });

  it("does not launch the game when a terminated process remains", async () => {
    powerShellMocks.execute.mockImplementation(async (command: string) => ({
      stdout: command.startsWith("$remaining") ? "remaining" : "",
      stderr: "",
      code: command.startsWith("$remaining") ? 0 : 1,
    }));
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const reservation = {
      id: "renewed-cleanup-failed",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "auto-update", launchAfterUpdate: true },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    await dispatch(EventType.PROCESS_START, processPayload(511));
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 511,
    });
    await dispatch(EventType.PATCH_UI_TITLE_TICK, {
      processName: "PathOfExile_KG",
      pid: 511,
      title: "완료",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
    });

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "패치 프로세스를 종료하지 못해 후속 동작을 시작하지 않았습니다",
      ),
    );
  });

  it("allows follow-up launch when taskkill reports no process and verification finds none", async () => {
    powerShellMocks.execute.mockImplementation(async (command: string) => ({
      stdout: command.startsWith("$remaining") ? "none" : "",
      stderr: command.startsWith("$remaining") ? "" : "process not found",
      code: command.startsWith("$remaining") ? 0 : 1,
    }));
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const reservation = {
      id: "renewed-cleanup-already-gone",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "auto-update", launchAfterUpdate: true },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    await dispatch(EventType.PROCESS_START, processPayload(512));
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 512,
    });
    await dispatch(EventType.PATCH_UI_TITLE_TICK, {
      processName: "PathOfExile_KG",
      pid: 512,
      title: "완료",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
    });

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(2);
  });

  it("preserves the already started game when launch-after-update finds no patch", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const reservation = {
      id: "renewed-auto-no-update",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "auto-update", launchAfterUpdate: true },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    await dispatch(EventType.PROCESS_START, processPayload(601));
    await dispatch(EventType.LOG_GAME_STARTUP, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 601,
    });

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(1);
    expect(eventBus.emit).not.toHaveBeenCalledWith(
      EventType.PROCESS_WILL_TERMINATE,
      expect.anything(),
      expect.anything(),
    );
  });

  it("terminates instead of relaunching after a recurring automatic update", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const due = new Date(NOW.getTime() + 1_000);
    const localTime = [due.getHours(), due.getMinutes(), due.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const reservation = {
      id: "renewed-daily-auto",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "daily", localTime },
      action: { kind: "auto-update" },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    await dispatch(EventType.PROCESS_START, processPayload(701));
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 701,
    });
    await dispatch(EventType.PATCH_UI_TITLE_TICK, {
      processName: "PathOfExile_KG",
      pid: 701,
      title: "완료",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
    });

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(1);
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.PROCESS_WILL_TERMINATE,
      context,
      { pid: 701 },
    );
    expect(config.renewedPatchReservations).toHaveLength(1);
  });

  it("rechecks game activity after a slow remote lookup", async () => {
    let resolveRemote!: (value: ReturnType<typeof remoteVersion>) => void;
    vi.mocked(RemoteVersionResolver.resolveFresh).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemote = resolve;
        }),
    );
    const reservation = {
      id: "renewed-busy-during-check",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "auto-update", launchAfterUpdate: false },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    updateGameStatusCache({
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      status: "running",
    });
    resolveRemote(remoteVersion("4.4.0.13"));
    await Promise.resolve();
    await Promise.resolve();

    expect(eventBus.emit).not.toHaveBeenCalledWith(
      EventType.UI_GAME_START_CLICK,
      expect.anything(),
      expect.anything(),
    );
    expect(config.renewedPatchReservations).toEqual([]);
  });

  it("keeps an in-flight occurrence alive when another reservation changes", async () => {
    let resolveRemote!: (value: ReturnType<typeof remoteVersion>) => void;
    vi.mocked(RemoteVersionResolver.resolveFresh).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemote = resolve;
        }),
    );
    const activeReservation = {
      id: "renewed-in-flight",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "auto-update", launchAfterUpdate: false },
    } satisfies RenewedPatchReservation;
    const unrelatedReservation = {
      id: "renewed-unrelated",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 60_000).toISOString(),
      },
      action: { kind: "notify" },
    } satisfies RenewedPatchReservation;

    await startRenewedService([activeReservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    config.renewedPatchReservations = [activeReservation, unrelatedReservation];
    await dispatch(EventType.CONFIG_CHANGE, {
      key: "renewedPatchReservations",
      oldValue: [activeReservation],
      newValue: config.renewedPatchReservations,
    });

    resolveRemote(remoteVersion("4.4.0.13"));
    await Promise.resolve();
    await Promise.resolve();

    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.UI_GAME_START_CLICK,
      context,
      expect.objectContaining({ gameId: GAME_ID, serviceId: SERVICE_ID }),
    );
    expect(config.renewedPatchReservations).toEqual([unrelatedReservation]);
  });

  it("ignores a late remote lookup result after the service stops", async () => {
    let resolveRemote!: (value: ReturnType<typeof remoteVersion>) => void;
    vi.mocked(RemoteVersionResolver.resolveFresh).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemote = resolve;
        }),
    );
    const reservation = {
      id: "renewed-stop-in-flight",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "notify" },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    await service?.stop();
    resolveRemote(remoteVersion("4.4.0.13"));
    await Promise.resolve();
    await Promise.resolve();

    expect(config.renewedPatchReservations).toEqual([reservation]);
    expect(logger.log).not.toHaveBeenCalledWith(
      expect.stringContaining("4.4.0.13 업데이트가 확인되었습니다"),
    );
    expect(eventBus.emit).not.toHaveBeenCalledWith(
      EventType.UI_GAME_START_CLICK,
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not revive renewed schedules from config changes after stop", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    await startRenewedService([]);
    await service?.stop();
    const reservation = {
      id: "renewed-after-stop",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: {
        kind: "once-at",
        at: new Date(NOW.getTime() + 1_000).toISOString(),
      },
      action: { kind: "notify" },
    } satisfies RenewedPatchReservation;
    config.renewedPatchReservations = [reservation];

    await dispatch(EventType.CONFIG_CHANGE, {
      key: "renewedPatchReservations",
      oldValue: [],
      newValue: [reservation],
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(RemoteVersionResolver.resolveFresh).not.toHaveBeenCalled();
    expect(service?.addRenewedReservation(reservation)).toEqual({
      ok: false,
      reason: "service-unavailable",
    });
  });

  it("does not cancel a simultaneous occurrence when its sibling is removed", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const at = new Date(NOW.getTime() + 1_000).toISOString();
    const first = {
      id: "renewed-simultaneous-a",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "once-at", at },
      action: { kind: "auto-update", launchAfterUpdate: false },
    } satisfies RenewedPatchReservation;
    const second = {
      ...first,
      id: "renewed-simultaneous-b",
    } satisfies RenewedPatchReservation;

    await startRenewedService([first, second]);
    await vi.advanceTimersByTimeAsync(1_000);
    await dispatch(EventType.PROCESS_START, processPayload(801));
    await dispatch(EventType.LOG_GAME_STARTUP, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 801,
    });

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(config.renewedPatchReservations).toEqual([]);
    expect(launchEvents).toHaveLength(2);
  });

  it("does not start a queued recurring update after that reservation is deleted", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const due = new Date(NOW.getTime() + 1_000);
    const localTime = [due.getHours(), due.getMinutes(), due.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const first = {
      id: "renewed-recurring-active",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "daily", localTime },
      action: { kind: "auto-update" },
    } satisfies RenewedPatchReservation;
    const deletedWhileQueued = {
      ...first,
      id: "renewed-recurring-queued",
    } satisfies RenewedPatchReservation;

    await startRenewedService([first, deletedWhileQueued]);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(service?.deleteRenewedReservation(deletedWhileQueued.id)).toEqual({
      ok: true,
    });
    await dispatch(EventType.PROCESS_START, processPayload(851));
    await dispatch(EventType.LOG_GAME_STARTUP, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 851,
    });
    await Promise.resolve();
    await Promise.resolve();

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "Canceled queued renewed update for removed reservation",
      ),
    );
  });

  it("finishes launch-after-update before revalidating the next queue item", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    let launchCount = 0;
    vi.mocked(eventBus.emit).mockImplementation(async (type) => {
      if (type !== EventType.UI_GAME_START_CLICK) return;
      launchCount += 1;
      if (launchCount === 2) {
        updateGameStatusCache({
          gameId: GAME_ID,
          serviceId: SERVICE_ID,
          status: "preparing",
        });
      }
    });
    const at = new Date(NOW.getTime() + 1_000).toISOString();
    const first = {
      id: "renewed-queue-launch",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "once-at", at },
      action: { kind: "auto-update", launchAfterUpdate: true },
    } satisfies RenewedPatchReservation;
    const second = {
      ...first,
      id: "renewed-queue-next",
      action: { kind: "auto-update", launchAfterUpdate: false },
    } satisfies RenewedPatchReservation;

    await startRenewedService([first, second]);
    await vi.advanceTimersByTimeAsync(1_000);
    await dispatch(EventType.PROCESS_START, processPayload(901));
    await dispatch(EventType.LOG_PATCH_CHECK_COMPLETE, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 901,
    });
    await dispatch(EventType.PATCH_UI_TITLE_TICK, {
      processName: "PathOfExile_KG",
      pid: 901,
      title: "완료",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
    });

    expect(launchCount).toBe(2);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "실행 중이거나 시작 중이어서 예약 업데이트를 시작하지 않았습니다",
      ),
    );
  });

  it("ignores a terminal log event correlated to an older attempt", async () => {
    await startService();
    autoPatchCorrelation.pidRunIds.set(999, "stale-run");

    await dispatch(EventType.LOG_GAME_STARTUP, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      pid: 999,
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("FINAL FAILURE"),
    );
    expect(logger.log).not.toHaveBeenCalledWith(
      expect.stringContaining("패치를 시도했으나 업데이트가 없었습니다"),
    );
  });

  it("uses a new run id for retry attempts", async () => {
    await startService();
    const firstRunId = autoPatchCorrelation.expectedRunId;

    await dispatch(EventType.PATCH_RETRY_REQUESTED, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      retryCount: 1,
      runId: firstRunId,
    });
    await dispatch(EventType.PATCH_RESERVATION_FAILED, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      reason: "retry",
      runId: firstRunId,
    });

    expect(autoPatchCorrelation.expectedRunId).toBeDefined();
    expect(autoPatchCorrelation.expectedRunId).not.toBe(firstRunId);
  });

  it("retries an active recurring reservation with a new run id", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const due = new Date(NOW.getTime() + 1_000);
    const localTime = [due.getHours(), due.getMinutes(), due.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const reservation = {
      id: "renewed-recurring-retry",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "daily", localTime },
      action: { kind: "auto-update" },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    const firstRunId = autoPatchCorrelation.expectedRunId;

    await dispatch(EventType.PATCH_RETRY_REQUESTED, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      retryCount: 1,
      runId: firstRunId,
    });
    await dispatch(EventType.PATCH_RESERVATION_FAILED, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      reason: "retry",
      runId: firstRunId,
    });
    await Promise.resolve();
    await Promise.resolve();

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(2);
    expect(autoPatchCorrelation.expectedRunId).toBeDefined();
    expect(autoPatchCorrelation.expectedRunId).not.toBe(firstRunId);
  });

  it("cancels a recurring retry when its original reservation is deleted", async () => {
    vi.mocked(RemoteVersionResolver.resolveFresh).mockResolvedValue(
      remoteVersion("4.4.0.13"),
    );
    const due = new Date(NOW.getTime() + 1_000);
    const localTime = [due.getHours(), due.getMinutes(), due.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const reservation = {
      id: "renewed-recurring-retry-deleted",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "daily", localTime },
      action: { kind: "auto-update" },
    } satisfies RenewedPatchReservation;

    await startRenewedService([reservation]);
    await vi.advanceTimersByTimeAsync(1_000);
    const firstRunId = autoPatchCorrelation.expectedRunId;

    await dispatch(EventType.PATCH_RETRY_REQUESTED, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      retryCount: 1,
      runId: firstRunId,
    });
    expect(service?.deleteRenewedReservation(reservation.id)).toEqual({
      ok: true,
    });
    await dispatch(EventType.PATCH_RESERVATION_FAILED, {
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      reason: "retry",
      runId: firstRunId,
    });
    await Promise.resolve();
    await Promise.resolve();

    const launchEvents = vi
      .mocked(eventBus.emit)
      .mock.calls.filter(
        ([eventType]) => eventType === EventType.UI_GAME_START_CLICK,
      );
    expect(launchEvents).toHaveLength(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "Canceled queued renewed update for removed reservation",
      ),
    );
  });

  it("rejects a one-time reservation that is already due", async () => {
    await startRenewedService([]);
    const result = service?.addRenewedReservation({
      id: "renewed-past",
      gameId: GAME_ID,
      serviceId: SERVICE_ID,
      createdAt: NOW.toISOString(),
      schedule: { kind: "once-at", at: NOW.toISOString() },
      action: { kind: "notify" },
    });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(config.renewedPatchReservations).toEqual([]);
  });
});

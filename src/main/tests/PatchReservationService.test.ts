import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eventBus } from "../events/EventBus";
import { AppContext, AppEvent, EventHandler, EventType } from "../events/types";
import { PatchReservationService } from "../services/PatchReservationService";
import { logger } from "../utils/logger";

import type { AppConfig, PatchReservation } from "../../shared/types";

vi.mock("electron", () => ({
  Notification: {
    isSupported: vi.fn(() => false),
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
  registerAutoPatchExpectation: vi.fn(),
}));

vi.mock("../utils/config-utils", () => ({
  setConfigWithEvent: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../utils/powershell", () => ({
  PowerShellManager: {
    getInstance: vi.fn(() => ({
      execute: vi.fn(async () => undefined),
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
    } as AppConfig;
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
    service = null;

    vi.mocked(eventBus.register).mockImplementation((handler) => {
      const captured = handler as EventHandler<AppEvent>;
      handlers.set(handlerKey(captured.targetEvent, captured.id), captured);
    });
    vi.mocked(eventBus.off).mockImplementation((type, id) => {
      handlers.delete(handlerKey(type, id));
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
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("FINAL FAILURE"),
    );
  });
});

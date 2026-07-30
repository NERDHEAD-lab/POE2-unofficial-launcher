import { describe, expect, it, vi } from "vitest";

import {
  AutoPatchProcessStartHandler,
  clearAutoPatchRun,
  getAutoPatchRunIdForPid,
  LogSessionHandler,
  registerAutoPatchExpectation,
} from "../events/handlers/AutoPatchHandler";
import { EventType } from "../events/types";

vi.mock("../services/PatchManager", () => ({
  PatchManager: class {},
}));

vi.mock("../events/EventBus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("../utils/config-utils", () => ({
  setConfigWithEvent: vi.fn(),
}));

vi.mock("../utils/powershell", () => ({
  PowerShellManager: { getInstance: vi.fn() },
}));

vi.mock("../utils/registry", () => ({
  getGameInstallPath: vi.fn(),
}));

describe("auto-patch run correlation", () => {
  it("binds a run id to the claimed PID and its log session", async () => {
    const runId = "run-correlation-1";
    const context = {} as never;
    registerAutoPatchExpectation("POE2", "Kakao Games", 0, runId);

    await AutoPatchProcessStartHandler.handle(
      {
        type: EventType.PROCESS_START,
        payload: {
          pid: 41001,
          name: "PathOfExile_KG.exe",
          gameId: "POE2",
          serviceId: "Kakao Games",
        },
      },
      context,
    );
    expect(getAutoPatchRunIdForPid(41001)).toBe(runId);

    await LogSessionHandler.handle(
      {
        type: EventType.LOG_SESSION_START,
        payload: {
          pid: 41001,
          gameId: "POE2",
          serviceId: "Kakao Games",
          timestamp: Date.now(),
        },
      },
      context,
    );
    expect(getAutoPatchRunIdForPid(41001)).toBe(runId);

    clearAutoPatchRun(runId);
    expect(getAutoPatchRunIdForPid(41001)).toBeUndefined();
  });

  it("does not let an unclaimed stale log session consume a new expectation", async () => {
    const runId = "run-correlation-2";
    registerAutoPatchExpectation("POE1", "GGG", 0, runId);

    await LogSessionHandler.handle(
      {
        type: EventType.LOG_SESSION_START,
        payload: {
          pid: 41002,
          gameId: "POE1",
          serviceId: "GGG",
          timestamp: Date.now(),
        },
      },
      {} as never,
    );

    expect(getAutoPatchRunIdForPid(41002)).toBeUndefined();
    clearAutoPatchRun(runId);
  });
});

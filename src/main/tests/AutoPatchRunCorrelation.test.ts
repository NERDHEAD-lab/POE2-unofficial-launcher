import { describe, expect, it, vi } from "vitest";

import {
  AutoPatchProcessStartHandler,
  clearAutoPatchRun,
  confirmGameVersionForPid,
  getAutoPatchRunIdForPid,
  LogSessionHandler,
  LogWebRootHandler,
  GameVersionCompletionHandler,
  registerAutoPatchExpectation,
} from "../events/handlers/AutoPatchHandler";
import { EventType } from "../events/types";
import { setConfigWithEvent } from "../utils/config-utils";

import type { AppConfig } from "../../shared/types";

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
  it("accepts an explicitly owned PID's early WebRoot only with a new matching startup, and refuses another run or target", async () => {
    const config = { knownGameVersions: {} } as AppConfig;
    vi.mocked(setConfigWithEvent).mockImplementation((key, value) => {
      (config as unknown as Record<string, unknown>)[key] = value;
    });
    const context = { getConfig: () => config } as never;
    const base = {
      pid: 41004,
      gameId: "POE2",
      serviceId: "Kakao Games",
      installPath: "D:\\Fixture\\POE2",
      timestamp: Date.now(),
      sourcePid: 41004,
    } as const;
    const target = {
      gameId: base.gameId,
      serviceId: base.serviceId,
      installPath: base.installPath,
      webRoot: "https://server/patch/0.5.5.4.2/",
      version: "0.5.5.4.2",
      status: "ok",
      source: "master-socket",
      fetchedAt: 1,
      sourceTimestamp: null,
      revision: 1,
    } as const;
    registerAutoPatchExpectation(
      base.gameId,
      base.serviceId,
      0,
      "proof-run",
      target,
    );
    await AutoPatchProcessStartHandler.handle(
      {
        type: EventType.PROCESS_START,
        payload: { ...base, name: "PathOfExile_KG.exe" },
      },
      context,
    );
    await LogSessionHandler.handle(
      { type: EventType.LOG_SESSION_START, payload: base },
      context,
    );
    await LogWebRootHandler.handle(
      {
        type: EventType.LOG_WEB_ROOT_FOUND,
        payload: { ...base, webRoot: target.webRoot, isHistorical: true },
      },
      context,
    );
    expect(
      confirmGameVersionForPid(
        context,
        base.pid,
        "other-run",
        "patch-done",
        target,
      ),
    ).toBe(false);
    expect(
      confirmGameVersionForPid(context, base.pid, "proof-run", "patch-done", {
        ...target,
        installPath: "E:\\Other",
      }),
    ).toBe(false);
    await GameVersionCompletionHandler.handle(
      {
        type: EventType.LOG_GAME_STARTUP,
        payload: { ...base, isHistorical: false, startupTime: 1 },
      },
      context,
    );
    expect(
      config.knownGameVersions["POE2_Kakao Games"].completed,
    ).toMatchObject({ runId: "proof-run", version: "0.5.5.4.2" });
    await LogWebRootHandler.handle(
      {
        type: EventType.LOG_WEB_ROOT_FOUND,
        payload: {
          ...base,
          webRoot: "https://server/patch/different/",
          isHistorical: false,
        },
      },
      context,
    );
    expect(
      confirmGameVersionForPid(
        context,
        base.pid,
        "proof-run",
        "patch-done",
        target,
      ),
    ).toBe(false);
    clearAutoPatchRun("proof-run");
  });
  it("records WebRoot as observation and confirms only newly appended startup from that same session", async () => {
    const config = { knownGameVersions: {} } as AppConfig;
    vi.mocked(setConfigWithEvent).mockImplementation((key, value) => {
      (config as unknown as Record<string, unknown>)[key] = value;
    });
    const context = { getConfig: () => config } as never;
    const base = {
      pid: 41003,
      gameId: "POE2",
      serviceId: "Kakao Games",
      installPath: "D:\\Fixture\\POE2",
      timestamp: Date.now(),
    } as const;
    await LogSessionHandler.handle(
      { type: EventType.LOG_SESSION_START, payload: base },
      context,
    );
    const webRoot = "https://server.example/patch/0.5.5.4.2/";
    await LogWebRootHandler.handle(
      {
        type: EventType.LOG_WEB_ROOT_FOUND,
        payload: { ...base, webRoot, isHistorical: true },
      },
      context,
    );
    expect(
      config.knownGameVersions["POE2_Kakao Games"].completed,
    ).toBeUndefined();
    await GameVersionCompletionHandler.handle(
      {
        type: EventType.LOG_GAME_STARTUP,
        payload: { ...base, startupTime: 1, isHistorical: false },
      },
      context,
    );
    expect(
      config.knownGameVersions["POE2_Kakao Games"].completed,
    ).toBeUndefined();
    await GameVersionCompletionHandler.handle(
      {
        type: EventType.LOG_GAME_STARTUP,
        payload: { ...base, startupTime: 1, isHistorical: true },
      },
      context,
    );
    expect(
      config.knownGameVersions["POE2_Kakao Games"].completed,
    ).toBeUndefined();
    await LogWebRootHandler.handle(
      {
        type: EventType.LOG_WEB_ROOT_FOUND,
        payload: { ...base, webRoot, isHistorical: false },
      },
      context,
    );
    await GameVersionCompletionHandler.handle(
      {
        type: EventType.LOG_GAME_STARTUP,
        payload: { ...base, startupTime: 1, isHistorical: false },
      },
      context,
    );
    expect(
      config.knownGameVersions["POE2_Kakao Games"].completed,
    ).toMatchObject({
      version: "0.5.5.4.2",
      installPath: base.installPath,
      evidence: "game-startup",
    });
  });

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

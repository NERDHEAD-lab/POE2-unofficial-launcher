import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPatchReservationService,
  getProcessWatcher,
  initializeCoreServices,
} from "../services/register-services";
import { serviceManager } from "../services/ServiceManager";

import type { AppContext } from "../events/types";

vi.mock("../services/ServiceManager", () => ({
  serviceManager: {
    get: vi.fn(),
    initAll: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock("../services/ThemeCacheManager", () => ({
  themeCacheManager: {
    id: "ThemeCacheManager",
  },
}));

vi.mock("../services/ProcessWatcher", () => ({
  ProcessWatcher: class MockProcessWatcher {
    public readonly id = "ProcessWatcher";
  },
}));

vi.mock("../services/LogWatcher", () => ({
  LogWatcher: class MockLogWatcher {
    public readonly id = "LogWatcher";
  },
}));

vi.mock("../services/PatchReservationService", () => ({
  PatchReservationService: class MockPatchReservationService {
    public readonly id = "PatchReservationService";
  },
}));

vi.mock("../services/UpdateSchedulerService", () => ({
  UpdateSchedulerService: class MockUpdateSchedulerService {
    public readonly id = "UpdateSchedulerService";
  },
}));

vi.mock("../services/EventNotificationService", () => ({
  EventNotificationService: class MockEventNotificationService {
    readonly id = "EventNotificationService";
  },
}));

describe("initializeCoreServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serviceManager.initAll).mockResolvedValue(undefined);
  });

  it("registers core services in the previous main-process order", async () => {
    const processWatcher = { id: "ProcessWatcher", stop: vi.fn() };
    vi.mocked(serviceManager.get).mockReturnValue(processWatcher);

    const result = await initializeCoreServices({} as AppContext);

    expect(
      vi.mocked(serviceManager.register).mock.calls.map(([service]) => {
        return service.id;
      }),
    ).toEqual([
      "ThemeCacheManager",
      "ProcessWatcher",
      "LogWatcher",
      "PatchReservationService",
      "UpdateSchedulerService",
      "EventNotificationService",
    ]);
    expect(serviceManager.initAll).toHaveBeenCalledOnce();
    expect(result.processWatcher).toBe(processWatcher);
  });

  it("uses stable service ids for runtime lookups", () => {
    getProcessWatcher();
    getPatchReservationService();

    expect(serviceManager.get).toHaveBeenNthCalledWith(1, "ProcessWatcher");
    expect(serviceManager.get).toHaveBeenNthCalledWith(
      2,
      "PatchReservationService",
    );
  });
});

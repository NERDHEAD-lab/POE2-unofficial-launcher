import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncAutoLaunch } from "../events/handlers/AutoLaunchHandler";

const mocks = vi.hoisted(() => ({
  isPackaged: true,
  getConfig: vi.fn(),
  setLoginItemSettings: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged;
    },
    setLoginItemSettings: mocks.setLoginItemSettings,
  },
}));

vi.mock("../store", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../utils/logger", () => ({
  logger: { log: vi.fn(), error: vi.fn() },
}));

describe("syncAutoLaunch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPackaged = true;
  });

  it.each([
    { autoLaunch: true, startMinimized: true, args: ["--hidden"] },
    { autoLaunch: true, startMinimized: false, args: [] },
    { autoLaunch: false, startMinimized: true, args: ["--hidden"] },
    { autoLaunch: false, startMinimized: false, args: [] },
  ])(
    "registers Windows login settings for autoLaunch=$autoLaunch, startMinimized=$startMinimized",
    async ({ autoLaunch, startMinimized, args }) => {
      mocks.getConfig.mockReturnValue({ autoLaunch, startMinimized });

      await syncAutoLaunch();

      expect(mocks.setLoginItemSettings).toHaveBeenCalledExactlyOnceWith({
        openAtLogin: autoLaunch,
        args,
      });
    },
  );

  it("does not register login settings in development", async () => {
    mocks.isPackaged = false;
    mocks.getConfig.mockReturnValue({
      autoLaunch: true,
      startMinimized: true,
    });

    await syncAutoLaunch();

    expect(mocks.setLoginItemSettings).not.toHaveBeenCalled();
  });
});

import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronState = vi.hoisted(() => ({
  isPackaged: false,
  setPath: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:\\Users\\test\\AppData\\Roaming"),
    get isPackaged() {
      return electronState.isPackaged;
    },
    setPath: electronState.setPath,
  },
}));

vi.mock("electron-store", () => ({
  default: class MockStore {},
}));

describe("QA user data path", () => {
  beforeEach(() => {
    vi.resetModules();
    electronState.isPackaged = false;
    electronState.setPath.mockClear();
    delete process.env.ELECTRON_QA_USER_DATA_DIR;
  });

  afterEach(() => {
    delete process.env.ELECTRON_QA_USER_DATA_DIR;
  });

  it("uses the isolated path only in development", async () => {
    process.env.ELECTRON_QA_USER_DATA_DIR = "D:\\temp\\poe2-hidden-qa";

    await import("../store");

    expect(electronState.setPath).toHaveBeenCalledWith(
      "userData",
      "D:\\temp\\poe2-hidden-qa",
    );
  });

  it("ignores the QA override in a packaged app", async () => {
    electronState.isPackaged = true;
    process.env.ELECTRON_QA_USER_DATA_DIR = "D:\\temp\\poe2-hidden-qa";

    await import("../store");

    expect(electronState.setPath).toHaveBeenCalledWith(
      "userData",
      path.join(
        "C:\\Users\\test\\AppData\\Roaming",
        "POE2 Unofficial Launcher",
      ),
    );
  });
});

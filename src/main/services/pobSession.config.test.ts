import { describe, expect, it, vi } from "vitest";

import { PoBSession } from "./pobSession";

import type { PobConfigSnapshot } from "../../shared/types";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
  BrowserWindow: {
    fromWebContents: () => null,
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

const emptySnapshot: PobConfigSnapshot = {
  activeConfigSetId: 1,
  configSets: [{ id: 1, index: 1, title: "Default", active: true }],
  search: "",
  showAll: false,
  sections: [],
};

describe("PoBSession Config RPC", () => {
  it("requests the active build config snapshot", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);

    await expect(session.configSnapshot()).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.config.snapshot");
  });

  it("forwards typed config actions", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);
    const action = {
      type: "setOption",
      var: "conditionFullLife",
      value: true,
    } as const;

    await expect(session.configAction(action)).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledWith("pob.config.action", action);
  });
});

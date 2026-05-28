import { describe, expect, it, vi } from "vitest";

import type { PobNotesSnapshot } from "@poe2-launcher/shared/types";

import { PoBSession } from "./session";

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

const emptySnapshot: PobNotesSnapshot = {
  text: "",
  showColorCodes: false,
  dirty: false,
  description: [],
  colorControls: [],
  toggleButton: {
    label: "Show Color Codes",
    shown: true,
    enabled: true,
    tooltip: null,
  },
};

describe("PoBSession Notes RPC", () => {
  it("requests the active build Notes snapshot", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);

    await expect(session.notesSnapshot()).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.notes.snapshot");
  });

  it("forwards typed Notes actions", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);
    const action = {
      type: "insertColor",
      code: "^7",
      selectionStartByte: 0,
      selectionEndByte: 0,
    } as const;

    await expect(session.notesAction(action)).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledWith("pob.notes.action", action);
  });
});

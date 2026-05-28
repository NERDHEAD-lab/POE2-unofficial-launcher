import { describe, expect, it, vi } from "vitest";

import type { PobTreeNodeTooltip } from "@poe2-launcher/shared/types";

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

const emptyTooltip: PobTreeNodeTooltip = {
  nodeId: 42,
  header: "NOTABLE",
  lines: [],
};

describe("PoBSession Tree RPC", () => {
  it("requests the active build tree node tooltip", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptyTooltip);

    await expect(session.treeNodeTooltip(42)).resolves.toBe(emptyTooltip);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.tree.nodeTooltip", { nodeId: 42 });
  });
});

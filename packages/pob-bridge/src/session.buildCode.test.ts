import { describe, expect, it, vi } from "vitest";

import {
  decodePobBuildCodeXml,
  encodePobBuildCodeXml,
} from "@poe2-launcher/pob-repoe/buildCode";

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

describe("PoBSession build code API", () => {
  it("decodes build code input before loading XML into Lua", async () => {
    const xml = '<PathOfBuilding2><Build level="1" /></PathOfBuilding2>';
    const code = encodePobBuildCodeXml(xml);
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue({ ok: true });

    await expect(session.loadBuildCode(code, "Code build")).resolves.toEqual({
      ok: true,
    });

    expect(call).toHaveBeenCalledWith("pob.loadBuildXml", {
      xml,
      name: "Code build",
    });
  });

  it("encodes exported XML with the same direct build code format", async () => {
    const xml = '<PathOfBuilding2><Build level="1" /></PathOfBuilding2>';
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue({ xml });

    const result = await session.exportBuildCode();

    expect(call).toHaveBeenCalledWith("pob.exportBuildXml");
    expect(decodePobBuildCodeXml(result.code)).toBe(xml);
  });
});

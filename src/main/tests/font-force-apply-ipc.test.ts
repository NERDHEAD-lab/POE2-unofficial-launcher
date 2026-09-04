import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { FontIpcHandler } from "../events/handlers/FontIpcHandler";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getPolicy: vi.fn(),
  setPolicy: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler),
  },
}));
vi.mock("../services/FontManager", () => ({ FontManager: {} }));
vi.mock("../services/ProcessFontMitigationService", () => ({
  ProcessFontMitigationService: { getInstance: () => mocks },
}));

beforeAll(() => FontIpcHandler.register());

describe("font policy IPC contract", () => {
  it("delegates read and mutation through the font domain", async () => {
    expect(mocks.handlers.has("font:get-force-apply-policy")).toBe(true);
    expect(mocks.handlers.has("font:set-force-apply-policy")).toBe(true);
    await mocks.handlers.get("font:get-force-apply-policy")!({});
    await mocks.handlers.get("font:set-force-apply-policy")!({}, true);
    expect(mocks.getPolicy).toHaveBeenCalledWith();
    expect(mocks.setPolicy).toHaveBeenCalledWith(true);
  });
  it("rejects nonboolean renderer input before service dispatch", async () => {
    const handler = mocks.handlers.get("font:set-force-apply-policy");
    expect(handler).toBeTypeOf("function");
    mocks.setPolicy.mockClear();
    await expect(
      handler!({}, { enabled: true, command: "bad" }),
    ).rejects.toThrow("boolean");
    expect(mocks.setPolicy).not.toHaveBeenCalled();
  });
  it("exposes only fixed-channel invoke methods in preload", () => {
    const preload = readFileSync("src/main/preload.ts", "utf8");
    expect(preload).toContain(
      'ipcRenderer.invoke("font:get-force-apply-policy")',
    );
    expect(preload).toContain(
      'ipcRenderer.invoke("font:set-force-apply-policy", enabled)',
    );
  });
});

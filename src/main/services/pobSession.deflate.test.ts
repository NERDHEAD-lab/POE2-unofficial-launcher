import { describe, expect, it, vi } from "vitest";

import {
  deflateRawBase64,
  handlePobInternalRpc,
  inflateRawBase64,
} from "./pobSession";

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

const roundTrip = (input: Buffer): Buffer => {
  const compressed = deflateRawBase64(input.toString("base64"));
  return Buffer.from(inflateRawBase64(compressed), "base64");
};

describe("PoBSession Deflate/Inflate bridge", () => {
  it.each([
    ["plain text", Buffer.from("Path of Building build code", "utf8")],
    ["empty", Buffer.alloc(0)],
    ["korean", Buffer.from("몽크 인보커 빌드", "utf8")],
    ["binary", Buffer.from(Array.from({ length: 256 }, (_, i) => i))],
    ["large", Buffer.alloc(1024 * 1024, "a")],
  ])("round-trips %s payloads", (_label, input) => {
    expect(roundTrip(input).equals(input)).toBe(true);
  });

  it("handles Lua internal RPC payload shape", () => {
    const source = Buffer.from("<PathOfBuilding2 />", "utf8");
    const compressed = handlePobInternalRpc("_internal.deflate", {
      data: source.toString("base64"),
    });
    const inflated = handlePobInternalRpc("_internal.inflate", compressed);

    expect(Buffer.from(inflated.data, "base64").equals(source)).toBe(true);
  });

  it("throws on corrupted compressed data", () => {
    const corrupted = Buffer.from("not compressed").toString("base64");
    expect(() => inflateRawBase64(corrupted)).toThrow();
  });
});

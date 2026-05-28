import { describe, expect, it } from "vitest";

import { getDdsLayerRange, parseDdsHeader } from "./DdsDecoder";

const setU32 = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value, true);
};

const makeDx10Header = (
  width: number,
  height: number,
  mipMapCount: number,
  dxgiFormat: number,
  arraySize: number,
): Uint8Array => {
  const bytes = new Uint8Array(148);
  const view = new DataView(bytes.buffer);
  setU32(view, 0, 0x20534444); // "DDS "
  setU32(view, 12, height);
  setU32(view, 16, width);
  setU32(view, 28, mipMapCount);
  setU32(view, 80, 0x4);
  setU32(view, 84, 0x30315844); // "DX10"
  setU32(view, 128, dxgiFormat);
  setU32(view, 132, 3);
  setU32(view, 140, arraySize);
  return bytes;
};

describe("DdsDecoder", () => {
  it("parses DX10 texture arrays", () => {
    const header = parseDdsHeader(makeDx10Header(64, 64, 7, 71, 123));

    expect(header).toMatchObject({
      width: 64,
      height: 64,
      mipMapCount: 7,
      arraySize: 123,
      dataOffset: 148,
      format: "bc1",
      dxgiFormat: 71,
    });
  });

  it("calculates layer-major BC1 mip offsets", () => {
    const header = parseDdsHeader(makeDx10Header(64, 64, 7, 71, 123));
    const layerSize = 2048 + 512 + 128 + 32 + 8 + 8 + 8;

    expect(getDdsLayerRange(header, 0)).toEqual({
      offset: 148,
      size: 2048,
      width: 64,
      height: 64,
    });
    expect(getDdsLayerRange(header, 46)).toEqual({
      offset: 148 + layerSize * 46,
      size: 2048,
      width: 64,
      height: 64,
    });
  });

  it("calculates RGBA8 array layer sizes", () => {
    const header = parseDdsHeader(makeDx10Header(108, 108, 7, 28, 10));
    const layerSize =
      108 * 108 * 4 +
      54 * 54 * 4 +
      27 * 27 * 4 +
      13 * 13 * 4 +
      6 * 6 * 4 +
      3 * 3 * 4 +
      1 * 1 * 4;

    expect(header.format).toBe("rgba8");
    expect(getDdsLayerRange(header, 9)).toEqual({
      offset: 148 + layerSize * 9,
      size: 108 * 108 * 4,
      width: 108,
      height: 108,
    });
  });

  it("rejects out-of-range texture array layers", () => {
    const header = parseDdsHeader(makeDx10Header(64, 64, 7, 71, 3));
    expect(() => getDdsLayerRange(header, 3)).toThrow(/outside array size/);
  });
});

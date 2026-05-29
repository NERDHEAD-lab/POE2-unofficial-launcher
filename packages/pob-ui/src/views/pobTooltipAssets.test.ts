import { describe, expect, it } from "vitest";

import {
  createPobAssetUrl,
  getPobTooltipBackgroundAsset,
  getPobTooltipHeaderAssets,
  getPobTooltipSeparatorAsset,
} from "./pobTooltipAssets";

describe("pobTooltipAssets", () => {
  it("maps item tooltip headers to original PoB item header assets", () => {
    expect(getPobTooltipHeaderAssets("RARE")).toEqual({
      left: "Assets/itemsheaderrareleft.png",
      middle: "Assets/itemsheaderraremiddle.png",
      right: "Assets/itemsheaderrareright.png",
      height: 58,
      sideWidth: 47,
      middleWidth: 47,
    });
    expect(getPobTooltipHeaderAssets("NORMAL")).toMatchObject({
      left: "Assets/itemsheaderwhiteleft.png",
      height: 38,
      sideWidth: 32,
    });
    expect(getPobTooltipHeaderAssets("GEM")).toEqual({
      left: "Assets/itemsheadergemleft.png",
      middle: "Assets/itemsheadergemmiddle.png",
      right: "Assets/itemsheadergemright.png",
      height: 38,
      sideWidth: 32,
      middleWidth: 32,
    });
  });

  it("maps passive tree tooltip headers to original PoB passive assets", () => {
    expect(getPobTooltipHeaderAssets("ORACLE_KEYSTONE")).toEqual({
      left: "Assets/oraclekeystonepassiveheaderleft.png",
      middle: "Assets/oraclekeystonepassiveheadermiddle.png",
      right: "Assets/oraclekeystonepassiveheaderright.png",
      height: 88,
      sideWidth: 71,
      middleWidth: 71,
    });
    expect(getPobTooltipHeaderAssets("PASSIVE")).toMatchObject({
      left: "Assets/normalpassiveheaderleft.png",
      height: 88,
    });
  });

  it("maps item tooltip separators to original PoB separator assets", () => {
    expect(getPobTooltipSeparatorAsset("UNIQUE")).toBe(
      "Assets/itemsseparatorunique.png",
    );
    expect(getPobTooltipSeparatorAsset("GEM")).toBe(
      "Assets/itemsseparatorgem.png",
    );
    expect(getPobTooltipSeparatorAsset("PASSIVE")).toBeNull();
  });

  it("maps line background metadata to original PoB tooltip background assets", () => {
    expect(getPobTooltipBackgroundAsset("GemHoverModBg")).toBe(
      "Assets/gemhovermodbg.png",
    );
    expect(getPobTooltipBackgroundAsset("Other")).toBeNull();
  });

  it("builds pob-asset protocol URLs from normalized vault paths", () => {
    expect(createPobAssetUrl("D:\\PoB\\0.15.0\\", "Assets/item.png")).toBe(
      "pob-asset://asset/?path=D%3A%2FPoB%2F0.15.0%2FAssets%2Fitem.png",
    );
    expect(createPobAssetUrl(null, "Assets/item.png")).toBeNull();
  });
});

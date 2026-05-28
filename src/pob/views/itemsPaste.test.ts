import { describe, expect, it } from "vitest";

import {
  isEditablePasteTarget,
  readItemCopyTextFromClipboard,
} from "./itemsPaste";

describe("ItemsView paste helpers", () => {
  it("accepts English and Korean item copy text headers", () => {
    expect(
      readItemCopyTextFromClipboard(
        "Rarity: Normal\r\nWrapped Quarterstaff\r\n",
      ),
    ).toBe("Rarity: Normal\nWrapped Quarterstaff");
    expect(
      readItemCopyTextFromClipboard("아이템 희귀도: 일반\n감싼 육척봉"),
    ).toBe("아이템 희귀도: 일반\n감싼 육척봉");
  });

  it("ignores non-item clipboard text", () => {
    expect(readItemCopyTextFromClipboard("not an item")).toBeNull();
    expect(readItemCopyTextFromClipboard("")).toBeNull();
  });

  it("detects editable paste targets", () => {
    expect(isEditablePasteTarget(document.createElement("textarea"))).toBe(
      true,
    );
    expect(isEditablePasteTarget(document.createElement("input"))).toBe(true);
    expect(isEditablePasteTarget(document.createElement("button"))).toBe(false);
  });
});

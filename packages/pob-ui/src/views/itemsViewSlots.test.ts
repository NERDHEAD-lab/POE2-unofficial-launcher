import { describe, expect, it } from "vitest";

import type { PobItemSlot, PobItemSummary } from "@poe2-launcher/shared/types";

import { canInspectSlotItem, isVisibleItemSlot } from "./itemsViewSlots";

const slot = ({
  name,
  visible,
  active,
}: {
  name: string;
  visible: boolean;
  active: boolean;
}): PobItemSlot => ({
  name,
  label: name,
  slotType: null,
  weaponSet: null,
  nodeId: null,
  selItemId: 0,
  visible,
  active,
  canActivate: false,
  validItemIds: [],
});

const item = (): PobItemSummary => ({
  id: 1,
  name: "Test Item",
  rarity: "RARE",
  baseName: null,
  title: null,
  itemLevel: null,
  quality: null,
  corrupted: false,
  mirrored: false,
  shaper: false,
  elder: false,
  fractured: false,
  influences: null,
  baseType: null,
  baseSubType: null,
  implicitLines: [],
  explicitLines: [],
});

describe("ItemsView slots", () => {
  it("uses slot visibility instead of flask/charm activation state", () => {
    const visibleInactiveGear = slot({
      name: "Helmet",
      visible: true,
      active: false,
    });
    const hiddenActiveSwapSlot = slot({
      name: "Weapon 1 Swap",
      visible: false,
      active: true,
    });

    expect(
      [visibleInactiveGear, hiddenActiveSwapSlot].filter(isVisibleItemSlot),
    ).toEqual([visibleInactiveGear]);
  });

  it("only enables slot inspection when an item is equipped", () => {
    expect(canInspectSlotItem(item())).toBe(true);
    expect(canInspectSlotItem(null)).toBe(false);
    expect(canInspectSlotItem(undefined)).toBe(false);
  });
});

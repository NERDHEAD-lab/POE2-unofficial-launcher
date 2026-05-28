import { describe, expect, it } from "vitest";

import { buildItemDetailEditAction } from "./itemsViewDetailMode";

describe("buildItemDetailEditAction", () => {
  it("saves existing custom items through the PoB display item save path", () => {
    expect(
      buildItemDetailEditAction(
        "custom",
        7,
        "Rarity: Rare\nStorm Grasp\nWrapped Quarterstaff",
      ),
    ).toEqual({
      type: "saveCustom",
      itemId: 7,
      raw: "Rarity: Rare\nStorm Grasp\nWrapped Quarterstaff",
    });
  });

  it("adds shared and database edits as new custom items", () => {
    const raw = "Rarity: Normal\nWrapped Quarterstaff";

    expect(buildItemDetailEditAction("shared", 1, raw)).toEqual({
      type: "createCustom",
      raw,
      equip: false,
    });
    expect(buildItemDetailEditAction("db", "unique-id", raw)).toEqual({
      type: "createCustom",
      raw,
      equip: false,
    });
  });

  it("does not emit an action for blank item text", () => {
    expect(buildItemDetailEditAction("custom", 7, "   \n")).toBeNull();
  });
});

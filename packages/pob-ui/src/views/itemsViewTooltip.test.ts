import { describe, expect, it } from "vitest";

import type { PobItemSummary } from "@poe2-launcher/shared/types";

import {
  buildItemTooltipSections,
  computeFloatingItemTooltipPosition,
} from "./itemsViewTooltip";

const labels = {
  baseType: "Base",
  itemLevel: "Item Level",
  quality: "Quality",
  corrupted: "Corrupted",
  mirrored: "Mirrored",
  shaper: "Shaper",
  elder: "Elder",
  fractured: "Fractured",
};

const item = (overrides: Partial<PobItemSummary> = {}): PobItemSummary => ({
  id: 1,
  raw: "Rarity: Rare\nDire Scratch\nWrapped Quarterstaff",
  name: "Dire Scratch Wrapped Quarterstaff",
  rarity: "RARE",
  baseName: "Wrapped Quarterstaff (Expert)",
  title: "Dire Scratch",
  itemLevel: 72,
  quality: 20,
  corrupted: true,
  mirrored: false,
  shaper: false,
  elder: false,
  fractured: false,
  influences: null,
  baseType: "Weapon",
  baseSubType: "Quarterstaff",
  implicitLines: ["16% increased Stun Buildup"],
  explicitLines: ["Adds 10 to 20 Physical Damage"],
  ...overrides,
});

describe("buildItemTooltipSections", () => {
  it("uses PoB item tooltip header order for titled items", () => {
    const sections = buildItemTooltipSections(item(), labels);

    expect(sections[0]).toEqual({
      id: "header",
      lines: [
        { text: "Dire Scratch", tone: "name" },
        { text: "Wrapped Quarterstaff", tone: "base" },
      ],
    });
  });

  it("keeps properties, implicit mods, explicit mods, and flags as separated sections", () => {
    const sections = buildItemTooltipSections(item(), labels);

    expect(sections.map((section) => section.id)).toEqual([
      "header",
      "properties",
      "implicit",
      "explicit",
      "flags",
    ]);
    expect(sections[1].lines.map((line) => line.text)).toEqual([
      "Quality: +20%",
      "Item Level: 72",
    ]);
    expect(sections[2].lines[0].text).toBe("16% increased Stun Buildup");
    expect(sections[3].lines[0].text).toBe("Adds 10 to 20 Physical Damage");
    expect(sections[4].lines[0].text).toBe("Corrupted");
  });

  it("shows the base as a property when there is no separate item title", () => {
    const sections = buildItemTooltipSections(
      item({
        name: "Wrapped Quarterstaff",
        title: null,
        quality: null,
        itemLevel: null,
        corrupted: false,
        implicitLines: [],
        explicitLines: [],
      }),
      labels,
    );

    expect(sections).toEqual([
      {
        id: "header",
        lines: [{ text: "Wrapped Quarterstaff", tone: "name" }],
      },
      {
        id: "properties",
        lines: [{ text: "Base: Wrapped Quarterstaff", tone: "meta" }],
      },
    ]);
  });
});

describe("computeFloatingItemTooltipPosition", () => {
  it("places floating tooltips beside the cursor when the viewport has room", () => {
    expect(
      computeFloatingItemTooltipPosition({
        pointerX: 100,
        pointerY: 120,
        viewportWidth: 1200,
        viewportHeight: 800,
      }),
    ).toMatchObject({
      left: 116,
      top: 136,
      maxHeight: 652,
    });
  });

  it("flips horizontally and keeps tall tooltips inside the viewport", () => {
    expect(
      computeFloatingItemTooltipPosition({
        pointerX: 1180,
        pointerY: 760,
        viewportWidth: 1200,
        viewportHeight: 800,
      }),
    ).toEqual({
      left: 744,
      top: 12,
      maxHeight: 776,
    });
  });
});

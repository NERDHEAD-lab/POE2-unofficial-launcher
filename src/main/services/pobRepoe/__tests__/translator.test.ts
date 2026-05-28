import { describe, expect, it } from "vitest";

import { Translator } from "../translator";

describe("RePoE Translator", () => {
  it("translates passive tree node names by id", () => {
    const translator = new Translator("ko", {
      passiveTree: {
        passives: {
          "4": { id: 4, name: "Shock Chance KO" },
        },
      },
    });

    expect(translator.translateNodeName("4")).toBe("Shock Chance KO");
    expect(translator.translateNodeName("missing", "Fallback")).toBe(
      "Fallback",
    );
  });

  it("translates item names by unique and base item ids", () => {
    const translator = new Translator("ko", {
      uniques: {
        "0": { id: "Bramblejack", name: "Bramblejack KO" },
      },
      baseItems: {
        "Metadata/Items/Armours/BodyArmours/BodyStr1": {
          display_name: "Plate Vest KO",
        },
      },
    });

    expect(translator.translateItemName("Bramblejack")).toBe("Bramblejack KO");
    expect(
      translator.translateItemName(
        "Metadata/Items/Armours/BodyArmours/BodyStr1",
      ),
    ).toBe("Plate Vest KO");
    expect(translator.translateItemName("unknown", "Unknown")).toBe("Unknown");
  });

  it("translates gem names by base item id and granted skill id", () => {
    const translator = new Translator("ko", {
      skillGems: {
        "Metadata/Items/Gem/SkillGemAlchemistsBoon": {
          base_item: {
            id: "Metadata/Items/Gem/SkillGemAlchemistsBoon",
            display_name: "Alchemist's Boon KO",
          },
          grants_skills: ["AlchemistsBoonPlayer"],
        },
      },
    });

    expect(
      translator.translateGemName("Metadata/Items/Gem/SkillGemAlchemistsBoon"),
    ).toBe("Alchemist's Boon KO");
    expect(translator.translateGemName("AlchemistsBoonPlayer")).toBe(
      "Alchemist's Boon KO",
    );
  });

  it("falls back to skill display names when a gem name is unavailable", () => {
    const translator = new Translator("ko", {
      skills: {
        FireballPlayer: {
          active_skill: {
            id: "fireball",
            display_name: "Fireball KO",
          },
        },
      },
    });

    expect(translator.translateGemName("FireballPlayer")).toBe("Fireball KO");
  });

  it("translates stat lines by stat id, condition, and value", () => {
    const translator = new Translator("ko", {
      statTranslations: [
        {
          ids: ["strength_+%"],
          Korean: [
            {
              condition: [{ min: 1, max: null }],
              string: "[Strength|STR_KO] {0}% increased",
            },
            {
              condition: [{ min: null, max: -1 }],
              string: "[Strength|STR_KO] {0}% reduced",
            },
          ],
        },
      ],
    });

    expect(translator.translateStatLine("strength_+%", [12])).toBe(
      "STR_KO 12% increased",
    );
    expect(translator.translateStatLine("strength_+%", [-8])).toBe(
      "STR_KO -8% reduced",
    );
  });

  it("keeps original stat text when no translation is available", () => {
    const translator = new Translator("ko");

    expect(translator.translateStatLine("15% increased Damage", [15])).toBe(
      "15% increased Damage",
    );
  });

  it("uses English markup when translating with English locale", () => {
    const translator = new Translator("en", {
      statTranslations: [
        {
          ids: ["base_strength"],
          English: [
            {
              condition: [{ min: null, max: null }],
              string: "[Strength|STR_KO] {0}",
            },
          ],
        },
      ],
    });

    expect(translator.translateStatLine("base_strength", [20])).toBe(
      "Strength 20",
    );
  });
});

import { describe, expect, it } from "vitest";

import { parseItemCopyText } from "../itemCopyParser";

const parserData = {
  en: {
    itemClasses: {
      Gloves: { display_name: "Gloves" },
    },
    baseItems: {
      "Metadata/Items/Armours/Gloves/GlovesDex1": {
        display_name: "Rawhide Gloves",
      },
    },
    uniques: {
      "Metadata/Items/Uniques/Armours/Gloves/Example": {
        name: "The Example",
      },
    },
  },
  ko: {
    itemClasses: {
      Gloves: { display_name: "장갑" },
    },
    baseItems: {
      "Metadata/Items/Armours/Gloves/GlovesDex1": {
        display_name: "생가죽 장갑",
      },
    },
    uniques: {
      "Metadata/Items/Uniques/Armours/Gloves/Example": {
        name: "예시",
      },
    },
  },
  statTranslations: [
    {
      ids: ["base_maximum_life"],
      English: [
        {
          condition: [{ min: null, max: null }],
          string: "+{0} to maximum Life",
        },
      ],
      Korean: [
        {
          condition: [{ min: null, max: null }],
          string: "최대 생명력 +{0}",
        },
      ],
    },
    {
      ids: ["attack_speed_+%"],
      English: [
        {
          condition: [{ min: null, max: null }],
          string: "{0}% increased Attack Speed",
        },
      ],
      Korean: [
        {
          condition: [{ min: null, max: null }],
          string: "공격 속도 {0}% 증가",
        },
      ],
    },
  ],
};

describe("PoB item copy parser", () => {
  it("passes English item text through with normalized line endings", () => {
    const raw = "Rarity: Rare\r\nStorm Grasp\r\nRawhide Gloves\r\n";

    expect(parseItemCopyText({ rawText: raw })).toEqual({
      status: "ok",
      locale: "en",
      englishText: "Rarity: Rare\nStorm Grasp\nRawhide Gloves",
      warnings: [],
    });
  });

  it("translates Korean item headers, names, requirements, and mapped stat lines", () => {
    const raw = [
      "아이템 종류: 장갑",
      "아이템 희귀도: 희귀",
      "폭풍 손아귀",
      "생가죽 장갑",
      "--------",
      "퀄리티: +20%",
      "요구 사항:",
      "레벨: 10",
      "민첩: 20",
      "--------",
      "아이템 레벨: 72",
      "--------",
      "최대 생명력 +25",
      "공격 속도 8% 증가",
    ].join("\n");

    const result = parseItemCopyText({ rawText: raw, data: parserData });

    expect(result).toEqual({
      status: "ok",
      locale: "ko",
      englishText: [
        "Item Class: Gloves",
        "Rarity: Rare",
        "폭풍 손아귀",
        "Rawhide Gloves",
        "--------",
        "Quality: +20%",
        "Requirements:",
        "Level: 10",
        "Dex: 20",
        "--------",
        "Item Level: 72",
        "--------",
        "+25 to maximum Life",
        "8% increased Attack Speed",
      ].join("\n"),
      warnings: [],
    });
  });

  it("translates Korean unique item names when RePoE ids line up", () => {
    const raw = [
      "아이템 희귀도: 고유",
      "예시",
      "생가죽 장갑",
      "--------",
      "아이템 레벨: 80",
    ].join("\n");

    const result = parseItemCopyText({ rawText: raw, data: parserData });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.englishText.split("\n").slice(0, 3)).toEqual([
        "Rarity: Unique",
        "The Example",
        "Rawhide Gloves",
      ]);
    }
  });

  it("rejects unmapped Korean modifier lines instead of sending them to Lua", () => {
    const raw = [
      "아이템 희귀도: 마법",
      "생가죽 장갑",
      "--------",
      "알 수 없는 피해 10% 증가",
    ].join("\n");

    expect(parseItemCopyText({ rawText: raw, data: parserData })).toEqual({
      status: "error",
      locale: "ko",
      reason: "Unmapped Korean item line: 알 수 없는 피해 10% 증가",
      originalText: raw,
    });
  });

  it("rejects Ctrl+Alt+C advanced item descriptions", () => {
    const raw = ["아이템 희귀도: 마법", "생가죽 장갑", "{ 태그: 공격 }"].join(
      "\n",
    );

    expect(parseItemCopyText({ rawText: raw, data: parserData })).toEqual({
      status: "error",
      locale: "ko",
      reason: "Advanced Item Descriptions (Ctrl+Alt+C) are unsupported",
      originalText: raw,
    });
  });
});

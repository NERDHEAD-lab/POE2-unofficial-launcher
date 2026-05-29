import { describe, expect, it } from "vitest";

import {
  buildLevelActionValue,
  buildPassivePointBudgetDisplayItems,
  resolveBuildMetadataAscendancies,
  sanitizeBuildLevelInput,
} from "./buildMetadataControls";

const passivePointBudget = {
  normal: { used: 102, max: 123, exceeded: false },
  weaponSet1: { used: 0, max: 24, exceeded: false },
  weaponSet2: { used: 0, max: 24, exceeded: false },
  ascendancy: { used: 2, max: 8, exceeded: false },
  requiredLevel: 79,
  act: "Endgame",
  extraSkillPoints: 0,
  tooltip:
    "Required Level: 79\nEstimated Progress:\nAct: Endgame\nExtra Skillpoints: 0",
};

describe("build metadata controls", () => {
  it("mirrors PoB level edit input filtering", () => {
    expect(sanitizeBuildLevelInput("8a1")).toBe("81");
    expect(sanitizeBuildLevelInput("1234")).toBe("123");
  });

  it("clamps level action values to PoB's 1..100 range", () => {
    expect(buildLevelActionValue("")).toBe(1);
    expect(buildLevelActionValue("0")).toBe(1);
    expect(buildLevelActionValue("81")).toBe(81);
    expect(buildLevelActionValue("101")).toBe(100);
  });

  it("uses the selected class ascendancy list", () => {
    expect(
      resolveBuildMetadataAscendancies({
        level: 81,
        levelAutoMode: false,
        classId: 8,
        className: "Monk",
        ascendClassId: 1,
        ascendClassName: "Invoker",
        passivePointBudget,
        classes: [
          {
            id: 3,
            label: "Ranger",
            ascendancies: [{ id: 0, label: "None" }],
          },
          {
            id: 8,
            label: "Monk",
            ascendancies: [
              { id: 0, label: "None" },
              { id: 1, label: "Invoker" },
            ],
          },
        ],
      }),
    ).toEqual([
      { id: 0, label: "None" },
      { id: 1, label: "Invoker" },
    ]);
  });

  it("maps passive point budget buckets to the original PoB display tones", () => {
    expect(
      buildPassivePointBudgetDisplayItems({
        ...passivePointBudget,
        normal: { used: 130, max: 123, exceeded: true },
        ascendancy: { used: 9, max: 8, exceeded: true },
      }).map((item) => ({
        id: item.id,
        tone: item.tone,
        value: `${item.bucket.used} / ${item.bucket.max}`,
      })),
    ).toEqual([
      { id: "normal", tone: "negative", value: "130 / 123" },
      { id: "weaponSet1", tone: "negative", value: "0 / 24" },
      { id: "weaponSet2", tone: "positive", value: "0 / 24" },
      { id: "ascendancy", tone: "negative", value: "9 / 8" },
    ]);
  });
});

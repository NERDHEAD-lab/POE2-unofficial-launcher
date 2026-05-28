import { describe, expect, it } from "vitest";

import {
  buildLevelActionValue,
  resolveBuildMetadataAscendancies,
  sanitizeBuildLevelInput,
} from "./buildMetadataControls";

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
});

import { describe, expect, it } from "vitest";

import {
  assertPobCalcsBreakdown,
  assertPobTreeSnapshot,
} from "./pobOriginalContract";

describe("pobOriginalContract strict shape assertions", () => {
  it("rejects unknown fields on projected PoB snapshots", () => {
    expect(() =>
      assertPobTreeSnapshot({
        treeVersion: "0_4",
        classId: 1,
        className: "Monk",
        ascendClassId: null,
        ascendClassName: null,
        allocCount: 0,
        viewport: null,
        treeSize: null,
        nodes: [],
        typo: true,
      }),
    ).toThrow("tree.typo must be a known PoB field");
  });

  it("validates calcs breakdown projection shape", () => {
    const breakdown = {
      key: "HitDamage:1:1:1",
      sections: [
        {
          type: "BREAKDOWN",
          data: {
            stat: "AverageHit",
            label: "Average Hit",
            footer: null,
            lines: ["100"],
            rowList: null,
            colList: null,
          },
        },
        {
          type: "MODS",
          data: {
            label: "Player modifiers",
            modName: ["Damage"],
            modType: "INC",
            entries: [
              {
                name: "Damage",
                type: "INC",
                value: 10,
                source: "Tree",
                sourceLine: "10% increased Damage",
              },
            ],
          },
        },
      ],
    };

    expect(() => assertPobCalcsBreakdown(breakdown)).not.toThrow();
  });
});

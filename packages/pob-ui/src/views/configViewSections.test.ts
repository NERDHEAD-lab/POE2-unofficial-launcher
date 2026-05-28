import { describe, expect, it } from "vitest";

import type {
  PobConfigOption,
  PobConfigOptionKind,
  PobConfigSection,
} from "@poe2-launcher/shared/types";

import {
  filterConfigSections,
  groupConfigSectionsByColumn,
} from "./configViewSections";

const makeOption = (
  id: string,
  label: string,
  kind: PobConfigOptionKind,
  opts: Partial<PobConfigOption> = {},
): PobConfigOption => ({
  id,
  var: id,
  kind,
  label,
  value: null,
  defaultValue: null,
  placeholder: null,
  shown: true,
  enabled: true,
  modified: false,
  tooltip: null,
  options: [],
  selectedIndex: null,
  resizable: false,
  hideIfInvalid: false,
  doNotHighlight: false,
  ...opts,
});

const makeSection = (
  label: string,
  col: number | null,
  options: PobConfigOption[],
): PobConfigSection => ({
  id: label.replace(/\s+/g, "-").toLowerCase(),
  label,
  col,
  shown: options.some((option) => option.shown),
  options,
});

describe("configViewSections.filterConfigSections", () => {
  const sections = [
    makeSection("General", 1, [
      makeOption("resistancePenalty", "Elemental Resistance penalty:", "list", {
        value: -60,
        options: [
          { index: 1, value: 0, label: "Act 1 (0%)" },
          { index: 7, value: -60, label: "Endgame (-60%)" },
        ],
      }),
      makeOption("hiddenOption", "Hidden", "check", { shown: false }),
    ]),
    makeSection("Enemy Stats", 2, [
      makeOption("enemyLevel", "Enemy Level:", "count", { value: 84 }),
    ]),
  ];

  it("keeps only options currently shown by PoB", () => {
    const result = filterConfigSections(sections, "");

    expect(result).toHaveLength(2);
    expect(result[0].options.map((option) => option.id)).toEqual([
      "resistancePenalty",
    ]);
  });

  it("matches section labels and keeps shown options in that section", () => {
    const result = filterConfigSections(sections, "enemy stats");

    expect(result.map((section) => section.label)).toEqual(["Enemy Stats"]);
    expect(result[0].options.map((option) => option.id)).toEqual([
      "enemyLevel",
    ]);
  });

  it("matches option labels, vars, scalar values, and list labels", () => {
    expect(filterConfigSections(sections, "resistance")[0].options[0].id).toBe(
      "resistancePenalty",
    );
    expect(filterConfigSections(sections, "enemyLevel")[0].options[0].id).toBe(
      "enemyLevel",
    );
    expect(filterConfigSections(sections, "84")[0].options[0].id).toBe(
      "enemyLevel",
    );
    expect(filterConfigSections(sections, "endgame")[0].options[0].id).toBe(
      "resistancePenalty",
    );
  });

  it("returns no sections when nothing matches", () => {
    expect(filterConfigSections(sections, "not-present")).toEqual([]);
  });
});

describe("configViewSections.groupConfigSectionsByColumn", () => {
  it("preserves section order within preferred columns", () => {
    const sections = [
      makeSection("General", 1, []),
      makeSection("Skill Options", 2, []),
      makeSection("Enemy Stats", 2, []),
      makeSection("Quest Rewards", 3, []),
      makeSection("Custom Modifiers", 1, []),
    ];

    const result = groupConfigSectionsByColumn(sections, 3);

    expect(
      result.map((column) => column.map((section) => section.label)),
    ).toEqual([
      ["General", "Custom Modifiers"],
      ["Skill Options", "Enemy Stats"],
      ["Quest Rewards"],
    ]);
  });

  it("clamps missing or out-of-range preferred columns", () => {
    const sections = [
      makeSection("Fallback", null, []),
      makeSection("Too Far", 8, []),
    ];

    const result = groupConfigSectionsByColumn(sections, 3);

    expect(
      result.map((column) => column.map((section) => section.label)),
    ).toEqual([["Fallback"], [], ["Too Far"]]);
  });
});

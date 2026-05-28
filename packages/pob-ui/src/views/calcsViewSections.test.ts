import { describe, expect, it } from "vitest";

import type { PobCalcsSection } from "@poe2-launcher/shared/types";

import {
  displayCalcsCellText,
  distributeSectionsIntoColumns,
  filterSections,
  matchesGroupFilter,
  matchesSearch,
} from "./calcsViewSections";

const makeSection = (
  id: string,
  group: PobCalcsSection["group"],
  rows: { label: string; cells: string[] }[],
  opts: { enabled?: boolean; subLabel?: string } = {},
): PobCalcsSection => ({
  id,
  group,
  widthCols: 1,
  colour: null,
  enabled: opts.enabled ?? true,
  subSections: [
    {
      id: id + "Sub",
      label: opts.subLabel ?? "Sub " + id,
      collapsed: false,
      defaultCollapsed: false,
      extra: null,
      colWidth: null,
      rows: rows.map((r) => ({
        label: r.label,
        cells: r.cells.map((text) => ({
          text,
          colour: null,
          breakdownKey: null,
        })),
      })),
    },
  ],
});

describe("calcsViewSections.matchesGroupFilter", () => {
  const s = makeSection("HitDamage", 1, []);
  it("returns true for 'all'", () => {
    expect(matchesGroupFilter(s, "all")).toBe(true);
  });
  it("matches group 1 to 'offence'", () => {
    expect(matchesGroupFilter(s, "offence")).toBe(true);
    expect(matchesGroupFilter(s, "defence")).toBe(false);
    expect(matchesGroupFilter(s, "resources")).toBe(false);
  });
  it("matches group 2 to 'resources'", () => {
    const r = makeSection("Life", 2, []);
    expect(matchesGroupFilter(r, "resources")).toBe(true);
    expect(matchesGroupFilter(r, "offence")).toBe(false);
  });
  it("matches group 3 to 'defence'", () => {
    const d = makeSection("Resist", 3, []);
    expect(matchesGroupFilter(d, "defence")).toBe(true);
    expect(matchesGroupFilter(d, "offence")).toBe(false);
  });
});

describe("calcsViewSections.matchesSearch", () => {
  const section = makeSection(
    "HitDamage",
    1,
    [
      { label: "Added Min", cells: ["100", "200"] },
      { label: "Added Max", cells: ["150", "250"] },
    ],
    { subLabel: "Skill Hit Damage" },
  );

  it("returns full section for empty query", () => {
    const result = matchesSearch(section, "");
    expect(result).toEqual(section);
  });

  it("returns full section for whitespace query", () => {
    const result = matchesSearch(section, "   ");
    expect(result).toEqual(section);
  });

  it("matches section id case-insensitively", () => {
    const result = matchesSearch(section, "hitdamage");
    expect(result).not.toBeNull();
    expect(result!.subSections[0].rows.length).toBe(2);
  });

  it("matches subsection label", () => {
    const result = matchesSearch(section, "Skill Hit");
    expect(result).not.toBeNull();
    expect(result!.subSections[0].rows.length).toBe(2);
  });

  it("matches row label and keeps only matching rows", () => {
    const result = matchesSearch(section, "Min");
    expect(result).not.toBeNull();
    expect(result!.subSections[0].rows.length).toBe(1);
    expect(result!.subSections[0].rows[0].label).toBe("Added Min");
  });

  it("matches cell text and keeps only matching rows", () => {
    const result = matchesSearch(section, "250");
    expect(result).not.toBeNull();
    expect(result!.subSections[0].rows.length).toBe(1);
    expect(result!.subSections[0].rows[0].label).toBe("Added Max");
  });

  it("returns null when nothing matches", () => {
    const result = matchesSearch(section, "no-such-token");
    expect(result).toBeNull();
  });
});

describe("calcsViewSections.filterSections", () => {
  const offence = makeSection("HitDamage", 1, [
    { label: "Total", cells: ["1000"] },
  ]);
  const resources = makeSection("Life", 2, [
    { label: "Total", cells: ["500"] },
  ]);
  const defence = makeSection("Resist", 3, [{ label: "Fire", cells: ["75"] }]);
  const disabled = makeSection("Disabled", 1, [{ label: "X", cells: ["1"] }], {
    enabled: false,
  });
  const list = [offence, resources, defence, disabled];

  it("drops disabled sections", () => {
    const result = filterSections(list, "all", "");
    expect(result.map((s) => s.id)).toEqual(["HitDamage", "Life", "Resist"]);
  });

  it("filters by 'offence' group", () => {
    const result = filterSections(list, "offence", "");
    expect(result.map((s) => s.id)).toEqual(["HitDamage"]);
  });

  it("filters by 'defence' group", () => {
    const result = filterSections(list, "defence", "");
    expect(result.map((s) => s.id)).toEqual(["Resist"]);
  });

  it("combines group filter + search", () => {
    const result = filterSections(list, "all", "75");
    expect(result.map((s) => s.id)).toEqual(["Resist"]);
  });

  it("returns empty array when no section matches", () => {
    const result = filterSections(list, "offence", "no-such");
    expect(result).toEqual([]);
  });
});

describe("calcsViewSections.displayCalcsCellText", () => {
  it("preserves intentional blank cells from PoB instead of replacing them", () => {
    expect(displayCalcsCellText("")).toBe("");
    expect(displayCalcsCellText("   ")).toBe("   ");
  });

  it("keeps normalized unavailable values as explicit dashes", () => {
    expect(displayCalcsCellText("-")).toBe("-");
  });
});

describe("calcsViewSections.distributeSectionsIntoColumns", () => {
  const sections = Array.from({ length: 11 }, (_, idx) =>
    makeSection(String(idx + 1), 1, []),
  );

  it("keeps source order in contiguous columns while balancing measured height", () => {
    const heights = new Map<string, number>(
      sections.map((section) => [section.id, section.id === "6" ? 200 : 100]),
    );

    const result = distributeSectionsIntoColumns(sections, heights, 3);

    expect(result).toEqual([
      ["1", "2", "3", "4"],
      ["5", "6", "7"],
      ["8", "9", "10", "11"],
    ]);
  });

  it("moves later sections left after earlier cards collapse without reordering", () => {
    const heights = new Map<string, number>(
      sections.map((section) => {
        if (section.id === "1" || section.id === "2") return [section.id, 50];
        if (section.id === "6") return [section.id, 200];
        return [section.id, 100];
      }),
    );

    const result = distributeSectionsIntoColumns(sections, heights, 3);

    expect(result).toEqual([
      ["1", "2", "3", "4", "5"],
      ["6", "7", "8"],
      ["9", "10", "11"],
    ]);
  });

  it("falls back to one ordered column on narrow layouts", () => {
    const result = distributeSectionsIntoColumns(
      sections.slice(0, 3),
      new Map(),
      1,
    );

    expect(result).toEqual([["1", "2", "3"]]);
  });
});

import { describe, expect, it } from "vitest";

import type { PobMainSkillSummarySnapshot } from "@poe2-launcher/shared/types";

import {
  buildMainSkillSummaryRows,
  clampMainSkillSummaryHeight,
  getMainSkillSummaryMaxHeight,
  getMainSkillSummaryTitle,
} from "./mainSkillSummaryPanel";

const snapshot: PobMainSkillSummarySnapshot = {
  socketGroupLabel: "Cast on Shock",
  mainSkillLabel: "Ball Lightning",
  rows: [
    {
      kind: "stat",
      label: "Skill Hit Damage",
      value: "1234",
      text: null,
      height: 14,
    },
    { kind: "spacer", label: null, value: null, text: null, height: 6 },
    {
      kind: "text",
      label: null,
      value: null,
      text: "Player:",
      height: 18,
    },
    { kind: "stat", label: "Missing Value", value: "", text: null, height: 14 },
  ],
  warnings: [],
};

describe("mainSkillSummaryPanel", () => {
  it("uses the selected main skill label before the socket group label", () => {
    expect(getMainSkillSummaryTitle(snapshot, "Main Skill")).toBe(
      "Ball Lightning",
    );
    expect(
      getMainSkillSummaryTitle(
        { ...snapshot, mainSkillLabel: null },
        "Main Skill",
      ),
    ).toBe("Cast on Shock");
  });

  it("preserves PoB statBox row order and fills empty display cells", () => {
    expect(buildMainSkillSummaryRows(snapshot)).toEqual([
      {
        id: "stat-0",
        kind: "stat",
        label: "Skill Hit Damage",
        value: "1234",
        text: "-",
      },
      { id: "spacer-1", kind: "spacer", label: "-", value: "-", text: "-" },
      {
        id: "text-2",
        kind: "text",
        label: "-",
        value: "-",
        text: "Player:",
      },
      {
        id: "stat-3",
        kind: "stat",
        label: "Missing Value",
        value: "-",
        text: "-",
      },
    ]);
  });

  it("clamps resize height to stable sidebar bounds", () => {
    expect(clampMainSkillSummaryHeight(40)).toBe(120);
    expect(clampMainSkillSummaryHeight(230.6)).toBe(231);
    expect(clampMainSkillSummaryHeight(999)).toBe(960);
    expect(clampMainSkillSummaryHeight(999, 640)).toBe(640);
    expect(clampMainSkillSummaryHeight(Number.NaN)).toBe(220);
  });

  it("derives the panel maximum from the viewport while preserving explorer space", () => {
    expect(getMainSkillSummaryMaxHeight(500)).toBe(240);
    expect(getMainSkillSummaryMaxHeight(2000)).toBe(960);
    expect(getMainSkillSummaryMaxHeight(Number.NaN)).toBe(960);
  });
});

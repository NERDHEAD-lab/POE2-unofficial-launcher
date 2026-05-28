import { describe, expect, it } from "vitest";

import {
  assertPobBuildMetadataActionResult,
  assertPobBuildMetadataSnapshot,
  assertPobCalcsBreakdown,
  assertPobMainSkillSummarySnapshot,
  assertPobPartySnapshot,
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

  it("validates build metadata projection shape", () => {
    const snapshot = {
      level: 90,
      levelAutoMode: false,
      classId: 3,
      className: "Monk",
      ascendClassId: 2,
      ascendClassName: "Invoker",
      classes: [
        {
          id: 3,
          label: "Monk",
          ascendancies: [
            { id: 0, label: "None" },
            { id: 1, label: "Acolyte of Chayula" },
            { id: 2, label: "Invoker" },
          ],
        },
      ],
    };

    expect(() => assertPobBuildMetadataSnapshot(snapshot)).not.toThrow();
  });

  it("validates build metadata class-change confirmation shape", () => {
    const result = {
      status: "confirm",
      snapshot: {
        level: 90,
        levelAutoMode: false,
        classId: 3,
        className: "Monk",
        ascendClassId: 2,
        ascendClassName: "Invoker",
        classes: [
          {
            id: 3,
            label: "Monk",
            ascendancies: [{ id: 0, label: "None" }],
          },
        ],
      },
      confirmation: {
        type: "classChange",
        classId: 4,
        classLabel: "Ranger",
        message: "Changing class to Ranger will reset your passive tree.",
        confirmLabel: "Continue",
        alternateLabel: "Connect Path",
      },
    };

    expect(() => assertPobBuildMetadataActionResult(result)).not.toThrow();
  });

  it("validates main skill summary projection shape", () => {
    const snapshot = {
      socketGroupLabel: "Quarterstaff",
      mainSkillLabel: "Ice Strike",
      rows: [
        {
          kind: "stat",
          label: "Hit DPS:",
          value: "123,456.7",
          text: null,
          height: 16,
        },
        {
          kind: "text",
          label: null,
          value: null,
          text: "Full DPS",
          height: 14,
        },
        {
          kind: "spacer",
          label: null,
          value: null,
          text: null,
          height: 6,
        },
      ],
      warnings: [],
    };

    expect(() => assertPobMainSkillSummarySnapshot(snapshot)).not.toThrow();
  });

  it("validates party projection shape", () => {
    const button = {
      label: "Import",
      shown: true,
      enabled: false,
      tooltip: null,
    };
    const checkbox = {
      ...button,
      label: "Append",
      checked: false,
    };
    const snapshot = {
      notes: 'To import a build it must be exported with "Export support"',
      enableExportBuffs: false,
      importControls: {
        inputLabel: "Enter a build code/URL below:",
        code: "",
        detail: "",
        valid: false,
        fetching: false,
        destinations: ["All", "Party Member Stats"],
        selectedDestination: 1,
        destinationTooltip: "Destination for Import/clear",
        importButton: button,
        append: checkbox,
        clear: { ...button, label: "Clear" },
        showAdvanced: { ...checkbox, label: "Show Advanced Info" },
        disableEffects: { ...button, label: "Disable Party Effects" },
        rebuild: { ...button, label: "Rebuild All" },
      },
      leftSections: [
        {
          key: "auras",
          label: "Auras",
          text: "",
          simpleText: "",
          advancedVisible: false,
        },
      ],
      rightSections: [
        {
          key: "enemyConditions",
          label: "Enemy Conditions",
          text: "",
          simpleText: "---------------------------\n",
          advancedVisible: false,
        },
      ],
    };

    expect(() => assertPobPartySnapshot(snapshot)).not.toThrow();
  });
});

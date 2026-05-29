import { describe, expect, it } from "vitest";

import {
  assertPobBuildMetadataActionResult,
  assertPobBuildMetadataSnapshot,
  assertPobImportExportSnapshot,
  assertPobCalcsSnapshot,
  assertPobCalcsBreakdown,
  assertPobItemsTooltip,
  assertPobMainSkillSummarySnapshot,
  assertPobNotesSnapshot,
  assertPobPartySnapshot,
  assertPobSkillsGemTooltip,
  assertPobTreeNodeTooltip,
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

  it("validates calcs visual metadata projection shape", () => {
    const snapshot = {
      search: "",
      skillSelect: {
        skillNumber: 1,
        buffMode: "EFFECTIVE",
        buffModeOptions: [
          { value: "UNBUFFED", label: "Unbuffed" },
          { value: "BUFFED", label: "Buffed" },
          { value: "COMBAT", label: "In Combat" },
          { value: "EFFECTIVE", label: "Effective DPS" },
        ],
        showMinion: false,
        showMinionShown: false,
        socketGroup: { selected: 1, options: [] },
        mainSkill: { selected: null, options: [] },
        statSet: { selected: null, options: [] },
        skillPart: { selected: null, shown: false, options: [] },
        skillStages: { value: null, shown: false },
        mineCount: { value: null, shown: false },
        minion: { selected: null, shown: false, options: [] },
        spectreLibrary: {
          label: "Manage Spectres...",
          shown: false,
          enabled: false,
        },
        beastLibrary: {
          label: "Manage Beasts...",
          shown: false,
          enabled: false,
        },
        minionSkill: { selected: null, shown: false, options: [] },
        minionSkillStatSet: { selected: null, shown: false, options: [] },
      },
      sections: [
        {
          id: "Attributes",
          group: 2,
          widthCols: 1,
          colour: "NORMAL",
          enabled: true,
          subSections: [
            {
              id: "Attributes",
              label: "Attributes",
              collapsed: false,
              defaultCollapsed: false,
              extra: "27, 121, 127",
              extraRichText: [
                { text: "27", colour: "LIFE", colourHex: "#E05030" },
                { text: ", ", colour: null, colourHex: null },
                { text: "121", colour: null, colourHex: "#70FF70" },
                { text: ", ", colour: null, colourHex: null },
                { text: "127", colour: "MANA", colourHex: "#7070FF" },
              ],
              colWidth: null,
              rows: [
                {
                  label: "Strength",
                  labelColour: "LIFE",
                  labelColourHex: "#E05030",
                  backgroundColour: null,
                  backgroundColourHex: "#071907",
                  textSize: 12,
                  cells: [
                    {
                      text: "27",
                      colour: null,
                      backgroundColour: null,
                      backgroundColourHex: "#071907",
                      breakdownKey: "Attributes:1:1:1",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      summary: {
        combinedDPS: null,
        fullDPS: null,
        totalEHP: null,
        life: null,
        energyShield: null,
        mana: null,
      },
    };

    expect(() => assertPobCalcsSnapshot(snapshot)).not.toThrow();
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

  it("validates tree node tooltip projection shape", () => {
    const tooltip = {
      nodeId: 123,
      header: "NOTABLE",
      lines: [
        {
          kind: "line",
          text: "Mindful Awareness",
          colour: null,
          size: 24,
          font: "FONTIN",
          center: true,
          background: null,
        },
        { kind: "separator", text: "", colour: null, size: 14 },
        {
          kind: "line",
          text: "Unallocating this node will give you:",
          colour: "NORMAL",
          size: 14,
          font: "VAR",
          center: false,
          background: null,
        },
        {
          kind: "line",
          text: "-56 Deflection Rating",
          colour: "NEGATIVE",
          size: 14,
          font: "VAR",
          center: true,
          background: null,
        },
        {
          kind: "line",
          text: "9,267 Gold required to unallocate these nodes",
          colour: "GOLD",
          size: 14,
          font: "VAR",
          center: false,
          background: null,
        },
      ],
    };

    expect(() => assertPobTreeNodeTooltip(tooltip)).not.toThrow();
  });

  it("validates passive tree node path preview fields", () => {
    const snapshot = {
      treeVersion: "0_4",
      classId: 1,
      className: "Monk",
      ascendClassId: null,
      ascendClassName: null,
      allocCount: 1,
      viewport: null,
      treeSize: null,
      nodes: [
        {
          id: 1,
          x: 0,
          y: 0,
          name: "Mindful Awareness",
          statLines: [],
          recipe: ["Clear Oil"],
          type: "Notable",
          ascendancyName: null,
          isAscendancyStart: false,
          isKeystone: false,
          isNotable: true,
          isSocket: false,
          isMastery: false,
          isOnlyImage: false,
          alloc: false,
          icon: null,
          activeEffectImage: null,
          overlay: null,
          targetSize: null,
          linked: [2],
          path: [2, 1],
          depends: [3],
        },
      ],
    };

    expect(() => assertPobTreeSnapshot(snapshot)).not.toThrow();
  });

  it("validates skills gem tooltip projection shape", () => {
    const tooltip = {
      groupIndex: 1,
      gemIndex: 2,
      mode: "gem",
      header: "GEM",
      lines: [
        { kind: "line", text: "Lightning Attunement", colour: "GEM", size: 20 },
        { kind: "separator", text: "", colour: null, size: 10 },
        { kind: "line", text: "Support", colour: "NORMAL", size: 16 },
        {
          kind: "line",
          text: "Supported Attacks Gain 25% of Damage as Extra Lightning Damage",
          colour: "MAGIC",
          size: 16,
          font: "FONTIN SC",
          center: true,
          background: "GemHoverModBg",
        },
      ],
    };

    expect(() => assertPobSkillsGemTooltip(tooltip)).not.toThrow();
  });

  it("validates items tooltip projection shape", () => {
    const tooltip = {
      source: "db",
      itemId: "Mahuxotl's Machination",
      db: "uniqueDB",
      slotName: null,
      header: "UNIQUE",
      influenceHeader1: "Desecrated",
      influenceHeader2: "Mutated",
      maxWidth: 600,
      lines: [
        {
          kind: "line",
          text: "Mahuxotl's Machination",
          colour: "UNIQUE",
          size: 20,
          font: "FONTIN SC",
          center: true,
          background: null,
          block: 1,
        },
        {
          kind: "separator",
          text: "",
          colour: null,
          size: 10,
          block: 1,
          separatorTheme: "UNIQUE",
        },
        {
          kind: "line",
          text: "Exclusive to: Trial of Chaos",
          colour: "NEGATIVE",
          size: 16,
          font: "FONTIN SC",
          center: true,
          background: null,
          block: 1,
        },
        {
          kind: "line",
          text: "Tip: Press Ctrl+D to disable the display of stat differences.",
          colour: "TIP",
          size: 14,
          block: 2,
        },
      ],
    };

    expect(() => assertPobItemsTooltip(tooltip)).not.toThrow();
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

  it("validates Import/Export projection shape", () => {
    const button = {
      label: "Import",
      shown: true,
      enabled: false,
      tooltip: null,
    };
    const checkbox = {
      ...button,
      label: "Export Support",
      checked: false,
    };
    const site = {
      id: "POBBin",
      label: "pobb.in",
      canImport: true,
      canExport: true,
      matchPattern: "^https://pobb%.in/.+",
    };
    const snapshot = {
      exportControls: {
        sectionLabel: "Build Sharing",
        generateLabel:
          "Generate a code to share this build with other Path of Building users:",
        generateButton: { ...button, label: "Generate", enabled: true },
        copyButton: { ...button, label: "Copy" },
        shareButton: { ...button, label: "Share" },
        exportSupport: checkbox,
        exportSites: [site],
        selectedExportSiteId: "POBBin",
        output: "",
        outputPlaceholder: "Code",
        note: "Note: this code can be very long; you can use 'Share' to shrink it.",
      },
      importControls: {
        inputLabel: "To import a build, enter URL or code here:",
        input: "",
        detail: "",
        valid: false,
        fetching: false,
        importButton: button,
        modes: [
          { id: "current", label: "Import to this build", enabled: true },
          { id: "new", label: "Import to a new build", enabled: true },
          { id: "comparison", label: "Import as comparison", enabled: true },
        ],
        selectedMode: "current",
        supportedSites: [site],
      },
      characterImport: {
        sectionLabel: "Character Import",
        statusLabel: "Character import status: Not authenticated",
        status: "Not authenticated",
        mode: "AUTHENTICATION",
        authenticateButton: {
          ...button,
          label: "Authorize with Path of Exile",
          shown: true,
          enabled: true,
        },
        logoutButton: {
          ...button,
          label: "Logout from Path of Exile API",
          shown: false,
        },
        startButton: { ...button, label: "Start" },
        realmOptions: [
          {
            id: "PoE2",
            label: "PoE2",
            canImport: false,
            canExport: false,
            matchPattern: null,
          },
        ],
        selectedRealmId: "PoE2",
        leagueOptions: [],
        characterOptions: [],
        importTreeButton: { ...button, label: "Passive Tree and Jewels" },
        importItemsButton: { ...button, label: "Items and Skills" },
        clearJewels: { ...checkbox, label: "Delete jewels:", checked: true },
        clearSkills: { ...checkbox, label: "Delete skills:", checked: true },
        clearItems: { ...checkbox, label: "Delete equipment:", checked: true },
        ignoreWeaponSwap: {
          ...checkbox,
          label: "Ignore weapon swap:",
          checked: false,
        },
      },
      unsupportedFeatures: ["urlShare", "urlDownload", "characterImport"],
    };

    expect(() => assertPobImportExportSnapshot(snapshot)).not.toThrow();
  });

  it("validates Notes projection shape", () => {
    const snapshot = {
      text: "^7Build notes",
      showColorCodes: false,
      dirty: true,
      description: [
        "You can use Ctrl +/- (or Ctrl+Scroll) to zoom in and out and Ctrl+0 to reset.",
        "This field also supports different colors.",
      ],
      colorControls: [
        {
          id: "normal",
          label: "NORMAL",
          code: "^7",
          shown: true,
          enabled: true,
        },
        {
          id: "unique",
          label: "UNIQUE",
          code: "^xAF6025",
          shown: true,
          enabled: true,
        },
      ],
      toggleButton: {
        label: "Show Color Codes",
        shown: true,
        enabled: true,
        tooltip: null,
      },
    };

    expect(() => assertPobNotesSnapshot(snapshot)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";

import type {
  PobCalcsBreakdown,
  PobCalcsSnapshot,
  PobConfigSnapshot,
  PobItemDbSummary,
  PobItemsSnapshot,
  PobRepoeTranslationsSnapshot,
  PobSkillsSnapshot,
  PobTreeSnapshot,
} from "@poe2-launcher/shared/types";

import {
  filterTranslatedItemDbEntries,
  translateCalcsBreakdown,
  translateCalcsSnapshot,
  translateConfigSnapshot,
  translateItemDbEntries,
  translateItemTooltip,
  translateItemsSnapshot,
  translateTreeNodeTooltip,
  translateSkillsGemTooltip,
  translateSkillsSnapshot,
  translateTreeSnapshot,
} from "./repoeTranslations";

const translations: PobRepoeTranslationsSnapshot = {
  locale: "ko",
  available: true,
  nodeNamesById: { "4": "Shock Chance KO" },
  nodeStatLinesById: {
    "4": ["5% increased Shock Chance KO"],
  },
  statLinesByEnglishLine: {
    "Cannot be Stunned": "기절 불가",
  },
  statLineTemplates: [
    {
      english: "+{0} to maximum Life",
      localized: "최대 생명력 +{0}",
    },
  ],
  itemNamesById: {
    Bramblejack: "Bramblejack KO",
    "Metadata/Items/Armours/BodyArmours/BodyStr1": "Plate Vest KO",
  },
  itemNamesByEnglishName: {
    Bramblejack: "Bramblejack KO",
    "Plate Vest": "Plate Vest KO",
  },
  gemNamesById: {
    "Metadata/Items/Gem/SkillGemAlchemistsBoon": "Alchemist's Boon KO",
  },
  gemNamesBySkillId: {
    AlchemistsBoonPlayer: "Alchemist's Boon KO",
    FireballPlayer: "Fireball KO",
  },
  gemNamesByEnglishName: {
    "Alchemist's Boon": "Alchemist's Boon KO",
    Fireball: "Fireball KO",
  },
  skillDescriptionsById: {},
  skillDescriptionsByEnglishText: {},
  gemFamiliesByEnglishName: {},
  skillTagsByEnglishName: {},
};

const itemBase = {
  raw: "Rarity: Unique\nBramblejack\nPlate Vest",
  rarity: "UNIQUE",
  title: null,
  itemLevel: 12,
  quality: null,
  corrupted: false,
  mirrored: false,
  shaper: false,
  elder: false,
  fractured: false,
  influences: null,
  baseType: "Plate Vest",
  baseSubType: null,
  implicitLines: ["Cannot be Stunned"],
  explicitLines: ["+32 to maximum Life"],
} satisfies Omit<PobItemDbSummary, "id" | "name" | "baseName">;

describe("RePoE renderer translation overlay", () => {
  it("translates tree node display names without mutating the source snapshot", () => {
    const snapshot: PobTreeSnapshot = {
      treeVersion: "4.4.0.14",
      classId: null,
      className: null,
      ascendClassId: null,
      ascendClassName: null,
      allocCount: 0,
      viewport: null,
      treeSize: null,
      nodes: [
        {
          id: 4,
          x: 0,
          y: 0,
          name: "Shock Chance",
          statLines: ["5% increased Shock Chance"],
          type: null,
          ascendancyName: null,
          isAscendancyStart: false,
          isKeystone: false,
          isNotable: false,
          isSocket: false,
          isMastery: false,
          isOnlyImage: false,
          alloc: false,
          linked: [],
        },
      ],
    };

    const translated = translateTreeSnapshot(snapshot, translations);

    expect(translated.nodes[0].name).toBe("Shock Chance KO");
    expect(translated.nodes[0].statLines).toEqual([
      "5% increased Shock Chance KO",
    ]);
    expect(snapshot.nodes[0].name).toBe("Shock Chance");
    expect(snapshot.nodes[0].statLines).toEqual(["5% increased Shock Chance"]);
  });

  it("translates item and database names while preserving action identifiers", () => {
    const snapshot: PobItemsSnapshot = {
      activeSetId: 1,
      useSecondWeaponSet: false,
      sets: [{ id: 1, title: "Default", useSecondWeaponSet: false }],
      slots: [],
      items: [
        {
          id: 7,
          name: "Bramblejack",
          baseName: "Plate Vest",
          ...itemBase,
        },
      ],
      sharedItems: [],
    };
    const dbEntry: PobItemDbSummary = {
      id: "Bramblejack",
      name: "Bramblejack",
      baseName: "Plate Vest",
      ...itemBase,
    };

    const translatedSnapshot = translateItemsSnapshot(snapshot, translations);
    const translatedDb = translateItemDbEntries([dbEntry], translations);

    expect(translatedSnapshot.items[0]).toMatchObject({
      id: 7,
      name: "Bramblejack KO",
      baseName: "Plate Vest KO",
      implicitLines: ["기절 불가"],
      explicitLines: ["최대 생명력 +32"],
    });
    expect(translatedDb[0]).toMatchObject({
      id: "Bramblejack",
      name: "Bramblejack KO",
    });
    expect(snapshot.items[0].name).toBe("Bramblejack");
    expect(snapshot.items[0].explicitLines).toEqual(["+32 to maximum Life"]);
  });

  it("filters translated item DB entries by localized and English source text", () => {
    const sourceEntries: PobItemDbSummary[] = [
      {
        id: "Bramblejack",
        name: "Bramblejack",
        baseName: "Plate Vest",
        ...itemBase,
      },
      {
        id: "OtherUnique",
        name: "Other Unique",
        baseName: "Other Base",
        ...itemBase,
        baseType: "Other Base",
        raw: "Rarity: Unique\nOther Unique\nOther Base",
      },
    ];
    const displayEntries = translateItemDbEntries(sourceEntries, translations);

    expect(
      filterTranslatedItemDbEntries(
        displayEntries,
        sourceEntries,
        "Bramble",
      ).map((entry) => entry.id),
    ).toEqual(["Bramblejack"]);
    expect(
      filterTranslatedItemDbEntries(
        displayEntries,
        sourceEntries,
        "Plate Vest",
      ).map((entry) => entry.id),
    ).toEqual(["Bramblejack"]);
    expect(
      filterTranslatedItemDbEntries(displayEntries, sourceEntries, "KO").map(
        (entry) => entry.id,
      ),
    ).toEqual(["Bramblejack"]);
  });

  it("translates skill display names and keeps gem ids available for actions", () => {
    const snapshot: PobSkillsSnapshot = {
      activeSetId: 1,
      mainSocketGroup: 1,
      calcsSocketGroup: 1,
      sets: [{ id: 1, title: "Default" }],
      groups: [
        {
          index: 1,
          label: "Alchemist's Boon",
          displayLabel: "Alchemist's Boon",
          slot: null,
          source: null,
          sourceNote: null,
          enabled: true,
          slotEnabled: true,
          includeInFullDPS: false,
          groupCount: 1,
          mainActiveSkill: 1,
          mainActiveSkillCalcs: 1,
          isMain: true,
          canDelete: true,
          noSupports: false,
          gems: [
            {
              index: 1,
              gemId: "Metadata/Items/Gem/SkillGemAlchemistsBoon",
              skillId: "AlchemistsBoonPlayer",
              nameSpec: "Alchemist's Boon",
              displayName: "Alchemist's Boon",
              level: 1,
              quality: 0,
              enabled: true,
              enableGlobal1: true,
              enableGlobal2: true,
              count: 1,
              errMsg: null,
              reqLevel: null,
              reqStr: null,
              reqDex: null,
              reqInt: null,
              naturalMaxLevel: null,
              color: "intelligence",
              isSupport: false,
              isVaal: false,
              fromItem: false,
              fromTree: false,
              triggered: false,
              countVisible: true,
              canEdit: true,
              canDelete: true,
              globalEffects: [{ index: 1, name: "Fireball", enabled: true }],
              displayLevel: null,
              displayQuality: null,
            },
          ],
          activeSkills: [
            {
              index: 1,
              label: "Fireball",
              skillPartName: null,
              disableReason: null,
              color: "intelligence",
            },
          ],
        },
      ],
      availableGems: [
        {
          id: "Metadata/Items/Gem/SkillGemAlchemistsBoon",
          name: "Alchemist's Boon",
          color: "intelligence",
          isSupport: false,
          naturalMaxLevel: 20,
          tagString: null,
        },
      ],
      slotOptions: [],
      defaultGemLevelOptions: [],
      supportGemTypeOptions: [],
      sortGemFieldOptions: [],
      options: {
        sortGemsByDPS: false,
        sortGemsByDPSField: "CombinedDPS",
        defaultGemLevel: "normalMaximum",
        defaultGemQuality: 0,
        showSupportGemTypes: "ALL",
      },
    };

    const translated = translateSkillsSnapshot(snapshot, translations);

    expect(translated.groups[0].displayLabel).toBe("Alchemist's Boon KO");
    expect(translated.groups[0].gems[0].displayName).toBe(
      "Alchemist's Boon KO",
    );
    expect(translated.groups[0].activeSkills[0].label).toBe("Fireball KO");
    expect(translated.availableGems[0]).toMatchObject({
      id: "Metadata/Items/Gem/SkillGemAlchemistsBoon",
      name: "Alchemist's Boon KO",
    });
    expect(snapshot.availableGems[0].name).toBe("Alchemist's Boon");
  });

  it("translates calcs display text without changing action or breakdown identifiers", () => {
    const snapshot: PobCalcsSnapshot = {
      search: "",
      skillSelect: {
        skillNumber: 1,
        buffMode: "EFFECTIVE",
        buffModeOptions: [{ value: "EFFECTIVE", label: "Effective DPS" }],
        showMinion: false,
        showMinionShown: false,
        socketGroup: { selected: 1, options: [] },
        mainSkill: {
          selected: 1,
          options: [{ index: 1, label: "Fireball" }],
        },
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
          id: "Defence",
          group: 3,
          widthCols: 1,
          colour: null,
          enabled: true,
          subSections: [
            {
              id: "DefenceSub",
              label: "Defence",
              collapsed: false,
              defaultCollapsed: false,
              extra: null,
              colWidth: null,
              rows: [
                {
                  label: "+32 to maximum Life",
                  cells: [
                    {
                      text: "Cannot be Stunned",
                      colour: null,
                      breakdownKey: "Defence:1:1",
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
        life: 32,
        energyShield: null,
        mana: null,
      },
    };
    const breakdown: PobCalcsBreakdown = {
      key: "Defence:1:1",
      sections: [
        {
          type: "BREAKDOWN",
          data: {
            stat: "Life",
            label: "+32 to maximum Life",
            footer: "Cannot be Stunned",
            lines: ["+32 to maximum Life"],
            rowList: [{ source: "Cannot be Stunned" }],
            colList: [{ key: "source", label: "Cannot be Stunned" }],
          },
        },
        {
          type: "MODS",
          data: {
            label: "+32 to maximum Life",
            modName: ["Cannot be Stunned"],
            modType: "BASE",
            entries: [
              {
                name: "Fireball",
                type: null,
                value: 32,
                source: "Bramblejack",
                sourceLine: "+32 to maximum Life",
              },
            ],
          },
        },
      ],
    };

    const translatedSnapshot = translateCalcsSnapshot(snapshot, translations);
    const translatedBreakdown = translateCalcsBreakdown(
      breakdown,
      translations,
    );

    expect(translatedSnapshot.skillSelect.mainSkill.options[0]).toEqual({
      index: 1,
      label: "Fireball KO",
    });
    expect(translatedSnapshot.sections[0].subSections[0].rows[0]).toMatchObject(
      {
        label: "최대 생명력 +32",
        cells: [{ text: "기절 불가", breakdownKey: "Defence:1:1" }],
      },
    );
    expect(snapshot.skillSelect.mainSkill.options[0].label).toBe("Fireball");
    expect(snapshot.sections[0].subSections[0].rows[0].label).toBe(
      "+32 to maximum Life",
    );
    expect(translatedBreakdown.key).toBe("Defence:1:1");
    expect(translatedBreakdown.sections[0]).toMatchObject({
      type: "BREAKDOWN",
      data: {
        label: "최대 생명력 +32",
        footer: "기절 불가",
        lines: ["최대 생명력 +32"],
        rowList: [{ source: "기절 불가" }],
        colList: [{ key: "source", label: "기절 불가" }],
      },
    });
    expect(translatedBreakdown.sections[1]).toMatchObject({
      type: "MODS",
      data: {
        label: "최대 생명력 +32",
        modName: ["기절 불가"],
        entries: [
          {
            name: "Fireball KO",
            source: "Bramblejack KO",
            sourceLine: "최대 생명력 +32",
          },
        ],
      },
    });
    expect(breakdown.sections[0]).toMatchObject({
      type: "BREAKDOWN",
      data: { label: "+32 to maximum Life" },
    });
  });

  it("translates config display labels without changing submitted values", () => {
    const snapshot: PobConfigSnapshot = {
      activeConfigSetId: 1,
      configSets: [{ id: 1, index: 1, title: "Default", active: true }],
      search: "",
      showAll: false,
      sections: [
        {
          id: "skill",
          label: "Fireball",
          col: null,
          shown: true,
          options: [
            {
              id: "skill-choice",
              var: "skill",
              kind: "list",
              label: "Cannot be Stunned",
              value: "Fireball",
              defaultValue: "Fireball",
              placeholder: null,
              shown: true,
              enabled: true,
              modified: false,
              tooltip: "+32 to maximum Life",
              options: [{ index: 1, value: "Fireball", label: "Fireball" }],
              selectedIndex: 1,
              resizable: false,
              hideIfInvalid: false,
              doNotHighlight: false,
            },
          ],
        },
      ],
    };

    const translated = translateConfigSnapshot(snapshot, translations);

    expect(translated.sections[0].label).toBe("Fireball KO");
    expect(translated.sections[0].options[0]).toMatchObject({
      label: "기절 불가",
      value: "Fireball",
      tooltip: "최대 생명력 +32",
      options: [{ value: "Fireball", label: "Fireball KO" }],
    });
    expect(snapshot.sections[0].options[0].options[0].label).toBe("Fireball");
  });

  it("translates tree, item and skill tooltip display text without changing identifiers", () => {
    const treeTooltip = translateTreeNodeTooltip(
      {
        nodeId: 4,
        header: "Fireball",
        lines: [
          { kind: "line", text: "Cannot be Stunned", colour: null, size: 14 },
        ],
      },
      translations,
    );
    const itemTooltip = translateItemTooltip(
      {
        source: "db",
        itemId: "Bramblejack",
        db: "uniqueDB",
        slotName: null,
        header: "Bramblejack",
        lines: [
          { kind: "line", text: "+32 to maximum Life", colour: null, size: 14 },
        ],
      },
      translations,
    );
    const skillTooltip = translateSkillsGemTooltip(
      {
        groupIndex: 1,
        gemIndex: 1,
        mode: "gem",
        header: "Fireball",
        lines: [
          { kind: "line", text: "Cannot be Stunned", colour: null, size: 14 },
        ],
      },
      translations,
    );

    expect(treeTooltip.nodeId).toBe(4);
    expect(treeTooltip.header).toBe("Fireball KO");
    expect(treeTooltip.lines[0].text).toBe("기절 불가");
    expect(itemTooltip.itemId).toBe("Bramblejack");
    expect(itemTooltip.header).toBe("Bramblejack KO");
    expect(itemTooltip.lines[0].text).toBe("최대 생명력 +32");
    expect(skillTooltip.groupIndex).toBe(1);
    expect(skillTooltip.header).toBe("Fireball KO");
    expect(skillTooltip.lines[0].text).toBe("기절 불가");
  });
});

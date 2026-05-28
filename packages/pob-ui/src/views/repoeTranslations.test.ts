import { describe, expect, it } from "vitest";

import type {
  PobItemDbSummary,
  PobItemsSnapshot,
  PobRepoeTranslationsSnapshot,
  PobSkillsSnapshot,
  PobTreeSnapshot,
} from "@poe2-launcher/shared/types";

import {
  filterTranslatedItemDbEntries,
  translateItemDbEntries,
  translateItemTooltip,
  translateItemsSnapshot,
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

  it("translates item and skill tooltip stat lines without changing identifiers", () => {
    const itemTooltip = translateItemTooltip(
      {
        source: "db",
        itemId: "Bramblejack",
        db: "uniqueDB",
        slotName: null,
        header: "UNIQUE",
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
        header: "GEM",
        lines: [
          { kind: "line", text: "Cannot be Stunned", colour: null, size: 14 },
        ],
      },
      translations,
    );

    expect(itemTooltip.itemId).toBe("Bramblejack");
    expect(itemTooltip.lines[0].text).toBe("최대 생명력 +32");
    expect(skillTooltip.groupIndex).toBe(1);
    expect(skillTooltip.lines[0].text).toBe("기절 불가");
  });
});

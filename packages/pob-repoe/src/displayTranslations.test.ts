import { describe, expect, it } from "vitest";

import type {
  PobBuildMetadataSnapshot,
  PobBuildSummary,
  PobConfigSnapshot,
  PobItemDbSummary,
  PobItemsSnapshot,
  PobItemsTooltip,
  PobMainSkillSummarySnapshot,
  PobRepoeTranslationsSnapshot,
  PobSkillGemCatalogEntry,
  PobSkillsSnapshot,
  PobTreeSnapshot,
} from "@poe2-launcher/shared/types";

import {
  filterTranslatedGemCatalogEntryViews,
  filterTranslatedItemDbEntryViews,
  projectSearchLabel,
  translateBuildMetadataSnapshot,
  translateBuildSummary,
  translateConfigSnapshot,
  translateItemDbEntries,
  translateItemTooltip,
  translateItemsSnapshot,
  translateMainSkillSummarySnapshot,
  translateSkillsSnapshot,
  translateStatLine,
  translateTreeSnapshot,
} from "./displayTranslations";

const translations: PobRepoeTranslationsSnapshot = {
  locale: "ko",
  available: true,
  nodeNamesById: {},
  nodeStatLinesById: {},
  statLinesByEnglishLine: {
    "Cannot be Stunned": "기절 불가",
  },
  statLineTemplates: [
    { english: "+#% to Cold Resistance", localized: "냉기 저항 +#%" },
    { english: "{0:+d}% to Fire Resistance", localized: "화염 저항 {0:+d}%" },
    {
      english: "{0}% increased Stun Threshold",
      localized: "기절 한계치 {0}% 증가",
    },
    {
      english: "{0}% increased Elemental Ailment Threshold",
      localized: "원소 상태 이상 한계치 {0}% 증가",
    },
    {
      english: "{0}% increased maximum Life",
      localized: "최대 생명력 {0}% 증가",
    },
    {
      english: "Adds # to # Cold Damage to Attacks",
      localized: "공격 시 냉기 피해 #~# 추가",
    },
  ],
  itemNamesById: {},
  itemNamesByEnglishName: {
    "Ab Aeterno": "영원불멸",
    "Grand Cuisses": "우수한 허벅지 방어구",
    "Plague Band": "역병 반지",
    "Sapphire Ring": "사파이어 반지",
  },
  gemNamesById: {},
  gemNamesBySkillId: {},
  gemNamesByEnglishName: {
    "Tempest Bell": "폭풍의 종",
    "Hand of Chayula": "차율라의 손",
    "Elemental Weakness": "원소 약화",
    "Freezing Mark": "동결의 징표",
  },
};

describe("RePoE display translation overlay", () => {
  it("matches PoB stat lines that use # placeholders, ranges, and case drift", () => {
    expect(translateStatLine("+21% to Cold Resistance", translations)).toBe(
      "냉기 저항 +21%",
    );
    expect(
      translateStatLine("Adds 1 to 3 Cold damage to Attacks", translations),
    ).toBe("공격 시 냉기 피해 1~3 추가");
    expect(translateStatLine("+5% to Fire Resistance", translations)).toBe(
      "화염 저항 +5%",
    );
    expect(
      translateStatLine("25% increased Stun Threshold", translations),
    ).toBe("기절 한계치 25% 증가");
    expect(
      translateStatLine(
        "30% increased Elemental Ailment Threshold",
        translations,
      ),
    ).toBe("원소 상태 이상 한계치 30% 증가");
    expect(
      translateStatLine("{enchant}{rune}+13% to Cold Resistance", translations),
    ).toBe("냉기 저항 +13%");
  });

  it("memoizes passive tree translation for identical snapshot objects", () => {
    const snapshot: PobTreeSnapshot = {
      treeVersion: "0_4",
      classId: null,
      className: null,
      ascendClassId: null,
      ascendClassName: null,
      allocCount: 0,
      viewport: null,
      treeSize: null,
      nodes: [
        {
          id: 1,
          x: 0,
          y: 0,
          name: "Cold Resistance",
          statLines: ["+21% to Cold Resistance"],
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

    const first = translateTreeSnapshot(snapshot, translations);
    const second = translateTreeSnapshot(snapshot, translations);

    expect(second).toBe(first);
    expect(first.nodes[0].statLines).toEqual(["냉기 저항 +21%"]);
    expect(snapshot.nodes[0].statLines).toEqual(["+21% to Cold Resistance"]);
  });

  it("reuses passive tree node text translations across build overlays", () => {
    const baseNode = {
      id: 1,
      x: 0,
      y: 0,
      name: "Cold Resistance",
      statLines: ["+21% to Cold Resistance"],
      type: null,
      ascendancyName: null,
      isAscendancyStart: false,
      isKeystone: false,
      isNotable: false,
      isSocket: false,
      isMastery: false,
      isOnlyImage: false,
      linked: [],
    };
    const firstSnapshot: PobTreeSnapshot = {
      treeVersion: "0_4",
      classId: 3,
      className: "Monk",
      ascendClassId: 2,
      ascendClassName: "Invoker",
      allocCount: 0,
      viewport: null,
      treeSize: null,
      nodes: [{ ...baseNode, alloc: false }],
    };
    const secondSnapshot: PobTreeSnapshot = {
      ...firstSnapshot,
      classId: 1,
      className: "Ranger",
      ascendClassId: null,
      ascendClassName: null,
      allocCount: 1,
      nodes: [{ ...baseNode, alloc: true, path: [1] }],
    };

    const first = translateTreeSnapshot(firstSnapshot, translations);
    const second = translateTreeSnapshot(secondSnapshot, translations);

    expect(first).not.toBe(second);
    expect(second.className).toBe("Ranger");
    expect(second.nodes[0]).toMatchObject({
      alloc: true,
      path: [1],
      name: "Cold Resistance",
      statLines: ["냉기 저항 +21%"],
    });
  });

  it("translates Imported Build2 item summary lines idempotently", () => {
    const snapshot: PobItemsSnapshot = {
      activeSetId: 1,
      useSecondWeaponSet: false,
      sets: [{ id: 1, title: "Default", useSecondWeaponSet: false }],
      slots: [],
      items: [
        {
          id: 2,
          raw: "Rarity: RARE\nPlague Band\nSapphire Ring",
          name: "Plague Band",
          rarity: "RARE",
          baseName: "Sapphire Ring",
          title: null,
          itemLevel: 69,
          quality: null,
          corrupted: false,
          mirrored: false,
          shaper: false,
          elder: false,
          fractured: false,
          influences: null,
          baseType: "Sapphire Ring",
          baseSubType: null,
          implicitLines: ["+21% to Cold Resistance"],
          explicitLines: ["Adds 1 to 3 Cold damage to Attacks"],
        },
      ],
      sharedItems: [],
    };

    const translated = translateItemsSnapshot(snapshot, translations);

    expect(translated.items[0]).toMatchObject({
      id: 2,
      name: "역병 반지",
      baseName: "사파이어 반지",
      implicitLines: ["냉기 저항 +21%"],
      explicitLines: ["공격 시 냉기 피해 1~3 추가"],
    });
    expect(translateItemsSnapshot(translated, translations)).toEqual(
      translated,
    );
    expect(snapshot.items[0].implicitLines).toEqual([
      "+21% to Cold Resistance",
    ]);
  });

  it("translates Imported Build2 item tooltip chrome and stat lines idempotently", () => {
    const tooltip: PobItemsTooltip = {
      source: "custom",
      itemId: 2,
      db: null,
      slotName: null,
      header: "RARE",
      lines: [
        { kind: "line", text: "Plague Band", colour: "RARE", size: 16 },
        { kind: "line", text: "Sapphire Ring", colour: null, size: 14 },
        { kind: "separator", text: "", colour: null, size: null },
        { kind: "line", text: "Requires Level 12", colour: null, size: 14 },
        {
          kind: "line",
          text: "+21% to Cold Resistance",
          colour: "COLD",
          size: 14,
        },
        {
          kind: "line",
          text: "Adds 1 to 3 Cold damage to Attacks",
          colour: null,
          size: 14,
        },
      ],
    };

    const translated = translateItemTooltip(tooltip, translations);

    expect(translated.lines.map((line) => line.text)).toEqual([
      "역병 반지",
      "사파이어 반지",
      "",
      "요구 레벨 12",
      "냉기 저항 +21%",
      "공격 시 냉기 피해 1~3 추가",
    ]);
    expect(translateItemTooltip(translated, translations)).toEqual(translated);
  });

  it("translates build metadata and main skill summary display fields only", () => {
    const summary: PobBuildSummary = {
      ok: true,
      className: "Monk",
      ascendClassName: "Invoker",
      level: 81,
      mainSkillName: "Tempest Bell",
      mainSkillDPS: 1234,
      playerStats: {},
    };
    const metadata: PobBuildMetadataSnapshot = {
      level: 81,
      levelAutoMode: true,
      classId: 3,
      className: "Monk",
      ascendClassId: 2,
      ascendClassName: "Invoker",
      classes: [
        {
          id: 3,
          label: "Monk",
          ascendancies: [{ id: 2, label: "Invoker" }],
        },
      ],
    };
    const mainSkillSummary: PobMainSkillSummarySnapshot = {
      socketGroupLabel: "Hand of Chayula, Elemental Weakness, Freezing Mark",
      mainSkillLabel: "Tempest Bell",
      rows: [
        {
          kind: "stat",
          label: "Skill",
          value: "Tempest Bell",
          text: null,
          height: 18,
        },
      ],
      warnings: ["Cannot be Stunned"],
    };

    expect(translateBuildSummary(summary, translations)).toMatchObject({
      className: "몽크",
      ascendClassName: "인보커",
      mainSkillName: "폭풍의 종",
      mainSkillDPS: 1234,
    });
    expect(
      translateBuildMetadataSnapshot(metadata, translations),
    ).toMatchObject({
      classId: 3,
      className: "몽크",
      ascendClassId: 2,
      ascendClassName: "인보커",
      classes: [
        {
          id: 3,
          label: "몽크",
          ascendancies: [{ id: 2, label: "인보커" }],
        },
      ],
    });
    expect(
      translateMainSkillSummarySnapshot(mainSkillSummary, translations),
    ).toMatchObject({
      socketGroupLabel: "차율라의 손, 원소 약화, 동결의 징표",
      mainSkillLabel: "폭풍의 종",
      rows: [{ label: "Skill", value: "폭풍의 종" }],
      warnings: ["기절 불가"],
    });
  });

  it("translates composite socket group labels without changing group ids", () => {
    const snapshot: PobSkillsSnapshot = {
      activeSetId: 1,
      mainSocketGroup: 2,
      calcsSocketGroup: 2,
      sets: [{ id: 1, title: "Default" }],
      groups: [
        {
          index: 2,
          label: "Hand of Chayula, Elemental Weakness, Freezing Mark",
          displayLabel: "Hand of Chayula, Elemental Weakness, Freezing Mark",
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
              gemId: null,
              skillId: null,
              nameSpec: "Hand of Chayula",
              displayName: "Hand of Chayula",
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
              color: "dexterity",
              isSupport: false,
              isVaal: false,
              fromItem: false,
              fromTree: false,
              triggered: false,
              countVisible: true,
              canEdit: true,
              canDelete: true,
              globalEffects: [],
              displayLevel: null,
              displayQuality: null,
            },
            {
              index: 2,
              gemId: null,
              skillId: null,
              nameSpec: "Elemental Weakness",
              displayName: "Elemental Weakness",
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
              globalEffects: [],
              displayLevel: null,
              displayQuality: null,
            },
            {
              index: 3,
              gemId: null,
              skillId: null,
              nameSpec: "Freezing Mark",
              displayName: "Freezing Mark",
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
              globalEffects: [],
              displayLevel: null,
              displayQuality: null,
            },
          ],
          activeSkills: [],
        },
      ],
      availableGems: [],
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

    expect(translated.groups[0]).toMatchObject({
      index: 2,
      displayLabel: "차율라의 손, 원소 약화, 동결의 징표",
    });
    expect(snapshot.groups[0].displayLabel).toBe(
      "Hand of Chayula, Elemental Weakness, Freezing Mark",
    );
  });

  it("translates ConfigView body labels and list labels while preserving values", () => {
    const snapshot: PobConfigSnapshot = {
      activeConfigSetId: 1,
      configSets: [{ id: 1, index: 1, title: "Default", active: true }],
      search: "",
      showAll: false,
      sections: [
        {
          id: "general",
          label: "General",
          col: null,
          shown: true,
          options: [
            {
              id: "res-penalty",
              var: "resPenalty",
              kind: "list",
              label: "Elemental Resistance penalty:",
              value: "Endgame (-60%)",
              defaultValue: "Endgame (-60%)",
              placeholder: null,
              shown: true,
              enabled: true,
              modified: false,
              tooltip: null,
              options: [
                { index: 1, value: "Nothing", label: "Nothing" },
                {
                  index: 2,
                  value: "+5% to Fire Resistance",
                  label: "+5% to Fire Resistance",
                },
              ],
              selectedIndex: 1,
              resizable: false,
              hideIfInvalid: false,
              doNotHighlight: false,
            },
          ],
        },
        {
          id: "skill-options",
          label: "Skill Options",
          col: null,
          shown: true,
          options: [
            {
              id: "wind-dancer-heading",
              var: null,
              kind: "label",
              label: "Wind Dancer:",
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
            },
            {
              id: "wind-dancer-stacks",
              var: "windDancerStacks",
              kind: "countAllowZero",
              label: "# of Wind Dancer Stacks:",
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
            },
          ],
        },
        {
          id: "quest",
          label: "Quest Rewards",
          col: null,
          shown: true,
          options: [
            {
              id: "venom",
              var: "questVenom",
              kind: "list",
              label: "Act 3: Venom Crypts",
              value: "25% increased Stun Threshold",
              defaultValue: "None",
              placeholder: null,
              shown: true,
              enabled: true,
              modified: false,
              tooltip:
                "One of the following:\n25% increased Stun Threshold\n30% increased Elemental Ailment Threshold",
              options: [
                { index: 1, value: "None", label: "Nothing" },
                {
                  index: 2,
                  value: "25% increased Stun Threshold",
                  label: "25% increased Stun Threshold",
                },
                {
                  index: 3,
                  value: "30% increased Elemental Ailment Threshold",
                  label: "30% increased Elemental Ailment Threshold",
                },
              ],
              selectedIndex: 2,
              resizable: false,
              hideIfInvalid: false,
              doNotHighlight: false,
            },
            {
              id: "halls",
              var: "questHalls",
              kind: "list",
              label: "Act 4: Halls Of The Dead",
              value: "+5% to Fire Resistance",
              defaultValue: "None",
              placeholder: null,
              shown: true,
              enabled: true,
              modified: false,
              tooltip: null,
              options: [
                { index: 1, value: "None", label: "Nothing" },
                {
                  index: 2,
                  value: "+5% to Fire Resistance",
                  label: "+5% to Fire Resistance",
                },
              ],
              selectedIndex: 2,
              resizable: false,
              hideIfInvalid: false,
              doNotHighlight: false,
            },
            {
              id: "khari",
              var: "questKhari",
              kind: "check",
              label: "Interlude 2: Khari Crossing",
              value: true,
              defaultValue: true,
              placeholder: null,
              shown: true,
              enabled: true,
              modified: false,
              tooltip: "5% increased maximum Life",
              options: [],
              selectedIndex: null,
              resizable: false,
              hideIfInvalid: false,
              doNotHighlight: false,
            },
          ],
        },
        {
          id: "enemy",
          label: "Enemy Stats",
          col: null,
          shown: true,
          options: [
            {
              id: "enemy-boss",
              var: "enemyIsBoss",
              kind: "list",
              label: "Is the enemy a Boss?",
              value: "Pinnacle",
              defaultValue: "Pinnacle",
              placeholder: null,
              shown: true,
              enabled: true,
              modified: false,
              tooltip: null,
              options: [
                { index: 1, value: "None", label: "No" },
                { index: 2, value: "Boss", label: "Standard Boss" },
                {
                  index: 3,
                  value: "Pinnacle",
                  label: "Guardian/Pinnacle Boss",
                },
                { index: 4, value: "Uber", label: "Uber Pinnacle Boss" },
              ],
              selectedIndex: 3,
              resizable: false,
              hideIfInvalid: false,
              doNotHighlight: false,
            },
          ],
        },
      ],
    };

    const translated = translateConfigSnapshot(snapshot, translations);

    expect(translated.sections[0].label).toBe("일반");
    expect(translated.sections[0].options[0]).toMatchObject({
      label: "원소 저항 페널티:",
      value: "Endgame (-60%)",
      options: [
        { value: "Nothing", label: "없음" },
        { value: "+5% to Fire Resistance", label: "화염 저항 +5%" },
      ],
    });
    expect(translated.sections[1]).toMatchObject({
      label: "스킬 옵션",
      options: [{ label: "바람의 무희:" }, { label: "바람의 무희 중첩 수:" }],
    });
    expect(translated.sections[2]).toMatchObject({
      label: "퀘스트 보상",
      options: [
        {
          label: "액트 3: 맹독 지하실",
          value: "25% increased Stun Threshold",
          tooltip:
            "다음 중 하나:\n기절 한계치 25% 증가\n원소 상태 이상 한계치 30% 증가",
          options: [
            { value: "None", label: "없음" },
            {
              value: "25% increased Stun Threshold",
              label: "기절 한계치 25% 증가",
            },
            {
              value: "30% increased Elemental Ailment Threshold",
              label: "원소 상태 이상 한계치 30% 증가",
            },
          ],
        },
        { label: "액트 4: 망자의 전당" },
        {
          label: "막간 2: 카리 교차로",
          value: true,
          tooltip: "최대 생명력 5% 증가",
        },
      ],
    });
    expect(translated.sections[3]).toMatchObject({
      label: "적 능력치",
      options: [
        {
          label: "적이 보스입니까?",
          value: "Pinnacle",
          options: [
            { value: "None", label: "아니요" },
            { value: "Boss", label: "일반 보스" },
            { value: "Pinnacle", label: "가디언/정점 보스" },
            { value: "Uber", label: "우버 정점 보스" },
          ],
        },
      ],
    });
    expect(translateConfigSnapshot(translated, translations)).toEqual(
      translated,
    );
  });

  it("keeps display overlays as no-ops for the English locale", () => {
    const englishTranslations: PobRepoeTranslationsSnapshot = {
      ...translations,
      locale: "en",
    };
    const summary: PobBuildSummary = {
      ok: true,
      className: "Monk",
      ascendClassName: "Invoker",
      level: 81,
      mainSkillName: "Tempest Bell",
      mainSkillDPS: 1234,
      playerStats: {},
    };
    const config: PobConfigSnapshot = {
      activeConfigSetId: 1,
      configSets: [{ id: 1, index: 1, title: "Default", active: true }],
      search: "",
      showAll: false,
      sections: [
        {
          id: "general",
          label: "General",
          col: null,
          shown: true,
          options: [
            {
              id: "res-penalty",
              var: "resPenalty",
              kind: "list",
              label: "Elemental Resistance penalty:",
              value: "Endgame (-60%)",
              defaultValue: "Endgame (-60%)",
              placeholder: null,
              shown: true,
              enabled: true,
              modified: false,
              tooltip: null,
              options: [
                { index: 1, value: "None", label: "Nothing" },
                {
                  index: 2,
                  value: "+5% to Fire Resistance",
                  label: "+5% to Fire Resistance",
                },
              ],
              selectedIndex: 1,
              resizable: false,
              hideIfInvalid: false,
              doNotHighlight: false,
            },
          ],
        },
      ],
    };

    expect(translateBuildSummary(summary, englishTranslations)).toEqual(
      summary,
    );
    expect(translateConfigSnapshot(config, englishTranslations)).toEqual(
      config,
    );
    expect(
      translateStatLine("+5% to Fire Resistance", englishTranslations),
    ).toBe("+5% to Fire Resistance");
  });

  it("projects source English labels only for English query matches", () => {
    const englishMatch = projectSearchLabel(
      "역병 반지",
      "Plague Band",
      "plag",
      "ko",
    );
    expect(englishMatch).toMatchObject({
      localizedLabel: "역병 반지",
      sourceEnglishLabel: "Plague Band",
      showSourceEnglish: true,
      matchedField: "sourceEnglish",
      sourceEnglishHighlightRanges: [{ start: 0, end: 4 }],
    });

    const localizedMatch = projectSearchLabel(
      "역병 반지",
      "Plague Band",
      "역병",
      "ko",
    );
    expect(localizedMatch.showSourceEnglish).toBe(false);
    expect(localizedMatch.matchedField).toBe("localized");
    expect(localizedMatch.localizedHighlightRanges).toEqual([
      { start: 0, end: 2 },
    ]);

    expect(
      projectSearchLabel("Plague Band", "Plague Band", "plag", "en")
        .showSourceEnglish,
    ).toBe(false);
    expect(
      projectSearchLabel("Plague Band", "Plague Band", "plag", "ko")
        .showSourceEnglish,
    ).toBe(false);
  });

  it("filters item DB search views by localized names and source English names", () => {
    const sourceEntries: PobItemDbSummary[] = [
      {
        id: "PlagueBand",
        raw: "Rarity: RARE\nPlague Band\nSapphire Ring",
        name: "Plague Band",
        rarity: "RARE",
        baseName: "Sapphire Ring",
        title: null,
        itemLevel: 69,
        quality: null,
        corrupted: false,
        mirrored: false,
        shaper: false,
        elder: false,
        fractured: false,
        influences: null,
        baseType: "Sapphire Ring",
        baseSubType: null,
        implicitLines: ["+21% to Cold Resistance"],
        explicitLines: ["Adds 1 to 3 Cold damage to Attacks"],
      },
    ];
    const displayEntries = translateItemDbEntries(sourceEntries, translations);

    const englishNameViews = filterTranslatedItemDbEntryViews(
      displayEntries,
      sourceEntries,
      "Plague",
      "ko",
    );
    expect(englishNameViews).toHaveLength(1);
    expect(englishNameViews[0].name.showSourceEnglish).toBe(true);
    expect(englishNameViews[0].name.sourceEnglishLabel).toBe("Plague Band");

    const englishBaseViews = filterTranslatedItemDbEntryViews(
      displayEntries,
      sourceEntries,
      "Sapphire",
      "ko",
    );
    expect(englishBaseViews).toHaveLength(1);
    expect(englishBaseViews[0].base.showSourceEnglish).toBe(true);
    expect(englishBaseViews[0].base.sourceEnglishLabel).toBe("Sapphire Ring");

    const localizedViews = filterTranslatedItemDbEntryViews(
      displayEntries,
      sourceEntries,
      "역병",
      "ko",
    );
    expect(localizedViews).toHaveLength(1);
    expect(localizedViews[0].name.showSourceEnglish).toBe(false);
    expect(localizedViews[0].name.matchedField).toBe("localized");
  });

  it("projects item DB rows as localized name over localized base labels", () => {
    const sourceEntries: PobItemDbSummary[] = [
      {
        id: "unique:AbAeterno",
        raw: "Rarity: UNIQUE\nAb Aeterno\nGrand Cuisses",
        name: "Ab Aeterno, Grand Cuisses",
        rarity: "UNIQUE",
        baseName: "Grand Cuisses",
        title: null,
        itemLevel: 80,
        quality: null,
        corrupted: false,
        mirrored: false,
        shaper: false,
        elder: false,
        fractured: false,
        influences: null,
        baseType: "Grand Cuisses",
        baseSubType: null,
        implicitLines: [],
        explicitLines: [],
      },
    ];
    const displayEntries = translateItemDbEntries(sourceEntries, translations);

    expect(displayEntries[0]).toMatchObject({
      name: "영원불멸, 우수한 허벅지 방어구",
      baseName: "우수한 허벅지 방어구",
    });

    const views = filterTranslatedItemDbEntryViews(
      displayEntries,
      sourceEntries,
      "Aeterno",
      "ko",
    );

    expect(views).toHaveLength(1);
    expect(views[0].name.localizedLabel).toBe("영원불멸");
    expect(views[0].name.sourceEnglishLabel).toBe("Ab Aeterno");
    expect(views[0].name.showSourceEnglish).toBe(true);
    expect(views[0].base.localizedLabel).toBe("우수한 허벅지 방어구");
  });

  it("filters gem catalog search views by localized and source English names", () => {
    const sourceEntries: PobSkillGemCatalogEntry[] = [
      {
        id: "Metadata/Items/Gem/SkillGemIceStrike",
        name: "Ice Strike",
        color: "dexterity",
        isSupport: false,
        naturalMaxLevel: 20,
        tagString: "Attack, Melee, Strike, Cold",
      },
    ];
    const displayEntries: PobSkillGemCatalogEntry[] = [
      {
        ...sourceEntries[0],
        name: "얼음 타격",
      },
    ];

    const englishViews = filterTranslatedGemCatalogEntryViews(
      displayEntries,
      sourceEntries,
      "ice",
      "ko",
    );
    expect(englishViews).toHaveLength(1);
    expect(englishViews[0].name.showSourceEnglish).toBe(true);
    expect(englishViews[0].name.sourceEnglishLabel).toBe("Ice Strike");

    const localizedViews = filterTranslatedGemCatalogEntryViews(
      displayEntries,
      sourceEntries,
      "얼음",
      "ko",
    );
    expect(localizedViews).toHaveLength(1);
    expect(localizedViews[0].name.showSourceEnglish).toBe(false);

    const englishLocaleViews = filterTranslatedGemCatalogEntryViews(
      sourceEntries,
      sourceEntries,
      "ice",
      "en",
    );
    expect(englishLocaleViews).toHaveLength(1);
    expect(englishLocaleViews[0].name.showSourceEnglish).toBe(false);
  });
});

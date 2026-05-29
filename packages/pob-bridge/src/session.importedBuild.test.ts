import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildCodesRepresentSameXml,
  decodePobBuildCodeXml,
  encodePobBuildCodeXml,
} from "@poe2-launcher/pob-repoe/buildCode";
import {
  translateConfigSnapshot,
  translateItemTooltip,
  translateItemsSnapshot,
} from "@poe2-launcher/pob-repoe/displayTranslations";
import { parseItemCopyText } from "@poe2-launcher/pob-repoe/itemCopyParser";
import type { PoBVault } from "@poe2-launcher/pob-vault";
import {
  assertPobBuildMetadataActionResult,
  assertPobBuildMetadataSnapshot,
  assertPobImportExportSnapshot,
  assertPobCalcsBreakdown,
  assertPobCalcsSnapshot,
  assertPobItemsDbList,
  assertPobItemsSnapshot,
  assertPobItemsTooltip,
  assertPobMainSkillSummarySnapshot,
  assertPobNotesSnapshot,
  assertPobPartySnapshot,
  assertPobSkillsGemTooltip,
  assertPobSkillsSnapshot,
  assertPobTreeNodeTooltip,
  assertPobTreeSnapshot,
  POB_ORIGINAL_CALCS_BUFF_MODE_LABELS,
  POB_ORIGINAL_CALCS_BUFF_MODES,
  POB_ORIGINAL_ITEMS_DB_KEYS,
} from "@poe2-launcher/shared/pobOriginalContract";
import type {
  PobCalcsSnapshot,
  PobRepoeTranslationsSnapshot,
} from "@poe2-launcher/shared/types";

import { PoBSession } from "./session";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
  BrowserWindow: {
    fromWebContents: () => null,
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

const defaultSourceRoot = "D:\\project_poe2\\PathOfBuilding-PoE2-KR\\src";
const sourceRoot = process.env.POB_INSTALL_LOCATION ?? defaultSourceRoot;
const importedBuildPath = path.resolve(
  "packages",
  "launcher",
  "src",
  "main",
  "services",
  "__fixtures__",
  "pob",
  "Imported Build2.xml",
);

const sourceAvailable =
  fs.existsSync(path.join(sourceRoot, "Modules", "Build.lua")) &&
  fs.existsSync(importedBuildPath);

const runIfPobSourceAvailable = sourceAvailable ? it : it.skip;

const staticVault = (vaultPath: string): PoBVault =>
  ({
    getActive: vi.fn(async () => ({ version: "source", vaultPath })),
    ensureSnapshot: vi.fn(async () => ({ version: "source", vaultPath })),
  }) as unknown as PoBVault;

const importedBuildItemTranslations: PobRepoeTranslationsSnapshot = {
  locale: "ko",
  available: true,
  nodeNamesById: {},
  nodeStatLinesById: {},
  statLinesByEnglishLine: {},
  statLineTemplates: [
    { english: "+#% to Cold Resistance", localized: "냉기 저항 +#%" },
    { english: "+#% to Fire Resistance", localized: "화염 저항 +#%" },
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
    { english: "+# to Accuracy Rating", localized: "정확도 +#" },
    { english: "+# to maximum Life", localized: "최대 생명력 +#" },
    { english: "+# to Intelligence", localized: "지능 +#" },
    { english: "-# Intelligence", localized: "지능 -#" },
    { english: "-#% Fire Resistance", localized: "화염 저항 -#%" },
    { english: "-#% Cold Resistance", localized: "냉기 저항 -#%" },
    {
      english: "Adds # to # Cold Damage to Attacks",
      localized: "공격 시 냉기 피해 #~# 추가",
    },
    {
      english: "Gain # Mana per enemy killed",
      localized: "적 처치 시 마나 # 획득",
    },
  ],
  itemNamesById: {},
  itemNamesByEnglishName: {
    "Plague Band": "역병 반지",
    "Sapphire Ring": "사파이어 반지",
  },
  gemNamesById: {},
  gemNamesBySkillId: {},
  gemNamesByEnglishName: {},
};

const untranslatedPlagueBandTerms =
  /\b(?:Cold Resistance|Cold damage to Attacks|Accuracy Rating|maximum Life|Intelligence|Fire Resistance|Mana per enemy killed|Requires Level)\b/i;

const calcsCardValue = (
  calcs: PobCalcsSnapshot,
  sectionId: string,
  subSectionLabel: string,
  rowLabel: string,
  cellIndex = 0,
) => {
  const section = calcs.sections.find((entry) => entry.id === sectionId);
  expect(section).toBeDefined();
  const subSection = section?.subSections.find(
    (entry) => entry.label === subSectionLabel,
  );
  expect(subSection).toBeDefined();
  const row = subSection?.rows.find((entry) => entry.label === rowLabel);
  expect(row).toBeDefined();
  return row?.cells[cellIndex]?.text;
};

describe("PoBSession Imported Build2 contract", () => {
  runIfPobSourceAvailable(
    "matches PoB Lua structures for tree, items, skills, and calcs",
    async () => {
      const xml = await fsp.readFile(importedBuildPath, "utf8");
      const session = new PoBSession({
        installLocation: sourceRoot,
        resourceRoot: path.resolve(
          "packages",
          "pob-headless-glue",
          "resources",
          "lua",
        ),
        vault: staticVault(sourceRoot),
      });

      try {
        const loaded = await session.loadBuildXml(xml, "Imported Build2");
        expect(loaded.ok).toBe(true);
        expect(loaded.playerStats.FullDPS).toBe(0);
        expect(loaded.playerStats.CombinedDPS).toBeGreaterThan(0);
        expect(loaded.playerStats.TotalDPS).toBeGreaterThan(0);
        expect(loaded.mainSkillDPS).toBe(loaded.playerStats.CombinedDPS);

        const buildMetadata = await session.buildMetadata();
        assertPobBuildMetadataSnapshot(buildMetadata);
        expect(buildMetadata.level).toBe(loaded.level);
        expect(buildMetadata.className).toBe(loaded.className);
        expect(buildMetadata.ascendClassName).toBe(loaded.ascendClassName);
        expect(buildMetadata.classes.length).toBeGreaterThan(0);
        expect(
          buildMetadata.classes.some(
            (classOption) => classOption.id === buildMetadata.classId,
          ),
        ).toBe(true);

        const levelChange = await session.buildMetadataAction({
          type: "setLevel",
          value: 82,
        });
        assertPobBuildMetadataActionResult(levelChange);
        expect(levelChange.status).toBe("ok");
        if (levelChange.status === "ok") {
          expect(levelChange.snapshot.level).toBe(82);
          expect(levelChange.snapshot.levelAutoMode).toBe(false);
        }

        const autoModeChange = await session.buildMetadataAction({
          type: "setLevelAutoMode",
          value: true,
        });
        assertPobBuildMetadataActionResult(autoModeChange);
        expect(autoModeChange.status).toBe("ok");
        if (autoModeChange.status === "ok") {
          expect(autoModeChange.snapshot.levelAutoMode).toBe(true);
        }

        const currentClass = buildMetadata.classes.find(
          (classOption) => classOption.id === buildMetadata.classId,
        );
        const alternateAscendancy = currentClass?.ascendancies.find(
          (ascendancy) => ascendancy.id !== buildMetadata.ascendClassId,
        );
        expect(alternateAscendancy).toBeDefined();
        if (alternateAscendancy) {
          const ascendancyChange = await session.buildMetadataAction({
            type: "setAscendClass",
            ascendClassId: alternateAscendancy.id,
          });
          assertPobBuildMetadataActionResult(ascendancyChange);
          expect(ascendancyChange.status).toBe("ok");
          if (ascendancyChange.status === "ok") {
            expect(ascendancyChange.snapshot.ascendClassId).toBe(
              alternateAscendancy.id,
            );
          }
        }

        const alternateClass = buildMetadata.classes.find(
          (classOption) => classOption.id !== buildMetadata.classId,
        );
        expect(alternateClass).toBeDefined();
        if (alternateClass) {
          const classChange = await session.buildMetadataAction({
            type: "setClass",
            classId: alternateClass.id,
          });
          assertPobBuildMetadataActionResult(classChange);
          expect(classChange.status).toBe("confirm");
          if (classChange.status === "confirm") {
            expect(classChange.confirmation).toMatchObject({
              type: "classChange",
              classId: alternateClass.id,
              classLabel: alternateClass.label,
              confirmLabel: "Continue",
              alternateLabel: "Connect Path",
            });
            expect(classChange.snapshot.classId).toBe(buildMetadata.classId);
          }
        }

        const tree = await session.treeSnapshot();
        assertPobTreeSnapshot(tree);
        expect(tree.nodes.length).toBeGreaterThan(0);
        expect(
          tree.nodes.some((node) => (node.statLines?.length ?? 0) > 0),
        ).toBe(true);
        const mindfulAwareness = tree.nodes.find(
          (node) => node.name === "Mindful Awareness",
        );
        expect(mindfulAwareness).toBeDefined();
        if (mindfulAwareness) {
          const tooltip = await session.treeNodeTooltip(mindfulAwareness.id);
          assertPobTreeNodeTooltip(tooltip);
          expect(tooltip.nodeId).toBe(mindfulAwareness.id);
          const tooltipText = tooltip.lines.map((line) => line.text);
          expect(tooltipText).toContain("Mindful Awareness");
          expect(tooltipText).toContain(
            "Unallocating this node will give you:",
          );
          expect(tooltipText).toContain(
            "Unallocating this node and all nodes depending on it will give you:",
          );
          expect(
            tooltipText.some((line) =>
              line.includes("Gold required to unallocate these nodes"),
            ),
          ).toBe(true);
          expect(tooltipText).toContain(
            "Tip: Press Ctrl+D to disable the display of stat differences.",
          );
          expect(tooltipText).toContain(
            "Tip: Press Ctrl+C to copy this node's text.",
          );
          expect(tooltip.lines.some((line) => line.colour === "NEGATIVE")).toBe(
            true,
          );
          expect(tooltip.lines.some((line) => line.colour === "GOLD")).toBe(
            true,
          );
          expect(JSON.stringify(tooltip)).not.toContain("^x");
          expect(JSON.stringify(tooltip)).not.toContain("^7");
        }

        const items = await session.itemsSnapshot();
        assertPobItemsSnapshot(items);
        expect(items.items.length + items.sharedItems.length).toBeGreaterThan(
          0,
        );
        expect(items.items.some((item) => item.raw.includes("Rarity:"))).toBe(
          true,
        );
        const firstCustomItem = items.items[0];
        expect(firstCustomItem).toBeDefined();
        if (firstCustomItem) {
          const itemTooltip = await session.itemsTooltip({
            source: "custom",
            itemId: firstCustomItem.id,
          });
          assertPobItemsTooltip(itemTooltip);
          expect(itemTooltip.header).toBe(firstCustomItem.rarity);
          const itemTooltipText = itemTooltip.lines.map((line) => line.text);
          expect(
            itemTooltipText.some((line) =>
              line.includes(firstCustomItem.title ?? firstCustomItem.name),
            ),
          ).toBe(true);
          expect(itemTooltipText).toContain(
            "Tip: Press Ctrl+D to disable the display of stat differences.",
          );
          expect(JSON.stringify(itemTooltip)).not.toContain("^x");
          expect(JSON.stringify(itemTooltip)).not.toContain("^7");
        }
        const plagueBand = items.items.find((item) =>
          item.raw.includes("Plague Band"),
        );
        expect(plagueBand).toBeDefined();
        if (plagueBand) {
          expect(plagueBand.implicitLines).toContain("+21% to Cold Resistance");
          expect(plagueBand.explicitLines).toContain(
            "Adds 1 to 3 Cold damage to Attacks",
          );

          const translatedItems = translateItemsSnapshot(
            items,
            importedBuildItemTranslations,
          );
          expect(
            translateItemsSnapshot(
              translatedItems,
              importedBuildItemTranslations,
            ),
          ).toEqual(translatedItems);
          const translatedPlagueBand = translatedItems.items.find(
            (item) => item.id === plagueBand.id,
          );
          expect(translatedPlagueBand).toMatchObject({
            id: plagueBand.id,
            title: "역병 반지",
            baseName: "사파이어 반지",
          });
          const translatedPlagueBandLines = [
            ...(translatedPlagueBand?.implicitLines ?? []),
            ...(translatedPlagueBand?.explicitLines ?? []),
          ];
          expect(translatedPlagueBandLines).toEqual(
            expect.arrayContaining([
              "냉기 저항 +21%",
              "공격 시 냉기 피해 1~3 추가",
              "정확도 +336",
              "최대 생명력 +16",
              "지능 +15",
              "화염 저항 +31%",
              "적 처치 시 마나 7 획득",
            ]),
          );
          expect(
            translatedPlagueBandLines.filter((line) =>
              untranslatedPlagueBandTerms.test(line),
            ),
          ).toEqual([]);

          const plagueBandTooltip = await session.itemsTooltip({
            source: "custom",
            itemId: plagueBand.id,
          });
          assertPobItemsTooltip(plagueBandTooltip);
          expect(plagueBandTooltip.maxWidth).toBe(600);
          expect(plagueBandTooltip.influenceHeader1).toBeNull();
          expect(plagueBandTooltip.influenceHeader2).toBeNull();
          expect(plagueBandTooltip.lines[0]).toMatchObject({
            font: "FONTIN SC",
            center: true,
            block: 1,
          });
          expect(
            plagueBandTooltip.lines.find((line) => line.kind === "separator"),
          ).toMatchObject({
            block: 1,
            separatorTheme: "RARE",
          });
          const translatedTooltip = translateItemTooltip(
            plagueBandTooltip,
            importedBuildItemTranslations,
          );
          expect(
            translateItemTooltip(
              translatedTooltip,
              importedBuildItemTranslations,
            ),
          ).toEqual(translatedTooltip);
          const translatedTooltipText = translatedTooltip.lines.map(
            (line) => line.text,
          );
          expect(translatedTooltipText).toEqual(
            expect.arrayContaining([
              "역병 반지",
              "사파이어 반지",
              "요구 레벨 12",
              "냉기 저항 +21%",
              "공격 시 냉기 피해 1~3 추가",
            ]),
          );
          expect(
            translatedTooltipText.filter((line) =>
              untranslatedPlagueBandTerms.test(line),
            ),
          ).toEqual([]);
          expect(
            plagueBandTooltip.lines.find((line) => line.text === "Plague Band"),
          ).toMatchObject({
            font: "FONTIN SC",
            center: true,
            background: null,
          });
        }
        for (const dbKey of POB_ORIGINAL_ITEMS_DB_KEYS) {
          const list = await session.itemsDbList(dbKey);
          assertPobItemsDbList(list);
          expect(
            list.entries.every((entry) => typeof entry.id === "string"),
          ).toBe(true);
          expect(
            list.entries.every((entry) => entry.raw.includes("Rarity:")),
          ).toBe(true);
          const dbEntry = list.entries.find(
            (entry) => entry.rarity === "UNIQUE" || dbKey === "rareDB",
          );
          expect(dbEntry).toBeDefined();
          if (dbEntry) {
            const dbTooltip = await session.itemsTooltip({
              source: "db",
              db: dbKey,
              itemId: dbEntry.id,
            });
            assertPobItemsTooltip(dbTooltip);
            expect(dbTooltip.header).toBe(dbEntry.rarity);
            expect(
              dbTooltip.lines.some((line) =>
                line.text.includes(dbEntry.title ?? dbEntry.name),
              ),
            ).toBe(true);
            expect(JSON.stringify(dbTooltip)).not.toContain("^x");
            expect(JSON.stringify(dbTooltip)).not.toContain("^7");
          }
        }

        const skills = await session.skillsSnapshot();
        assertPobSkillsSnapshot(skills);
        expect(skills.groups.length).toBeGreaterThan(0);
        const stormWaveGroup = skills.groups.find((group) =>
          group.gems.some((gem) => gem.nameSpec === "Storm Wave"),
        );
        const stormWave = stormWaveGroup?.gems.find(
          (gem) => gem.nameSpec === "Storm Wave",
        );
        expect(stormWaveGroup).toBeDefined();
        expect(stormWave).toBeDefined();
        if (stormWaveGroup && stormWave) {
          const gemTooltip = await session.skillsGemTooltip(
            stormWaveGroup.index,
            stormWave.index,
            "gem",
          );
          assertPobSkillsGemTooltip(gemTooltip);
          expect(gemTooltip.header).toBe("GEM");
          const gemTooltipText = gemTooltip.lines.map((line) => line.text);
          expect(gemTooltipText).toContain("Storm Wave");
          expect(gemTooltipText).toContain("Level: 18");
          expect(gemTooltipText).toContain("Quality: +20%");
          expect(
            gemTooltip.lines.find((line) => line.text === "Storm Wave"),
          ).toMatchObject({
            font: "FONTIN SC",
            center: true,
            background: null,
          });
          expect(
            gemTooltipText.some((line) => line.startsWith("Requires ")),
          ).toBe(true);

          const qualityTooltip = await session.skillsGemTooltip(
            stormWaveGroup.index,
            stormWave.index,
            "quality",
          );
          assertPobSkillsGemTooltip(qualityTooltip);
          expect(qualityTooltip.mode).toBe("quality");
          expect(qualityTooltip.lines.length).toBeGreaterThan(0);

          const enabledTooltip = await session.skillsGemTooltip(
            stormWaveGroup.index,
            stormWave.index,
            "enabled",
          );
          assertPobSkillsGemTooltip(enabledTooltip);
          expect(enabledTooltip.mode).toBe("enabled");
          expect(JSON.stringify(enabledTooltip)).not.toContain("^x");
          expect(JSON.stringify(enabledTooltip)).not.toContain("^7");
        }
        const lightningAttunementGroup = skills.groups.find((group) =>
          group.gems.some((gem) => gem.nameSpec === "Lightning Attunement"),
        );
        const lightningAttunement = lightningAttunementGroup?.gems.find(
          (gem) => gem.nameSpec === "Lightning Attunement",
        );
        expect(lightningAttunementGroup).toBeDefined();
        expect(lightningAttunement).toBeDefined();
        if (lightningAttunementGroup && lightningAttunement) {
          const supportTooltip = await session.skillsGemTooltip(
            lightningAttunementGroup.index,
            lightningAttunement.index,
            "gem",
          );
          assertPobSkillsGemTooltip(supportTooltip);
          const supportTooltipText = supportTooltip.lines.map(
            (line) => line.text,
          );
          expect(supportTooltipText).toContain("Lightning Attunement");
          expect(supportTooltipText).toContain("Support");
          expect(supportTooltipText).toContain(
            "Category: Lightning Attunement",
          );
          expect(supportTooltipText).toContain("Tier: 1");
          expect(supportTooltipText).toContain(
            "Supports Attacks, causing them to Gain Lightning Damage but deal less Cold and Fire Damage.",
          );
          expect(
            supportTooltipText.some((line) =>
              line.includes("Lightning Damage"),
            ),
          ).toBe(true);
          expect(JSON.stringify(supportTooltip)).not.toContain("^x");
          expect(JSON.stringify(supportTooltip)).not.toContain("^7");
        }

        const mainSkillSummary = await session.mainSkillSummary();
        assertPobMainSkillSummarySnapshot(mainSkillSummary);
        expect(mainSkillSummary.mainSkillLabel).not.toBeNull();
        expect(mainSkillSummary.rows.some((row) => row.kind === "stat")).toBe(
          true,
        );
        expect(JSON.stringify(mainSkillSummary)).not.toContain("^x");

        const config = await session.configSnapshot();
        const translatedConfig = translateConfigSnapshot(
          config,
          importedBuildItemTranslations,
        );
        expect(config.sections.map((section) => section.label)).toEqual(
          expect.arrayContaining(["General", "Quest Rewards", "Enemy Stats"]),
        );
        expect(
          translatedConfig.sections.map((section) => section.label),
        ).toEqual(expect.arrayContaining(["일반", "퀘스트 보상", "적 능력치"]));
        const questRewards = translatedConfig.sections.find(
          (section) => section.label === "퀘스트 보상",
        );
        expect(questRewards).toBeDefined();
        expect(questRewards?.options.map((option) => option.label)).toEqual(
          expect.arrayContaining([
            "액트 3: 맹독 지하실",
            "액트 4: 망자의 전당",
            "막간 2: 카리 교차로",
          ]),
        );
        expect(
          questRewards?.options.flatMap((option) =>
            option.options.map((entry) => entry.label),
          ),
        ).toEqual(
          expect.arrayContaining([
            "화염 저항 +5%",
            "기절 한계치 25% 증가",
            "원소 상태 이상 한계치 30% 증가",
          ]),
        );
        expect(
          questRewards?.options.flatMap((option) =>
            option.options.map((entry) => entry.value),
          ),
        ).toEqual(
          expect.arrayContaining([
            "+5% to Fire Resistance",
            "25% increased Stun Threshold",
            "30% increased Elemental Ailment Threshold",
          ]),
        );

        const party = await session.partySnapshot();
        assertPobPartySnapshot(party);
        expect(party.enableExportBuffs).toBe(false);
        expect(party.notes).toContain(
          'To import a build it must be exported with "Export support" enabled',
        );
        expect(party.importControls.inputLabel).toBe(
          "Enter a build code/URL below:",
        );
        expect(party.importControls.destinations).toEqual([
          "All",
          "Party Member Stats",
          "Aura",
          "Curse",
          "Warcry Skills",
          "Link Skills",
          "EnemyConditions",
          "EnemyMods",
        ]);
        expect(party.importControls.selectedDestination).toBe(1);
        expect(party.importControls.append.checked).toBe(false);
        expect(party.importControls.showAdvanced.checked).toBe(false);
        expect(party.leftSections.map((section) => section.label)).toEqual([
          "Auras",
          "Warcry Skills",
          "Link Skills",
        ]);
        expect(party.rightSections.map((section) => section.label)).toEqual([
          "Party Member Stats",
          "Enemy Conditions",
          "Enemy Modifiers",
          "Curses",
        ]);
        expect(party.leftSections.every((section) => section.text === "")).toBe(
          true,
        );
        expect(
          party.rightSections.every((section) => section.text === ""),
        ).toBe(true);
        expect(
          party.rightSections.find(
            (section) => section.key === "enemyConditions",
          )?.simpleText,
        ).toBe("---------------------------\n");
        expect(JSON.stringify(party)).not.toContain("^7");

        const importExport = await session.importExportSnapshot();
        assertPobImportExportSnapshot(importExport);
        expect(importExport.exportControls.exportSupport.label).toBe(
          "Export Support",
        );
        expect(importExport.exportControls.exportSupport.checked).toBe(false);
        expect(
          importExport.exportControls.exportSites.map((site) => site.id),
        ).toEqual(["Maxroll", "POBBin", "PoeNinja", "PoE2DB"]);
        expect(
          importExport.importControls.modes.map((mode) => mode.id),
        ).toEqual(["current", "new", "comparison"]);
        expect(importExport.characterImport.mode).toBe("AUTHENTICATION");
        expect(importExport.unsupportedFeatures).toEqual(
          expect.arrayContaining([
            "urlShare",
            "urlDownload",
            "characterImport",
          ]),
        );

        const exportSupportImportExport = await session.importExportAction({
          type: "setExportSupport",
          value: true,
        });
        expect(exportSupportImportExport.status).toBe("ok");
        if (exportSupportImportExport.status === "ok") {
          assertPobImportExportSnapshot(exportSupportImportExport.snapshot);
          expect(
            exportSupportImportExport.snapshot.exportControls.exportSupport
              .checked,
          ).toBe(true);
        }
        const partyAfterImportExportAction = await session.partySnapshot();
        assertPobPartySnapshot(partyAfterImportExportAction);
        expect(partyAfterImportExportAction.enableExportBuffs).toBe(true);

        const advancedParty = await session.partyAction({
          type: "setShowAdvanced",
          value: true,
        });
        assertPobPartySnapshot(advancedParty);
        expect(advancedParty.importControls.showAdvanced.checked).toBe(true);
        expect(
          advancedParty.rightSections.every(
            (section) => section.advancedVisible,
          ),
        ).toBe(true);

        const appendedParty = await session.partyAction({
          type: "setAppend",
          value: true,
        });
        assertPobPartySnapshot(appendedParty);
        expect(appendedParty.importControls.append.checked).toBe(true);

        const enemyDestination = await session.partyAction({
          type: "setDestination",
          value: "EnemyConditions",
        });
        assertPobPartySnapshot(enemyDestination);
        expect(enemyDestination.importControls.selectedDestination).toBe(7);

        const editedParty = await session.partyAction({
          type: "setSectionText",
          key: "enemyConditions",
          value: "Condition:Blinded",
        });
        assertPobPartySnapshot(editedParty);
        expect(
          editedParty.rightSections.find(
            (section) => section.key === "enemyConditions",
          )?.text,
        ).toBe("Condition:Blinded");

        const clearedParty = await session.partyAction({ type: "clear" });
        assertPobPartySnapshot(clearedParty);
        expect(
          clearedParty.rightSections.find(
            (section) => section.key === "enemyConditions",
          )?.text,
        ).toBe("");

        const exportSupportParty = await session.partyAction({
          type: "setExportSupport",
          value: true,
        });
        assertPobPartySnapshot(exportSupportParty);
        expect(exportSupportParty.enableExportBuffs).toBe(true);

        const notes = await session.notesSnapshot();
        assertPobNotesSnapshot(notes);
        expect(notes.text.trim()).toBe("");
        expect(notes.colorControls.map((control) => control.id)).toEqual([
          "normal",
          "magic",
          "rare",
          "unique",
          "fire",
          "cold",
          "lightning",
          "chaos",
          "strength",
          "dexterity",
          "intelligence",
          "default",
        ]);
        expect(notes.toggleButton.label).toBe("Show Color Codes");
        expect(notes.description[0]).toContain("Ctrl +/-");

        const editedNotes = await session.notesAction({
          type: "setText",
          value: "PR-13 note",
        });
        assertPobNotesSnapshot(editedNotes);
        expect(editedNotes.text).toBe("PR-13 note");
        expect(editedNotes.dirty).toBe(true);

        const colorNotes = await session.notesAction({
          type: "insertColor",
          code: "^7",
          selectionStartByte: 0,
          selectionEndByte: 5,
        });
        assertPobNotesSnapshot(colorNotes);
        expect(colorNotes.text).toContain("^7");

        const visibleColorCodes = await session.notesAction({
          type: "setShowColorCodes",
          value: true,
        });
        assertPobNotesSnapshot(visibleColorCodes);
        expect(visibleColorCodes.showColorCodes).toBe(true);
        expect(visibleColorCodes.toggleButton.label).toBe("Hide Color Codes");

        const hiddenColorCodes = await session.notesAction({
          type: "setShowColorCodes",
          value: false,
        });
        assertPobNotesSnapshot(hiddenColorCodes);
        expect(hiddenColorCodes.showColorCodes).toBe(false);

        const savedNotesXml = await session.saveBuildXml();
        expect(savedNotesXml.xml).toContain("<Notes>");
        expect(savedNotesXml.xml).toContain("PR-13");
        expect(savedNotesXml.xml).toContain("note");

        const calcs = await session.calcsSnapshot();
        assertPobCalcsSnapshot(calcs);
        expect(calcs.skillSelect.buffModeOptions).toEqual(
          POB_ORIGINAL_CALCS_BUFF_MODES.map((value) => ({
            value,
            label: POB_ORIGINAL_CALCS_BUFF_MODE_LABELS[value],
          })),
        );

        const hitDamage = calcs.sections.find(
          (section) => section.id === "HitDamage",
        );
        const skillHit = hitDamage?.subSections.find(
          (sub) => sub.label === "Skill Hit Damage",
        );
        expect(skillHit?.rows[0]?.cells.map((cell) => cell.text)).toEqual([
          "All Types:",
          "Physical:",
          "Lightning:",
          "Cold:",
          "Fire:",
          "Chaos:",
        ]);
        expect(
          skillHit?.rows.find((row) => row.label === "Added Min")?.cells[0]
            ?.text,
        ).toBe("");
        expect(
          skillHit?.rows.find((row) => row.label === "Added Max")?.cells[0]
            ?.text,
        ).toBe("");
        const hitDamageRows =
          skillHit?.rows.filter((row) => row.label.endsWith("Hit Damage")) ??
          [];
        expect(hitDamageRows.length).toBeGreaterThan(0);
        for (const row of hitDamageRows) {
          const values = row.cells.map((cell) => cell.text);
          expect(values).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/\d+(\.\d+)? to \d+(\.\d+)?/),
            ]),
          );
          expect(values).not.toContain("-");
        }

        expect(
          calcsCardValue(calcs, "Attributes", "Attributes", "Strength"),
        ).toBe("27");
        expect(
          calcsCardValue(calcs, "Attributes", "Attributes", "Dexterity"),
        ).toBe("121");
        expect(
          calcsCardValue(calcs, "Attributes", "Attributes", "Intelligence"),
        ).toBe("127");
        expect(calcsCardValue(calcs, "Life", "Life", "Total")).toBe("1,388");
        expect(calcsCardValue(calcs, "Mana", "Mana", "Total")).toBe("749");
        expect(calcsCardValue(calcs, "Resist", "Resists", "Fire Resist")).toBe(
          "75% (+7%)",
        );
        expect(
          calcsCardValue(
            calcs,
            "MiscEffects",
            "Other Effects",
            "Presence Radius",
          ),
        ).toBe("4m");
        expect(
          calcsCardValue(
            calcs,
            "Speed",
            "Attack/Cast Rate",
            "MH Att. per second",
          ),
        ).toBe("1.89");

        const calcsText = calcs.sections.flatMap((section) =>
          section.subSections.flatMap((sub) =>
            sub.rows.flatMap((row) => [
              row.label,
              ...row.cells.map((cell) => cell.text),
            ]),
          ),
        );
        expect(calcsText).not.toContain("old:");
        expect(calcsText).not.toContain("ire:");
        expect(calcsText).not.toContain("haos:");
        expect(calcsText).not.toContain("-%");
        expect(calcsText).not.toContain("- to -");

        const firstBreakdownKey = calcs.sections
          .flatMap((section) => section.subSections)
          .flatMap((sub) => sub.rows)
          .flatMap((row) => row.cells)
          .find((cell) => cell.breakdownKey !== null)?.breakdownKey;
        expect(firstBreakdownKey).toBeTypeOf("string");
        if (typeof firstBreakdownKey === "string") {
          const breakdown = await session.calcsBreakdown(firstBreakdownKey);
          assertPobCalcsBreakdown(breakdown);
          expect(breakdown.key).toBe(firstBreakdownKey);
        }
      } finally {
        await session.dispose();
      }
    },
    180_000,
  );

  runIfPobSourceAvailable(
    "exports Imported Build2 as a direct PoB build code that can be re-imported",
    async () => {
      const xml = await fsp.readFile(importedBuildPath, "utf8");
      const sourceCode = encodePobBuildCodeXml(xml);
      const session = new PoBSession({
        installLocation: sourceRoot,
        resourceRoot: path.resolve(
          "packages",
          "pob-headless-glue",
          "resources",
          "lua",
        ),
        vault: staticVault(sourceRoot),
      });
      let exportedCode: string | undefined;

      try {
        const loaded = await session.loadBuildCode(
          sourceCode,
          "Imported Build2 code",
        );
        expect(loaded.ok).toBe(true);

        const exported = await session.exportBuildCode();
        exportedCode = exported.code;
        expect(decodePobBuildCodeXml(exported.code)).toContain(
          "<PathOfBuilding2",
        );

        const comparison = await session.importExportAction({
          type: "importBuildCode",
          code: exported.code,
          mode: "comparison",
          name: "Imported comparison",
        });
        expect(comparison.status).toBe("ok");
        if (comparison.status === "ok") {
          assertPobImportExportSnapshot(comparison.snapshot);
          expect(comparison.mode).toBe("comparison");
        }
        const afterComparison = await session.exportBuildCode();
        expect(
          buildCodesRepresentSameXml(exported.code, afterComparison.code),
        ).toBe(true);
      } finally {
        await session.dispose();
      }
      expect(exportedCode).toBeDefined();
      if (!exportedCode) return;

      const reimported = new PoBSession({
        installLocation: sourceRoot,
        resourceRoot: path.resolve(
          "packages",
          "pob-headless-glue",
          "resources",
          "lua",
        ),
        vault: staticVault(sourceRoot),
      });

      try {
        const reloaded = await reimported.loadBuildCode(
          exportedCode,
          "Reimported Imported Build2 code",
        );
        expect(reloaded.ok).toBe(true);

        const tree = await reimported.treeSnapshot();
        assertPobTreeSnapshot(tree);
        expect(tree.nodes.length).toBeGreaterThan(0);

        const items = await reimported.itemsSnapshot();
        assertPobItemsSnapshot(items);
        expect(items.items.length + items.sharedItems.length).toBeGreaterThan(
          0,
        );

        const skills = await reimported.skillsSnapshot();
        assertPobSkillsSnapshot(skills);
        expect(skills.groups.length).toBeGreaterThan(0);

        const calcs = await reimported.calcsSnapshot();
        assertPobCalcsSnapshot(calcs);
        expect(calcs.sections.length).toBeGreaterThan(0);
      } finally {
        await reimported.dispose();
      }
    },
    180_000,
  );

  runIfPobSourceAvailable(
    "accepts parser-normalized Korean item copy text through the Lua item path",
    async () => {
      const parsed = parseItemCopyText({
        rawText: ["아이템 희귀도: 일반", "감싼 육척봉"].join("\n"),
        data: {
          en: {
            baseItems: {
              wrappedQuarterstaff: { display_name: "Wrapped Quarterstaff" },
            },
          },
          ko: {
            baseItems: {
              wrappedQuarterstaff: { display_name: "감싼 육척봉" },
            },
          },
        },
      });

      expect(parsed.status).toBe("ok");
      if (parsed.status !== "ok") return;

      const session = new PoBSession({
        installLocation: sourceRoot,
        resourceRoot: path.resolve(
          "packages",
          "pob-headless-glue",
          "resources",
          "lua",
        ),
        vault: staticVault(sourceRoot),
      });

      try {
        await session.newBuild("Item copy parser");
        const snapshot = await session.itemsParseAndAdd(parsed.englishText);

        expect(snapshot.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "Wrapped Quarterstaff",
              baseName: "Wrapped Quarterstaff",
              raw: expect.stringContaining("Rarity: NORMAL"),
            }),
          ]),
        );

        const itemId = snapshot.items[0]?.id;
        expect(itemId).toBeTypeOf("number");
        if (typeof itemId !== "number") return;

        const edited = await session.itemsAction({
          type: "saveCustom",
          itemId,
          raw: "Rarity: Rare\nStorm Grasp\nWrapped Quarterstaff",
        });
        const saved = edited.items.find((item) => item.id === itemId);
        expect(saved).toEqual(
          expect.objectContaining({
            name: "Storm Grasp, Wrapped Quarterstaff",
            title: "Storm Grasp",
            baseName: "Wrapped Quarterstaff",
            raw: expect.stringContaining("Rarity: RARE"),
          }),
        );
      } finally {
        await session.dispose();
      }
    },
    180_000,
  );
});

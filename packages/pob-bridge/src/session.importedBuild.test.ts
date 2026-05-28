import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildCodesRepresentSameXml,
  decodePobBuildCodeXml,
  encodePobBuildCodeXml,
} from "@poe2-launcher/pob-repoe/buildCode";
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
  assertPobPartySnapshot,
  assertPobSkillsGemTooltip,
  assertPobSkillsSnapshot,
  assertPobTreeNodeTooltip,
  assertPobTreeSnapshot,
  POB_ORIGINAL_CALCS_BUFF_MODE_LABELS,
  POB_ORIGINAL_CALCS_BUFF_MODES,
  POB_ORIGINAL_ITEMS_DB_KEYS,
} from "@poe2-launcher/shared/pobOriginalContract";
import type { PobCalcsSnapshot } from "@poe2-launcher/shared/types";

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

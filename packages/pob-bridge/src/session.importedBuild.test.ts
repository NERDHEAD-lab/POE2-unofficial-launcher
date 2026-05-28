import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  decodePobBuildCodeXml,
  encodePobBuildCodeXml,
} from "@poe2-launcher/pob-repoe/buildCode";
import { parseItemCopyText } from "@poe2-launcher/pob-repoe/itemCopyParser";
import type { PoBVault } from "@poe2-launcher/pob-vault";
import {
  assertPobCalcsBreakdown,
  assertPobCalcsSnapshot,
  assertPobItemsDbList,
  assertPobItemsSnapshot,
  assertPobSkillsSnapshot,
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

        const tree = await session.treeSnapshot();
        assertPobTreeSnapshot(tree);
        expect(tree.nodes.length).toBeGreaterThan(0);
        expect(
          tree.nodes.some((node) => (node.statLines?.length ?? 0) > 0),
        ).toBe(true);

        const items = await session.itemsSnapshot();
        assertPobItemsSnapshot(items);
        expect(items.items.length + items.sharedItems.length).toBeGreaterThan(
          0,
        );
        for (const dbKey of POB_ORIGINAL_ITEMS_DB_KEYS) {
          const list = await session.itemsDbList(dbKey);
          assertPobItemsDbList(list);
          expect(
            list.entries.every((entry) => typeof entry.id === "string"),
          ).toBe(true);
        }

        const skills = await session.skillsSnapshot();
        assertPobSkillsSnapshot(skills);
        expect(skills.groups.length).toBeGreaterThan(0);

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
            }),
          ]),
        );
      } finally {
        await session.dispose();
      }
    },
    180_000,
  );
});

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { PoBSession } from "./pobSession";
import {
  assertPobCalcsSnapshot,
  assertPobItemsDbList,
  assertPobItemsSnapshot,
  assertPobSkillsSnapshot,
  assertPobTreeSnapshot,
  POB_ORIGINAL_CALCS_BUFF_MODE_LABELS,
  POB_ORIGINAL_CALCS_BUFF_MODES,
  POB_ORIGINAL_ITEMS_DB_KEYS,
} from "../../shared/pobOriginalContract";

import type { PoBVault } from "./pobVault";

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

describe("PoBSession Imported Build2 contract", () => {
  runIfPobSourceAvailable(
    "matches PoB Lua structures for tree, items, skills, and calcs",
    async () => {
      const xml = await fsp.readFile(importedBuildPath, "utf8");
      const session = new PoBSession({
        installLocation: sourceRoot,
        resourceRoot: path.resolve("resources", "lua"),
        vault: staticVault(sourceRoot),
      });

      try {
        const loaded = await session.loadBuildXml(xml, "Imported Build2");
        expect(loaded.ok).toBe(true);

        const tree = await session.treeSnapshot();
        assertPobTreeSnapshot(tree);
        expect(tree.nodes.length).toBeGreaterThan(0);

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
      } finally {
        await session.dispose();
      }
    },
    180_000,
  );
});

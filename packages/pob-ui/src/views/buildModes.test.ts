import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { POB_BUILD_MODES } from "./buildModes";

const defaultSourceRoot = "D:\\project_poe2\\PathOfBuilding-PoE2-KR\\src";
const sourceRoot = process.env.POB_INSTALL_LOCATION ?? defaultSourceRoot;
const buildLuaPath = path.join(sourceRoot, "Modules", "Build.lua");
const runIfPobSourceAvailable = fs.existsSync(buildLuaPath) ? it : it.skip;

const modeButtonPattern =
  /self\.controls\.mode(?:Tree|Skills|Items|Calcs|Party)\s*=\s*new\("ButtonControl",[^\n]*,\s*"([^"]+)",\s*function/g;

const toModeId = (label: string) => label.toLowerCase();

describe("POB_BUILD_MODES", () => {
  it("keeps the launcher primary mode order explicit", () => {
    expect(POB_BUILD_MODES).toEqual([
      "tree",
      "skills",
      "items",
      "calcs",
      "party",
      "notes",
    ]);
  });

  runIfPobSourceAvailable(
    "keeps PoB Build.lua mode parity while placing Notes after Party in React",
    () => {
      const buildLua = fs.readFileSync(buildLuaPath, "utf8");
      const modeLabels = [...buildLua.matchAll(modeButtonPattern)].map(
        ([, label]) => toModeId(label),
      );

      expect(modeLabels).toEqual(
        POB_BUILD_MODES.filter((mode) => mode !== "notes"),
      );
      expect(buildLua).toMatch(/self\.controls\.modeNotes\s*=/);
    },
  );
});

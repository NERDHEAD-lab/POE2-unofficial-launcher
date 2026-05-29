import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPobTestSourceAvailable,
  resolvePobTestSource,
  shouldRunPobSourceTest,
} from "@poe2-launcher/shared/pobTestSource";

import { getBuildModePreloadOrder, POB_BUILD_MODES } from "./buildModes";

const pobSource = resolvePobTestSource();
const sourceRoot = pobSource.sourceRoot;
const buildLuaPath = path.join(sourceRoot, "Modules", "Build.lua");
const runIfPobSourceAvailable = shouldRunPobSourceTest(pobSource)
  ? it
  : it.skip;

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

  it("preloads the active mode first and keeps the PoB mode order after it", () => {
    expect(getBuildModePreloadOrder("items")).toEqual([
      "items",
      "tree",
      "skills",
      "calcs",
      "party",
      "notes",
    ]);
  });

  runIfPobSourceAvailable(
    "keeps PoB Build.lua mode parity while placing Notes after Party in React",
    () => {
      assertPobTestSourceAvailable(pobSource);
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

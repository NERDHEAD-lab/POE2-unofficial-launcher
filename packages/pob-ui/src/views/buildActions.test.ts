import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { POB_BUILD_ACTIONS, POB_BUILD_HEADER_ACTIONS } from "./buildActions";

const defaultSourceRoot = "D:\\project_poe2\\PathOfBuilding-PoE2-KR\\src";
const sourceRoot = process.env.POB_INSTALL_LOCATION ?? defaultSourceRoot;
const buildLuaPath = path.join(sourceRoot, "Modules", "Build.lua");
const runIfPobSourceAvailable = fs.existsSync(buildLuaPath) ? it : it.skip;

const actionButtonPattern =
  /self\.controls\.mode(?:Import|Config)\s*=\s*new\("ButtonControl",[^\n]*,\s*"([^"]+)",\s*function/g;

const toActionId = (label: string) => {
  if (label === "Import/Export Build") return "importExport";
  if (label === "Configuration") return "configuration";
  return label;
};

describe("POB_BUILD_ACTIONS", () => {
  it("keeps the launcher build action order explicit", () => {
    expect(POB_BUILD_ACTIONS).toEqual(["importExport", "configuration"]);
  });

  it("splits the header import/export controls without changing PoB source actions", () => {
    expect(
      POB_BUILD_HEADER_ACTIONS.map(({ id, buildAction, iconOnly }) => ({
        id,
        buildAction,
        iconOnly: iconOnly ?? false,
      })),
    ).toEqual([
      { id: "importBuild", buildAction: "importExport", iconOnly: false },
      { id: "exportBuild", buildAction: "importExport", iconOnly: false },
      { id: "configuration", buildAction: "configuration", iconOnly: true },
    ]);

    expect([
      ...new Set(POB_BUILD_HEADER_ACTIONS.map((action) => action.buildAction)),
    ]).toEqual([...POB_BUILD_ACTIONS]);
  });

  runIfPobSourceAvailable(
    "matches PoB Build.lua import/config action button order",
    () => {
      const buildLua = fs.readFileSync(buildLuaPath, "utf8");
      const actionLabels = [...buildLua.matchAll(actionButtonPattern)].map(
        ([, label]) => toActionId(label),
      );

      expect(actionLabels).toEqual([...POB_BUILD_ACTIONS]);
    },
  );
});

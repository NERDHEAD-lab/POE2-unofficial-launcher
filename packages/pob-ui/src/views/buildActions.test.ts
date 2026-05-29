import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPobTestSourceAvailable,
  resolvePobTestSource,
  shouldRunPobSourceTest,
} from "@poe2-launcher/shared/pobTestSource";

import {
  POB_BUILD_ACTIONS,
  POB_BUILD_HEADER_ACTIONS,
  resolveImportExportPanelVisibility,
} from "./buildActions";

const pobSource = resolvePobTestSource();
const sourceRoot = pobSource.sourceRoot;
const buildLuaPath = path.join(sourceRoot, "Modules", "Build.lua");
const runIfPobSourceAvailable = shouldRunPobSourceTest(pobSource)
  ? it
  : it.skip;

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
        intent:
          POB_BUILD_HEADER_ACTIONS.find((action) => action.id === id)?.intent ??
          null,
      })),
    ).toEqual([
      {
        id: "importBuild",
        buildAction: "importExport",
        iconOnly: false,
        intent: "import",
      },
      {
        id: "exportBuild",
        buildAction: "importExport",
        iconOnly: false,
        intent: "export",
      },
      {
        id: "configuration",
        buildAction: "configuration",
        iconOnly: true,
        intent: null,
      },
    ]);

    expect([
      ...new Set(POB_BUILD_HEADER_ACTIONS.map((action) => action.buildAction)),
    ]).toEqual([...POB_BUILD_ACTIONS]);
  });

  runIfPobSourceAvailable(
    "matches PoB Build.lua import/config action button order",
    () => {
      assertPobTestSourceAvailable(pobSource);
      const buildLua = fs.readFileSync(buildLuaPath, "utf8");
      const actionLabels = [...buildLua.matchAll(actionButtonPattern)].map(
        ([, label]) => toActionId(label),
      );

      expect(actionLabels).toEqual([...POB_BUILD_ACTIONS]);
    },
  );

  it("uses split import/export panels only for renewed UI", () => {
    expect(resolveImportExportPanelVisibility("renewed", "import")).toEqual({
      exportPanel: false,
      importPanel: true,
      characterImportPanel: true,
    });
    expect(resolveImportExportPanelVisibility("renewed", "export")).toEqual({
      exportPanel: true,
      importPanel: false,
      characterImportPanel: false,
    });
    expect(resolveImportExportPanelVisibility("legacy", "export")).toEqual({
      exportPanel: true,
      importPanel: true,
      characterImportPanel: true,
    });
  });
});

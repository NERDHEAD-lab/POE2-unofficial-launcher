import { describe, expect, it } from "vitest";

import {
  DEFAULT_POB_SETTINGS,
  normalizePobBuildExplorerExpandedPaths,
  normalizePobMainSkillPanelHeightRatio,
  normalizePobSettings,
  normalizePobVaultGenerationLimit,
} from "./pobSettings";

describe("PoB settings contract", () => {
  it("keeps PR-9 vault defaults enabled and bounded", () => {
    expect(DEFAULT_POB_SETTINGS).toMatchObject({
      autosaveDrafts: false,
      sidebarCollapsed: false,
      buildExplorerExpandedPaths: [""],
      mainSkillPanelCollapsed: false,
      mainSkillPanelHeightRatio: 0.5,
      autoVaultUpdate: true,
      vaultGenerationLimit: 2,
    });
  });

  it("normalizes missing or invalid stored values to safe defaults", () => {
    expect(normalizePobSettings(undefined)).toEqual(DEFAULT_POB_SETTINGS);
    expect(
      normalizePobSettings({
        autosaveDrafts: true,
        sidebarCollapsed: true,
        buildExplorerExpandedPaths: ["", "Monk", "Monk/Invoker"],
        mainSkillPanelCollapsed: true,
        mainSkillPanelHeightRatio: 2,
        autoVaultUpdate: false,
        vaultGenerationLimit: 9,
      }),
    ).toEqual({
      autosaveDrafts: true,
      sidebarCollapsed: true,
      buildExplorerExpandedPaths: ["", "Monk", "Monk/Invoker"],
      mainSkillPanelCollapsed: true,
      mainSkillPanelHeightRatio: 1,
      autoVaultUpdate: false,
      vaultGenerationLimit: 5,
    });
  });

  it("normalizes persisted wrapper UI state fields", () => {
    expect(normalizePobBuildExplorerExpandedPaths(undefined)).toEqual([""]);
    expect(
      normalizePobBuildExplorerExpandedPaths(["", " Monk\\Invoker ", 3]),
    ).toEqual(["", "Monk/Invoker"]);
    expect(normalizePobMainSkillPanelHeightRatio(-1)).toBe(0);
    expect(normalizePobMainSkillPanelHeightRatio(0.75)).toBe(0.75);
    expect(normalizePobMainSkillPanelHeightRatio("bad")).toBe(0.5);
  });

  it("clamps vault generation count to the PoB plan range", () => {
    expect(normalizePobVaultGenerationLimit(0)).toBe(1);
    expect(normalizePobVaultGenerationLimit(3.8)).toBe(3);
    expect(normalizePobVaultGenerationLimit(6)).toBe(5);
    expect(normalizePobVaultGenerationLimit("bad")).toBe(2);
  });
});

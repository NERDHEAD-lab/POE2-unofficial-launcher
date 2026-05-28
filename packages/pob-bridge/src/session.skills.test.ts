import { describe, expect, it, vi } from "vitest";

import type {
  PobSkillsGemTooltip,
  PobSkillsSnapshot,
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

const emptySnapshot: PobSkillsSnapshot = {
  activeSetId: 1,
  mainSocketGroup: 1,
  calcsSocketGroup: 1,
  sets: [],
  groups: [],
  availableGems: [],
  slotOptions: [],
  defaultGemLevelOptions: [],
  supportGemTypeOptions: [],
  sortGemFieldOptions: [],
  options: {
    sortGemsByDPS: true,
    sortGemsByDPSField: "CombinedDPS",
    defaultGemLevel: "normalMaximum",
    defaultGemQuality: 0,
    showSupportGemTypes: "ALL",
  },
};

const emptyTooltip: PobSkillsGemTooltip = {
  groupIndex: 1,
  gemIndex: 2,
  mode: "gem",
  header: "GEM",
  lines: [],
};

describe("PoBSession Skills RPC", () => {
  it("requests the active build skills snapshot", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);

    await expect(session.skillsSnapshot()).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.skills.snapshot");
  });

  it("forwards typed skill actions", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);
    const action = {
      type: "setGem",
      groupIndex: 1,
      gemIndex: 1,
      patch: { level: 20 },
    } as const;

    await expect(session.skillsAction(action)).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.skills.action", action);
  });

  it("requests gem tooltip payloads by group, gem, and mode", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptyTooltip);

    await expect(session.skillsGemTooltip(1, 2, "gem")).resolves.toBe(
      emptyTooltip,
    );

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.skills.gemTooltip", {
      groupIndex: 1,
      gemIndex: 2,
      mode: "gem",
    });
  });
});

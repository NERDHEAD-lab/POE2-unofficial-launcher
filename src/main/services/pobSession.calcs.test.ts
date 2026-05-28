import { describe, expect, it, vi } from "vitest";

import { PoBSession } from "./pobSession";

import type { PobCalcsBreakdown, PobCalcsSnapshot } from "../../shared/types";

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

const emptySnapshot: PobCalcsSnapshot = {
  search: "",
  skillSelect: {
    skillNumber: 1,
    buffMode: "EFFECTIVE",
    buffModeOptions: [
      { value: "UNBUFFED", label: "UNBUFFED" },
      { value: "BUFFED", label: "BUFFED" },
      { value: "COMBAT", label: "COMBAT" },
      { value: "EFFECTIVE", label: "EFFECTIVE" },
    ],
    showMinion: false,
    showMinionShown: false,
    socketGroup: { selected: 1, options: [] },
    mainSkill: { selected: null, options: [] },
    statSet: { selected: null, options: [] },
    skillPart: { selected: null, shown: false, options: [] },
    skillStages: { value: null, shown: false },
    mineCount: { value: null, shown: false },
    minion: { selected: null, shown: false, options: [] },
    spectreLibrary: {
      label: "Manage Spectres...",
      shown: false,
      enabled: false,
    },
    beastLibrary: { label: "Manage Beasts...", shown: false, enabled: false },
    minionSkill: { selected: null, shown: false, options: [] },
    minionSkillStatSet: { selected: null, shown: false, options: [] },
  },
  sections: [],
  summary: {
    combinedDPS: null,
    fullDPS: null,
    totalEHP: null,
    life: null,
    energyShield: null,
    mana: null,
  },
};

const emptyBreakdown: PobCalcsBreakdown = {
  key: "HitDamage:1:1:1",
  sections: [],
};

describe("PoBSession Calcs RPC", () => {
  it("requests the active build calcs snapshot", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);

    await expect(session.calcsSnapshot()).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.calcs.snapshot");
  });

  it("requests breakdown for a cell key", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptyBreakdown);

    await expect(session.calcsBreakdown("HitDamage:1:1:1")).resolves.toBe(
      emptyBreakdown,
    );

    expect(call).toHaveBeenCalledWith("pob.calcs.breakdown", {
      key: "HitDamage:1:1:1",
    });
  });

  it("forwards typed calcs actions", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);
    const action = { type: "setBuffMode", value: "BUFFED" } as const;

    await expect(session.calcsAction(action)).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledWith("pob.calcs.action", action);
  });
});

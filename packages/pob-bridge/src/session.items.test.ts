import { describe, expect, it, vi } from "vitest";

import type {
  PobItemsDbList,
  PobItemsSnapshot,
  PobItemsTooltip,
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

const emptySnapshot: PobItemsSnapshot = {
  activeSetId: 1,
  useSecondWeaponSet: false,
  sets: [],
  slots: [],
  items: [],
  sharedItems: [],
};

const emptyDbList: PobItemsDbList = {
  entries: [],
};

const emptyTooltip: PobItemsTooltip = {
  source: "custom",
  itemId: 1,
  db: null,
  slotName: null,
  header: "RARE",
  lines: [],
};

describe("PoBSession Items RPC", () => {
  it("requests the active build items snapshot", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);

    await expect(session.itemsSnapshot()).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.items.snapshot");
  });

  it.each(["uniqueDB", "rareDB"] as const)(
    "requests %s item DB entries",
    async (db) => {
      const session = new PoBSession({ installLocation: "C:\\PoB" });
      const call = vi.spyOn(session, "call").mockResolvedValue(emptyDbList);

      await expect(session.itemsDbList(db)).resolves.toBe(emptyDbList);

      expect(call).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledWith("pob.items.dbList", { db });
    },
  );

  it("forwards typed item actions", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);
    const action = { type: "setWeaponSet", weaponSet: 2 } as const;

    await expect(session.itemsAction(action)).resolves.toBe(emptySnapshot);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.items.action", action);
  });

  it("requests item tooltip payloads", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptyTooltip);
    const request = { source: "custom", itemId: 1 } as const;

    await expect(session.itemsTooltip(request)).resolves.toBe(emptyTooltip);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.items.tooltip", request);
  });

  it("adds parsed custom item text through the existing createCustom action", async () => {
    const session = new PoBSession({ installLocation: "C:\\PoB" });
    const call = vi.spyOn(session, "call").mockResolvedValue(emptySnapshot);
    const englishText = "Rarity: Normal\nWrapped Quarterstaff";

    await expect(session.itemsParseAndAdd(englishText, true)).resolves.toBe(
      emptySnapshot,
    );

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("pob.items.action", {
      type: "createCustom",
      raw: englishText,
      equip: true,
    });
  });
});

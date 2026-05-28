import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PoBSession } from "./pobSession";
import { PoBVault } from "./pobVault";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
}));

const installLocation = process.env.POB_INSTALL_LOCATION;
let tempRoot: string | null = null;

describe("PoBSession integration", () => {
  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  const runIfPobInstalled = installLocation ? it : it.skip;

  runIfPobInstalled(
    "spawns LuaJIT from a vault and round-trips build XML",
    async () => {
      tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-session-"));
      const session = new PoBSession({
        installLocation,
        resourceRoot: path.resolve("resources", "lua"),
        vault: new PoBVault({ root: path.join(tempRoot, "vault") }),
      });

      try {
        await session.spawn();

        const ping = await session.ping();
        expect(ping.pong).toBe(true);
        expect(ping.pobVersion).toEqual(expect.any(String));

        const loaded = await session.loadBuildXml("<PathOfBuilding2 />");
        expect(loaded.ok).toBe(true);
        expect(loaded.level).toEqual(expect.any(Number));

        const exported = await session.exportBuildXml();
        expect(exported.xml).toContain("<PathOfBuilding2");

        await session.loadBuildXml(exported.xml, "Roundtrip build");
        const exportedAgain = await session.exportBuildXml();
        expect(exportedAgain.xml).toContain("<PathOfBuilding2");
        expect(exportedAgain.xml).toContain("<Build");
      } finally {
        await session.dispose();
      }
    },
    180_000,
  );
});

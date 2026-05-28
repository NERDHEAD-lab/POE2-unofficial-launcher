import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { decodePobBuildCodeXml } from "@poe2-launcher/pob-repoe/buildCode";

import {
  DEFAULT_POB_SMOKE_FIXTURE_DPS,
  loadDefaultPobSmokeFixture,
  resolveDefaultPobSmokeFixturePath,
} from "./smokeFixture";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

describe("default PoB vault smoke fixture", () => {
  it("loads Imported Build2 from repo fixtures in development", () => {
    expect(resolveDefaultPobSmokeFixturePath()).toBe(
      path.join(
        process.cwd(),
        "packages",
        "launcher",
        "src",
        "main",
        "services",
        "__fixtures__",
        "pob",
        "Imported Build2.xml",
      ),
    );
  });

  it("uses Imported Build2 as an encoded build-code fixture", async () => {
    const fixture = await loadDefaultPobSmokeFixture();

    expect(fixture.xml).toContain("<PathOfBuilding2");
    expect(fixture.xml).toContain('className="Monk"');
    expect(fixture.expectedMainSkillDps).toBe(DEFAULT_POB_SMOKE_FIXTURE_DPS);
    expect(decodePobBuildCodeXml(fixture.buildCode)).toBe(fixture.xml);
  });
});

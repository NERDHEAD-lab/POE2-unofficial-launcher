import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectPobInstallVersion,
  PobVaultContractValidator,
  type PobVaultSmokeSession,
} from "./validator";
import { encodePobBuildCodeXml } from "../pobRepoe/buildCode";

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

const FIXTURE_XML = '<PathOfBuilding2><Build level="1" /></PathOfBuilding2>';

const makeSession = (
  overrides: Partial<PobVaultSmokeSession> = {},
): PobVaultSmokeSession => ({
  ping: vi.fn(async () => ({ pong: true, pobVersion: "0.15.0" })),
  loadBuildXml: vi.fn(async () => ({
    ok: true,
    className: "Sorceress",
    ascendClassName: "Stormweaver",
    level: 90,
    mainSkillName: "Spark",
    mainSkillDPS: 100,
    playerStats: {},
  })),
  exportBuildXml: vi.fn(async () => ({ xml: FIXTURE_XML })),
  dispose: vi.fn(async () => undefined),
  ...overrides,
});

const makeValidator = (session: PobVaultSmokeSession) => {
  let now = 0;
  return new PobVaultContractValidator({
    fixture: {
      xml: FIXTURE_XML,
      buildCode: encodePobBuildCodeXml(FIXTURE_XML),
      expectedMainSkillDps: 100,
    },
    sessionFactory: () => session,
    now: () => {
      now += 5;
      return now;
    },
  });
};

let tempRoot: string;

describe("PobVaultContractValidator", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-validator-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("detects the PoB version from manifest.xml first", async () => {
    await fs.writeFile(
      path.join(tempRoot, "manifest.xml"),
      '<PoBVersion><Version number="0.16.1" /></PoBVersion>',
    );
    await fs.writeFile(path.join(tempRoot, "Path of Building-PoE2.exe"), "x");

    await expect(detectPobInstallVersion(tempRoot)).resolves.toEqual({
      version: "0.16.1",
      source: "manifest",
    });
  });

  it("falls back to executable metadata when manifest version is unavailable", async () => {
    await fs.writeFile(path.join(tempRoot, "Path of Building-PoE2.exe"), "pob");

    const result = await detectPobInstallVersion(tempRoot);

    expect(result.source).toBe("executable");
    expect(result.version).toMatch(/^exe-\d+-3$/);
  });

  it("runs all four smoke-test steps and disposes the session on success", async () => {
    const session = makeSession();
    const result = await makeValidator(session).runSmokeTest(tempRoot);

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.id)).toEqual([
      "ping",
      "build-dps",
      "xml-roundtrip",
      "build-code-decode",
    ]);
    expect(session.loadBuildXml).toHaveBeenCalledWith(
      FIXTURE_XML,
      "PoB vault smoke test",
    );
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("stops after ping failure and still disposes the session", async () => {
    const session = makeSession({
      ping: vi.fn(async () => {
        throw new Error("ready timeout");
      }),
    });

    const result = await makeValidator(session).runSmokeTest(tempRoot);

    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      id: "ping",
      ok: false,
      detail: "ready timeout",
    });
    expect(session.loadBuildXml).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("fails the DPS step when the fixture output drifts beyond tolerance", async () => {
    const session = makeSession({
      loadBuildXml: vi.fn(async () => ({
        ok: true,
        className: "Sorceress",
        ascendClassName: "Stormweaver",
        level: 90,
        mainSkillName: "Spark",
        mainSkillDPS: 106,
        playerStats: {},
      })),
    });

    const result = await makeValidator(session).runSmokeTest(tempRoot);

    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => step.id)).toEqual(["ping", "build-dps"]);
    expect(result.steps[1].detail).toContain("differs from expected");
    expect(session.exportBuildXml).not.toHaveBeenCalled();
  });

  it("fails the XML roundtrip step when exported XML changes", async () => {
    const session = makeSession({
      exportBuildXml: vi.fn(async () => ({
        xml: '<PathOfBuilding2><Build level="2" /></PathOfBuilding2>',
      })),
    });

    const result = await makeValidator(session).runSmokeTest(tempRoot);

    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => step.id)).toEqual([
      "ping",
      "build-dps",
      "xml-roundtrip",
    ]);
    expect(result.steps[2].detail).toBe(
      "Exported XML differs from fixture XML",
    );
  });

  it("fails the build-code step when inflate/decode is incompatible", async () => {
    const session = makeSession();
    const validator = new PobVaultContractValidator({
      fixture: {
        xml: FIXTURE_XML,
        buildCode: "invalid-build-code",
        expectedMainSkillDps: 100,
      },
      sessionFactory: () => session,
    });

    const result = await validator.runSmokeTest(tempRoot);

    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => step.id)).toEqual([
      "ping",
      "build-dps",
      "xml-roundtrip",
      "build-code-decode",
    ]);
    expect(result.steps[3]).toMatchObject({
      id: "build-code-decode",
      ok: false,
    });
  });
});

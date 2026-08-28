import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildGamePathDiagnosticQaRendererUrl,
  isAllowedGamePathDiagnosticQaRendererUrl,
  resolveGamePathDiagnosticQaLaunch,
} from "../qa/GamePathDiagnosticQa";

const runId = "qa-ms64-12345678";
const userDataPath = String.raw`C:\Temp\poe2-unofficial-launcher-codex-qa\qa-ms64-12345678`;
const activeInput = {
  isPackaged: false,
  devServerUrl: "http://localhost:54321/",
  startHidden: "true",
  runId,
  fixtureMode: "diagnostic",
  userDataPath,
} as const;

describe("GamePathDiagnostic QA launch boundary", () => {
  it("stays inactive when no fixture mode was requested", () => {
    expect(
      resolveGamePathDiagnosticQaLaunch({
        ...activeInput,
        fixtureMode: undefined,
      }),
    ).toEqual({ kind: "inactive" });
  });

  it("activates only for an owned hidden development run with an allowlisted fixture", () => {
    expect(resolveGamePathDiagnosticQaLaunch(activeInput)).toEqual({
      kind: "active",
      request: {
        runId,
        fixtureMode: "diagnostic",
        userDataPath,
        devServerUrl: "http://localhost:54321/",
      },
    });
  });

  it.each([
    ["packaged", { isPackaged: true }],
    ["no dev server", { devServerUrl: undefined }],
    ["visible", { startHidden: "false" }],
    ["missing run id", { runId: undefined }],
    ["invalid mode", { fixtureMode: "../../arbitrary.html" }],
    ["missing profile", { userDataPath: undefined }],
    [
      "profile outside owned QA root",
      { userDataPath: String.raw`C:\Users\qa-ms64-12345678` },
    ],
    [
      "profile for another run",
      {
        userDataPath: String.raw`C:\Temp\poe2-unofficial-launcher-codex-qa\qa-ms64-foreign`,
      },
    ],
  ])(
    "keeps normal startup when %s makes fixture activation unsafe",
    (_label, override) => {
      const decision = resolveGamePathDiagnosticQaLaunch({
        ...activeInput,
        ...override,
      });

      expect(decision).toEqual({ kind: "inactive" });
    },
  );

  it("builds only owned allowlisted renderer fixture URLs", () => {
    const decision = resolveGamePathDiagnosticQaLaunch(activeInput);
    if (decision.kind !== "active") throw new Error("expected active QA");

    const url = buildGamePathDiagnosticQaRendererUrl(decision.request);

    expect(url).toBe(
      "http://localhost:54321/?codexQaFixture=diagnostic&codexQaRun=qa-ms64-12345678",
    );
    expect(
      isAllowedGamePathDiagnosticQaRendererUrl(
        url,
        decision.request.devServerUrl,
        runId,
      ),
    ).toBe(true);
    expect(
      isAllowedGamePathDiagnosticQaRendererUrl(
        `${url}&script=alert(1)`,
        decision.request.devServerUrl,
        runId,
      ),
    ).toBe(false);
    expect(
      isAllowedGamePathDiagnosticQaRendererUrl(
        url.replace("diagnostic", "../../arbitrary.html"),
        decision.request.devServerUrl,
        runId,
      ),
    ).toBe(false);
  });
});

describe("main bootstrap source contract", () => {
  it("returns through the dedicated QA bootstrap before normal user-state paths", () => {
    const source = fs.readFileSync(path.resolve("src/main/main.ts"), "utf8");
    const ready = source.indexOf("app.whenReady().then(async () => {");
    const qaDecision = source.indexOf(
      "process.env.ELECTRON_QA_GAME_PATH_FIXTURE",
      ready,
    );
    const qaWindow = source.indexOf(
      "createGamePathDiagnosticQaWindow",
      qaDecision,
    );
    const normalDiagnosticStore = source.indexOf(
      "diagnosticLogStore.initialize",
      ready,
    );
    const normalUac = source.indexOf(
      'getEffectiveConfig("skipDaumGameStarterUac")',
      ready,
    );
    const normalInstallSync = source.indexOf("syncInstallLocation()", ready);
    const normalWindow = source.indexOf("await createWindow()", ready);

    expect(ready).toBeGreaterThan(-1);
    expect(qaDecision).toBeGreaterThan(ready);
    expect(qaWindow).toBeGreaterThan(qaDecision);
    expect(qaWindow).toBeLessThan(normalDiagnosticStore);
    expect(source.slice(qaDecision, normalDiagnosticStore)).toMatch(
      /createGamePathDiagnosticQaWindow[\s\S]*return;/,
    );
    expect(normalDiagnosticStore).toBeLessThan(normalUac);
    expect(normalUac).toBeLessThan(normalInstallSync);
    expect(normalInstallSync).toBeLessThan(normalWindow);
  });

  it("keeps registry and normal service calls out of the dedicated QA window function", () => {
    const source = fs.readFileSync(path.resolve("src/main/main.ts"), "utf8");
    const start = source.indexOf(
      "async function createGamePathDiagnosticQaWindow",
    );
    const end = source.indexOf("async function createWindow", start);
    const qaWindowSource = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(qaWindowSource).not.toMatch(
      /syncInstallLocation|syncAutoLaunch|reconcileAllGameInstallStatuses|initializeCoreServices|SimpleUacBypass|getGameInstallPathDiagnostics/,
    );
  });
});

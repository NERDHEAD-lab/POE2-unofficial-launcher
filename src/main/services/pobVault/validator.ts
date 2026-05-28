import fs from "node:fs/promises";
import path from "node:path";

import { readPobVersion } from "./snapshot";
import { PoBVault } from "./vault";
import {
  decodePobBuildCodeXml,
  normalizePobBuildXmlForCompare,
} from "../pobRepoe/buildCode";
import {
  PoBSession,
  type PobExportBuildXmlResult,
  type PobPingResult,
} from "../pobSession";

import type { PobBuildSummary } from "../../../shared/types";

export type PobVaultVersionSource = "manifest" | "executable" | "unknown";

export interface PobVaultDetectedVersion {
  version: string;
  source: PobVaultVersionSource;
}

export type PobVaultSmokeStepId =
  | "ping"
  | "build-dps"
  | "xml-roundtrip"
  | "build-code-decode";

export interface PobVaultSmokeStepResult {
  id: PobVaultSmokeStepId;
  label: string;
  ok: boolean;
  durationMs: number;
  detail: string | null;
}

export interface PobVaultSmokeTestResult {
  ok: boolean;
  vaultPath: string;
  steps: PobVaultSmokeStepResult[];
}

export interface PobVaultSmokeSession {
  ping(): Promise<PobPingResult>;
  loadBuildXml(xml: string, name?: string): Promise<PobBuildSummary>;
  exportBuildXml(): Promise<PobExportBuildXmlResult>;
  dispose(): Promise<void>;
}

export interface PobVaultSmokeFixture {
  xml: string;
  buildCode: string;
  expectedMainSkillDps: number;
  dpsTolerancePercent?: number;
}

export interface PobVaultContractValidatorOptions {
  fixture: PobVaultSmokeFixture;
  sessionFactory?: (vaultPath: string) => PobVaultSmokeSession;
  now?: () => number;
}

const POB_EXE_NAMES = ["Path of Building-PoE2.exe", "Path of Building.exe"];
const UNKNOWN_VERSION = "unknown";
const DEFAULT_DPS_TOLERANCE_PERCENT = 5;

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

class StaticPobSmokeVault extends PoBVault {
  constructor(private readonly vaultPath: string) {
    super({ root: path.dirname(vaultPath) });
  }

  override async getActive() {
    return {
      version: path.basename(this.vaultPath),
      vaultPath: this.vaultPath,
    };
  }

  override async ensureSnapshot() {
    return {
      version: path.basename(this.vaultPath),
      vaultPath: this.vaultPath,
    };
  }
}

const createDefaultSmokeSession = (vaultPath: string): PobVaultSmokeSession =>
  new PoBSession({ vault: new StaticPobSmokeVault(vaultPath) });

const assertPobXml = (xml: string): void => {
  if (!/<PathOfBuilding2?\b/.test(xml)) {
    throw new Error("Expected PathOfBuilding XML payload");
  }
};

const assertDpsWithinTolerance = (
  actual: number | null,
  expected: number,
  tolerancePercent: number,
): void => {
  if (actual === null || !Number.isFinite(actual)) {
    throw new Error("Main skill DPS is missing");
  }

  const tolerance = Math.abs(expected) * (tolerancePercent / 100);
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    throw new Error(
      `Main skill DPS ${actual} differs from expected ${expected} by ${delta}`,
    );
  }
};

export async function detectPobInstallVersion(
  installLocation: string,
): Promise<PobVaultDetectedVersion> {
  const manifestVersion = await readPobVersion(installLocation);
  if (manifestVersion !== UNKNOWN_VERSION) {
    return { version: manifestVersion, source: "manifest" };
  }

  for (const exeName of POB_EXE_NAMES) {
    const stat = await fs
      .stat(path.join(installLocation, exeName))
      .catch(() => null);
    if (stat?.isFile()) {
      return {
        version: `exe-${Math.trunc(stat.mtimeMs)}-${stat.size}`,
        source: "executable",
      };
    }
  }

  return { version: UNKNOWN_VERSION, source: "unknown" };
}

export class PobVaultContractValidator {
  private readonly fixture: PobVaultSmokeFixture;
  private readonly sessionFactory: (vaultPath: string) => PobVaultSmokeSession;
  private readonly now: () => number;

  constructor(options: PobVaultContractValidatorOptions) {
    this.fixture = options.fixture;
    this.sessionFactory = options.sessionFactory ?? createDefaultSmokeSession;
    this.now = options.now ?? Date.now;
  }

  async runSmokeTest(vaultPath: string): Promise<PobVaultSmokeTestResult> {
    const session = this.sessionFactory(vaultPath);
    const steps: PobVaultSmokeStepResult[] = [];

    try {
      for (const step of this.createSteps(session)) {
        const result = await this.runStep(step);
        steps.push(result);
        if (!result.ok) break;
      }
    } finally {
      await session.dispose().catch(() => undefined);
    }

    return {
      ok: steps.length === 4 && steps.every((step) => step.ok),
      vaultPath,
      steps,
    };
  }

  private createSteps(session: PobVaultSmokeSession) {
    return [
      {
        id: "ping" as const,
        label: "PoB RPC ping",
        run: async () => {
          const ping = await session.ping();
          if (!ping.pong || !ping.pobVersion.trim()) {
            throw new Error("PoB ping did not return a valid version");
          }
        },
      },
      {
        id: "build-dps" as const,
        label: "Fixture build DPS",
        run: async () => {
          assertDpsWithinTolerance(
            (
              await session.loadBuildXml(
                this.fixture.xml,
                "PoB vault smoke test",
              )
            ).mainSkillDPS,
            this.fixture.expectedMainSkillDps,
            this.fixture.dpsTolerancePercent ?? DEFAULT_DPS_TOLERANCE_PERCENT,
          );
        },
      },
      {
        id: "xml-roundtrip" as const,
        label: "XML export roundtrip",
        run: async () => {
          const exported = await session.exportBuildXml();
          assertPobXml(exported.xml);
          if (
            normalizePobBuildXmlForCompare(exported.xml) !==
            normalizePobBuildXmlForCompare(this.fixture.xml)
          ) {
            throw new Error("Exported XML differs from fixture XML");
          }
        },
      },
      {
        id: "build-code-decode" as const,
        label: "Build code inflate",
        run: async () => {
          assertPobXml(decodePobBuildCodeXml(this.fixture.buildCode));
        },
      },
    ];
  }

  private async runStep(step: {
    id: PobVaultSmokeStepId;
    label: string;
    run: () => Promise<void>;
  }): Promise<PobVaultSmokeStepResult> {
    const startedAt = this.now();
    try {
      await step.run();
      return {
        id: step.id,
        label: step.label,
        ok: true,
        durationMs: this.now() - startedAt,
        detail: null,
      };
    } catch (err) {
      return {
        id: step.id,
        label: step.label,
        ok: false,
        durationMs: this.now() - startedAt,
        detail: errorMessage(err),
      };
    }
  }
}

import fs from "node:fs/promises";

import {
  detectPobInstallVersion,
  type PobVaultDetectedVersion,
  type PobVaultSmokeTestResult,
} from "./validator";
import {
  PoBVault,
  type PobVaultEntry,
  type PobVaultStagedEntry,
} from "./vault";

export type PobVaultUpdateStatus =
  | "up-to-date"
  | "update-available"
  | "promoted"
  | "fallback";

export interface PobVaultUpdateFlowOptions {
  vault: PoBVault;
  validator: {
    runSmokeTest(vaultPath: string): Promise<PobVaultSmokeTestResult>;
  };
  detectVersion?: (installLocation: string) => Promise<PobVaultDetectedVersion>;
  now?: () => string;
}

export interface PobVaultUpdateRunOptions {
  autoUpdate?: boolean;
  generationLimit?: number;
}

export interface PobVaultUpdateResult {
  status: PobVaultUpdateStatus;
  installVersion: PobVaultDetectedVersion;
  previousActive: PobVaultEntry | null;
  active: PobVaultEntry | null;
  promoted: PobVaultEntry | null;
  smokeTest: PobVaultSmokeTestResult | null;
  error: string | null;
}

const smokeTestError = (smokeTest: PobVaultSmokeTestResult): string =>
  smokeTest.steps.find((step) => !step.ok)?.detail ??
  "PoB vault smoke test failed";

export class PobVaultUpdateFlow {
  private readonly vault: PoBVault;
  private readonly validator: PobVaultUpdateFlowOptions["validator"];
  private readonly detectVersion: NonNullable<
    PobVaultUpdateFlowOptions["detectVersion"]
  >;
  private readonly now: () => string;

  constructor(options: PobVaultUpdateFlowOptions) {
    this.vault = options.vault;
    this.validator = options.validator;
    this.detectVersion = options.detectVersion ?? detectPobInstallVersion;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(
    installLocation: string,
    options: PobVaultUpdateRunOptions = {},
  ): Promise<PobVaultUpdateResult> {
    const installVersion = await this.detectVersion(installLocation);
    const previousActive = await this.vault.getActive();
    if (previousActive?.version === installVersion.version) {
      return {
        status: "up-to-date",
        installVersion,
        previousActive,
        active: previousActive,
        promoted: null,
        smokeTest: null,
        error: null,
      };
    }

    if (options.autoUpdate === false) {
      return {
        status: "update-available",
        installVersion,
        previousActive,
        active: previousActive,
        promoted: null,
        smokeTest: null,
        error: null,
      };
    }

    const staged = await this.vault.stage(
      installLocation,
      installVersion.version,
    );
    const smokeTest = await this.validator.runSmokeTest(staged.stagingPath);
    if (!smokeTest.ok) {
      await discardStaging(staged);
      const active = await this.vault.getActive();
      return {
        status: "fallback",
        installVersion,
        previousActive,
        active,
        promoted: null,
        smokeTest,
        error: smokeTestError(smokeTest),
      };
    }

    const promoted = await this.vault.promote(staged, {
      smokeTestPassedAt: this.now(),
      generationLimit: options.generationLimit,
    });
    return {
      status: "promoted",
      installVersion,
      previousActive,
      active: promoted,
      promoted,
      smokeTest,
      error: null,
    };
  }
}

const discardStaging = async (staged: PobVaultStagedEntry): Promise<void> => {
  await fs.rm(staged.stagingPath, { recursive: true, force: true });
};

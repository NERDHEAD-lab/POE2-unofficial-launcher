import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import { PobVaultContractValidator } from "./validator";
import { encodePobBuildCodeXml } from "../pobRepoe/buildCode";

import type { PobVaultSmokeFixture } from "./validator";

export const DEFAULT_POB_SMOKE_FIXTURE_DPS = 3636.913074617;

const IMPORTED_BUILD2_SOURCE_PATH = path.join(
  "src",
  "main",
  "services",
  "__fixtures__",
  "pob",
  "Imported Build2.xml",
);
const IMPORTED_BUILD2_RESOURCE_PATH = path.join("pob", "Imported Build2.xml");

export const resolveDefaultPobSmokeFixturePath = (): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, IMPORTED_BUILD2_RESOURCE_PATH)
    : path.join(app.getAppPath(), IMPORTED_BUILD2_SOURCE_PATH);

export async function loadDefaultPobSmokeFixture(): Promise<PobVaultSmokeFixture> {
  const xml = await fs.readFile(resolveDefaultPobSmokeFixturePath(), "utf8");
  return {
    xml,
    buildCode: encodePobBuildCodeXml(xml),
    expectedMainSkillDps: DEFAULT_POB_SMOKE_FIXTURE_DPS,
  };
}

export async function createDefaultPobVaultContractValidator(): Promise<PobVaultContractValidator> {
  return new PobVaultContractValidator({
    fixture: await loadDefaultPobSmokeFixture(),
  });
}

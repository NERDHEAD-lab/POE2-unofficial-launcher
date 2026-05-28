import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const SOURCE_ROOTS = ["packages"];
const UI_SOURCE_ROOTS = [
  "packages/launcher/src/renderer",
  "packages/pob-ui/src",
];
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|mts)$/;
const LEGACY_VAULT_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["'](?:-launcher\/pob-vault|(?:\.\/|\.\.\/)+pobVault(?:\/|["'])|(?:@\/|(?:\.\/|\.\.\/)+)main\/services\/pobVault\/)/;
const VAULT_REVERSE_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["'](?:@\/|(?:\.\.\/)+(?:src\/)?(?:main|renderer|pob)\b|(?:\.\.\/)*pobSession\b|@poe2-launcher\/(?:launcher|pob-bridge|pob-headless-glue)\b)/;
const UI_VAULT_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["']@poe2-launcher\/pob-vault\b/;

function listSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }
    return SOURCE_FILE_PATTERN.test(entry.name) ? [entryPath] : [];
  });
}

const readSource = (filePath: string): string =>
  fs.readFileSync(filePath, "utf8");

describe("pob-vault package boundary", () => {
  it("uses @poe2-launcher/pob-vault imports instead of legacy service paths", () => {
    const offenders = SOURCE_ROOTS.flatMap((root) =>
      listSourceFiles(path.join(repoRoot, root)),
    )
      .filter((filePath) =>
        LEGACY_VAULT_IMPORT_PATTERN.test(readSource(filePath)),
      )
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });

  it("does not import session, bridge, launcher, renderer, or pob-ui implementation code", () => {
    const offenders = listSourceFiles(
      path.join(repoRoot, "packages/pob-vault/src"),
    )
      .filter((filePath) => !filePath.endsWith(".test.ts"))
      .filter((filePath) =>
        VAULT_REVERSE_IMPORT_PATTERN.test(readSource(filePath)),
      )
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });

  it("keeps pob-vault out of renderer and pob-ui sources", () => {
    const offenders = UI_SOURCE_ROOTS.flatMap((root) =>
      listSourceFiles(path.join(repoRoot, root)),
    )
      .filter((filePath) => UI_VAULT_IMPORT_PATTERN.test(readSource(filePath)))
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });
});

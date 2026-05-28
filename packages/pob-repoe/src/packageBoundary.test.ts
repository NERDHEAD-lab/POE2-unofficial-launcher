import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const SOURCE_ROOTS = ["packages"];
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|mts)$/;
const LEGACY_REPOE_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["'](?:\.\/|\.\.\/)+pobRepoe\//;
const REPOE_REVERSE_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["'](?:@\/|(?:\.\.\/)+(?:src\/)?(?:renderer|pob)\b)/;

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

describe("pob-repoe package boundary", () => {
  it("uses @poe2-launcher/pob-repoe imports instead of legacy service paths", () => {
    const offenders = SOURCE_ROOTS.flatMap((root) =>
      listSourceFiles(path.join(repoRoot, root)),
    )
      .filter((filePath) =>
        LEGACY_REPOE_IMPORT_PATTERN.test(fs.readFileSync(filePath, "utf8")),
      )
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });

  it("does not import renderer or pob-ui implementation code", () => {
    const offenders = listSourceFiles(
      path.join(repoRoot, "packages/pob-repoe/src"),
    )
      .filter((filePath) =>
        REPOE_REVERSE_IMPORT_PATTERN.test(fs.readFileSync(filePath, "utf8")),
      )
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });
});

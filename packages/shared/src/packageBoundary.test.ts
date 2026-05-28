import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const SOURCE_ROOTS = [
  "packages/launcher/src",
  "packages/pob-ui",
  "packages/shared/src",
];
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|mts)$/;
const RELATIVE_SHARED_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["'](?:\.\.\/)+shared\//;
const SHARED_REVERSE_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["'](?:@\/|(?:\.\.\/)+(?:src\/)?(?:main|renderer|pob)\b)/;

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

describe("shared package boundary", () => {
  it("uses @poe2-launcher/shared imports instead of legacy relative shared paths", () => {
    const offenders = SOURCE_ROOTS.flatMap((root) =>
      listSourceFiles(path.join(repoRoot, root)),
    ).filter((filePath) =>
      RELATIVE_SHARED_IMPORT_PATTERN.test(fs.readFileSync(filePath, "utf8")),
    );

    expect(
      offenders.map((filePath) => path.relative(repoRoot, filePath)),
    ).toEqual([]);
  });

  it("does not import launcher, renderer, or pob-ui implementation code", () => {
    const offenders = listSourceFiles(
      path.join(repoRoot, "packages/shared/src"),
    )
      .filter((filePath) =>
        SHARED_REVERSE_IMPORT_PATTERN.test(fs.readFileSync(filePath, "utf8")),
      )
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const wrapperSourceDir = path.join(
  repoRoot,
  "packages",
  "pob-unofficial-wrapper",
  "src",
);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|mts)$/;
const WRAPPER_REVERSE_IMPORT_PATTERN =
  /\b(?:from|import)\s*\(?\s*["'](?:@\/|(?:\.\.\/)+(?:src\/)?(?:main|renderer|pob)\b|@poe2-launcher\/(?:launcher|pob-ui)\b)/;

function listSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return SOURCE_FILE_PATTERN.test(entry.name) ? [entryPath] : [];
  });
}

describe("pob-unofficial-wrapper package boundary", () => {
  it("does not import launcher, renderer, or pob-ui implementation code", () => {
    const offenders = listSourceFiles(wrapperSourceDir)
      .filter((filePath) => !filePath.endsWith(".test.ts"))
      .filter((filePath) =>
        WRAPPER_REVERSE_IMPORT_PATTERN.test(fs.readFileSync(filePath, "utf8")),
      )
      .map((filePath) => path.relative(repoRoot, filePath));

    expect(offenders).toEqual([]);
  });
});

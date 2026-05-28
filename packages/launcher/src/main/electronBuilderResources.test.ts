import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function readExtraResourceSources(): string[] {
  const config = fs.readFileSync(
    path.join(repoRoot, "electron-builder.json5"),
    "utf8",
  );
  return [...config.matchAll(/\bfrom:\s*"([^"]+)"/g)].map((match) => match[1]);
}

describe("electron-builder extra resources", () => {
  it("references only existing package resource sources", () => {
    expect(
      readExtraResourceSources().filter(
        (sourcePath) => !fs.existsSync(path.join(repoRoot, sourcePath)),
      ),
    ).toEqual([]);
  });
});

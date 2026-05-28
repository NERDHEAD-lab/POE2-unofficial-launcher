import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const readWorkflow = (name: string) =>
  fs.readFileSync(path.join(repoRoot, ".github/workflows", name), "utf8");

describe("GitHub workflow commands", () => {
  it("keeps PR checks aligned with the monorepo validation gates", () => {
    const workflow = readWorkflow("pr-check.yml");
    const install = workflow.indexOf("run: npm ci");
    const lint = workflow.indexOf("run: npm run lint");
    const test = workflow.indexOf("run: npm test");
    const buildCheck = workflow.indexOf("run: npm run build:check");

    expect([install, lint, test, buildCheck].every((index) => index >= 0)).toBe(
      true,
    );
    expect(install).toBeLessThan(lint);
    expect(lint).toBeLessThan(test);
    expect(test).toBeLessThan(buildCheck);
  });

  it("uses package-scoped RePoE baseline test path after the monorepo move", () => {
    const workflow = readWorkflow("pob-repoe-cdn-check.yml");

    expect(workflow).toContain(
      "npm test -- packages/pob-repoe/src/__tests__/cdn-baseline.spec.ts",
    );
    expect(workflow).not.toContain("src/main/services/pobRepoe");
  });
});

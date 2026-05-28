import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const PACKAGE_LICENSES = {
  "packages/launcher": "AGPL-3.0-or-later",
  "packages/pob-bridge": "MIT",
  "packages/pob-headless-glue": "MIT",
  "packages/pob-repoe": "MIT",
  "packages/pob-ui": "MIT",
  "packages/pob-unofficial-wrapper": "MIT",
  "packages/pob-vault": "MIT",
  "packages/shared": "MIT",
} as const;

describe("workspace package license files", () => {
  it("keeps package.json license fields aligned with package LICENSE files", () => {
    const mismatches = Object.entries(PACKAGE_LICENSES).flatMap(
      ([packagePath, expectedLicense]) => {
        const packageJson = JSON.parse(
          fs.readFileSync(
            path.join(repoRoot, packagePath, "package.json"),
            "utf8",
          ),
        ) as { license?: string };
        const licenseText = fs.readFileSync(
          path.join(repoRoot, packagePath, "LICENSE"),
          "utf8",
        );

        const expectedText =
          expectedLicense === "MIT"
            ? "MIT License"
            : "GNU AFFERO GENERAL PUBLIC LICENSE";

        return packageJson.license === expectedLicense &&
          licenseText.includes(expectedText)
          ? []
          : [packagePath];
      },
    );

    expect(mismatches).toEqual([]);
  });
});

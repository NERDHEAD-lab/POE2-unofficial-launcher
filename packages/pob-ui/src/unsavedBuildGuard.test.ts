import { describe, expect, it } from "vitest";

import { getUnsavedBuildGuard } from "./unsavedBuildGuard";

describe("unsavedBuildGuard", () => {
  it("does not guard clean builds", () => {
    expect(
      getUnsavedBuildGuard(
        false,
        { subPath: "Witch", fileName: "Existing" },
        "Unnamed build",
      ),
    ).toBeNull();
  });

  it("saves an existing dirty build back to the current file", () => {
    expect(
      getUnsavedBuildGuard(
        true,
        { subPath: "Witch", fileName: "Imported Build2" },
        "Unnamed build",
      ),
    ).toEqual({ saveName: "Imported Build2", isDraft: false });
  });

  it("saves a dirty draft using the generated draft name", () => {
    expect(
      getUnsavedBuildGuard(
        true,
        { subPath: "Witch", fileName: null },
        "Unnamed build (2)",
      ),
    ).toEqual({ saveName: "Unnamed build (2)", isDraft: true });
  });
});

import { describe, expect, it } from "vitest";

import {
  createBuildEditSessionKey,
  createBuildEditTargetKey,
} from "./buildEditSessionIdentity";

describe("buildEditSessionIdentity", () => {
  it("separates different saved build files even when the session revision is unchanged", () => {
    const imported = createBuildEditSessionKey(
      createBuildEditTargetKey({
        subPath: "",
        fileName: "Imported Build2.xml",
        draftKey: 0,
      }),
      0,
    );
    const unnamed = createBuildEditSessionKey(
      createBuildEditTargetKey({
        subPath: "",
        fileName: "Unnamed build.xml",
        draftKey: 0,
      }),
      0,
    );

    expect(imported).not.toEqual(unnamed);
  });

  it("separates draft builds by draft key", () => {
    expect(
      createBuildEditTargetKey({ subPath: "", fileName: null, draftKey: 1 }),
    ).not.toEqual(
      createBuildEditTargetKey({ subPath: "", fileName: null, draftKey: 2 }),
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  POB_WRAPPER_BUILD_MODES,
  POB_WRAPPER_STATE_CONFIG_KEY,
  normalizePobWrapperState,
} from "./state";

describe("pob-unofficial-wrapper state contract", () => {
  it("reserves a wrapper-specific config key", () => {
    expect(POB_WRAPPER_STATE_CONFIG_KEY).toBe("pobWrapper");
  });

  it("tracks the last build and component location including Notes", () => {
    expect(POB_WRAPPER_BUILD_MODES).toEqual([
      "TREE",
      "SKILLS",
      "ITEMS",
      "CALCS",
      "PARTY",
      "NOTES",
    ]);

    expect(
      normalizePobWrapperState({
        lastLocation: {
          game: "POE2",
          subPath: "Witch",
          buildName: "Imported Build2",
          buildMode: "CALCS",
        },
      }),
    ).toEqual({
      lastLocation: {
        game: "POE2",
        subPath: "Witch",
        buildName: "Imported Build2",
        buildMode: "CALCS",
      },
    });
  });

  it("drops invalid stored locations instead of carrying stale state forward", () => {
    expect(
      normalizePobWrapperState({
        lastLocation: {
          game: "POE2",
          subPath: "Witch",
          buildName: "Imported Build2",
          buildMode: "CONFIG",
        },
      }),
    ).toEqual({ lastLocation: null });
  });
});

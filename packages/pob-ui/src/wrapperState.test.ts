import { describe, expect, it } from "vitest";

import {
  createWrapperLastLocation,
  restoreWrapperLocation,
} from "./wrapperState";

describe("wrapperState", () => {
  it("maps the UI build target and mode to the wrapper last-location contract", () => {
    expect(
      createWrapperLastLocation(
        "POE2",
        { subPath: "Witch", fileName: "Imported Build2" },
        "notes",
      ),
    ).toEqual({
      game: "POE2",
      subPath: "Witch",
      buildName: "Imported Build2",
      buildMode: "NOTES",
    });
  });

  it("restores only supported modes for the current game", () => {
    expect(
      restoreWrapperLocation(
        {
          game: "POE2",
          subPath: "Witch",
          buildName: "Imported Build2",
          buildMode: "ITEMS",
        },
        "POE2",
      ),
    ).toEqual({
      target: { subPath: "Witch", fileName: "Imported Build2" },
      activeMode: "items",
    });

    expect(
      restoreWrapperLocation(
        {
          game: "POE1",
          subPath: "Witch",
          buildName: "Imported Build2",
          buildMode: "ITEMS",
        },
        "POE2",
      ),
    ).toBeNull();

    expect(
      restoreWrapperLocation(
        {
          game: "POE2",
          subPath: "Witch",
          buildName: "Imported Build2",
          buildMode: "NOTES",
        },
        "POE2",
      ),
    ).toEqual({
      target: { subPath: "Witch", fileName: "Imported Build2" },
      activeMode: "notes",
    });
  });
});

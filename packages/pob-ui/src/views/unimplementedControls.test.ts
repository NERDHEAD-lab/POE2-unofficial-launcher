import { describe, expect, it } from "vitest";

import {
  POB_UNIMPLEMENTED_CONTROLS,
  buildPobUnimplementedClassName,
  getPobUnimplementedControlAttributes,
  getPobUnimplementedControlDefinition,
} from "./unimplementedControls";

describe("unimplementedControls", () => {
  it("keeps deferred PoB wrapper controls in an explicit inventory", () => {
    expect(POB_UNIMPLEMENTED_CONTROLS.map((control) => control.id)).toEqual([
      "ui-mode.switch",
      "import-export.share-url",
      "import-export.character-auth",
      "import-export.character-tree",
      "import-export.character-items",
      "tree.find-timeless-jewel",
      "items.set-manage",
      "items.price-check",
      "items.craft",
      "calcs.spectre-library",
      "calcs.beast-library",
    ]);
  });

  it("projects marker attributes without using the native disabled state", () => {
    expect(getPobUnimplementedControlAttributes("items.price-check")).toEqual({
      "aria-disabled": true,
      "data-pob-unimplemented": "items.price-check",
      "data-pob-disabled-reason": "external-service",
    });
    expect(buildPobUnimplementedClassName("pob-button")).toBe(
      "pob-button pob-control-unimplemented",
    );
  });

  it("keeps a reason code and user-facing message key for each control", () => {
    for (const control of POB_UNIMPLEMENTED_CONTROLS) {
      expect(getPobUnimplementedControlDefinition(control.id)).toMatchObject({
        reason: expect.stringMatching(
          /^(not-implemented|parity-deferred|external-service)$/,
        ),
        messageKey: expect.stringContaining("."),
      });
    }
  });
});

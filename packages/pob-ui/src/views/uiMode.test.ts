import { describe, expect, it } from "vitest";

import {
  DEFAULT_POB_UI_MODE,
  LOCKED_POB_UI_MODES,
  POB_UI_MODE_POLICIES,
  POB_UI_MODE_SWITCH_ORDER,
  createPobSnapshotProjection,
  getNextPobUiMode,
  isPobUiModeLocked,
  preservePobActionPayload,
} from "./uiMode";

describe("uiMode facade", () => {
  it("documents every build mode policy boundary", () => {
    expect(POB_UI_MODE_POLICIES.map((policy) => policy.mode)).toEqual([
      "tree",
      "skills",
      "items",
      "calcs",
      "party",
      "notes",
    ]);
    expect(
      POB_UI_MODE_POLICIES.every(
        (policy) =>
          policy.legacyParityRequired.length > 0 &&
          policy.renewedLayoutAllowed.length > 0,
      ),
    ).toBe(true);
  });

  it("wraps PoB snapshots without transforming source identifiers", () => {
    const snapshot = {
      sectionId: "HitDamage",
      actionPayload: { type: "setOption", var: "conditionFullLife" },
    };

    const projection = createPobSnapshotProjection("legacy", "calcs", snapshot);

    expect(projection.source).toBe("pob-original");
    expect(projection.snapshot).toBe(snapshot);
    expect(projection.snapshot.sectionId).toBe("HitDamage");
  });

  it("keeps PoB action payloads pass-through", () => {
    const action = {
      type: "setSectionText",
      key: "enemyConditions",
      value: "Condition:Blinded",
    };

    expect(preservePobActionPayload(action)).toBe(action);
  });

  it("orders the switch as legacy to unofficial while keeping renewed default semantics", () => {
    expect(DEFAULT_POB_UI_MODE).toBe("renewed");
    expect(POB_UI_MODE_SWITCH_ORDER).toEqual(["legacy", "renewed"]);
    expect(getNextPobUiMode("legacy")).toBe("renewed");
    expect(getNextPobUiMode("renewed")).toBe("legacy");
  });

  it("locks legacy UI until original PoB parity is implemented", () => {
    expect(LOCKED_POB_UI_MODES).toEqual(["legacy"]);
    expect(isPobUiModeLocked("legacy")).toBe(true);
    expect(isPobUiModeLocked("renewed")).toBe(false);
    expect(isPobUiModeLocked(getNextPobUiMode(DEFAULT_POB_UI_MODE))).toBe(true);
  });
});

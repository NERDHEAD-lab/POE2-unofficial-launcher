import { afterEach, describe, expect, it } from "vitest";

import type {
  PobRepoeLocale,
  PobRepoeTranslationsSnapshot,
} from "@poe2-launcher/shared/types";

import { passiveTreeTextOverride } from "./passiveTreeText";

const snapshot = (
  locale: PobRepoeLocale = "ko",
): PobRepoeTranslationsSnapshot => ({
  locale,
  available: false,
  nodeNamesById: {},
  nodeStatLinesById: {},
  itemNamesById: {},
  itemNamesByEnglishName: {},
  gemNamesById: {},
  gemNamesBySkillId: {},
  gemNamesByEnglishName: {},
});

describe("passiveTreeTextOverride", () => {
  afterEach(() => {
    passiveTreeTextOverride.enabled = true;
  });

  it("maps PoB node ids to localized passive names", () => {
    const tree = {
      passives: {
        "4": { id: 4, name: "감전 확률" },
      },
    };

    expect(
      passiveTreeTextOverride.apply("4", "Shock Chance", ["5% Shock"], tree),
    ).toEqual({ name: "감전 확률", statLines: ["5% Shock"] });
  });

  it("falls back to the PoB English name when RePoE has no matching node", () => {
    const tree = {
      passives: {
        "5": { id: 5, name: "화염 피해" },
      },
    };

    expect(
      passiveTreeTextOverride.apply("4", "Shock Chance", ["5% Shock"], tree),
    ).toEqual({ name: "Shock Chance", statLines: ["5% Shock"] });
  });

  it("maps localized passive stat lines", () => {
    expect(
      passiveTreeTextOverride.apply("4", "Shock Chance", ["5% Shock"], {
        passives: {
          "4": {
            id: 4,
            name: "감전 확률",
            stats: ["감전 확률 5% 증가", "", 7],
          },
        },
      }),
    ).toEqual({ name: "감전 확률", statLines: ["감전 확률 5% 증가"] });
  });

  it("can be disabled with a one-line toggle", () => {
    passiveTreeTextOverride.enabled = false;

    expect(
      passiveTreeTextOverride.apply("4", "Shock Chance", ["5% Shock"], {
        passives: { "4": { id: 4, name: "감전 확률" } },
      }),
    ).toEqual({ name: "Shock Chance", statLines: ["5% Shock"] });
  });

  it("indexes localized node names into the serializable translation snapshot", () => {
    const target = snapshot();

    passiveTreeTextOverride.indexSnapshot(target, {
      passives: {
        "4": { id: 4, name: "감전 확률", stats: ["감전 확률 5% 증가"] },
        other: { id: "node-other", name: "다른 노드" },
        empty: { id: "node-empty", name: "" },
      },
    });

    expect(target.nodeNamesById).toEqual({
      "4": "감전 확률",
      other: "다른 노드",
      "node-other": "다른 노드",
    });
    expect(target.nodeStatLinesById).toEqual({
      "4": ["감전 확률 5% 증가"],
    });
  });

  it("leaves the translation snapshot empty when the cache is unavailable", () => {
    const target = snapshot();

    passiveTreeTextOverride.indexSnapshot(target, null);

    expect(target.nodeNamesById).toEqual({});
    expect(target.nodeStatLinesById).toEqual({});
  });
});

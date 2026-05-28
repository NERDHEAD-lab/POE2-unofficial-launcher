import { afterEach, describe, expect, it } from "vitest";

import type { PobRepoeTranslationsSnapshot } from "@poe2-launcher/shared/types";

import { statDescriptionsOverride } from "./statDescriptions";

const snapshot = (): PobRepoeTranslationsSnapshot => ({
  locale: "ko",
  available: false,
  nodeNamesById: {},
  nodeStatLinesById: {},
  statLinesByEnglishLine: {},
  statLineTemplates: [],
  itemNamesById: {},
  itemNamesByEnglishName: {},
  gemNamesById: {},
  gemNamesBySkillId: {},
  gemNamesByEnglishName: {},
});

describe("statDescriptionsOverride", () => {
  afterEach(() => {
    statDescriptionsOverride.enabled = true;
  });

  it("indexes exact and templated stat lines from paired English/Korean resources", () => {
    const index = statDescriptionsOverride.createIndex(
      [
        [
          {
            ids: ["base_maximum_life"],
            English: [{ string: "+{0} to maximum Life" }],
          },
          {
            ids: ["cannot_be_stunned"],
            English: [{ string: "Cannot be Stunned" }],
          },
        ],
      ],
      [
        [
          {
            ids: ["base_maximum_life"],
            Korean: [{ string: "최대 생명력 +{0}" }],
          },
          {
            ids: ["cannot_be_stunned"],
            Korean: [{ string: "기절 불가" }],
          },
        ],
      ],
      "ko",
    );
    const target = snapshot();

    statDescriptionsOverride.indexSnapshot(target, index);

    expect(target.statLinesByEnglishLine["Cannot be Stunned"]).toBe(
      "기절 불가",
    );
    expect(target.statLineTemplates).toEqual([
      { english: "+{0} to maximum Life", localized: "최대 생명력 +{0}" },
    ]);
    expect(
      statDescriptionsOverride.translateById(index, "base_maximum_life", [32]),
    ).toBe("최대 생명력 +32");
  });

  it("keeps the index empty when disabled or locale is English", () => {
    statDescriptionsOverride.enabled = false;
    expect(
      statDescriptionsOverride.createIndex([], [], "ko").templates,
    ).toEqual([]);

    statDescriptionsOverride.enabled = true;
    expect(
      statDescriptionsOverride.createIndex([], [], "en").templates,
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  findPobI18nDomainViolations,
  isLikelyPobGameDataKey,
} from "./check-pob-i18n-domain.mjs";

describe("PoB i18n domain guard", () => {
  it("allows namespaced UI translation keys", () => {
    expect(
      findPobI18nDomainViolations({
        "buildEdit.calcs.summary.life": "Life",
        "buildEdit.skills.gem.name": "Gem name",
      }),
    ).toEqual([]);
  });

  it("rejects raw game-data strings used as translation keys", () => {
    expect(isLikelyPobGameDataKey("Critical Strike Chance")).toBe(true);
    expect(isLikelyPobGameDataKey("cold_damage_+%")).toBe(true);
    expect(isLikelyPobGameDataKey("Adds 1 to 4 Fire Damage")).toBe(true);
  });

  it("reports nested raw game-data keys with file context", () => {
    expect(
      findPobI18nDomainViolations(
        {
          pobStats: {
            "Fire Damage": "화염 피해",
          },
        },
        "src/pob/i18n/ko.json",
      ),
    ).toEqual([
      {
        filePath: "src/pob/i18n/ko.json",
        key: "pobStats.Fire Damage",
      },
    ]);
  });
});

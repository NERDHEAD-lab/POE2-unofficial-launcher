import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RePoeCache } from "../cache";
import {
  loadOrFetchRePoeTranslations,
  loadRePoeTranslations,
} from "../translations";

let tempRoot: string;
let cache: RePoeCache;

const writeResource = (
  locale: "en" | "ko",
  resourcePath: string,
  json: unknown,
) =>
  cache.writeJsonResource({
    id: `${locale}:${resourcePath}`,
    locale,
    path: resourcePath,
    url: "",
    json,
    etag: null,
    lastModified: null,
  });

describe("RePoE translation snapshots", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-repoe-i18n-"));
    cache = new RePoeCache({ root: tempRoot, now: () => 1234 });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("builds serializable Tree/Items/Skills maps from cached English and Korean resources", async () => {
    await writeResource("ko", "passive_skill_trees/Default.json", {
      passives: {
        "4": {
          id: 4,
          name: "Shock Chance KO",
          stats: [{ id: "shock_chance_+%", value: 5 }],
        },
      },
    });
    await writeResource("en", "stat_translations/stat_descriptions.json", [
      {
        ids: ["shock_chance_+%"],
        English: [{ string: "{0}% increased Shock Chance" }],
      },
      {
        ids: ["cannot_be_stunned"],
        English: [{ string: "Cannot be Stunned" }],
      },
    ]);
    await writeResource("ko", "stat_translations/stat_descriptions.json", [
      {
        ids: ["shock_chance_+%"],
        Korean: [{ string: "감전 확률 {0}% 증가" }],
      },
      {
        ids: ["cannot_be_stunned"],
        Korean: [{ string: "기절 불가" }],
      },
    ]);
    await writeResource("en", "uniques.json", {
      Bramblejack: {
        id: "Metadata/Items/Unique/Bramblejack",
        name: "Bramblejack",
      },
    });
    await writeResource("ko", "uniques.json", {
      Bramblejack: {
        id: "Metadata/Items/Unique/Bramblejack",
        name: "Bramblejack KO",
      },
    });
    await writeResource("en", "base_items.json", {
      "Metadata/Items/Armours/BodyArmours/BodyStr1": {
        display_name: "Plate Vest",
      },
    });
    await writeResource("ko", "base_items.json", {
      "Metadata/Items/Armours/BodyArmours/BodyStr1": {
        display_name: "Plate Vest KO",
      },
    });
    await writeResource("en", "skill_gems.json", {
      "Metadata/Items/Gem/SkillGemAlchemistsBoon": {
        base_item: {
          id: "Metadata/Items/Gem/SkillGemAlchemistsBoon",
          display_name: "Alchemist's Boon",
        },
        grants_skills: ["AlchemistsBoonPlayer"],
      },
    });
    await writeResource("ko", "skill_gems.json", {
      "Metadata/Items/Gem/SkillGemAlchemistsBoon": {
        base_item: {
          id: "Metadata/Items/Gem/SkillGemAlchemistsBoon",
          display_name: "Alchemist's Boon KO",
        },
        grants_skills: ["AlchemistsBoonPlayer"],
      },
    });
    await writeResource("en", "skills.json", {
      FireballPlayer: {
        active_skill: { id: "fireball", display_name: "Fireball" },
      },
    });
    await writeResource("ko", "skills.json", {
      FireballPlayer: {
        active_skill: { id: "fireball", display_name: "Fireball KO" },
      },
    });

    const snapshot = await loadRePoeTranslations("ko", cache);

    expect(snapshot.available).toBe(true);
    expect(snapshot.nodeNamesById["4"]).toBe("Shock Chance KO");
    expect(snapshot.nodeStatLinesById["4"]).toEqual(["감전 확률 5% 증가"]);
    expect(snapshot.statLinesByEnglishLine["Cannot be Stunned"]).toBe(
      "기절 불가",
    );
    expect(snapshot.statLineTemplates).toEqual([
      {
        english: "{0}% increased Shock Chance",
        localized: "감전 확률 {0}% 증가",
      },
    ]);
    expect(snapshot.itemNamesById.Bramblejack).toBe("Bramblejack KO");
    expect(
      snapshot.itemNamesById["Metadata/Items/Armours/BodyArmours/BodyStr1"],
    ).toBe("Plate Vest KO");
    expect(snapshot.itemNamesByEnglishName.Bramblejack).toBe("Bramblejack KO");
    expect(
      snapshot.gemNamesById["Metadata/Items/Gem/SkillGemAlchemistsBoon"],
    ).toBe("Alchemist's Boon KO");
    expect(snapshot.gemNamesBySkillId.AlchemistsBoonPlayer).toBe(
      "Alchemist's Boon KO",
    );
    expect(snapshot.gemNamesBySkillId.FireballPlayer).toBe("Fireball KO");
    expect(snapshot.gemNamesByEnglishName.Fireball).toBe("Fireball KO");
  });

  it("returns an unavailable fallback snapshot when cached Korean resources are missing", async () => {
    const snapshot = await loadRePoeTranslations("ko", cache);

    expect(snapshot).toMatchObject({
      locale: "ko",
      available: false,
      nodeNamesById: {},
      nodeStatLinesById: {},
      statLinesByEnglishLine: {},
      statLineTemplates: [],
      itemNamesById: {},
      gemNamesById: {},
    });
  });

  it("fetches missing RePoE resources before building language maps", async () => {
    const resources: Record<string, unknown> = {
      "ko:passive_skill_trees/Default.json": {
        passives: {
          "4": {
            id: 4,
            name: "Shock Chance KO",
            stats: [{ id: "shock_chance_+%", value: 5 }],
          },
        },
      },
      "en:stat_translations/stat_descriptions.json": [
        {
          ids: ["shock_chance_+%"],
          English: [{ string: "{0}% increased Shock Chance" }],
        },
      ],
      "ko:stat_translations/stat_descriptions.json": [
        {
          ids: ["shock_chance_+%"],
          Korean: [{ string: "감전 확률 {0}% 증가" }],
        },
      ],
      "en:uniques.json": {
        Bramblejack: { name: "Bramblejack" },
      },
      "ko:uniques.json": {
        Bramblejack: { name: "Bramblejack KO" },
      },
      "en:skill_gems.json": {
        "Metadata/Items/Gem/SkillGemAlchemistsBoon": {
          base_item: { display_name: "Alchemist's Boon" },
          grants_skills: ["AlchemistsBoonPlayer"],
        },
      },
      "ko:skill_gems.json": {
        "Metadata/Items/Gem/SkillGemAlchemistsBoon": {
          base_item: { display_name: "Alchemist's Boon KO" },
          grants_skills: ["AlchemistsBoonPlayer"],
        },
      },
      "en:skills.json": {
        FireballPlayer: {
          active_skill: { display_name: "Fireball" },
        },
      },
      "ko:skills.json": {
        FireballPlayer: {
          active_skill: { display_name: "Fireball KO" },
        },
      },
      "en:base_items.json": {},
      "ko:base_items.json": {},
      "en:passive_skill_trees/Default.json": { passives: {} },
    };
    const requested: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      const [, suffix = ""] = url.split("/poe2/");
      const locale = suffix.startsWith("Korean/") ? "ko" : "en";
      const resourcePath =
        locale === "ko" ? suffix.slice("Korean/".length) : suffix;
      const key = `${locale}:${resourcePath}`;
      requested.push(key);
      const fallback = resourcePath.startsWith("stat_translations/") ? [] : {};
      return new Response(JSON.stringify(resources[key] ?? fallback), {
        status: 200,
        headers: { etag: `"${key}"` },
      });
    };

    const snapshot = await loadOrFetchRePoeTranslations("ko", cache, fetcher);

    expect(snapshot.available).toBe(true);
    expect(requested).toContain("ko:passive_skill_trees/Default.json");
    expect(snapshot.nodeNamesById["4"]).toBe("Shock Chance KO");
    expect(snapshot.nodeStatLinesById["4"]).toEqual(["감전 확률 5% 증가"]);
    expect(snapshot.itemNamesByEnglishName.Bramblejack).toBe("Bramblejack KO");
    expect(snapshot.gemNamesBySkillId.FireballPlayer).toBe("Fireball KO");
  });
});

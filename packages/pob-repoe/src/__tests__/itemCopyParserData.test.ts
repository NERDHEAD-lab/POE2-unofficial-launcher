import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RePoeCache } from "../cache";
import {
  loadItemCopyParserData,
  loadOrFetchItemCopyParserData,
} from "../itemCopyParserData";

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

describe("PoB item copy parser data", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pob-item-copy-"));
    cache = new RePoeCache({ root: tempRoot, now: () => 1234 });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("loads paired item names and stat translation variants from cached RePoE resources", async () => {
    await writeResource("en", "base_items.json", {
      wrappedQuarterstaff: { display_name: "Wrapped Quarterstaff" },
    });
    await writeResource("ko", "base_items.json", {
      wrappedQuarterstaff: { display_name: "감싼 육척봉" },
    });
    await writeResource("en", "item_classes.json", {
      Quarterstaff: { display_name: "Quarterstaff" },
    });
    await writeResource("ko", "item_classes.json", {
      Quarterstaff: { display_name: "육척봉" },
    });
    await writeResource("en", "uniques.json", {
      example: { name: "The Example" },
    });
    await writeResource("ko", "uniques.json", {
      example: { name: "예시" },
    });
    await writeResource("en", "stat_translations/stat_descriptions.json", [
      {
        ids: ["base_maximum_life"],
        English: [
          {
            condition: [{ min: null, max: null }],
            string: "+{0} to maximum Life",
          },
        ],
      },
    ]);
    await writeResource("ko", "stat_translations/stat_descriptions.json", [
      {
        ids: ["base_maximum_life"],
        Korean: [
          {
            condition: [{ min: null, max: null }],
            string: "최대 생명력 +{0}",
          },
        ],
      },
    ]);

    const data = await loadItemCopyParserData(cache);

    expect(data.en?.baseItems?.wrappedQuarterstaff).toMatchObject({
      display_name: "Wrapped Quarterstaff",
    });
    expect(data.ko?.itemClasses?.Quarterstaff).toMatchObject({
      display_name: "육척봉",
    });
    expect(data.ko?.uniques?.example).toMatchObject({ name: "예시" });
    expect(data.statTranslations).toEqual([
      {
        ids: ["base_maximum_life"],
        English: [
          {
            condition: [{ min: null, max: null }],
            string: "+{0} to maximum Life",
          },
        ],
        Korean: [
          {
            condition: [{ min: null, max: null }],
            string: "최대 생명력 +{0}",
          },
        ],
      },
    ]);
  });

  it("fetches missing parser resources before building Korean item copy data", async () => {
    const resources = new Map<string, unknown>([
      [
        "en:base_items.json",
        { wrappedQuarterstaff: { display_name: "Wrapped Quarterstaff" } },
      ],
      [
        "ko:base_items.json",
        { wrappedQuarterstaff: { display_name: "감싼 육척봉" } },
      ],
      [
        "en:item_classes.json",
        { Quarterstaff: { display_name: "Quarterstaff" } },
      ],
      ["ko:item_classes.json", { Quarterstaff: { display_name: "육척봉" } }],
      ["en:uniques.json", { example: { name: "The Example" } }],
      ["ko:uniques.json", { example: { name: "예시" } }],
      [
        "en:stat_translations/stat_descriptions.json",
        [
          {
            ids: ["base_maximum_life"],
            English: [{ string: "+{0} to maximum Life" }],
          },
        ],
      ],
      [
        "ko:stat_translations/stat_descriptions.json",
        [
          {
            ids: ["base_maximum_life"],
            Korean: [{ string: "최대 생명력 +{0}" }],
          },
        ],
      ],
      ["en:stat_translations/advanced_mod_stat_descriptions.json", []],
      ["ko:stat_translations/advanced_mod_stat_descriptions.json", []],
    ]);

    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
        const href = String(input);
        const suffix = href.split("/poe2/")[1] ?? "";
        const locale = suffix.startsWith("Korean/") ? "ko" : "en";
        const resourcePath =
          locale === "ko" ? suffix.slice("Korean/".length) : suffix;
        const json = resources.get(`${locale}:${resourcePath}`);
        return new Response(JSON.stringify(json ?? {}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    const data = await loadOrFetchItemCopyParserData(
      cache,
      fetchMock as unknown as typeof fetch,
    );

    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(data.ko?.baseItems?.wrappedQuarterstaff).toMatchObject({
      display_name: "감싼 육척봉",
    });
    expect(data.statTranslations).toEqual([
      {
        ids: ["base_maximum_life"],
        English: [{ string: "+{0} to maximum Life" }],
        Korean: [{ string: "최대 생명력 +{0}" }],
      },
    ]);

    fetchMock.mockClear();
    await loadOrFetchItemCopyParserData(
      cache,
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

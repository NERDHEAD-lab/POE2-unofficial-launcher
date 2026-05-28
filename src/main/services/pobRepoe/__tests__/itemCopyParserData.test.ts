import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RePoeCache } from "../cache";
import { loadItemCopyParserData } from "../itemCopyParserData";

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
});

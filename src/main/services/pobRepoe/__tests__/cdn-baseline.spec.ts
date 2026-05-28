import { describe, expect, it, vi } from "vitest";

import {
  assertRePoeCdnBaseline,
  assertRePoePassiveTreeJsonBaseline,
  checkRePoeCdnBaseline,
  checkRePoePassiveTreeJsonBaseline,
  GGPK_POE2_VERSION_URL,
  REPOE_POE2_BASE_URL,
  REPOE_POE2_CDN_BASELINE_TARGETS,
} from "../cdnBaseline";

describe("RePoE CDN baseline", () => {
  it("pins the PR-7 baseline URLs", () => {
    expect(REPOE_POE2_BASE_URL).toBe("https://repoe-fork.github.io/poe2");
    expect(GGPK_POE2_VERSION_URL).toBe("https://ggpk.exposed/version?poe=2");
    expect(REPOE_POE2_CDN_BASELINE_TARGETS).toEqual([
      {
        id: "repoe-version",
        url: "https://repoe-fork.github.io/poe2/version.txt",
      },
      {
        id: "repoe-tree-ko",
        url: "https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json",
      },
      {
        id: "repoe-tree-en",
        url: "https://repoe-fork.github.io/poe2/passive_skill_trees/Default.json",
      },
      {
        id: "ggpk-poe2-version",
        url: "https://ggpk.exposed/version?poe=2",
      },
    ]);
  });

  it("checks every baseline target with HEAD", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
    }));

    const results = await checkRePoeCdnBaseline(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenCalledWith(
      "https://repoe-fork.github.io/poe2/version.txt",
      { method: "HEAD", redirect: "follow" },
    );
    expect(results.map((result) => result.status)).toEqual([
      200, 200, 200, 200,
    ]);
    expect(() => assertRePoeCdnBaseline(results)).not.toThrow();
  });

  it("reports failed targets with ids and URLs", () => {
    expect(() =>
      assertRePoeCdnBaseline([
        {
          id: "repoe-version",
          url: "https://repoe-fork.github.io/poe2/version.txt",
          ok: false,
          status: 404,
          statusText: "Not Found",
        },
      ]),
    ).toThrow(
      "RePoE CDN baseline failed: repoe-version 404 Not Found: https://repoe-fork.github.io/poe2/version.txt",
    );
  });

  it("validates passive tree JSON shape and key overlap", async () => {
    const jsonByUrl = new Map<string, unknown>([
      [
        "https://repoe-fork.github.io/poe2/passive_skill_trees/Default.json",
        { passives: { "1": {}, "2": {}, "3": {}, "4": {} } },
      ],
      [
        "https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json",
        { passives: { "1": {}, "2": {}, "3": {} } },
      ],
    ]);
    const fetcher = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => jsonByUrl.get(url),
    }));

    const result = await checkRePoePassiveTreeJsonBaseline(fetcher);

    expect(result).toEqual({
      englishPassiveCount: 4,
      koreanPassiveCount: 3,
      overlapCount: 3,
      overlapRatio: 0.75,
    });
    expect(() =>
      assertRePoePassiveTreeJsonBaseline({
        ...result,
        overlapRatio: 0.8,
      }),
    ).not.toThrow();
  });

  it("rejects missing passive tree JSON passives", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
    }));

    await expect(checkRePoePassiveTreeJsonBaseline(fetcher)).rejects.toThrow(
      "RePoE passive tree JSON missing passives",
    );
  });

  const runLiveBaseline = process.env.POB_REPOE_CDN_BASELINE === "1";
  const liveIt = runLiveBaseline ? it : it.skip;

  liveIt(
    "reaches the live CDN baseline",
    async () => {
      const results = await checkRePoeCdnBaseline();
      const treeResult = await checkRePoePassiveTreeJsonBaseline();

      expect(results).toHaveLength(4);
      assertRePoeCdnBaseline(results);
      assertRePoePassiveTreeJsonBaseline(treeResult);
    },
    30_000,
  );
});

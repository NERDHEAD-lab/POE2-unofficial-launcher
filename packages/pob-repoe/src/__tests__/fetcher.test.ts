import { describe, expect, it, vi } from "vitest";

import {
  buildRePoeResourceTargets,
  buildRePoeResourceUrl,
  buildValidatorHeaders,
  fetchGgpkPoe2VersionUrl,
  fetchRePoeJsonResource,
  fetchRePoeVersion,
  REPOE_POE2_RESOURCE_PATHS,
  REPOE_POE2_VERSION_URL,
} from "../fetcher";

describe("RePoE fetcher", () => {
  it("builds English and Korean resource URLs", () => {
    expect(buildRePoeResourceUrl("skills.json", "en")).toBe(
      "https://repoe-fork.github.io/poe2/skills.json",
    );
    expect(buildRePoeResourceUrl("/skills.json", "ko")).toBe(
      "https://repoe-fork.github.io/poe2/Korean/skills.json",
    );
  });

  it("builds the default PR-7 resource target set", () => {
    const targets = buildRePoeResourceTargets();

    expect(targets).toHaveLength(REPOE_POE2_RESOURCE_PATHS.length * 2);
    expect(targets[0]).toEqual({
      id: "en:passive_skill_trees/Default.json",
      locale: "en",
      path: "passive_skill_trees/Default.json",
      url: "https://repoe-fork.github.io/poe2/passive_skill_trees/Default.json",
    });
    expect(targets[REPOE_POE2_RESOURCE_PATHS.length]).toEqual({
      id: "ko:passive_skill_trees/Default.json",
      locale: "ko",
      path: "passive_skill_trees/Default.json",
      url: "https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json",
    });
  });

  it("uses cached HTTP validators when fetching version.txt", async () => {
    const fetcher = vi.fn(async () => {
      return new Response("4.4.0.14\n", {
        status: 200,
        headers: {
          etag: '"abc"',
          "last-modified": "Thu, 28 May 2026 00:00:00 GMT",
        },
      });
    });

    await expect(
      fetchRePoeVersion(
        {
          etag: '"old"',
          lastModified: "Wed, 27 May 2026 00:00:00 GMT",
        },
        fetcher,
      ),
    ).resolves.toEqual({
      status: "ok",
      version: "4.4.0.14",
      etag: '"abc"',
      lastModified: "Thu, 28 May 2026 00:00:00 GMT",
    });

    expect(fetcher).toHaveBeenCalledWith(REPOE_POE2_VERSION_URL, {
      method: "GET",
      headers: {
        "If-None-Match": '"old"',
        "If-Modified-Since": "Wed, 27 May 2026 00:00:00 GMT",
      },
    });
  });

  it("reports version.txt 304 as not modified", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(null, {
        status: 304,
        headers: { etag: '"same"' },
      });
    });

    await expect(fetchRePoeVersion(undefined, fetcher)).resolves.toEqual({
      status: "not_modified",
      etag: '"same"',
      lastModified: null,
    });
  });

  it("builds empty validator headers when no cache metadata exists", () => {
    expect(buildValidatorHeaders()).toEqual({});
  });

  it("fetches a JSON resource and keeps response validators", async () => {
    const target = buildRePoeResourceTargets(["ko"], ["skills.json"])[0];
    const fetcher = vi.fn(async () => {
      return Response.json(
        { Fireball: { name: "Fireball" } },
        {
          headers: {
            etag: '"skills"',
            "last-modified": "Thu, 28 May 2026 00:00:00 GMT",
          },
        },
      );
    });

    await expect(fetchRePoeJsonResource(target, fetcher)).resolves.toEqual({
      ...target,
      json: { Fireball: { name: "Fireball" } },
      etag: '"skills"',
      lastModified: "Thu, 28 May 2026 00:00:00 GMT",
    });
    expect(fetcher).toHaveBeenCalledWith(target.url, { method: "GET" });
  });

  it("normalizes ggpk version endpoint text", async () => {
    const fetcher = vi.fn(async () => new Response('"https://patch/"'));

    await expect(fetchGgpkPoe2VersionUrl(fetcher)).resolves.toBe(
      "https://patch/",
    );
  });

  it("throws on failed resource responses", async () => {
    const target = buildRePoeResourceTargets(["en"], ["missing.json"])[0];
    const fetcher = vi.fn(async () => {
      return new Response("missing", {
        status: 404,
        statusText: "Not Found",
      });
    });

    await expect(fetchRePoeJsonResource(target, fetcher)).rejects.toThrow(
      "Failed to fetch RePoE resource en:missing.json: 404 Not Found",
    );
  });
});

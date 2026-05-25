import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { RemoteVersionResolver } from "../utils/RemoteVersionResolver";
import { GhPagesError } from "../utils/version-sources/ghPagesLatest";
import { MasterSocketError } from "../utils/version-sources/masterSocket";

const POE2_KAKAO =
  "https://patch.poe2.kakaogames.com/production/patch/4.4.0.13/";
const POE2_KAKAO_OLD =
  "https://patch.poe2.kakaogames.com/production/patch/4.4.0.10/";

describe("RemoteVersionResolver", () => {
  beforeEach(() => {
    RemoteVersionResolver.__reset();
  });

  afterEach(() => {
    RemoteVersionResolver.__reset();
  });

  it("returns master result and tags source", async () => {
    const master = vi.fn().mockResolvedValue({ webRoot: POE2_KAKAO });
    const ghPages = vi.fn();
    RemoteVersionResolver.__setAdapters({ master, ghPages });

    const result = await RemoteVersionResolver.resolve("POE2");
    expect(result).toMatchObject({
      gameId: "POE2",
      webRoot: POE2_KAKAO,
      version: "4.4.0.13",
      source: "master-socket",
    });
    expect(master).toHaveBeenCalledTimes(1);
    expect(ghPages).not.toHaveBeenCalled();
  });

  it("falls back to gh-pages when master throws", async () => {
    const master = vi
      .fn()
      .mockRejectedValue(new MasterSocketError("timeout", "timeout"));
    const ghPages = vi.fn().mockResolvedValue({ webRoot: POE2_KAKAO_OLD });
    RemoteVersionResolver.__setAdapters({ master, ghPages });

    const result = await RemoteVersionResolver.resolve("POE2");
    expect(result).toMatchObject({
      source: "gh-pages",
      webRoot: POE2_KAKAO_OLD,
    });
    expect(master).toHaveBeenCalledTimes(1);
    expect(ghPages).toHaveBeenCalledTimes(1);
  });

  it("returns null when both sources fail", async () => {
    const master = vi
      .fn()
      .mockRejectedValue(new MasterSocketError("boom", "unknown"));
    const ghPages = vi
      .fn()
      .mockRejectedValue(new GhPagesError("boom", "network"));
    RemoteVersionResolver.__setAdapters({ master, ghPages });

    const result = await RemoteVersionResolver.resolve("POE1");
    expect(result).toBeNull();
  });

  it("dedups concurrent calls for the same game", async () => {
    let resolveMaster!: (v: { webRoot: string }) => void;
    const master = vi.fn(
      () =>
        new Promise<{ webRoot: string }>((res) => {
          resolveMaster = res;
        }),
    );
    const ghPages = vi.fn();
    RemoteVersionResolver.__setAdapters({ master, ghPages });

    const p1 = RemoteVersionResolver.resolve("POE2");
    const p2 = RemoteVersionResolver.resolve("POE2");
    resolveMaster({ webRoot: POE2_KAKAO });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(master).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  it("returns cached value while fresh, refreshes after TTL", async () => {
    const master = vi
      .fn()
      .mockResolvedValueOnce({ webRoot: POE2_KAKAO_OLD })
      .mockResolvedValueOnce({ webRoot: POE2_KAKAO });
    RemoteVersionResolver.__setAdapters({
      master,
      ghPages: vi.fn(),
    });

    const first = await RemoteVersionResolver.resolve("POE2");
    expect(first?.version).toBe("4.4.0.10");

    // Within TTL: same value, no extra call
    const second = await RemoteVersionResolver.resolve("POE2");
    expect(second).toBe(first);
    expect(master).toHaveBeenCalledTimes(1);

    // Force cache expiry by rewinding fetchedAt
    const cached = RemoteVersionResolver.peekCache("POE2")!;
    cached.fetchedAt = Date.now() - 11 * 60 * 1000;

    const third = await RemoteVersionResolver.resolve("POE2");
    expect(third?.version).toBe("4.4.0.13");
    expect(master).toHaveBeenCalledTimes(2);
  });

  it("isFresh respects TTL", () => {
    const master = vi.fn().mockResolvedValue({ webRoot: POE2_KAKAO });
    RemoteVersionResolver.__setAdapters({ master, ghPages: vi.fn() });

    expect(RemoteVersionResolver.isFresh("POE2")).toBe(false);
    return RemoteVersionResolver.resolve("POE2").then(() => {
      expect(RemoteVersionResolver.isFresh("POE2")).toBe(true);
      const cached = RemoteVersionResolver.peekCache("POE2")!;
      cached.fetchedAt = Date.now() - 11 * 60 * 1000;
      expect(RemoteVersionResolver.isFresh("POE2")).toBe(false);
    });
  });
});

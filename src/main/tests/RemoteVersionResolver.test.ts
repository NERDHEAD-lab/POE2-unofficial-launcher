import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { RemoteVersionResolver } from "../utils/RemoteVersionResolver";
import { GhPagesError } from "../utils/version-sources/ghPagesLatest";
import { MasterSocketError } from "../utils/version-sources/masterSocket";

const context = {
  gameId: "POE2",
  serviceId: "Kakao Games",
  installPath: "D:\\fixture\\POE2",
} as const;
const context1 = { ...context, gameId: "POE1" } as const;

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

    const result = await RemoteVersionResolver.resolve(context);
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
    const ghPages = vi.fn().mockResolvedValue({
      webRoot: POE2_KAKAO_OLD,
      version: "4.4.0.10",
      timestamp: 123,
    });
    RemoteVersionResolver.__setAdapters({ master, ghPages });

    const result = await RemoteVersionResolver.resolve(context);
    expect(result).toMatchObject({
      source: "gh-pages",
      status: "unavailable",
      sourceTimestamp: 123,
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

    const result = await RemoteVersionResolver.resolve(context1);
    expect(result).toMatchObject({ status: "unavailable", source: null });
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

    const p1 = RemoteVersionResolver.resolve(context);
    const p2 = RemoteVersionResolver.resolve(context);
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

    const first = await RemoteVersionResolver.resolve(context);
    expect(first?.version).toBe("4.4.0.10");

    // Within TTL: same value, no extra call
    const second = await RemoteVersionResolver.resolve(context);
    expect(second).toBe(first);
    expect(master).toHaveBeenCalledTimes(1);

    // Force cache expiry by rewinding fetchedAt
    const cached = RemoteVersionResolver.peekCache(context)!;
    cached.fetchedAt = Date.now() - 11 * 60 * 1000;

    const third = await RemoteVersionResolver.resolve(context);
    expect(third?.version).toBe("4.4.0.13");
    expect(master).toHaveBeenCalledTimes(2);
  });

  it("bypasses the TTL cache for reservation monitoring", async () => {
    const master = vi
      .fn()
      .mockResolvedValueOnce({ webRoot: POE2_KAKAO_OLD })
      .mockResolvedValueOnce({ webRoot: POE2_KAKAO });
    RemoteVersionResolver.__setAdapters({
      master,
      ghPages: vi.fn(),
    });

    const first = await RemoteVersionResolver.resolve(context);
    const fresh = await RemoteVersionResolver.resolveFresh(context);

    expect(first?.version).toBe("4.4.0.10");
    expect(fresh?.version).toBe("4.4.0.13");
    expect(master).toHaveBeenCalledTimes(2);
  });

  it("dedups concurrent fresh reservation checks for the same game", async () => {
    let resolveMaster!: (value: { webRoot: string }) => void;
    const master = vi.fn(
      () =>
        new Promise<{ webRoot: string }>((resolve) => {
          resolveMaster = resolve;
        }),
    );
    RemoteVersionResolver.__setAdapters({ master, ghPages: vi.fn() });

    const first = RemoteVersionResolver.resolveFresh(context);
    const second = RemoteVersionResolver.resolveFresh(context);
    resolveMaster({ webRoot: POE2_KAKAO });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(master).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(secondResult);
  });

  it("isFresh respects TTL", () => {
    const master = vi.fn().mockResolvedValue({ webRoot: POE2_KAKAO });
    RemoteVersionResolver.__setAdapters({ master, ghPages: vi.fn() });

    expect(RemoteVersionResolver.isFresh(context)).toBe(false);
    return RemoteVersionResolver.resolve(context).then(() => {
      expect(RemoteVersionResolver.isFresh(context)).toBe(true);
      const cached = RemoteVersionResolver.peekCache(context)!;
      cached.fetchedAt = Date.now() - 11 * 60 * 1000;
      expect(RemoteVersionResolver.isFresh(context)).toBe(false);
    });
  });

  it("keeps the direct 0.x server identity and publishes a failed fresh lookup instead of retaining old success", async () => {
    const updates = vi.fn();
    RemoteVersionResolver.setOnUpdated(updates);
    RemoteVersionResolver.__setAdapters({
      master: vi
        .fn()
        .mockResolvedValueOnce({
          webRoot: "https://new-cdn.example/patch/0.5.5.4.2/",
        })
        .mockRejectedValueOnce(new Error("offline")),
      ghPages: vi.fn().mockResolvedValue({
        webRoot: POE2_KAKAO_OLD,
        version: "4.4.0.10",
        timestamp: 1,
      }),
    });
    expect(await RemoteVersionResolver.resolve(context)).toMatchObject({
      version: "0.5.5.4.2",
      status: "ok",
    });
    const failed = await RemoteVersionResolver.resolveFresh(context);
    expect(failed).toMatchObject({
      source: "gh-pages",
      status: "unavailable",
      sourceTimestamp: 1,
    });
    expect(RemoteVersionResolver.peekCache(context)).toBe(failed);
    expect(RemoteVersionResolver.isFresh(context)).toBe(false);
    expect(updates).toHaveBeenLastCalledWith(failed);
  });

  it("separates simultaneous service/path lookups and pins their request context", async () => {
    const master = vi.fn().mockResolvedValue({ webRoot: POE2_KAKAO });
    RemoteVersionResolver.__setAdapters({ master });
    const other = {
      ...context,
      serviceId: "GGG" as const,
      installPath: "E:\\Other",
    };
    const mutable: {
      gameId: "POE2";
      serviceId: "Kakao Games";
      installPath: string;
    } = { ...context };
    const first = RemoteVersionResolver.resolve(mutable);
    mutable.installPath = "F:\\Changed";
    const [one, two] = await Promise.all([
      first,
      RemoteVersionResolver.resolve(other),
    ]);
    expect(one.installPath).toBe(context.installPath);
    expect(two.installPath).toBe("E:\\Other");
    expect(master).toHaveBeenCalledTimes(2);
  });
});

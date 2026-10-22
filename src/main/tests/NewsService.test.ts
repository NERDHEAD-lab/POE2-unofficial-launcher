import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";

import { NEWS_REFRESH_INTERVAL } from "../../shared/news-config";
import { NewsService } from "../services/NewsService";

const storeMocks = vi.hoisted(() => ({
  persisted: null as Record<string, unknown> | null,
  failWrite: false,
}));

// Mock fetch and electron-store
vi.stubGlobal("fetch", vi.fn());

vi.mock("electron-store", () => {
  return {
    default: class {
      data: Record<string, unknown> = {};
      constructor(options: { defaults?: Record<string, unknown> }) {
        storeMocks.persisted ??= options.defaults
          ? JSON.parse(JSON.stringify(options.defaults))
          : {};
        this.data = storeMocks.persisted!;
      }
      get(key: string) {
        return this.data[key];
      }
      set(key: string, value: unknown) {
        if (storeMocks.failWrite) throw new Error("fixture save failed");
        this.data[key] = value;
      }
    },
  };
});

describe("NewsService", () => {
  let service: NewsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T00:00:00.000Z"));
    storeMocks.persisted = null;
    storeMocks.failWrite = false;
    service = new NewsService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  const mockForumHtml = (id: string, title: string) => `
    <table class="forumTable">
      <tr class="headerRow"><th>Title</th></tr>
      <tr>
        <td class="title"><a class="title" href="/forum/view-thread/${id}">${title}</a></td>
        <td class="postBy"><div class="post_date">, Jan 01, 2024</div></td>
      </tr>
    </table>
  `;

  const mockNewsFetches = () => {
    (globalThis.fetch as Mock).mockImplementation((url: string) => {
      if (url.includes("notice/list.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                title: "Dev Notice",
                url: "https://example.com/notice/dev.md",
                date: "2026-06-07",
                priority: true,
              },
            ]),
        });
      }

      const id = url.includes("2212") ? "patch-1" : "notice-1";
      const title = url.includes("2212") ? "Patch Note" : "Notice";
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockForumHtml(id, title)),
      });
    });
  };

  const source = { game: "POE2", service: "GGG", category: "notice" } as const;
  const seedPosts = (
    ids: string[],
    category = "notice",
    game = "POE2",
    channel = "GGG",
  ) => {
    const data = storeMocks.persisted!;
    (data.items as Record<string, unknown>)[`${channel}-${game}-${category}`] =
      ids.map((id) => ({
        id,
        title: `Title ${id}`,
        link: `https://example.com/${id}`,
        date: "2026-10-22",
        type: category,
        isSticky: id === "pinned",
        isNew: false, // Deliberately stale cache flag must not be authoritative.
      }));
    const updated = data.lastUpdatedAt as Record<string, number>;
    updated[`${channel}-${game}-notice`] = Date.now();
    updated[`${channel}-${game}-patch-notes`] = Date.now();
    updated["dev-notice"] = Date.now();
  };
  const activate = () => {
    service.setSelectedContext(source);
    service.setActive(true);
    return service.getView("POE2", "GGG");
  };

  it("keeps actually displayed titles NEW until the next activation and never consumes unseen titles", () => {
    seedPosts(["pinned", "outside"]);
    const hidden = service.getView("POE2", "GGG");
    expect(
      service.reportDisplayed({ ...source, ...hidden, ids: ["pinned"] }),
    ).toBe(false);
    const first = activate();
    expect(
      service.reportDisplayed({
        ...source,
        ...first,
        ids: ["pinned", "not-cached"],
      }),
    ).toBe(true);
    expect(
      service.getView("POE2", "GGG").notices.map((item) => item.isNew),
    ).toEqual([true, true]);
    service.setActive(true); // duplicate show/focus and renderer cache queries retain the same generation.
    expect(service.getView("POE2", "GGG").generation).toBe(first.generation);
    seedPosts(["pinned", "outside", "arrived"]);
    expect(
      service.getView("POE2", "GGG").notices.map((item) => item.isNew),
    ).toEqual([true, true, true]);
    service.setActive(false);
    expect(
      service.reportDisplayed({ ...source, ...first, ids: ["outside"] }),
    ).toBe(false);
    const second = activate();
    expect(second.notices.map((item) => item.isNew)).toEqual([
      false,
      true,
      true,
    ]);
    expect(
      service.reportDisplayed({ ...source, ...first, ids: ["outside"] }),
    ).toBe(false);
  });

  it("scopes direct reads and rejects reports from a previous selection even after switching back", () => {
    seedPosts(["same-id"]);
    seedPosts(["same-id"], "patch-notes");
    seedPosts(["same-id"], "notice", "POE1");
    const first = activate();
    service.setSelectedContext({ game: "POE1", service: "GGG" });
    expect(
      service.reportDisplayed({ ...source, ...first, ids: ["same-id"] }),
    ).toBe(false);
    service.setSelectedContext(source);
    expect(
      service.reportDisplayed({ ...source, ...first, ids: ["same-id"] }),
    ).toBe(false);
    expect(service.getView("POE2", "GGG").notices[0].isNew).toBe(true);
    service.markAsRead("same-id", source);
    expect(service.getView("POE2", "GGG").notices[0].isNew).toBe(false);
    expect(service.getView("POE2", "GGG").patchNotes[0].isNew).toBe(true);
    expect(service.getView("POE1", "GGG").notices[0].isNew).toBe(true);
  });

  it("retains persisted scoped/pinned and legacy history across process restart without clearing unseen posts", () => {
    seedPosts(["pinned", "legacy", "unseen"]);
    storeMocks.persisted!.lastReadIds = ["legacy"];
    // A current cached pinned identity survives pruning of older history.
    storeMocks.persisted!.readKeys = [
      JSON.stringify(["GGG-POE2-notice", "pinned"]),
      ...Array.from({ length: 210 }, (_, index) => `old-${index}`),
    ];
    const first = activate();
    service.reportDisplayed({ ...source, ...first, ids: ["pinned"] });
    const restarted = new NewsService();
    restarted.setSelectedContext(source);
    restarted.setActive(true);
    expect(
      restarted.getView("POE2", "GGG").notices.map((item) => item.isNew),
    ).toEqual([false, false, true]);
    expect(storeMocks.persisted!.lastReadIds).toEqual(["legacy"]);
    restarted.stop();
  });

  it("leaves a title NEW after a failed persistence write and a later activation", () => {
    seedPosts(["not-saved"]);
    const first = activate();
    storeMocks.failWrite = true;
    expect(
      service.reportDisplayed({ ...source, ...first, ids: ["not-saved"] }),
    ).toBe(false);
    storeMocks.failWrite = false;
    service.setActive(false);
    expect(activate().notices[0].isNew).toBe(true);
  });

  it("should fetch news list correctly from GGG", async () => {
    const mockHtml = `
      <table class="forumTable">
        <tr class="headerRow"><th>Title</th></tr>
        <tr>
          <td class="title"><a class="title" href="/forum/view-thread/12345">Test Title</a></td>
          <td class="postBy"><div class="post_date">, Jan 01, 2024</div></td>
        </tr>
      </table>
    `;

    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    const items = await service.fetchNewsList("POE2", "GGG", "notice");

    expect(items.length).toBe(1);
    expect(items[0].title).toBe("Test Title");
    expect(items[0].link).toBe(
      "https://www.pathofexile.com/forum/view-thread/12345",
    );
    expect(items[0].id).toBe("12345");
  });

  it("decodes HTML entities in forum titles", async () => {
    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          mockForumHtml(
            "3990149",
            "패스 오브 엑자일 1&amp;2 패키지 상품 가격 조정 안내",
          ),
        ),
    });

    const items = await service.fetchNewsList("POE2", "Kakao Games", "notice");

    expect(items[0].title).toBe(
      "패스 오브 엑자일 1&2 패키지 상품 가격 조정 안내",
    );
  });

  it("falls back to Kakao maintenance info when forum fetch redirects to inspection", async () => {
    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      url: "https://pathofexile.kakaogames.com/inspection",
      text: () =>
        Promise.resolve(`
          <div class="construction__data">
            <ul>
              <li><div><strong>점검시간</strong><div>2026년 06월 17일 07:00 ~ 06월 17일 10:00</div></div></li>
              <li><div><strong>점검내용</strong><div>카카오게임즈 서비스 전환을 위한 점검</div></div></li>
            </ul>
          </div>
        `),
    });

    const items = await service.fetchNewsList("POE2", "Kakao Games", "notice");

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("카카오게임즈 점검 안내");
    expect(items[0].link).toBe("https://pathofexile.kakaogames.com/inspection");
    expect(items[0].date).toBe("2026년 06월 17일");
    expect(service.getContentFromCache(items[0].id)).toContain("점검내용");
  });

  it("should fetch post content correctly", async () => {
    const mockHtml = `
      <div class="forumPost">
        <div class="content">This is the <p>patch note</p> content.</div>
      </div>
    `;

    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    const content = await service.fetchNewsContent(
      "12345",
      "https://www.pathofexile.com/forum/view-thread/12345",
    );

    expect(content).toContain("This is the <p>patch note</p> content.");
  });

  it("refreshes due forum news and developer notices on one schedule", async () => {
    const onUpdated = vi.fn();
    mockNewsFetches();
    service.setActive(true);
    service.init(onUpdated);

    await service.refreshDue({
      game: "POE2",
      service: "GGG",
      reason: "test",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(onUpdated).toHaveBeenCalled();
    expect(service.getCacheItems("GGG-POE2-notice")[0].title).toBe("Notice");
    expect(service.getCacheItems("GGG-POE2-patch-notes")[0].title).toBe(
      "Patch Note",
    );
    expect(service.getCacheItems("dev-notice")[0].title).toBe("Dev Notice");
    expect(service.getLastUpdatedAt("GGG-POE2-notice")).toBe(Date.now());
    expect(service.getLastUpdatedAt("GGG-POE2-patch-notes")).toBe(Date.now());
    expect(service.getLastUpdatedAt("dev-notice")).toBe(Date.now());

    (globalThis.fetch as Mock).mockClear();
    onUpdated.mockClear();

    await service.refreshDue({
      game: "POE2",
      service: "GGG",
      reason: "not-due",
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(Date.now() + NEWS_REFRESH_INTERVAL));
    const unchangedDueRefresh = await service.refreshDue({
      game: "POE2",
      service: "GGG",
      reason: "due-again",
    });

    expect(unchangedDueRefresh).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(onUpdated).toHaveBeenCalled();
    expect(service.getLastUpdatedAt("GGG-POE2-notice")).toBe(Date.now());
  });

  it("manually refreshes all news sources before the scheduled interval", async () => {
    const onUpdated = vi.fn();
    mockNewsFetches();
    service.setActive(true);
    service.init(onUpdated);

    const changed = await service.refreshAllNews();

    expect(changed).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(9);
    expect(onUpdated).toHaveBeenCalled();
    expect(service.getCacheItems("GGG-POE2-notice")[0].title).toBe("Notice");
    expect(service.getCacheItems("GGG-POE2-patch-notes")[0].title).toBe(
      "Patch Note",
    );
    expect(service.getCacheItems("dev-notice")[0].title).toBe("Dev Notice");
    expect(service.getLastUpdatedAt("GGG-POE2-notice")).toBe(Date.now());
    expect(service.getLastUpdatedAt("GGG-POE2-patch-notes")).toBe(Date.now());
    expect(service.getLastUpdatedAt("Kakao Games-POE1-patch-notes")).toBe(
      Date.now(),
    );
    expect(service.getLastUpdatedAt("dev-notice")).toBe(Date.now());

    (globalThis.fetch as Mock).mockClear();
    onUpdated.mockClear();
    vi.setSystemTime(new Date(Date.now() + 1000));

    const unchanged = await service.refreshAllNews();

    expect(unchanged).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(9);
    expect(onUpdated).toHaveBeenCalled();
    expect(service.getLastUpdatedAt("GGG-POE2-notice")).toBe(Date.now());
    expect(service.getLastUpdatedAt("GGG-POE2-patch-notes")).toBe(Date.now());
    expect(service.getLastUpdatedAt("Kakao Games-POE1-patch-notes")).toBe(
      Date.now(),
    );
    expect(service.getLastUpdatedAt("dev-notice")).toBe(Date.now());
  });

  it("defers due refresh while inactive and runs it when focused again", async () => {
    const onUpdated = vi.fn();
    mockNewsFetches();
    service.setActive(true);
    service.init(onUpdated);

    service.setActive(false);
    const refreshedWhileInactive = await service.refreshDue({
      game: "POE2",
      service: "GGG",
      reason: "timer",
    });

    expect(refreshedWhileInactive).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    service.setActive(true, {
      game: "POE2",
      service: "GGG",
      reason: "focus",
    });

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(onUpdated).toHaveBeenCalled();
    });
  });
});

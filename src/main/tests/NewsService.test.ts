import { describe, it, expect, vi, beforeEach, Mock } from "vitest";

import { NewsService } from "../services/NewsService";

// Mock fetch and electron-store
vi.stubGlobal("fetch", vi.fn());

vi.mock("electron-store", () => {
  return {
    default: class {
      data: Record<string, unknown> = {};
      constructor(options: { defaults?: Record<string, unknown> }) {
        this.data = options.defaults || {};
      }
      get(key: string) {
        return this.data[key];
      }
      set(key: string, value: unknown) {
        this.data[key] = value;
      }
    },
  };
});

describe("NewsService", () => {
  let service: NewsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NewsService();
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

  it("should handle read status correctly", () => {
    service.markAsRead("12345");
    // Just verify no crash
  });
});

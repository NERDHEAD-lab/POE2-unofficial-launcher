import { describe, it, expect, beforeEach, vi } from "vitest";

import { NewsService } from "../services/NewsService";

// Mock electron-store to avoid "projectName" error in Vitest
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

// Integration test for live crawling
describe("NewsService Integration (Live)", () => {
  let service: NewsService;

  beforeEach(() => {
    service = new NewsService();
  });

  const testConfigs = [
    { game: "POE2", service: "GGG", category: "notice" },
    { game: "POE2", service: "GGG", category: "patch-notes" },
    { game: "POE2", service: "Kakao Games", category: "notice" },
    { game: "POE2", service: "Kakao Games", category: "patch-notes" },
    { game: "POE1", service: "GGG", category: "notice" },
    { game: "POE1", service: "GGG", category: "patch-notes" },
    { game: "POE1", service: "Kakao Games", category: "notice" },
    { game: "POE1", service: "Kakao Games", category: "patch-notes" },
  ] as const;

  testConfigs.forEach(({ game, service: srv, category }) => {
    it(`should fetch live news for ${srv} - ${game} - ${category}`, async () => {
      const items = await service.fetchNewsList(game, srv, category);

      console.log(
        `[Test] Fetched ${items.length} items for ${srv} ${game} ${category}`,
      );

      // We expect at least some items on actual forum pages
      expect(items.length).toBeGreaterThan(0);

      const firstItem = items[0];
      expect(firstItem.title).toBeTruthy();
      expect(firstItem.link).toContain("http");
      expect(firstItem.id).toBeTruthy();

      // Test content fetching for the first item
      const content = await service.fetchNewsContent(
        firstItem.id,
        firstItem.link,
      );
      expect(content).not.toContain("내용을 불러올 수 없습니다");
      expect(content).not.toContain("실패했습니다");
      expect(
        content.length,
        `[Test] ${srv} ${game} ${category} content[${content}] is less than 50. link: ${firstItem.link}`,
      ).toBeGreaterThan(50);
    }, 20000); // 20s timeout per live test
  });
});

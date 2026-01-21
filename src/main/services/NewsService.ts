import Store from "electron-store";
import { parse } from "node-html-parser";

import { MAX_NEWS_COUNT, NEWS_REFRESH_INTERVAL } from "../../shared/constants";
import {
  NewsItem,
  NewsCategory,
  NewsServiceState,
  AppConfig,
} from "../../shared/types";

const GGG_BASE_URL = "https://www.pathofexile.com";
const KAKAO_BASE_URL = "https://poe.game.daum.net";

const URL_MAP: Record<string, string> = {
  "GGG-POE2-notice": `${GGG_BASE_URL}/forum/view-forum/2211`,
  "GGG-POE2-patch-notes": `${GGG_BASE_URL}/forum/view-forum/2212`,
  "Kakao Games-POE2-notice": `${KAKAO_BASE_URL}/forum/view-forum/news2`,
  "Kakao Games-POE2-patch-notes": `${KAKAO_BASE_URL}/forum/view-forum/patch-notes2`,
  "GGG-POE1-notice": `${GGG_BASE_URL}/forum/view-forum/news`,
  "GGG-POE1-patch-notes": `${GGG_BASE_URL}/forum/view-forum/patch-notes`,
  "Kakao Games-POE1-notice": `${KAKAO_BASE_URL}/forum/view-forum/news`,
  "Kakao Games-POE1-patch-notes": `${KAKAO_BASE_URL}/forum/view-forum/patch-notes`,
};

export class NewsService {
  private store: Store<NewsServiceState>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private onUpdated: (() => void) | null = null;
  private lastConfig: {
    game: AppConfig["activeGame"];
    service: AppConfig["serviceChannel"];
  } | null = null;

  constructor() {
    this.store = new Store<NewsServiceState>({
      name: "news-cache",
      defaults: {
        items: {},
        contents: {},
        lastReadIds: [],
      },
    });
  }

  init(onUpdated: () => void) {
    this.onUpdated = onUpdated;
    // Start periodic refresh
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(
      () => this.refreshAll(),
      NEWS_REFRESH_INTERVAL,
    );
  }

  private async refreshAll() {
    if (!this.lastConfig) return;

    console.log("[NewsService] Background refresh started...");
    await Promise.all([
      this.fetchNewsList(
        this.lastConfig.game,
        this.lastConfig.service,
        "notice",
      ),
      this.fetchNewsList(
        this.lastConfig.game,
        this.lastConfig.service,
        "patch-notes",
      ),
    ]);

    if (this.onUpdated) this.onUpdated();
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 3,
  ): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });
        if (response.ok) return response;
        if (i === retries - 1) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        if (i === retries - 1) throw error;
        console.warn(`[NewsService] Retry ${i + 1}/${retries} for ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw new Error("Max retries reached");
  }

  async fetchNewsList(
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ): Promise<NewsItem[]> {
    this.lastConfig = { game, service };
    const key = `${service}-${game}-${category}`;
    const url = URL_MAP[key];

    if (!url) return [];

    try {
      const response = await this.fetchWithRetry(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      const html = await response.text();
      const root = parse(html);

      let table = root.getElementById("view_forum_table");
      if (!table) {
        table = root.querySelector(".forumTable");
      }

      const rows = table ? table.querySelectorAll("tr") : [];
      const items: NewsItem[] = [];
      const lastReadIds = this.store.get("lastReadIds");

      for (const row of rows) {
        if (items.length >= MAX_NEWS_COUNT) break;

        const titleAnchor = row.querySelector(".title a");
        const dateElement = row.querySelector(".post_date");

        if (titleAnchor) {
          const title = titleAnchor.innerText.trim();
          const link = titleAnchor.getAttribute("href") || "";

          let date = dateElement ? dateElement.innerText.trim() : "";
          date = date.replace(/^,\s*/, "");

          const fullLink = link.startsWith("http")
            ? link
            : (service === "GGG" ? GGG_BASE_URL : KAKAO_BASE_URL) + link;

          const idMatch = link.match(/view-thread\/(\d+)/);
          const id = idMatch ? idMatch[1] : link;

          items.push({
            id,
            title,
            link: fullLink,
            date,
            type: category,
            isNew: !lastReadIds.includes(id),
          });
        }
      }

      // Check if data has changed compared to cache
      const cachedItems = this.getCacheItems(key);
      const isChanged = JSON.stringify(cachedItems) !== JSON.stringify(items);

      if (isChanged) {
        const allItems = this.store.get("items");
        allItems[key] = items;
        this.store.set("items", allItems);

        // Notify UI if it was a background refresh or if we need to update
        if (this.onUpdated) this.onUpdated();
      }

      return items;
    } catch (error) {
      console.error(
        `[NewsService] Failed to fetch news list for ${key}:`,
        error,
      );
      return this.getCacheItems(key);
    }
  }

  async fetchNewsContent(id: string, link: string): Promise<string> {
    try {
      const response = await this.fetchWithRetry(link, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      const html = await response.text();
      const root = parse(html);

      const content =
        root.querySelector(".forumPost .content") ||
        root.querySelector(".newsPost .content") ||
        root.querySelector(".content-container .content");

      if (!content)
        return "내용을 불러올 수 없습니다. (게시글이 삭제되었거나 형식이 다를 수 있습니다.)";

      // Remove unnecessary elements (author info, buttons, etc.)
      const unwantedSelectors = [
        ".post_author_info",
        ".report_button",
        ".content-footer",
        ".social-buttons",
        "script",
        "style",
      ];
      unwantedSelectors.forEach((sel) => {
        content.querySelectorAll(sel).forEach((el) => el.remove());
      });

      // Special handling for Kakao: sometimes author info is within a sibling or specific div
      // Based on user feedback, we strictly need the content only.
      // If we used root.querySelector(".content"), it might include too much.
      // We already narrowed it down to 'content' variable.

      const cleanHtml = content.innerHTML.trim();

      const contents = this.store.get("contents");
      contents[id] = {
        id,
        content: cleanHtml,
        lastUpdated: Date.now(),
      };
      this.store.set("contents", contents);

      return cleanHtml;
    } catch (error) {
      console.error(
        `[NewsService] Failed to fetch news content for ${id}:`,
        error,
      );
      return (
        this.store.get("contents")[id]?.content ||
        "오프라인 상태이거나 내용을 불러오는 데 실패했습니다."
      );
    }
  }

  getContentFromCache(id: string): string | null {
    return this.store.get("contents")[id]?.content || null;
  }

  markAsRead(id: string): void {
    const lastReadIds = this.store.get("lastReadIds");
    if (!lastReadIds.includes(id)) {
      lastReadIds.push(id);
      // Keep only last 100 IDs to avoid store bloat
      if (lastReadIds.length > 100) lastReadIds.shift();
      this.store.set("lastReadIds", lastReadIds);
    }
  }

  getCacheItems(
    keyOrConfig:
      | string
      | {
          game: AppConfig["activeGame"];
          service: AppConfig["serviceChannel"];
          category: NewsCategory;
        },
  ): NewsItem[] {
    const key =
      typeof keyOrConfig === "string"
        ? keyOrConfig
        : `${keyOrConfig.service}-${keyOrConfig.game}-${keyOrConfig.category}`;
    return this.store.get("items")[key] || [];
  }
}

export const newsService = new NewsService();

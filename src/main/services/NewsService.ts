import Store from "electron-store";
import { parse } from "node-html-parser";

import {
  MAX_NEWS_COUNT,
  NEWS_REFRESH_INTERVAL,
  GGG_BASE_URL,
  KAKAO_BASE_URL,
  NEWS_URL_MAP,
  NEWS_CACHE_STORE_NAME,
  NEWS_CACHE_DEFAULTS,
} from "../../shared/news-config";
import {
  NewsItem,
  NewsCategory,
  NewsServiceState,
  NewsContent,
  AppConfig,
} from "../../shared/types";
import { Logger } from "../utils/logger";

export class NewsService {
  private store: Store<NewsServiceState>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private onUpdated: (() => void) | null = null;
  private lastConfig: {
    game: AppConfig["activeGame"];
    service: AppConfig["serviceChannel"];
  } | null = null;
  private fetchLock: Set<string> = new Set();
  private logger = new Logger({ type: "NEWS_SERVICE", typeColor: "#ce9178" });

  constructor() {
    this.store = new Store<NewsServiceState>({
      name: NEWS_CACHE_STORE_NAME,
      defaults: NEWS_CACHE_DEFAULTS,
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
    this.logger.log("Background refresh started...");
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
      this.fetchDevNotices().then((items) => {
        const allItems = this.store.get("items");
        allItems["dev-notice"] = items;
        this.store.set("items", allItems);
      }),
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
          signal: AbortSignal.timeout(15000), // Increased to 15s timeout
        });
        if (response.ok) return response;
        if (i === retries - 1) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        if (i === retries - 1) throw error;
        this.logger.warn(`Retry ${i + 1}/${retries} for ${url}`);
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
    const url = NEWS_URL_MAP[key];

    if (!url) return [];

    if (this.fetchLock.has(key)) {
      this.logger.log(`Fetch already in progress for ${key}. Skipping.`);
      return this.getCacheItems(key);
    }

    this.fetchLock.add(key);
    this.logger.log(`Fetching ${category} for ${service}-${game}...`);

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

          // Detect Sticky flag
          const isSticky = !!row.querySelector(
            "td.flags.first div.flag.sticky",
          );

          items.push({
            id,
            title,
            link: fullLink,
            date,
            type: category,
            isNew: !lastReadIds.includes(id),
            isSticky,
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
        this.logger.log(`News updated for ${key}. (New items detected)`);

        // Run garbage collection to clean up orphaned contents
        this.garbageCollect();
      }

      this.logger.log(
        `Successfully fetched ${category} for ${service}-${game}.`,
      );
      return items;
    } catch (error) {
      this.logger.error(`Failed to fetch news list for ${key}:`, error);
      return this.getCacheItems(key);
    } finally {
      this.fetchLock.delete(key);
    }
  }

  async fetchDevNotices(): Promise<NewsItem[]> {
    const url = NEWS_URL_MAP["dev-notice"];
    if (!url) return [];

    this.logger.log("Fetching developer notices...");

    try {
      const response = await this.fetchWithRetry(url, {
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await response.json();

      if (!Array.isArray(data)) {
        this.logger.warn("Dev notices data is not an array.");
        return [];
      }

      const items: NewsItem[] = data.map(
        (file: {
          title?: string;
          url?: string;
          date?: string;
          priority?: boolean;
        }) => {
          const title = file.title || "Untitled";
          const link = file.url || "";
          // Use link or title as ID
          const id = link || `dev-notice-${title}`;

          return {
            id,
            title,
            link,
            date: file.date || new Date().toISOString().split("T")[0],
            type: "dev-notice" as NewsCategory,
            isNew: false,
            isSticky: !!file.priority,
          };
        },
      );

      this.logger.log(
        `Successfully fetched ${items.length} developer notices.`,
      );

      // Sort: Priority (Sticky) first, then by date descending
      return items
        .sort((a, b) => {
          if (a.isSticky && !b.isSticky) return -1;
          if (!a.isSticky && b.isSticky) return 1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        })
        .slice(0, MAX_NEWS_COUNT);
    } catch (error) {
      this.logger.error("Failed to fetch dev notices:", error);
      return [];
    }
  }

  private updateCache(id: string, cleanHtml: string) {
    const contents = this.store.get("contents");
    const isChanged = contents[id]?.content !== cleanHtml;

    contents[id] = {
      id,
      content: cleanHtml,
      lastUpdated: Date.now(),
    };
    this.store.set("contents", contents);

    if (isChanged) {
      this.logger.log(`Content updated for post ${id}.`);
    }
  }

  async fetchNewsContent(id: string, link: string): Promise<string> {
    this.logger.log(`Fetching content for post ${id}...`);
    try {
      const response = await this.fetchWithRetry(link, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      const html = await response.text();
      const isMarkdown =
        link.toLowerCase().endsWith(".md") ||
        id.startsWith("dev-notice-") ||
        !link.includes("forum/view-thread");

      if (isMarkdown) {
        // For Markdown files, we return the raw content without HTML parsing
        this.logger.log(`Detected Markdown content for ${id}. Processing...`);

        let processedContent = html.trim();
        const lines = processedContent.split("\n");

        // If first line is a title (# ), remove it to avoid redundancy with the modal title
        if (lines[0] && lines[0].startsWith("# ")) {
          this.logger.log(`Stripping redundant H1 title from ${id}`);
          processedContent = lines.slice(1).join("\n").trim();
        }

        this.updateCache(id, processedContent);
        return processedContent;
      }

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

      const cleanHtml = content.innerHTML.trim();
      this.updateCache(id, cleanHtml);

      this.logger.log(`Successfully fetched content for post ${id}.`);

      return cleanHtml;
    } catch (error) {
      this.logger.error(`Failed to fetch news content for ${id}:`, error);
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
    this.markMultipleAsRead([id]);
  }

  markMultipleAsRead(ids: string[]): void {
    const lastReadIds = this.store.get("lastReadIds") || [];
    let changed = false;

    for (const id of ids) {
      if (!lastReadIds.includes(id)) {
        lastReadIds.push(id);
        changed = true;
      }
    }

    if (changed) {
      // Keep only last 200 IDs (increased slightly for safety)
      while (lastReadIds.length > 200) lastReadIds.shift();
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

  private garbageCollect() {
    try {
      const itemsMap = this.store.get("items") || {};
      const activeIds = new Set<string>();

      Object.values(itemsMap).forEach((items) => {
        if (Array.isArray(items)) {
          items.forEach((item: NewsItem) => activeIds.add(item.id));
        }
      });

      const contentsMap = this.store.get("contents") || {};
      const nextContents: Record<string, NewsContent> = {};
      let removedCount = 0;

      Object.keys(contentsMap).forEach((id) => {
        if (activeIds.has(id)) {
          nextContents[id] = contentsMap[id];
        } else {
          removedCount++;
        }
      });

      if (removedCount > 0) {
        this.store.set("contents", nextContents);
        this.logger.log(
          `Garbage collection finished. Removed ${removedCount} orphaned contents.`,
        );
      }
    } catch (e) {
      this.logger.error("Failed to run news garbage collection:", e);
    }
  }
}

export const newsService = new NewsService();

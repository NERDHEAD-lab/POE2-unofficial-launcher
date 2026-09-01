import Store from "electron-store";
import { parse } from "node-html-parser";

import { isKakaoInspectionUrlString } from "../../shared/kakao-url-policy";
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
import {
  createKakaoMaintenanceNewsItem,
  extractKakaoMaintenanceInfoFromHtml,
  formatKakaoMaintenanceContent,
} from "../kakao/maintenance-info";
import { Logger } from "../utils/logger";

type ForumNewsCategory = Extract<NewsCategory, "notice" | "patch-notes">;

type NewsRefreshContext = {
  game: AppConfig["activeGame"];
  service: AppConfig["serviceChannel"];
  reason?: string;
  force?: boolean;
};

type NewsRefreshSource =
  | {
      kind: "forum";
      key: string;
      game: AppConfig["activeGame"];
      service: AppConfig["serviceChannel"];
      category: ForumNewsCategory;
    }
  | {
      kind: "dev";
      key: "dev-notice";
    };

type FetchResult = {
  items: NewsItem[];
  changed: boolean;
  refreshed: boolean;
};

const DEV_NOTICE_KEY = "dev-notice";
const FORUM_REFRESH_CATEGORIES: ForumNewsCategory[] = ["notice", "patch-notes"];
const FORUM_REFRESH_COMBINATIONS: Array<{
  game: AppConfig["activeGame"];
  service: AppConfig["serviceChannel"];
}> = [
  { game: "POE1", service: "GGG" },
  { game: "POE2", service: "GGG" },
  { game: "POE1", service: "Kakao Games" },
  { game: "POE2", service: "Kakao Games" },
];

const isForumNewsCategory = (
  category: NewsCategory,
): category is ForumNewsCategory => {
  return category === "notice" || category === "patch-notes";
};

export class NewsService {
  private store: Store<NewsServiceState>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private onUpdated: (() => void) | null = null;
  private isActive = true;
  private hasPendingRefresh = false;
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
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(
      () => void this.refreshDue({ reason: "timer" }),
      NEWS_REFRESH_INTERVAL,
    );
  }

  stop() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  setActive(isActive: boolean, context?: NewsRefreshContext) {
    this.isActive = isActive;

    if (!isActive) {
      this.hasPendingRefresh = true;
      this.logger.log("News refresh suspended while launcher is inactive.");
      return;
    }

    const shouldRefreshOnResume = this.hasPendingRefresh || Boolean(context);
    this.hasPendingRefresh = false;

    if (shouldRefreshOnResume) {
      void this.refreshDue({
        ...context,
        reason: context?.reason ?? "resume",
      });
    }
  }

  async refreshDue(context?: Partial<NewsRefreshContext>): Promise<boolean> {
    const sources = this.getRefreshSources(context);
    const dueSources = sources.filter((source) =>
      context?.force ? true : this.isRefreshDue(source.key),
    );

    if (dueSources.length === 0) {
      this.hasPendingRefresh = false;
      return false;
    }

    if (!this.isActive && !context?.force) {
      this.hasPendingRefresh = true;
      this.logger.log(
        `News refresh deferred (${context?.reason ?? "timer"}): launcher inactive.`,
      );
      return false;
    }

    this.logger.log(
      `News refresh started (${context?.reason ?? "manual"}): ${dueSources
        .map((source) => source.key)
        .join(", ")}`,
    );

    const results = await Promise.all(
      dueSources.map((source) => this.refreshSource(source)),
    );
    const changed = results.some((result) => result.changed);
    const refreshed = results.some((result) => result.refreshed);

    this.hasPendingRefresh = false;
    if (refreshed) {
      this.emitUpdated();
    }

    return changed;
  }

  async refreshAllNews(): Promise<boolean> {
    const sources = this.getAllRefreshSources();

    this.logger.log(
      `News refresh started (manual): ${sources
        .map((source) => source.key)
        .join(", ")}`,
    );

    const results = await Promise.all(
      sources.map((source) => this.refreshSource(source)),
    );
    const changed = results.some((result) => result.changed);
    this.hasPendingRefresh = false;

    // Manual refresh should update timestamps in the renderer even when content is unchanged.
    this.emitUpdated();

    return changed;
  }

  private getRefreshSources(
    context?: Partial<NewsRefreshContext>,
  ): NewsRefreshSource[] {
    const game = context?.game ?? this.lastConfig?.game;
    const service = context?.service ?? this.lastConfig?.service;
    const sources: NewsRefreshSource[] = [{ kind: "dev", key: DEV_NOTICE_KEY }];

    if (!game || !service) {
      return sources;
    }

    for (const category of FORUM_REFRESH_CATEGORIES) {
      sources.push({
        kind: "forum",
        key: this.getForumKey(game, service, category),
        game,
        service,
        category,
      });
    }

    return sources;
  }

  private getAllRefreshSources(): NewsRefreshSource[] {
    const sources: NewsRefreshSource[] = [{ kind: "dev", key: DEV_NOTICE_KEY }];

    for (const { game, service } of FORUM_REFRESH_COMBINATIONS) {
      for (const category of FORUM_REFRESH_CATEGORIES) {
        sources.push({
          kind: "forum",
          key: this.getForumKey(game, service, category),
          game,
          service,
          category,
        });
      }
    }

    return sources;
  }

  private isRefreshDue(key: string): boolean {
    const lastRefreshedAt = this.getLastUpdatedAt(key) ?? 0;
    return Date.now() - lastRefreshedAt >= NEWS_REFRESH_INTERVAL;
  }

  private async refreshSource(source: NewsRefreshSource): Promise<FetchResult> {
    if (source.kind === "dev") {
      return this.fetchDevNoticeList({ notify: false });
    }

    return this.fetchNewsListWithResult(
      source.game,
      source.service,
      source.category,
      {
        notify: false,
        updateLastConfig: false,
      },
    );
  }

  private getForumKey(
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: ForumNewsCategory,
  ) {
    return `${service}-${game}-${category}`;
  }

  private markRefreshed(key: string) {
    const lastUpdatedAt = this.store.get("lastUpdatedAt") || {};
    lastUpdatedAt[key] = Date.now();
    this.store.set("lastUpdatedAt", lastUpdatedAt);
  }

  getLastUpdatedAt(
    keyOrConfig:
      | string
      | {
          game: AppConfig["activeGame"];
          service: AppConfig["serviceChannel"];
          category: NewsCategory;
        },
  ): number | null {
    const key =
      typeof keyOrConfig === "string"
        ? keyOrConfig
        : this.getNewsKey(
            keyOrConfig.game,
            keyOrConfig.service,
            keyOrConfig.category,
          );
    return this.store.get("lastUpdatedAt")?.[key] ?? null;
  }

  private getNewsKey(
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: NewsCategory,
  ) {
    if (category === "dev-notice") {
      return DEV_NOTICE_KEY;
    }

    return `${service}-${game}-${category}`;
  }

  private emitUpdated() {
    this.onUpdated?.();
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
    if (category === "dev-notice") {
      return this.fetchDevNotices();
    }

    if (!isForumNewsCategory(category)) {
      return [];
    }

    const result = await this.fetchNewsListWithResult(game, service, category);
    return result.items;
  }

  private async fetchNewsListWithResult(
    game: AppConfig["activeGame"],
    service: AppConfig["serviceChannel"],
    category: ForumNewsCategory,
    options: { notify?: boolean; updateLastConfig?: boolean } = {},
  ): Promise<FetchResult> {
    const notify = options.notify ?? true;
    const updateLastConfig = options.updateLastConfig ?? true;

    if (updateLastConfig) {
      this.lastConfig = { game, service };
    }

    const key = this.getForumKey(game, service, category);
    const url = NEWS_URL_MAP[key];

    if (!url) return { items: [], changed: false, refreshed: false };

    if (this.fetchLock.has(key)) {
      this.logger.log(`Fetch already in progress for ${key}. Skipping.`);
      return {
        items: this.getCacheItems(key),
        changed: false,
        refreshed: false,
      };
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
      const finalUrl = response.url || url;
      const lastReadIds = this.store.get("lastReadIds");
      const maintenanceInfo =
        service === "Kakao Games" || isKakaoInspectionUrlString(finalUrl)
          ? extractKakaoMaintenanceInfoFromHtml(html, finalUrl)
          : null;

      if (maintenanceInfo) {
        const items = [
          createKakaoMaintenanceNewsItem(
            maintenanceInfo,
            category,
            lastReadIds,
          ),
        ];
        this.updateCache(
          items[0].id,
          formatKakaoMaintenanceContent(maintenanceInfo),
        );

        const cachedItems = this.getCacheItems(key);
        const isChanged = JSON.stringify(cachedItems) !== JSON.stringify(items);

        if (isChanged) {
          const allItems = this.store.get("items");
          allItems[key] = items;
          this.store.set("items", allItems);

          if (notify) this.emitUpdated();
          this.logger.log(`Maintenance notice updated for ${key}.`);
          this.garbageCollect();
        }

        this.markRefreshed(key);
        return { items, changed: isChanged, refreshed: true };
      }

      let table = root.getElementById("view_forum_table");
      if (!table) {
        table = root.querySelector(".forumTable");
      }

      const rows = table ? table.querySelectorAll("tr") : [];
      const items: NewsItem[] = [];

      for (const row of rows) {
        if (items.length >= MAX_NEWS_COUNT) break;

        const titleAnchor = row.querySelector(".title a");
        const dateElement = row.querySelector(".post_date");

        if (titleAnchor) {
          const title = titleAnchor.text.trim();
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
        if (notify) this.emitUpdated();
        this.logger.log(`News updated for ${key}. (New items detected)`);

        // Run garbage collection to clean up orphaned contents
        this.garbageCollect();
      }

      this.logger.log(
        `Successfully fetched ${category} for ${service}-${game}.`,
      );
      this.markRefreshed(key);
      return { items, changed: isChanged, refreshed: true };
    } catch (error) {
      this.logger.error(`Failed to fetch news list for ${key}:`, error);
      return {
        items: this.getCacheItems(key),
        changed: false,
        refreshed: false,
      };
    } finally {
      this.fetchLock.delete(key);
    }
  }

  async fetchDevNotices(): Promise<NewsItem[]> {
    const result = await this.fetchDevNoticeList();
    return result.items;
  }

  private async fetchDevNoticeList(
    options: { notify?: boolean } = {},
  ): Promise<FetchResult> {
    const notify = options.notify ?? true;
    const url = NEWS_URL_MAP["dev-notice"];
    if (!url) return { items: [], changed: false, refreshed: false };

    if (this.fetchLock.has(DEV_NOTICE_KEY)) {
      this.logger.log("Fetch already in progress for dev-notice. Skipping.");
      return {
        items: this.getCacheItems(DEV_NOTICE_KEY),
        changed: false,
        refreshed: false,
      };
    }

    this.fetchLock.add(DEV_NOTICE_KEY);
    this.logger.log("Fetching developer notices...");

    try {
      const response = await this.fetchWithRetry(url, {
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await response.json();

      if (!Array.isArray(data)) {
        this.logger.warn("Dev notices data is not an array.");
        return {
          items: this.getCacheItems(DEV_NOTICE_KEY),
          changed: false,
          refreshed: false,
        };
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

      // Sort: Priority (Sticky) first, then by date descending
      const sortedItems = items
        .sort((a, b) => {
          if (a.isSticky && !b.isSticky) return -1;
          if (!a.isSticky && b.isSticky) return 1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        })
        .slice(0, MAX_NEWS_COUNT);

      const cachedItems = this.getCacheItems(DEV_NOTICE_KEY);
      const isChanged =
        JSON.stringify(cachedItems) !== JSON.stringify(sortedItems);
      const allItems = this.store.get("items");
      allItems[DEV_NOTICE_KEY] = sortedItems;
      this.store.set("items", allItems);
      this.markRefreshed(DEV_NOTICE_KEY);

      if (isChanged) {
        this.logger.log(
          `Successfully fetched ${sortedItems.length} developer notices.`,
        );
        if (notify) this.emitUpdated();
      }

      return { items: sortedItems, changed: isChanged, refreshed: true };
    } catch (error) {
      this.logger.error("Failed to fetch dev notices:", error);
      return {
        items: this.getCacheItems(DEV_NOTICE_KEY),
        changed: false,
        refreshed: false,
      };
    } finally {
      this.fetchLock.delete(DEV_NOTICE_KEY);
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
      const maintenanceInfo = extractKakaoMaintenanceInfoFromHtml(
        html,
        response.url || link,
      );

      if (maintenanceInfo) {
        const cleanHtml = formatKakaoMaintenanceContent(maintenanceInfo);
        this.updateCache(id, cleanHtml);
        return cleanHtml;
      }

      const isMarkdown =
        link.toLowerCase().endsWith(".md") ||
        id.startsWith("dev-notice-") ||
        !link.includes("forum/view-thread");

      if (isMarkdown) {
        // For Markdown files, we return the raw content without HTML parsing
        this.logger.log(`Detected Markdown content for ${id}. Processing...`);

        let processedContent = html.trim();

        // Path transformation for relative images (Issue fix)
        // Extract base directory from the link (e.g., https://.../notice/file.md -> https://.../notice/)
        const baseUrl = link.substring(0, link.lastIndexOf("/") + 1);

        // 1. Transform Markdown image syntax: ![alt](relative-path)
        processedContent = processedContent.replace(
          /(!\[.*?\]\()((?!(?:http|https|data):).*?)(\))/g,
          (_, prefix, path, suffix) => {
            const absolutePath = path.startsWith("/")
              ? new URL(path, new URL(link).origin).toString()
              : baseUrl + path;
            this.logger
              .silent()
              .log(`Transforming image path: ${path} -> ${absolutePath}`);
            return `${prefix}${absolutePath}${suffix}`;
          },
        );

        // 2. Transform HTML img tags: <img src="relative-path">
        processedContent = processedContent.replace(
          /(<img\s+[^>]*src=["'])((?!(?:http|https|data):).*?)(["'][^>]*>)/gi,
          (_, prefix, path, suffix) => {
            const absolutePath = path.startsWith("/")
              ? new URL(path, new URL(link).origin).toString()
              : baseUrl + path;
            this.logger
              .silent()
              .log(`Transforming img tag src: ${path} -> ${absolutePath}`);
            return `${prefix}${absolutePath}${suffix}`;
          },
        );

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

      let cleanHtml = "";

      if (!content) {
        // 대체제 (.lbox-container 조각들) 확인 및 병합 시도
        const lboxContainers = root.querySelectorAll(".lbox-container");
        if (lboxContainers.length > 0) {
          this.logger.log(
            `[NewsService] Basic content selector missed for post ${id}. ` +
              `Falling back to merging ${lboxContainers.length} .lbox-container elements.`,
          );

          const unwantedSelectors = [
            ".post_author_info",
            ".report_button",
            ".content-footer",
            ".social-buttons",
            "script",
            "style",
          ];

          lboxContainers.forEach((container) => {
            unwantedSelectors.forEach((sel) => {
              container.querySelectorAll(sel).forEach((el) => el.remove());
            });
          });

          cleanHtml = lboxContainers
            .map((container) => container.innerHTML.trim())
            .join("\n");
        } else {
          // 대체제도 없는 최종적인 구조 붕괴 상황에만 예외 발생
          throw new Error(
            `게시글 본문(content) 및 대체 컨테이너(lbox-container)를 모두 찾을 수 없습니다. (HTML 구조 붕괴 또는 글 삭제)\n` +
              `Target URL: ${link}\n` +
              `Tested Selectors: .forumPost .content, .newsPost .content, .content-container .content, .lbox-container`,
          );
        }
      } else {
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
        cleanHtml = content.innerHTML.trim();
      }

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

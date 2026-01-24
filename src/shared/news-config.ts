import { BASE_URLS, FORUM_URLS } from "./urls";

export const MAX_NEWS_COUNT = 5;
export const NEWS_REFRESH_INTERVAL = 1000 * 60 * 30; // 30 minutes

// Deprecated: Uses BASE_URLS from ./urls instead if needed, but keeping for compatibility if direct access is used elsewhere
export const GGG_BASE_URL = BASE_URLS.GGG.POE1;
export const KAKAO_BASE_URL = BASE_URLS["Kakao Games"].POE1;

export const NEWS_URL_MAP: Record<string, string> = {
  "GGG-POE2-notice": `${FORUM_URLS.GGG}/2211`,
  "GGG-POE2-patch-notes": `${FORUM_URLS.GGG}/2212`,
  "Kakao Games-POE2-notice": `${FORUM_URLS["Kakao Games"]}/news2`,
  "Kakao Games-POE2-patch-notes": `${FORUM_URLS["Kakao Games"]}/patch-notes2`,
  "GGG-POE1-notice": `${FORUM_URLS.GGG}/news`,
  "GGG-POE1-patch-notes": `${FORUM_URLS.GGG}/patch-notes`,
  "Kakao Games-POE1-notice": `${FORUM_URLS["Kakao Games"]}/news`,
  "Kakao Games-POE1-patch-notes": `${FORUM_URLS["Kakao Games"]}/patch-notes`,
  "dev-notice":
    "https://nerdhead-lab.github.io/POE2-quick-launch-for-kakao/notice/list.json",
};

export const NEWS_CACHE_STORE_NAME = "news-cache";

export const NEWS_CACHE_DEFAULTS = {
  items: {},
  contents: {},
  lastReadIds: [],
};

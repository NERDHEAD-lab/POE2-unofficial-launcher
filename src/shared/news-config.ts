export const MAX_NEWS_COUNT = 5;
export const NEWS_REFRESH_INTERVAL = 1000 * 60 * 30; // 30 minutes

export const GGG_BASE_URL = "https://www.pathofexile.com";
export const KAKAO_BASE_URL = "https://poe.game.daum.net";

export const NEWS_URL_MAP: Record<string, string> = {
  "GGG-POE2-notice": `${GGG_BASE_URL}/forum/view-forum/2211`,
  "GGG-POE2-patch-notes": `${GGG_BASE_URL}/forum/view-forum/2212`,
  "Kakao Games-POE2-notice": `${KAKAO_BASE_URL}/forum/view-forum/news2`,
  "Kakao Games-POE2-patch-notes": `${KAKAO_BASE_URL}/forum/view-forum/patch-notes2`,
  "GGG-POE1-notice": `${GGG_BASE_URL}/forum/view-forum/news`,
  "GGG-POE1-patch-notes": `${GGG_BASE_URL}/forum/view-forum/patch-notes`,
  "Kakao Games-POE1-notice": `${KAKAO_BASE_URL}/forum/view-forum/news`,
  "Kakao Games-POE1-patch-notes": `${KAKAO_BASE_URL}/forum/view-forum/patch-notes`,
  "dev-notice":
    "https://nerdhead-lab.github.io/POE2-quick-launch-for-kakao/notice/list.json",
};

export const NEWS_CACHE_STORE_NAME = "news-cache";

export const NEWS_CACHE_DEFAULTS = {
  items: {},
  contents: {},
  lastReadIds: [],
};

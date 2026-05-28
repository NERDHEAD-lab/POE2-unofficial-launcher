import { AppConfig } from "./types";

// Common Type for Service -> Game mapping
type ServiceGameMap<T = string> = Record<
  AppConfig["serviceChannel"],
  Record<AppConfig["activeGame"], T>
>;

// 1. Base Domain URLs
export const BASE_URLS: ServiceGameMap = {
  GGG: {
    POE1: "https://www.pathofexile.com",
    POE2: "https://pathofexile2.com",
  },
  "Kakao Games": {
    POE1: "https://poe.game.daum.net",
    POE2: "https://pathofexile2.game.daum.net",
  },
};

// 2. Download Page Mapping
export const DOWNLOAD_URLS: ServiceGameMap = {
  GGG: {
    POE1: "https://www.pathofexile.com/download",
    POE2: "https://pathofexile2.com/download",
  },
  "Kakao Games": {
    POE1: "https://poe.game.daum.net/kr/download",
    POE2: "https://poe2.game.daum.net/download",
  },
};

// 3. News & Forum Base URLs
// Forums bases are per-service (GGG shares domain, Kakao shares domain)
export const FORUM_URLS: Record<AppConfig["serviceChannel"], string> = {
  GGG: "https://www.pathofexile.com/forum/view-forum",
  "Kakao Games": "https://poe.game.daum.net/forum/view-forum",
};

// 4. Support & External Links
export const SUPPORT_URLS = {
  EMAIL: __APP_AUTHOR_EMAIL__,
  DONATION:
    "https://nerdhead-lab.github.io/POE2-unofficial-launcher?docs=SUPPORT_KR.md",
  DISCORD_INVITE: "https://discord.gg/aYrPYdvGEn",
  DISCORD_ERRORS:
    "https://discord.com/channels/1455427555883749439/1479304995940733019",
  DISCORD_SUGGESTIONS:
    "https://discord.com/channels/1455427555883749439/1479304951313469621",
  ISSUES: "https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/issues",
  GITHUB_REPO: "https://github.com/NERDHEAD-lab/POE2-unofficial-launcher",
  LATEST_VERSIONS_JSON:
    "https://nerdhead-lab.github.io/POE2-unofficial-launcher/latest-versions.json",
  THEMES_JSON:
    "https://nerdhead-lab.github.io/POE2-unofficial-launcher/themes.json",
  ASSETS_BASE: "https://nerdhead-lab.github.io/POE2-unofficial-launcher/",
};

// 5. Trade Site URLs
export const TRADE_URLS: ServiceGameMap = {
  GGG: {
    POE1: "https://www.pathofexile.com/trade",
    POE2: "https://www.pathofexile.com/trade2",
  },
  "Kakao Games": {
    POE1: "https://poe.game.daum.net/trade",
    POE2: "https://poe.game.daum.net/trade2",
  },
};

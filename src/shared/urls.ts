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
  DONATION:
    "https://nerdhead-lab.github.io/POE2-quick-launch-for-kakao?docs=SUPPORT.md",
  ISSUES: "https://github.com/NERDHEAD-lab/POE2-quick-launch-for-kakao/issues",
  GITHUB_REPO: "https://github.com/NERDHEAD-lab/POE2-unofficial-launcher",
};

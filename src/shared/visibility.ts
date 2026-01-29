export interface VisibilityRule {
  name: string;
  /** Condition to identify user-facing windows (No debug border / Show immediately) */
  match: (url: URL) => boolean;
}

/**
 * List of rules defining pages that are naturally visible to the user
 * (i.e., windows that show even when "Show Inactive Windows" is OFF).
 */
export const VISIBILITY_RULES: VisibilityRule[] = [
  {
    name: "KakaoAccountLogin",
    match: (url) =>
      url.hostname === "accounts.kakao.com" &&
      !url.pathname.includes("/login/simple"),
  },
];

/**
 * Common logic to check if a URL is for a user-facing page.
 */
export function isUserFacingPage(url: string | URL): boolean {
  try {
    const parsedUrl = typeof url === "string" ? new URL(url) : url;
    return VISIBILITY_RULES.some((rule) => rule.match(parsedUrl));
  } catch {
    return false;
  }
}

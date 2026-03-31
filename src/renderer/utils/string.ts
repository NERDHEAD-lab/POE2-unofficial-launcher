/**
 * Filters out technical commit hash links from the changelog body.
 * Pattern: " ([hash](github_url))"
 */
export const filterChangelogBody = (body: string): string => {
  return body
    .replace(/^##\s*\[v?[\d.]+\]\(.*?\)\s*\(.*?\)\s*\n?/gm, "") // Remove H2 version header with link (e.g., ## [0.6.3](...) (2026-02-03))
    .replace(
      / \(\[[0-9a-f]+\]\(https:\/\/github\.com\/.*?\/commit\/[0-9a-f]+\)\)/g,
      "",
    ); // Remove commit hash links
};

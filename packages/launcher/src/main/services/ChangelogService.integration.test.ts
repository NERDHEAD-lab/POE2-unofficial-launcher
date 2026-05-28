import { describe, it, expect } from "vitest";

import { changelogService } from "./ChangelogService";

// NOTE: This test hits the REAL GitHub API.
// It requires an internet connection and consumes rate limits (60/hr for unauthenticated).
describe("ChangelogService Integration (Real Network)", () => {
  it("should fetch real releases from GitHub", async () => {
    // Fetch all releases since v0.0.0 up to a future version
    // This ensures we get practically all releases
    const releases = await changelogService.fetchChangelogs("99.9.9", "0.0.0");

    console.log("Found Releases count:", releases.length);
    if (releases.length > 0) {
      console.log("Latest Release:", releases[0].version);
      console.log("Latest Body Snippet:", releases[0].body.substring(0, 100));
    }

    // We expect at least one release to exist if the repo has releases
    // If the repo is new/empty, this might fail, but for NERDHEAD-lab/POE2-unofficial-launcher it should pass.
    expect(Array.isArray(releases)).toBe(true);
    expect(releases.length).toBeGreaterThan(0); // [Active] Assert we found data
  });
});

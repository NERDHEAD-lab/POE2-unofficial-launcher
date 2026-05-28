import axios from "axios";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { changelogService } from "./ChangelogService";

// Mock axios
vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("ChangelogService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockReleases = [
    {
      tag_name: "v1.0.2",
      name: "v1.0.2",
      published_at: "2024-01-03T00:00:00Z",
      body: "Fix bug B",
      html_url: "http://github.com/v1.0.2",
      draft: false,
      prerelease: false,
    },
    {
      tag_name: "v1.0.1",
      name: "v1.0.1",
      published_at: "2024-01-02T00:00:00Z",
      body: "Feature A",
      html_url: "http://github.com/v1.0.1",
      draft: false,
      prerelease: false,
    },
    {
      tag_name: "v1.0.0",
      name: "v1.0.0",
      published_at: "2024-01-01T00:00:00Z",
      body: "Initial Release",
      html_url: "http://github.com/v1.0.0",
      draft: false,
      prerelease: false,
    },
  ];

  it("should fetch and filter releases correctly (middle update)", async () => {
    // Scenario: Updating from v1.0.0 to v1.0.2
    // Expected: v1.0.1 and v1.0.2 should be returned. v1.0.0 should be excluded.
    mockedAxios.get.mockResolvedValue({ data: mockReleases });

    const result = await changelogService.fetchChangelogs("1.0.2", "1.0.0");

    expect(result).toHaveLength(2);
    expect(result[0].version).toBe("v1.0.2");
    expect(result[1].version).toBe("v1.0.1");
    // Ensure body is preserved
    expect(result[0].body).toBe("Fix bug B");
  });

  it("should return empty list if no new versions found", async () => {
    // Scenario: Re-installing same version v1.0.2 -> v1.0.2
    mockedAxios.get.mockResolvedValue({ data: mockReleases });

    const result = await changelogService.fetchChangelogs("1.0.2", "1.0.2");

    expect(result).toHaveLength(0);
  });

  it("should handle error gracefully", async () => {
    mockedAxios.get.mockRejectedValue(new Error("Network Error"));

    const result = await changelogService.fetchChangelogs("1.0.2", "1.0.0");

    expect(result).toEqual([]);
  });

  it("should ignore drafts", async () => {
    const drafts = [
      {
        tag_name: "v1.0.3",
        name: "v1.0.3",
        draft: true, // Should be ignored
        prerelease: false,
        published_at: "2024-01-04T00:00:00Z",
        body: "Draft",
        html_url: "http://github.com/draft",
      },
      ...mockReleases,
    ];
    mockedAxios.get.mockResolvedValue({ data: drafts });

    const result = await changelogService.fetchChangelogs("1.0.3", "1.0.0");

    // Should include 1.0.2, 1.0.1. Should NOT include 1.0.3 (draft)
    expect(result).toHaveLength(2);
    expect(result[0].version).toBe("v1.0.2");
  });
});

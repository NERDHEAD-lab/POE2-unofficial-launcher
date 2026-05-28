import axios from "axios";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetchGhPagesWebRoot } from "../utils/version-sources/ghPagesLatest";

vi.mock("axios");

const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

describe("fetchGhPagesWebRoot", () => {
  beforeEach(() => {
    mockedAxios.get = vi.fn();
  });

  it("returns webRoot for known game", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: {
        POE1: {
          version: "3.28.0.6.2",
          webRoot: "https://poe.gdn.gamecdn.net/live/patch/3.28.0.6.2/",
          timestamp: 1,
        },
        POE2: {
          version: "4.4.0.10",
          webRoot:
            "https://patch.poe2.kakaogames.com/production/patch/4.4.0.10/",
          timestamp: 2,
        },
      },
    });
    await expect(fetchGhPagesWebRoot("POE2")).resolves.toEqual({
      webRoot: "https://patch.poe2.kakaogames.com/production/patch/4.4.0.10/",
    });
  });

  it("throws missing-game when entry absent", async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: {} });
    await expect(fetchGhPagesWebRoot("POE1")).rejects.toMatchObject({
      name: "GhPagesError",
      code: "missing-game",
    });
  });

  it("throws missing-webroot when entry has no webRoot field", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { POE1: { version: "x", timestamp: 0 } },
    });
    await expect(fetchGhPagesWebRoot("POE1")).rejects.toMatchObject({
      code: "missing-webroot",
    });
  });

  it("wraps network errors as network", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(fetchGhPagesWebRoot("POE1")).rejects.toMatchObject({
      code: "network",
    });
  });
});

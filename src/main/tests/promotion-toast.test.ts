import { describe, expect, it } from "vitest";

import { buildPromotionToast } from "../services/promotion-toast";

import type { PromotionEvent } from "../../shared/promotions";

const event: PromotionEvent = {
  id: "ggg-1-stash",
  kind: "stash-sale",
  game: "both",
  startsAt: "2026-09-04T00:00:00Z",
  endsAt: "2026-09-08T00:00:00Z",
  sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
  precision: "exact",
};
describe("Windows promotion XML", () => {
  it("restricts API-confirmed shop buttons to observed targets and opens the shop from the body", () => {
    const document = new DOMParser().parseFromString(
      buildPromotionToast({
        ...event,
        sourceUrl:
          "https://poe2.kakaogames.com/api/shop-microtransactions?game=poe2",
        targets: [{ service: "kakao", game: "poe2" }],
      }),
      "text/xml",
    );
    expect(document.querySelectorAll("action")).toHaveLength(1);
    expect(document.querySelector("action")?.getAttribute("content")).toBe(
      "Kakao POE2",
    );
    expect(document.querySelector("toast")?.getAttribute("launch")).toBe(
      "https://poe2.kakaogames.com/shop/stash-tabs",
    );
  });
  it("renders four independent protocol actions with the exact Kakao PoE2 shop", () => {
    const document = new DOMParser().parseFromString(
      buildPromotionToast(event),
      "text/xml",
    );
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelectorAll("action")).toHaveLength(4);
    expect(
      [...document.querySelectorAll("action")].every(
        (x) => x.getAttribute("activationType") === "protocol",
      ),
    ).toBe(true);
    expect(
      document
        .querySelector('action[content="Kakao POE2"]')
        ?.getAttribute("arguments"),
    ).toBe("https://poe2.kakaogames.com/shop/stash-tabs");
    expect(document.querySelector("text")?.textContent).toContain(
      "보관함 할인 진행 중 (",
    );
    expect(document.querySelector("toast")?.getAttribute("launch")).toBe(
      event.sourceUrl,
    );
  });
  it.each([
    [undefined, "https://www.twitch.tv/directory/category/path-of-exile-2"],
    [
      "https://www.twitch.tv/directory/category/new-event?lang=ko&from=launcher",
      "https://www.twitch.tv/directory/category/new-event?lang=ko&from=launcher",
    ],
  ])(
    "opens the same watching URL from the Twitch body and action (%s)",
    (watchUrl, destination) => {
      const document = new DOMParser().parseFromString(
        buildPromotionToast({
          ...event,
          kind: "twitch-drops",
          game: "poe2",
          watchUrl,
        }),
        "text/xml",
      );
      expect(document.querySelector("parsererror")).toBeNull();
      expect(document.querySelectorAll("action")).toHaveLength(1);
      expect(document.querySelector("action")?.getAttribute("arguments")).toBe(
        destination,
      );
      expect(document.querySelector("toast")?.getAttribute("launch")).toBe(
        destination,
      );
      expect(document.querySelector("action")?.getAttribute("content")).toBe(
        "Twitch에서 시청",
      );
    },
  );
});

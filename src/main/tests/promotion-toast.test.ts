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
  it("uses one game-specific Twitch action and escapes XML attributes", () => {
    const sourceUrl = 'https://www.pathofexile.com/forum/view-thread/1?x="<&';
    const document = new DOMParser().parseFromString(
      buildPromotionToast({
        ...event,
        kind: "twitch-drops",
        game: "poe2",
        sourceUrl,
      }),
      "text/xml",
    );
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelectorAll("action")).toHaveLength(1);
    expect(document.querySelector("action")?.getAttribute("arguments")).toBe(
      "https://www.twitch.tv/directory/category/path-of-exile-2",
    );
    expect(document.querySelector("toast")?.getAttribute("launch")).toBe(
      sourceUrl,
    );
  });
});

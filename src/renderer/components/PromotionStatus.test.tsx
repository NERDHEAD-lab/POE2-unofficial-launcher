import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PromotionStatus from "./PromotionStatus";
import { stashSection } from "../../shared/test-fixtures/stash-sales";

import type { PromotionEvent } from "../../shared/promotions";
import type {
  ActiveGame,
  ElectronAPI,
  ServiceChannel,
} from "../../shared/types";

const drops: PromotionEvent = {
  id: "qa-drops",
  kind: "twitch-drops",
  game: "poe1",
  startsAt: "2026-09-04T00:00:00Z",
  endsAt: "2026-09-05T00:00:00Z",
  sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
  precision: "exact",
};
const stash: PromotionEvent = {
  ...drops,
  id: "qa-stash",
  kind: "stash-sale",
  game: "both",
};

describe("promotion status shortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-09-04T01:00:00Z");
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.electronAPI = {
      getPromotions: vi.fn().mockResolvedValue({
        revision: 1,
        events: [],
        activeEvents: [drops, stash],
        upcomingEvents: [],
      }),
      onPromotionsUpdated: vi.fn(() => vi.fn()),
    } as unknown as ElectronAPI;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
  const render = async (
    serviceChannel: ServiceChannel,
    activeGame: ActiveGame,
  ) =>
    act(async () =>
      root.render(
        <PromotionStatus
          serviceChannel={serviceChannel}
          activeGame={activeGame}
        />,
      ),
    );

  it.each([
    ["GGG", "POE1", "https://www.pathofexile.com/shop/category/stash-tabs"],
    ["GGG", "POE2", "https://pathofexile2.com/shop/stash-tabs"],
    [
      "Kakao Games",
      "POE1",
      "https://poe.kakaogames.com/shop/category/stash-tabs",
    ],
    ["Kakao Games", "POE2", "https://poe2.kakaogames.com/shop/stash-tabs"],
  ] as const)(
    "opens the %s %s shop independently of dismissed notifications",
    async (service, game, url) => {
      await render(service, game);
      const label = container.querySelector(".news-open-mode-label");
      expect(label?.textContent).toBe("이달의 주요 소식");
      expect(label?.tagName).toBe("SPAN");
      expect(label?.closest("a")).toBeNull();
      expect(
        container
          .querySelector('[data-promotion-status="stash-sale"] a')
          ?.getAttribute("href"),
      ).toBe(url);
      expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
        2,
      );
      // Only PoE 1 drops exist; selecting PoE 2 must still show those drops.
      expect(
        container
          .querySelector('[data-promotion-status="twitch-drops"] a')
          ?.getAttribute("href"),
      ).toBe("https://www.twitch.tv/directory/category/path-of-exile");
      expect(container.textContent).toContain("PoE 1 트위치 드롭스");
    },
  );
  it("stops highlighting and linking expired events without a new IPC snapshot", async () => {
    await render("GGG", "POE2");
    vi.setSystemTime(drops.endsAt);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      0,
    );
    expect(container.querySelectorAll(".promotion-buff-slot a")).toHaveLength(
      0,
    );
    expect(container.textContent).toContain("예정된 일정이 없습니다");
  });

  it("does not expand a confirmed service/game pair to other shops", async () => {
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [],
      activeEvents: [
        { ...stash, targets: [{ service: "kakao", game: "poe2" }] },
      ],
      upcomingEvents: [],
    });
    for (const [service, game] of [
      ["GGG", "POE1"],
      ["GGG", "POE2"],
      ["Kakao Games", "POE1"],
    ] as const) {
      await render(service, game);
      expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
        0,
      );
    }
    await render("Kakao Games", "POE2");
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      1,
    );
  });

  it("shows estimated dates without activating at their start and expires them locally", async () => {
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [],
      activeEvents: [],
      upcomingEvents: [],
      stashEstimate: stashSection.nextEstimate,
    });
    await render("GGG", "POE2");
    expect(container.textContent).toContain("다음 예상 일정");
    expect(container.textContent).toContain("9/11 ~ 9/15");
    vi.setSystemTime("2026-09-11T01:00:00Z");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      0,
    );
    expect(container.querySelectorAll(".promotion-buff-slot a")).toHaveLength(
      0,
    );
    vi.setSystemTime("2026-09-15T15:00:00Z");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).not.toContain("9/11 ~ 9/15");
  });

  it("shows the earliest upcoming schedule on inactive icons and activates at its start", async () => {
    const next = { ...drops, startsAt: "2026-09-04T02:00:00Z" };
    const later = {
      ...drops,
      id: "later",
      game: "poe2",
      startsAt: "2026-09-04T03:00:00Z",
    };
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [],
      activeEvents: [],
      upcomingEvents: [later, next],
    });
    await render("Kakao Games", "POE2");
    const tip = container.querySelector(
      '[data-promotion-status="twitch-drops"] [role="tooltip"]',
    )!;
    expect(tip.textContent).toContain("다음 이벤트");
    expect(tip.textContent).toContain("PoE 1 트위치 드롭스");
    expect(tip.textContent).not.toContain("PoE 2 트위치 드롭스");
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      0,
    );
    expect(container.querySelectorAll(".promotion-buff-slot a")).toHaveLength(
      0,
    );
    vi.setSystemTime(next.startsAt);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      1,
    );
    expect(
      container.querySelector(".promotion-buff-slot a")?.getAttribute("href"),
    ).toBe("https://www.twitch.tv/directory/category/path-of-exile");
  });
});

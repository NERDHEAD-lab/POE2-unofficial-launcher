import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PromotionStatus from "./PromotionStatus";
import { stashSection } from "../../shared/test-fixtures/stash-sales";

import type {
  PromotionEvent,
  PromotionSnapshot,
} from "../../shared/promotions";
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
const sharedDrops: PromotionEvent = {
  ...drops,
  id: "ggg-4012689-twitch-591814b46c-poe1",
  title: "ExileCon 트위치 드롭스",
  sourceUrl: "https://www.pathofexile.com/forum/view-thread/4012689",
  watchUrl: "https://www.twitch.tv/directory/category/exilecon",
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

  it("updates the active shortcut to the supplied URL on a newer snapshot", async () => {
    let update!: (snapshot: PromotionSnapshot) => void;
    window.electronAPI.onPromotionsUpdated = vi.fn((callback) => {
      update = callback;
      return vi.fn();
    });
    await render("GGG", "POE1");
    const watchUrl = "https://www.twitch.tv/directory/category/new-event";
    await act(async () =>
      update({
        revision: 2,
        events: [],
        activeEvents: [{ ...drops, watchUrl }],
        upcomingEvents: [],
      }),
    );
    const link = container.querySelector(
      '[data-promotion-status="twitch-drops"] a',
    );
    expect(link?.getAttribute("href")).toBe(watchUrl);
    expect(link?.getAttribute("aria-label")).toBe(
      "트위치 드롭스 진행 중 · Twitch에서 시청",
    );
  });

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
        game === "POE1" ? 2 : 1,
      );
      expect(
        container
          .querySelector('[data-promotion-status="twitch-drops"] a')
          ?.getAttribute("href"),
      ).toBe(
        game === "POE1"
          ? "https://www.twitch.tv/directory/category/path-of-exile"
          : undefined,
      );
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
    expect(container.querySelector(".promotion-buff.upcoming")).toBeNull();
    expect(container.textContent).not.toContain("뒤부터 시작합니다");
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

  it("enters the yellow upcoming state at 24h, updates actual seconds and activates at the start", async () => {
    const start = Date.parse(drops.startsAt);
    vi.setSystemTime(start - 86400_000 - 1000);
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [],
      activeEvents: [],
      upcomingEvents: [drops],
    });
    await render("GGG", "POE1");
    expect(container.querySelector(".promotion-buff.upcoming")).toBeNull();
    expect(container.querySelector(".promotion-buff-slot a")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelectorAll(".promotion-buff.upcoming")).toHaveLength(
      1,
    );
    const futureLink = container.querySelector<HTMLAnchorElement>(
      ".promotion-buff-slot a",
    )!;
    expect(futureLink.href).toBe(
      "https://www.twitch.tv/directory/category/path-of-exile",
    );
    expect(futureLink.target).toBe("_blank");
    expect(futureLink.rel).toBe("noreferrer");
    expect(futureLink.getAttribute("aria-label")).toBe(
      "트위치 드롭스 시작 예정 · Twitch에서 시청",
    );
    expect(container.textContent).toContain("24시간 0분 0초 뒤부터 시작합니다");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).toContain(
      "23시간 59분 59초 뒤부터 시작합니다",
    );
    vi.setSystemTime(start - 1500);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).toContain("0시간 0분 1초 뒤부터 시작합니다");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelector(".promotion-buff.upcoming")).toBeNull();
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      1,
    );
    expect(container.querySelector(".promotion-buff-slot a")).not.toBeNull();
    expect(container.textContent).not.toContain("뒤부터 시작합니다");
    expect(container.textContent).toContain("24시간 0분 0초 뒤에 종료됩니다");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).toContain("23시간 59분 59초 뒤에 종료됩니다");
    vi.setSystemTime(drops.endsAt);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).not.toContain("뒤에 종료됩니다");
    expect(container.querySelector(".promotion-buff-slot a")).toBeNull();
  });

  it("gives an active schedule priority over another upcoming schedule", async () => {
    const activeWatchUrl = "https://www.twitch.tv/active-event";
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [],
      activeEvents: [{ ...drops, watchUrl: activeWatchUrl }],
      upcomingEvents: [
        {
          ...drops,
          id: "next",
          watchUrl: "https://www.twitch.tv/upcoming-event",
          startsAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      ],
    });
    await render("GGG", "POE1");
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      1,
    );
    expect(container.querySelector(".promotion-buff.upcoming")).toBeNull();
    expect(container.textContent).not.toContain("뒤부터 시작합니다");
    expect(
      container.querySelector(".promotion-buff-slot a")?.getAttribute("href"),
    ).toBe(activeWatchUrl);
  });

  it("switches only the selected game's title, countdown, 24h state and watching link", async () => {
    const next = {
      ...drops,
      title: "Raven 트위치 드롭스",
      watchUrl: "https://www.twitch.tv/poe1event",
      startsAt: "2026-09-05T02:00:00Z",
      endsAt: "2026-09-06T00:00:00Z",
    };
    const later = {
      ...drops,
      id: "later",
      game: "poe2",
      title: "Moon 트위치 드롭스",
      watchUrl: "https://www.twitch.tv/poe2event",
      startsAt: "2026-09-04T02:00:00Z",
    };
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [],
      activeEvents: [],
      upcomingEvents: [later, next],
    });
    await render("Kakao Games", "POE1");
    const tip = container.querySelector(
      '[data-promotion-status="twitch-drops"] [role="tooltip"]',
    )!;
    expect(tip.textContent).toContain("적용 게임: PoE1");
    expect(tip.textContent).not.toContain("PoE2");
    expect(tip.textContent).toContain("Raven 트위치 드롭스");
    expect(tip.textContent).not.toContain("Moon 트위치 드롭스");
    expect(tip.textContent).toContain("25시간 0분 0초");
    expect(container.querySelector(".promotion-buff.upcoming")).toBeNull();
    expect(container.querySelector(".promotion-buff-slot a")).toBeNull();
    await render("Kakao Games", "POE2");
    expect(tip.textContent).toContain("적용 게임: PoE2");
    expect(tip.textContent).not.toContain("PoE1");
    expect(tip.textContent).toContain("Moon 트위치 드롭스");
    expect(tip.textContent).not.toContain("Raven 트위치 드롭스");
    expect(tip.textContent).toContain("1시간 0분 0초");
    expect(container.querySelectorAll(".promotion-buff.upcoming")).toHaveLength(
      1,
    );
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      0,
    );
    expect(
      container.querySelector(".promotion-buff-slot a")?.getAttribute("href"),
    ).toBe(later.watchUrl);
    vi.setSystemTime(later.startsAt);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelectorAll(".promotion-buff.active")).toHaveLength(
      1,
    );
    expect(
      container.querySelector(".promotion-buff-slot a")?.getAttribute("href"),
    ).toBe(later.watchUrl);
    await render("GGG", "POE1");
    expect(
      container.querySelector(".promotion-buff-slot a")?.getAttribute("href"),
    ).toBe(next.watchUrl);
    expect(tip.textContent).toContain("23시간 59분 59초");
    vi.setSystemTime(next.startsAt);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(
      container.querySelector(".promotion-buff-slot a")?.getAttribute("href"),
    ).toBe(next.watchUrl);
  });

  it("keeps another game's active and upcoming schedules out of the selected toolbar", async () => {
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [drops],
      activeEvents: [{ ...drops, title: "Other active" }],
      upcomingEvents: [
        {
          ...drops,
          id: "other-upcoming",
          title: "Other upcoming",
          startsAt: "2026-09-04T02:00:00Z",
        },
      ],
    });
    await render("GGG", "POE2");
    const slot = container.querySelector(
      '[data-promotion-status="twitch-drops"]',
    )!;
    expect(slot.querySelector(".active, .upcoming, a")).toBeNull();
    expect(slot.textContent).toContain("예정된 일정이 없습니다");
    expect(slot.textContent).not.toContain("Other");
  });

  it.each(["suffix", "bare", "alias"])(
    "shows the verified shared scope with ID form=%s while retaining one selected-game row and link",
    async (form) => {
      const pair: PromotionEvent[] = [
        {
          ...sharedDrops,
          id:
            form === "alias"
              ? "ggg-7-twitch-0123456789"
              : form === "bare"
                ? "ggg-4012689-twitch-591814b46c"
                : sharedDrops.id,
          ...(form === "alias"
            ? { sourceGroupId: "ggg-4012689-twitch-591814b46c" }
            : {}),
        },
        {
          ...sharedDrops,
          id: "ggg-4012689-twitch-591814b46c-poe2",
          game: "poe2",
          startsAt: "2026-09-04T00:00:00.000Z",
          sourceUrl: `${sharedDrops.sourceUrl}/filter-account-type/staff`,
          ...(form === "alias"
            ? { sourceGroupId: "ggg-4012689-twitch-591814b46c" }
            : {}),
        },
      ];
      vi.setSystemTime(Date.parse(sharedDrops.startsAt) - 1000);
      window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
        revision: 1,
        events: [],
        activeEvents: [],
        upcomingEvents: pair,
      });
      for (const game of ["POE1", "POE2"] as const) {
        await render("GGG", game);
        const tip = container.querySelector(
          '[data-promotion-status="twitch-drops"] [role="tooltip"]',
        )!;
        expect(tip.querySelectorAll("strong")).toHaveLength(1);
        const lines = [...tip.firstElementChild!.children].map(
          (line) => line.textContent,
        );
        expect(lines).toEqual([
          "ExileCon 트위치 드롭스",
          "적용 게임: PoE1 · PoE2",
          expect.stringContaining(" ~ "),
          "0시간 0분 1초 뒤부터 시작합니다",
        ]);
      }
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      for (const game of ["POE1", "POE2"] as const) {
        await render("GGG", game);
        const slot = container.querySelector(
          '[data-promotion-status="twitch-drops"]',
        )!;
        expect(slot.querySelectorAll("strong")).toHaveLength(1);
        expect(slot.textContent).toContain("적용 게임: PoE1 · PoE2");
        expect(slot.textContent).toContain("24시간 0분 0초 뒤에 종료됩니다");
        expect(slot.querySelector("a")?.getAttribute("href")).toBe(
          sharedDrops.watchUrl,
        );
      }
    },
  );

  it("shows unknown for both compatibility games before shared grouping and updates only display metadata", async () => {
    let update!: (snapshot: PromotionSnapshot) => void;
    window.electronAPI.onPromotionsUpdated = vi.fn((callback) => {
      update = callback;
      return vi.fn();
    });
    const unknown = { ...sharedDrops, title: undefined, gameUnknown: true };
    const events: PromotionEvent[] = [
      unknown,
      { ...unknown, id: "ggg-4012689-twitch-591814b46c-poe2", game: "poe2" },
    ];
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      events: [],
      activeEvents: events,
      upcomingEvents: [],
    });
    for (const game of ["POE1", "POE2"] as const) {
      await render("GGG", game);
      const tip = container.querySelector(
        '[data-promotion-status="twitch-drops"] [role="tooltip"]',
      )!;
      expect(tip.querySelector("strong")?.textContent).toBe("트위치 드롭스");
      expect(tip.textContent).toContain("적용 게임: 알 수 없음");
      expect(tip.textContent).not.toContain("PoE1 · PoE2");
    }
    await act(async () =>
      update({
        revision: 2,
        events: [],
        activeEvents: events.map((event) => ({
          ...event,
          title: "새 행사",
          gameUnknown: false,
        })),
        upcomingEvents: [],
      }),
    );
    const tip = container.querySelector(
      '[data-promotion-status="twitch-drops"] [role="tooltip"]',
    )!;
    expect(tip.querySelector("strong")?.textContent).toBe("새 행사");
    expect(tip.textContent).toContain("적용 게임: PoE1 · PoE2");
  });

  it.each([
    ["another section", {}, { id: "ggg-4012689-twitch-aaaaaaaaaa-poe2" }],
    [
      "another source",
      {},
      { sourceUrl: "https://www.pathofexile.com/forum/view-thread/2" },
    ],
    ["another start", {}, { startsAt: "2026-09-04T00:30:00Z" }],
    ["another end", {}, { endsAt: "2026-09-05T01:00:00Z" }],
    ["another title", {}, { title: "다른 행사 트위치 드롭스" }],
    ["another destination", {}, { watchUrl: "https://www.twitch.tv/other" }],
    [
      "an incorrect game suffix",
      { id: "ggg-4012689-twitch-591814b46c-poe2" },
      {},
    ],
    ["manual identifiers", { id: "manual-poe1" }, { id: "manual-poe2" }],
    [
      "different raw source groups",
      { sourceGroupId: "ggg-4012689-twitch-0123456789" },
      { sourceGroupId: "ggg-4012689-twitch-aaaaaaaaaa" },
    ],
    [
      "one-sided source evidence",
      { sourceGroupId: "ggg-4012689-twitch-591814b46c" },
      {},
    ],
  ] as const)(
    "keeps a same-title peer with %s out of the display scope",
    async (_name, selectedChange, peerChange) => {
      window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
        revision: 1,
        events: [],
        activeEvents: [
          { ...sharedDrops, ...selectedChange },
          {
            ...sharedDrops,
            id: "ggg-4012689-twitch-591814b46c-poe2",
            game: "poe2",
            ...peerChange,
          },
        ],
        upcomingEvents: [],
      });
      await render("GGG", "POE1");
      const tip = container.querySelector(
        '[data-promotion-status="twitch-drops"] [role="tooltip"]',
      )!;
      expect(tip.textContent).toContain("적용 게임: PoE1");
      expect(tip.textContent).not.toContain("PoE2");
      expect(tip.querySelectorAll("strong")).toHaveLength(1);
    },
  );
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WindowControls from "./WindowControls";
import { promotionScheduleKey } from "../../shared/promotions";

import type {
  PromotionEvent,
  PromotionSnapshot,
} from "../../shared/promotions";
import type {
  DebugLogPayload,
  ElectronAPI,
  OperationalNotification,
} from "../../shared/types";

const warning: OperationalNotification = {
  id: "game-path-registry:Kakao Games:POE2",
  contextKey: "Kakao Games:POE2",
  level: "warn",
  tone: "amber",
  title: "POE2 게임 경로 확인 필요",
  message: "게임은 설치되어 있지만 레지스트리 경로가 없습니다.",
  serviceId: "Kakao Games",
  gameId: "POE2",
  action: "open-game-path-diagnostic",
};

describe("WindowControls notifications", () => {
  let container: HTMLDivElement;
  let root: Root;
  let emitException: ((log: DebugLogPayload) => void) | undefined;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    emitException = undefined;
    window.electronAPI = {
      getDebugHistory: vi.fn().mockResolvedValue([]),
      onExceptionLog: vi.fn((callback) => {
        emitException = callback;
        return vi.fn();
      }),
      minimizeWindow: vi.fn(),
      closeWindow: vi.fn(),
      setConfig: vi.fn(),
    } as unknown as ElectronAPI;
    container = document.createElement("div");
    container.id = "app-container";
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("deduplicates an operational warning and sends its exact context without opening the exception report", async () => {
    const onClick = vi.fn();
    const reportListener = vi.fn();
    window.addEventListener("SHOW_REPORT_MODAL", reportListener);

    await act(async () => {
      root.render(
        <WindowControls
          devMode={false}
          debugConsole={false}
          operationalNotifications={[warning, warning]}
          onOperationalNotificationClick={onClick}
        />,
      );
    });
    await act(async () => Promise.resolve());

    const notificationToggle = container.querySelector<HTMLButtonElement>(
      'button[title="알림 1건 확인"]',
    );
    await act(async () => notificationToggle?.click());
    expect(container.textContent).toContain("알림");
    expect(
      container.querySelectorAll(`[data-notification-id="${warning.id}"]`),
    ).toHaveLength(1);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          `[data-notification-id="${warning.id}"]`,
        )
        ?.click();
    });

    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: "Kakao Games",
        gameId: "POE2",
        action: "open-game-path-diagnostic",
      }),
    );
    expect(reportListener).not.toHaveBeenCalled();
    expect(container.querySelector("[data-notification-badge]")).toBeNull();
    await act(async () => notificationToggle?.click());
    expect(
      container
        .querySelector(`[data-notification-id="${warning.id}"]`)
        ?.classList.contains("notification-read"),
    ).toBe(true);
    window.removeEventListener("SHOW_REPORT_MODAL", reportListener);
  });

  it("keeps existing exception notifications alongside the operational warning", async () => {
    await act(async () => {
      root.render(
        <WindowControls
          devMode={false}
          debugConsole={false}
          operationalNotifications={[warning]}
        />,
      );
    });
    await act(async () => {
      emitException?.({
        type: "renderer_exception",
        content: "Unhandled exception\n at App",
        isError: true,
        timestamp: 1,
      });
    });

    expect(
      container.querySelector('button[title="알림 2건 확인"]'),
    ).not.toBeNull();
  });

  it("keeps fresh information beside warnings when an older initial query resolves late", async () => {
    let update!: (snapshot: PromotionSnapshot) => void;
    let resolveInitial!: (snapshot: PromotionSnapshot) => void;
    const unsubscribe = vi.fn();
    window.electronAPI.getPromotions = () =>
      new Promise((resolve) => {
        resolveInitial = resolve;
      });
    window.electronAPI.onPromotionsUpdated = (callback) => {
      update = callback;
      return unsubscribe;
    };
    await act(async () =>
      root.render(
        <WindowControls
          devMode={false}
          debugConsole={false}
          operationalNotifications={[warning]}
        />,
      ),
    );
    const now = Date.now();
    await act(async () =>
      update({
        revision: 2,
        activeEvents: [],
        upcomingEvents: [],
        events: [
          {
            id: "ggg-1-stash",
            kind: "stash-sale",
            game: "both",
            startsAt: new Date(now - 1000).toISOString(),
            endsAt: new Date(now + 86400_000).toISOString(),
            sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
            precision: "exact",
          },
        ],
      }),
    );
    await act(async () =>
      resolveInitial({
        revision: 1,
        activeEvents: [],
        upcomingEvents: [],
        events: [],
      }),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>("[data-notification-toggle]")
        ?.click(),
    );
    expect(container.textContent).toContain("보관함 할인 진행 중");
    expect(container.textContent).not.toContain("예시");
    expect(
      container.querySelectorAll('[data-promotion-id="ggg-1-stash"] a'),
    ).toHaveLength(4);
    expect(container.querySelector("[data-notification-id]")).not.toBeNull();
    await act(async () =>
      update({ revision: 3, activeEvents: [], upcomingEvents: [], events: [] }),
    );
    expect(container.textContent).not.toContain("보관함 할인 진행 중");
    await act(async () => root.render(null));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it.each(["session", "schedule"] as const)(
    "dismisses an in-app promotion using %s mode without activating its link",
    async (mode) => {
      const event: PromotionEvent = {
        id: "qa-twitch",
        kind: "twitch-drops",
        game: "poe2",
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 86400_000).toISOString(),
        sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
        precision: "manual",
      };
      let update!: (snapshot: PromotionSnapshot) => void;
      window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
        revision: 1,
        activeEvents: [],
        upcomingEvents: [],
        events: [event],
      });
      window.electronAPI.onPromotionsUpdated = (callback) => {
        update = callback;
        return vi.fn();
      };
      window.electronAPI.dismissPromotion = vi.fn(async () => {
        update({
          revision: 2,
          activeEvents: [],
          upcomingEvents: [],
          events: [],
        });
        return { ok: true as const };
      });
      await act(async () =>
        root.render(<WindowControls devMode={false} debugConsole={false} />),
      );
      const click = async (selector: string) =>
        act(async () =>
          container.querySelector<HTMLButtonElement>(selector)!.click(),
        );
      await click("[data-notification-toggle]");
      const close =
        container.querySelector<HTMLButtonElement>(".promotion-dismiss")!;
      expect(close.closest("a")).toBeNull();
      await click(".promotion-dismiss");
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.parentElement?.parentElement).toBe(container);
      expect(container.querySelector("[data-notification-panel]")).toBeNull();
      expect(container.textContent).toContain("알림 삭제");
      expect(container.textContent).toContain("이번 일정 내 표시하지 않음");
      await click(".promotion-dismiss-modal input");
      await act(async () =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(
        container.querySelector("[data-notification-toggle]"),
      );
      expect(window.electronAPI.dismissPromotion).not.toHaveBeenCalled();
      expect(
        container.querySelector("[data-notification-badge]")?.textContent,
      ).toBe("1");
      await click("[data-notification-toggle]");
      await click(".promotion-dismiss");
      expect(
        container.querySelector<HTMLInputElement>(
          ".promotion-dismiss-modal input",
        )?.checked,
      ).toBe(true);
      if (mode === "session") await click(".promotion-dismiss-modal input");
      await click(".promotion-dismiss-modal .event-notification-confirm");
      expect(window.electronAPI.dismissPromotion).toHaveBeenCalledWith({
        key: promotionScheduleKey(event),
        mode,
      });
      expect(container.querySelector("[data-promotion-id]")).toBeNull();
      expect(document.activeElement).toBe(
        container.querySelector('[aria-label="창 최소화"]'),
      );
    },
  );

  it("keeps an event visible when the dismissal command fails", async () => {
    const event: PromotionEvent = {
      id: "qa-stash",
      kind: "stash-sale",
      game: "both",
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 86400_000).toISOString(),
      sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
      precision: "manual",
    };
    window.electronAPI.getPromotions = vi.fn().mockResolvedValue({
      revision: 1,
      activeEvents: [],
      upcomingEvents: [],
      events: [event],
    });
    let finish!: (result: { ok: false; reason: "save-failed" }) => void;
    window.electronAPI.dismissPromotion = vi.fn(
      () =>
        new Promise<{ ok: false; reason: "save-failed" }>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () =>
      root.render(<WindowControls devMode={false} debugConsole={false} />),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>("[data-notification-toggle]")!
        .click(),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".promotion-dismiss")!.click(),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          ".promotion-dismiss-modal .event-notification-confirm",
        )!
        .click(),
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".event-notification-confirm")!
        .click();
      container
        .querySelector<HTMLButtonElement>(".event-notification-cancel")!
        .click();
      container
        .querySelector<HTMLButtonElement>(".event-notification-close")!
        .click();
      container
        .querySelector<HTMLElement>(".promotion-dismiss-overlay")!
        .click();
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(window.electronAPI.dismissPromotion).toHaveBeenCalledOnce();
    expect(
      container.querySelector<HTMLInputElement>(
        ".promotion-dismiss-modal input",
      )?.disabled,
    ).toBe(true);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => finish({ ok: false, reason: "save-failed" }));
    expect(
      container.querySelector<HTMLInputElement>(
        ".promotion-dismiss-modal input",
      )?.checked,
    ).toBe(true);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      container.querySelector("[data-notification-toggle]"),
    ).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "다시 시도",
    );
  });

  it("counts only unread items, keeps read links accessible and identifies promotions by schedule", async () => {
    const now = Date.now();
    const event: PromotionEvent = {
      id: "read-twitch",
      kind: "twitch-drops",
      game: "poe1",
      startsAt: new Date(now - 1000).toISOString(),
      endsAt: new Date(now + 86400_000).toISOString(),
      sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
      precision: "exact",
    };
    let events = [
      event,
      {
        ...event,
        id: "read-stash",
        kind: "stash-sale" as const,
        game: "both" as const,
      },
    ];
    window.electronAPI.getPromotions = vi.fn(async () => ({
      revision: 1,
      activeEvents: [],
      upcomingEvents: [],
      events,
    }));
    const render = () =>
      root.render(<WindowControls devMode={false} debugConsole={false} />);
    const click = (selector: string) =>
      act(async () => container.querySelector<HTMLElement>(selector)!.click());
    const badge = () =>
      container.querySelector("[data-notification-badge]")?.textContent;
    // Exercise React handlers while suppressing jsdom's external navigation only.
    container.addEventListener("click", (e) => {
      if ((e.target as Element).closest("a")) e.preventDefault();
    });
    await act(async () => render());
    expect(badge()).toBe("2");
    await click("[data-notification-toggle]");
    expect(badge()).toBe("2");
    await act(async () =>
      container
        .querySelector('[data-promotion-id="read-twitch"] a')!
        .dispatchEvent(
          new MouseEvent("auxclick", { button: 2, bubbles: true }),
        ),
    );
    expect(badge()).toBe("2");
    await click('[data-promotion-id="read-twitch"] a');
    expect(badge()).toBe("1");
    expect(
      container
        .querySelector('[data-promotion-id="read-twitch"]')
        ?.classList.contains("notification-read"),
    ).toBe(true);
    await act(async () =>
      container
        .querySelector('[data-promotion-id="read-stash"] a')!
        .dispatchEvent(
          new MouseEvent("auxclick", { button: 1, bubbles: true }),
        ),
    );
    expect(badge()).toBeUndefined();
    expect(container.textContent).toContain("모두 읽음");
    expect(container.querySelectorAll("[data-promotion-id]")).toHaveLength(2);
    await click('[data-promotion-id="read-stash"] a:last-child');
    expect(badge()).toBeUndefined();
    await click("[data-notification-toggle]");
    await click("[data-notification-toggle]");
    expect(container.querySelectorAll(".notification-read")).toHaveLength(2);

    // Reload/remount and an article ID change retain read state for the same schedule.
    await act(async () => root.render(null));
    events = [{ ...event, id: "new-article-same-schedule" }];
    await act(async () => render());
    expect(badge()).toBeUndefined();
    await click("[data-notification-toggle]");
    expect(container.querySelector(".notification-read")).not.toBeNull();
    await act(async () => root.render(null));
    events = [{ ...event, endsAt: new Date(now + 172800_000).toISOString() }];
    await act(async () => render());
    expect(badge()).toBe("1");
    // A fresh renderer session (actual process restart is covered by Electron QA).
    await act(async () => root.render(null));
    window.sessionStorage.clear();
    events = [event];
    await act(async () => render());
    expect(badge()).toBe("1");
  });

  it("marks an opened error report read and counts a newly arriving error", async () => {
    const log: DebugLogPayload = {
      type: "renderer_exception",
      content: "Unhandled exception\n at App",
      isError: true,
      timestamp: 1,
    };
    window.electronAPI.getDebugHistory = vi.fn().mockResolvedValue([log]);
    await act(async () =>
      root.render(<WindowControls devMode={false} debugConsole={false} />),
    );
    await act(async () =>
      container
        .querySelector<HTMLElement>("[data-notification-toggle]")!
        .click(),
    );
    await act(async () =>
      container
        .querySelector<HTMLElement>("[data-error-notification] button")!
        .click(),
    );
    expect(container.querySelector("[data-notification-badge]")).toBeNull();
    await act(async () =>
      container
        .querySelector<HTMLElement>("[data-notification-toggle]")!
        .click(),
    );
    expect(
      container
        .querySelector("[data-error-notification]")
        ?.classList.contains("notification-read"),
    ).toBe(true);
    await act(async () => emitException?.({ ...log, timestamp: 2 }));
    expect(
      container.querySelector("[data-notification-badge]")?.textContent,
    ).toBe("1");
  });

  it("still marks notifications read when session storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    await act(async () =>
      root.render(
        <WindowControls
          devMode={false}
          debugConsole={false}
          operationalNotifications={[warning]}
          onOperationalNotificationClick={vi.fn()}
        />,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLElement>("[data-notification-toggle]")!
        .click(),
    );
    await act(async () =>
      container.querySelector<HTMLElement>("[data-notification-id]")!.click(),
    );
    expect(
      container.querySelector("[data-notification-toggle]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-notification-badge]")).toBeNull();
  });
});

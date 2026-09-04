import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeEventPreferences,
  promotionScheduleKey,
  type PromotionEvent,
  type PromotionFeed,
  type PromotionSnapshot,
} from "../../shared/promotions";
import { STASH_API_URLS } from "../../shared/stash-sales";
import {
  stashSection,
  stashObservations,
  observedStashPeriod,
} from "../../shared/test-fixtures/stash-sales";
import {
  PromotionController,
  type PromotionCache,
} from "../services/PromotionController";

const event = {
  id: "ggg-1-twitch-1",
  kind: "twitch-drops" as const,
  game: "poe1" as const,
  startsAt: "2026-09-03T21:00:00.000Z",
  endsAt: "2026-09-04T21:00:00.000Z",
  sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
  precision: "exact" as const,
};
const feed: PromotionFeed = {
  schemaVersion: 1,
  generatedAt: "2026-09-04T00:00:00.000Z",
  events: [event],
};

function setup(initial: PromotionCache = { feed, windows: {} }) {
  let persisted = initial;
  const prefs = normalizeEventPreferences({ channels: { windows: true } });
  const notify = vi.fn(async (_event: PromotionEvent) => true);
  const snapshots: PromotionSnapshot[] = [];
  const fetchFeed = vi.fn(
    async (_signal: AbortSignal): Promise<unknown> => feed,
  );
  const save = vi.fn((value: PromotionCache) => {
    persisted = structuredClone(value);
  });
  const prune = vi.fn();
  const controller = new PromotionController({
    load: () => persisted,
    save,
    fetchFeed,
    preferences: () => prefs,
    notify,
    changed: (snapshot) => snapshots.push(snapshot),
    prune,
    warn: vi.fn(),
  });
  return {
    controller,
    prefs,
    notify,
    snapshots,
    fetchFeed,
    save,
    prune,
    persisted: () => persisted,
  };
}

describe("promotion delivery", () => {
  it("keeps one stash delivery when targets grow and retains the other confirmed target on no-sale", async () => {
    const first = {
      ...stashSection.observations[0],
      confirmedPeriod: observedStashPeriod,
    };
    const second = {
      ...first,
      service: "ggg" as const,
      sourceUrl: STASH_API_URLS["ggg:poe2"],
    };
    const extended = {
      ...feed,
      events: [],
      stashSales: { ...stashSection, observations: stashObservations(first) },
    };
    const s = setup({ feed: extended, windows: {} });
    s.fetchFeed.mockResolvedValue(extended);
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    const key = promotionScheduleKey(s.controller.snapshot().events[0]);
    s.fetchFeed.mockResolvedValue({
      ...extended,
      stashSales: {
        ...stashSection,
        observations: stashObservations(second, first),
      },
    });
    s.controller.wake();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toHaveLength(1);
    expect(s.controller.snapshot().events[0].targets).toHaveLength(2);
    expect(promotionScheduleKey(s.controller.snapshot().events[0])).toBe(key);
    expect(s.notify).toHaveBeenCalledTimes(1);
    s.fetchFeed.mockResolvedValue({
      ...extended,
      stashSales: {
        ...stashSection,
        observations: stashObservations(
          { ...second, confirmedPeriod: null },
          first,
        ),
      },
    });
    s.controller.wake();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events[0].targets).toEqual([
      { service: "kakao", game: "poe2" },
    ]);
    expect(s.notify).toHaveBeenCalledTimes(1);
    s.controller.stop();
  });
  it("keeps an estimate separate across its start and removes it after its last KST date", async () => {
    const extended = { ...feed, events: [], stashSales: stashSection };
    const s = setup({ feed: extended, windows: {} });
    s.fetchFeed.mockResolvedValue(extended);
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().stashEstimate).toEqual(
      stashSection.nextEstimate,
    );
    vi.setSystemTime("2026-09-11T01:00:00Z");
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.controller.snapshot().activeEvents).toEqual([]);
    expect(s.notify).not.toHaveBeenCalled();
    vi.setSystemTime("2026-09-15T15:00:00Z");
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.controller.snapshot().stashEstimate).toBeNull();
    s.controller.stop();
  });

  it("delivers and dismisses an API-confirmed stash period through the shared event path", async () => {
    const extended = {
      ...feed,
      events: [],
      stashSales: {
        ...stashSection,
        observations: stashObservations({
          ...stashSection.observations[0],
          confirmedPeriod: observedStashPeriod,
        }),
      },
    };
    const s = setup({ feed: extended, windows: {} });
    s.fetchFeed.mockResolvedValue(extended);
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().activeEvents).toHaveLength(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
    const current = s.controller.snapshot().events[0];
    s.controller.dismiss({
      key: promotionScheduleKey(current),
      mode: "schedule",
    });
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.controller.snapshot().activeEvents).toHaveLength(1);
    expect(s.persisted().hidden?.[promotionScheduleKey(current)]).toBe(
      Date.parse(observedStashPeriod.endsAt),
    );
    s.controller.stop();
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-09-04T00:10:00Z");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records before sending and does not resend on restart, refresh, or toggling", async () => {
    const s = setup();
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
    expect(s.save.mock.invocationCallOrder[0]).toBeLessThan(
      s.notify.mock.invocationCallOrder[0],
    );
    s.prefs.channels.windows = false;
    s.controller.settingsChanged();
    s.prefs.channels.windows = true;
    s.controller.settingsChanged();
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(s.notify).toHaveBeenCalledTimes(1);
    s.controller.stop();
    const restarted = setup(s.persisted());
    restarted.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(restarted.notify).not.toHaveBeenCalled();
    restarted.controller.stop();
  });

  it("shows cached events offline and removes them exactly at expiration", async () => {
    const s = setup();
    s.fetchFeed.mockRejectedValue(new Error("offline"));
    vi.setSystemTime(Date.parse(event.endsAt) - 1000);
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.persisted().feed?.events).toHaveLength(1);
    s.controller.stop();
  });

  it("adds a running event when a channel is first enabled and keeps app/native independent", async () => {
    const s = setup();
    s.prefs.channels = { inApp: false, windows: false };
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.notify).not.toHaveBeenCalled();
    s.prefs.channels.windows = true;
    s.controller.settingsChanged();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
    expect(s.controller.snapshot().events).toEqual([]);
    s.prefs.channels.inApp = true;
    s.controller.settingsChanged();
    expect(s.controller.snapshot().events).toHaveLength(1);
    s.controller.stop();
  });

  it("applies shared channels to selected types and prunes a disabled type", async () => {
    const stash = {
      ...event,
      id: "ggg-1-stash",
      kind: "stash-sale" as const,
      game: "both" as const,
    };
    const both = { ...feed, events: [event, stash] };
    const s = setup({ feed: both, windows: {} });
    s.fetchFeed.mockResolvedValue(both);
    s.prefs.types.twitch = false;
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events.map((item) => item.id)).toEqual([
      stash.id,
    ]);
    expect(s.notify.mock.calls.map((call) => call[0])).toEqual([stash]);
    s.prefs.types.twitch = true;
    s.controller.settingsChanged();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toHaveLength(2);
    expect(s.notify).toHaveBeenCalledTimes(2);
    s.prefs.channels.inApp = false;
    s.prefs.types.stash = false;
    s.controller.settingsChanged();
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.prune).toHaveBeenLastCalledWith(
      new Set([promotionScheduleKey(event)]),
    );
    s.prefs.channels.windows = false;
    s.controller.settingsChanged();
    expect(s.prune).toHaveBeenLastCalledWith(new Set());
    s.prefs.channels = { inApp: true, windows: true };
    s.prefs.types.stash = true;
    s.controller.settingsChanged();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toHaveLength(2);
    expect(s.notify).toHaveBeenCalledTimes(2);
    s.controller.stop();
  });

  it("retains good data when the server returns malformed or older data", async () => {
    const s = setup();
    s.fetchFeed.mockResolvedValue({ schemaVersion: 2, events: [] });
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toHaveLength(1);
    s.fetchFeed.mockResolvedValue({
      ...feed,
      generatedAt: "2026-09-03T00:00:00Z",
      events: [],
    });
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(s.controller.snapshot().events).toHaveLength(1);
    s.controller.stop();
  });

  it("aborts requests and ignores a late response after stop", async () => {
    const s = setup({ feed: null, windows: {} });
    let resolve!: (value: unknown) => void;
    s.fetchFeed.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    s.controller.init();
    s.controller.stop();
    resolve(feed);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.fetchFeed.mock.calls[0][0].aborted).toBe(true);
    expect(s.notify).not.toHaveBeenCalled();
    expect(s.persisted().feed).toBeNull();
  });

  it("never sends when the delivery ledger cannot be persisted", async () => {
    const s = setup();
    s.save.mockImplementation(() => {
      throw new Error("disk full");
    });
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.notify).not.toHaveBeenCalled();
    s.controller.stop();
  });

  it("backs off a known native failure, but allows a later retry", async () => {
    const s = setup();
    s.notify.mockResolvedValue(false);
    s.controller.init();
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.notify).toHaveBeenCalledTimes(1);
    s.notify.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(s.notify).toHaveBeenCalledTimes(2);
    s.controller.stop();
  });

  it("uses the corrected live event after waiting for another notification", async () => {
    const second = { ...event, id: "ggg-2-twitch-1", game: "poe2" as const };
    const s = setup({
      feed: { ...feed, events: [event, second] },
      windows: {},
    });
    let finish!: (value: boolean) => void;
    s.notify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    s.fetchFeed.mockResolvedValue({
      ...feed,
      events: [event, { ...second, startsAt: "2026-09-04T02:00:00.000Z" }],
    });
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    finish(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
    expect(s.persisted().windows[promotionScheduleKey(second)]).toBeUndefined();
    s.controller.stop();
  });
  it("deletes for the current app session across refreshes, then returns after restart", async () => {
    const s = setup();
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    s.controller.dismiss({ key: promotionScheduleKey(event), mode: "session" });
    expect(s.controller.snapshot().events).toEqual([]);
    s.controller.wake();
    s.controller.settingsChanged();
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.notify).toHaveBeenCalledTimes(1);
    s.controller.stop();
    const restarted = setup(s.persisted());
    restarted.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(restarted.controller.snapshot().events).toHaveLength(1);
    expect(restarted.notify).not.toHaveBeenCalled();
    restarted.controller.stop();
  });

  it("keeps a schedule hidden after restart but displays and sends a different schedule", async () => {
    const s = setup();
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    s.controller.dismiss({
      key: promotionScheduleKey(event),
      mode: "schedule",
    });
    s.controller.stop();
    const restarted = setup(s.persisted());
    restarted.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(restarted.controller.snapshot().events).toEqual([]);
    expect(restarted.notify).not.toHaveBeenCalled();
    const next = { ...event, endsAt: "2026-09-05T21:00:00Z" };
    restarted.fetchFeed.mockResolvedValue({ ...feed, events: [next] });
    restarted.controller.wake();
    await vi.advanceTimersByTimeAsync(1);
    expect(restarted.controller.snapshot().events).toEqual([next]);
    expect(restarted.notify).toHaveBeenCalledOnce();
    restarted.controller.stop();
  });

  it("treats duplicate source IDs for the same schedule as one notification", async () => {
    const s = setup();
    s.fetchFeed.mockResolvedValue({
      ...feed,
      events: [event, { ...event, id: "ggg-repost" }],
    });
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toHaveLength(1);
    expect(s.notify).toHaveBeenCalledOnce();
    s.controller.dismiss({
      key: promotionScheduleKey(event),
      mode: "schedule",
    });
    s.fetchFeed.mockResolvedValue({
      ...feed,
      events: [{ ...event, id: "ggg-new-source" }],
    });
    s.controller.wake();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.notify).toHaveBeenCalledOnce();
    s.controller.stop();
  });

  it("keeps the row visible on persistence failure and rejects unknown schedules", async () => {
    const s = setup();
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    s.save.mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() =>
      s.controller.dismiss({
        key: promotionScheduleKey(event),
        mode: "schedule",
      }),
    ).toThrow("disk full");
    expect(s.controller.snapshot().events).toHaveLength(1);
    expect(() =>
      s.controller.dismiss({ key: "unknown", mode: "session" }),
    ).toThrow();
    s.controller.dismiss({ key: promotionScheduleKey(event), mode: "session" });
    expect(s.controller.snapshot().events).toEqual([]);
    s.controller.stop();
  });

  it("expires hidden and Windows records at the end without rewriting every tick", async () => {
    vi.setSystemTime(Date.parse(event.endsAt) - 1000);
    const s = setup();
    s.fetchFeed.mockRejectedValue(new Error("offline"));
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    s.controller.dismiss({
      key: promotionScheduleKey(event),
      mode: "schedule",
    });
    expect(Object.keys(s.persisted().windows)).toHaveLength(1);
    expect(Object.keys(s.persisted().hidden!)).toHaveLength(1);
    s.save.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.persisted().windows).toEqual({});
    expect(s.persisted().hidden).toEqual({});
    expect(s.save).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.save).toHaveBeenCalledOnce();
    s.controller.stop();
  });

  it("persists cleanup of records expired while closed and retains ongoing schedules", async () => {
    const expiredEnd = Date.now() - 1;
    const records = {
      expired: expiredEnd,
      [promotionScheduleKey(event)]: Date.parse(event.endsAt),
    };
    const s = setup({ feed, windows: records, hidden: records });
    s.fetchFeed.mockRejectedValue(new Error("offline"));
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    const retained = {
      [promotionScheduleKey(event)]: Date.parse(event.endsAt),
    };
    expect(s.persisted().windows).toEqual(retained);
    expect(s.persisted().hidden).toEqual(retained);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.notify).not.toHaveBeenCalled();
    s.controller.stop();
  });

  it("retries failed expiration cleanup with backoff", async () => {
    const records = { expired: Date.now() - 1 };
    const s = setup({ feed: null, windows: records, hidden: records });
    s.fetchFeed.mockRejectedValue(new Error("offline"));
    s.save.mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    s.controller.init();
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.save).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3600_000);
    expect(s.save).toHaveBeenCalledTimes(2);
    expect(s.persisted().windows).toEqual({});
    expect(s.persisted().hidden).toEqual({});
    s.controller.stop();
  });

  it("can send Windows after the same schedule is hidden in the app", async () => {
    const s = setup();
    s.prefs.channels.windows = false;
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    s.controller.dismiss({
      key: promotionScheduleKey(event),
      mode: "schedule",
    });
    s.prefs.channels.windows = true;
    s.controller.settingsChanged();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.notify).toHaveBeenCalledOnce();
    s.controller.stop();
  });

  it("moves an upcoming schedule into active status at its start with notifications off", async () => {
    vi.setSystemTime(Date.parse(event.startsAt) - 1000);
    const s = setup();
    s.prefs.types.twitch = false;
    s.prefs.channels = { inApp: false, windows: false };
    s.fetchFeed.mockRejectedValue(new Error("offline"));
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().activeEvents).toEqual([]);
    expect(s.controller.snapshot().upcomingEvents).toEqual([event]);
    const revision = s.controller.snapshot().revision;
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.controller.snapshot().activeEvents).toEqual([event]);
    expect(s.controller.snapshot().upcomingEvents).toEqual([]);
    expect(s.controller.snapshot().revision).toBeGreaterThan(revision);
    expect(s.notify).not.toHaveBeenCalled();
    s.controller.stop();
  });

  it("publishes active schedules independently of notification preferences and dismissal", async () => {
    const s = setup();
    s.prefs.types.twitch = false;
    s.prefs.channels = { inApp: false, windows: false };
    s.fetchFeed.mockRejectedValue(new Error("offline"));
    s.controller.init();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.controller.snapshot().events).toEqual([]);
    expect(s.controller.snapshot().activeEvents).toEqual([event]);
    s.controller.dismiss({
      key: promotionScheduleKey(event),
      mode: "schedule",
    });
    expect(s.controller.snapshot().activeEvents).toEqual([event]);
    const revision = s.controller.snapshot().revision;
    vi.setSystemTime(event.endsAt);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.controller.snapshot().activeEvents).toEqual([]);
    expect(s.controller.snapshot().revision).toBeGreaterThan(revision);
    expect(s.notify).not.toHaveBeenCalled();
    s.controller.stop();
  });
});

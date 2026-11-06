import { describe, expect, it } from "vitest";

import {
  formatPromotionPeriod,
  isPromotionActive,
  normalizeEventPreferences,
  parsePromotionFeed,
  promotionScheduleKey,
  promotionWatchUrl,
  promotionActions,
  promotionTitle,
  selectedReminderSeconds,
  toReminderSeconds,
} from "./promotions";
import { stashSection } from "./test-fixtures/stash-sales";
import stashContractSamples from "./test-fixtures/stash-sales-contract.json";

export const samplePromotion = {
  id: "ggg-4000901-twitch-1",
  kind: "twitch-drops" as const,
  game: "poe1" as const,
  startsAt: "2026-09-03T21:00:00.000Z",
  endsAt: "2026-09-04T21:00:00.000Z",
  sourceUrl: "https://www.pathofexile.com/forum/view-thread/4000901",
  precision: "exact" as const,
};

describe("promotion contract", () => {
  it("prefers supplied display names and retains old game and stash fallbacks", () => {
    expect(
      promotionTitle({ ...samplePromotion, title: "ExileCon 트위치 드롭스" }),
    ).toBe("ExileCon 트위치 드롭스");
    expect(promotionTitle(samplePromotion)).toBe("PoE 1 트위치 드롭스");
    expect(promotionTitle({ ...samplePromotion, game: "poe2" })).toBe(
      "PoE 2 트위치 드롭스",
    );
    expect(promotionTitle({ ...samplePromotion, kind: "stash-sale" })).toBe(
      "보관함 할인",
    );
  });
  it("preserves boolean unknown metadata and neutral fallback without changing identity", () => {
    const feed = {
      schemaVersion: 1,
      generatedAt: samplePromotion.startsAt,
      events: [samplePromotion],
    };
    for (const gameUnknown of [true, false]) {
      const parsed = parsePromotionFeed({
        ...feed,
        events: [{ ...samplePromotion, gameUnknown }],
      }).events[0];
      expect(parsed.gameUnknown).toBe(gameUnknown);
      expect(promotionScheduleKey(parsed)).toBe(
        promotionScheduleKey(samplePromotion),
      );
    }
    for (const gameUnknown of [null, 1, "true", {}])
      expect(() =>
        parsePromotionFeed({
          ...feed,
          events: [{ ...samplePromotion, gameUnknown }],
        }),
      ).toThrow();
    expect(promotionTitle({ ...samplePromotion, gameUnknown: true })).toBe(
      "트위치 드롭스",
    );
    expect(
      promotionTitle({
        ...samplePromotion,
        gameUnknown: true,
        title: "새 행사",
      }),
    ).toBe("새 행사");
    const metadata = {
      ...samplePromotion,
      sourcePublishedAt: "2026-09-01T00:00:00Z",
      sourceGroupId: "ggg-4000901-twitch-0123456789",
    };
    expect(
      parsePromotionFeed({ ...feed, events: [metadata] }).events[0],
    ).toEqual(metadata);
    for (const change of [
      { sourcePublishedAt: null },
      { sourcePublishedAt: "2026-09-01T09:00:00+09:00" },
      { sourceGroupId: null },
      { sourceGroupId: "ggg-2-twitch-0123456789" },
      { sourceGroupId: "bad" },
      { kind: "stash-sale", sourceGroupId: metadata.sourceGroupId },
    ])
      expect(() =>
        parsePromotionFeed({
          ...feed,
          events: [{ ...samplePromotion, ...change }],
        }),
      ).toThrow();
  });
  it("uses supplied Twitch destinations independently of the game and falls back for old feeds", () => {
    const watchUrl = "https://events.twitch.tv/a-future-event/watch";
    for (const game of ["poe1", "poe2"] as const) {
      const event = { ...samplePromotion, game, watchUrl };
      expect(promotionWatchUrl(event)).toBe(watchUrl);
      expect(promotionActions(event)).toEqual([
        { label: "Twitch에서 시청", url: watchUrl },
      ]);
    }
    expect(promotionWatchUrl(samplePromotion)).toBe(
      "https://www.twitch.tv/directory/category/path-of-exile",
    );
    expect(promotionWatchUrl({ ...samplePromotion, game: "poe2" })).toBe(
      "https://www.twitch.tv/directory/category/path-of-exile-2",
    );
  });
  it("requires all four shop observations and distinct manual sources", () => {
    const sample = stashContractSamples.manual;
    expect(() =>
      parsePromotionFeed({
        ...sample,
        stashSales: {
          ...sample.stashSales,
          observations: sample.stashSales.observations.slice(1),
        },
      }),
    ).toThrow();
    expect(() =>
      parsePromotionFeed({
        ...sample,
        stashSales: {
          ...sample.stashSales,
          anchor: {
            ...sample.stashSales.anchor,
            sourceUrls: [
              sample.stashSales.anchor.sourceUrls[0],
              sample.stashSales.anchor.sourceUrls[0],
            ],
          },
          nextEstimate: null,
        },
      }),
    ).toThrow();
  });
  it("round trips the collector's manual, confirmed, unavailable and expired samples", () => {
    for (const sample of Object.values(stashContractSamples))
      expect(parsePromotionFeed(sample)).toEqual(sample);
  });
  it("rejects mismatched shop sources, duplicate targets, malformed dates and ungrounded predictions", () => {
    const parse = (stashSales: unknown) =>
      parsePromotionFeed({
        schemaVersion: 1,
        generatedAt: "2026-09-04T00:00:00Z",
        events: [],
        stashSales,
      });
    for (const section of [
      {
        ...stashSection,
        observations: [
          {
            ...stashSection.observations[0],
            sourceUrl:
              "https://poe2.kakaogames.com.evil.test/api/shop-microtransactions?game=poe2",
          },
          ...stashSection.observations.slice(1),
        ],
      },
      {
        ...stashSection,
        observations: [
          { ...stashSection.observations[0], game: "poe1" },
          ...stashSection.observations.slice(1),
        ],
      },
      {
        ...stashSection,
        observations: [
          stashSection.observations[0],
          stashSection.observations[0],
          ...stashSection.observations.slice(2),
        ],
      },
      {
        ...stashSection,
        anchor: { ...stashSection.anchor, startDate: "2026-02-30" },
      },
      {
        ...stashSection,
        nextEstimate: { ...stashSection.nextEstimate, startDate: "2026-10-02" },
      },
      {
        ...stashSection,
        nextEstimate: { ...stashSection.nextEstimate, basisOrigin: "api" },
      },
      { ...stashSection, anchor: null },
    ])
      expect(() => parse(section)).toThrow();
  });
  it("preserves the optional shop section without promoting estimates into events", () => {
    const parsed = parsePromotionFeed({
      schemaVersion: 1,
      generatedAt: "2026-09-04T00:00:00Z",
      events: [samplePromotion],
      stashSales: stashSection,
    });
    expect(parsed.stashSales).toEqual(stashSection);
    expect(parsed.events).toEqual([samplePromotion]);
  });
  it("identifies a schedule by kind, game, and exact instants rather than source ID", () => {
    const key = promotionScheduleKey(samplePromotion);
    expect(
      promotionScheduleKey({
        ...samplePromotion,
        id: "another-source",
        watchUrl: "https://www.twitch.tv/pathofexile",
        startsAt: "2026-09-03T21:00:00Z",
      }),
    ).toBe(key);
    expect(promotionScheduleKey({ ...samplePromotion, game: "poe2" })).not.toBe(
      key,
    );
    expect(
      promotionScheduleKey({
        ...samplePromotion,
        endsAt: "2026-09-05T21:00:00Z",
      }),
    ).not.toBe(key);
  });
  it("uses exact start-inclusive/end-exclusive instants", () => {
    const start = Date.parse(samplePromotion.startsAt);
    const end = Date.parse(samplePromotion.endsAt);
    expect(isPromotionActive(samplePromotion, start - 1)).toBe(false);
    expect(isPromotionActive(samplePromotion, start)).toBe(true);
    expect(isPromotionActive(samplePromotion, end - 1)).toBe(true);
    expect(isPromotionActive(samplePromotion, end)).toBe(false);
  });

  it("formats the same instants in the PC timezone without shifting the end", () => {
    expect(formatPromotionPeriod(samplePromotion, "Asia/Seoul")).toBe(
      "9/4 ~ 9/5",
    );
    expect(formatPromotionPeriod(samplePromotion, "America/Los_Angeles")).toBe(
      "9/3 ~ 9/4",
    );
  });

  it("separates event types from shared channels and fills partial preferences", () => {
    expect(
      normalizeEventPreferences({
        types: { twitch: false },
        channels: { inApp: "true", windows: true },
      }),
    ).toEqual({
      types: { twitch: false, stash: true },
      channels: { inApp: true, windows: true },
      reminders: {
        presets: [],
        custom: { enabled: false, value: 30, unit: "minute" },
      },
    });
    expect(normalizeEventPreferences(null)).toEqual({
      types: { twitch: true, stash: true },
      channels: { inApp: true, windows: false },
      reminders: {
        presets: [],
        custom: { enabled: false, value: 30, unit: "minute" },
      },
    });
  });

  it("normalizes supported presets and deduplicates equivalent custom offsets", () => {
    const prefs = normalizeEventPreferences({
      reminders: {
        presets: [86400, 1800, 1800, 60, "3600"],
        custom: { enabled: true, value: 0.5, unit: "hour" },
      },
    });
    expect(prefs.reminders.presets).toEqual([1800, 86400]);
    expect(selectedReminderSeconds(prefs.reminders)).toEqual([1800, 86400]);
    expect(toReminderSeconds(2, "day")).toBe(172800);
    expect(toReminderSeconds(2, "hour")).toBe(7200);
    expect(toReminderSeconds(2, "second")).toBe(2);
    expect(toReminderSeconds(1.5, "hour")).toBe(5400);
    expect(toReminderSeconds(0.1, "minute")).toBe(6);
    expect(toReminderSeconds(1.1, "hour")).toBe(3960);
    expect(toReminderSeconds(365.00125, "day")).toBe(31536108);
    expect(toReminderSeconds(10000.13, "day")).toBe(864011232);
    expect(toReminderSeconds(365.001251, "day")).toBeNull();
    expect(toReminderSeconds(6000000000.0001, "second")).toBeNull();
    expect(toReminderSeconds(1e-7, "day")).toBeNull();
    expect(toReminderSeconds(1000, "day")).toBe(86400000);
  });

  it("disables malformed or unsafe custom offsets without enabling Windows", () => {
    for (const custom of [
      { enabled: true, value: 0, unit: "second" },
      { enabled: true, value: -1, unit: "minute" },
      { enabled: true, value: 0.5, unit: "second" },
      { enabled: true, value: Number.MAX_SAFE_INTEGER, unit: "second" },
      { enabled: true, value: 2, unit: "week" },
    ]) {
      const prefs = normalizeEventPreferences({ reminders: { custom } });
      expect(selectedReminderSeconds(prefs.reminders)).toEqual([]);
      expect(prefs.channels.windows).toBe(false);
    }
  });

  it("rejects an entire invalid feed rather than silently deleting valid events", () => {
    const feed = {
      schemaVersion: 1,
      generatedAt: "2026-09-04T00:00:00.000Z",
      events: [samplePromotion],
    };
    expect(parsePromotionFeed(feed).events).toHaveLength(1);
    for (const bad of [
      { ...samplePromotion, game: "unknown" },
      { ...samplePromotion, endsAt: samplePromotion.startsAt },
      { ...samplePromotion, startsAt: "2026-02-30T00:00:00.000Z" },
      {
        ...samplePromotion,
        sourceUrl: "https://www.pathofexile.com.evil.test/forum/view-thread/1",
      },
      {
        ...samplePromotion,
        sourceUrl: "http://www.pathofexile.com/forum/view-thread/1",
      },
    ])
      expect(() =>
        parsePromotionFeed({ ...feed, events: [samplePromotion, bad] }),
      ).toThrow();
    expect(() =>
      parsePromotionFeed({
        ...feed,
        events: [samplePromotion, samplePromotion],
      }),
    ).toThrow();
    expect(() => parsePromotionFeed({ ...feed, schemaVersion: 2 })).toThrow();
  });
});

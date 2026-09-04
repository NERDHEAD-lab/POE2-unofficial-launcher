import { describe, expect, it } from "vitest";

import {
  formatPromotionPeriod,
  isPromotionActive,
  normalizeEventPreferences,
  parsePromotionFeed,
  promotionScheduleKey,
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
    });
    expect(normalizeEventPreferences(null)).toEqual({
      types: { twitch: true, stash: true },
      channels: { inApp: true, windows: false },
    });
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

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { parsePromotionFeed } from "./contract.mjs";
import samples from "./fixtures/stash-sales-contract.json" with { type: "json" };
import { parsePromotionFeed as parseLegacy } from "./fixtures/legacy-contract-v1.mjs";

const event = {
  id: "ggg-4000901-twitch-471bcf3ba0",
  kind: "twitch-drops",
  game: "poe1",
  startsAt: "2026-09-03T21:00:00Z",
  endsAt: "2026-09-04T21:00:00.000Z",
  sourceUrl: "https://www.pathofexile.com/forum/view-thread/4000901",
  precision: "exact",
};
const feed = {
  schemaVersion: 1,
  generatedAt: "2026-09-04T08:00:00Z",
  events: [event],
};
const invalid = [
  null,
  {},
  [],
  { ...feed, schemaVersion: 2 },
  { ...feed, generatedAt: "2026-02-30T00:00:00Z" },
  { ...feed, events: [event, event] },
  { ...feed, events: Array(201).fill(event) },
  ...[
    { id: "" },
    { id: "x".repeat(161) },
    { id: "Uppercase" },
    { kind: "unknown" },
    { game: "both" },
    { game: "poe3" },
    { precision: "guessed" },
    { startsAt: "2026-09-03T21:00:00+00:00" },
    { endsAt: "2026-02-30T21:00:00Z" },
    { endsAt: event.startsAt },
    { endsAt: "2027-09-04T21:00:00Z" },
    { sourceUrl: "https://example.com/forum/view-thread/1" },
    { sourceUrl: event.sourceUrl + "?x=1" },
  ].map((change) => ({ ...feed, events: [{ ...event, ...change }] })),
];
const valid = [
  feed,
  { ...feed, events: [] },
  { ...feed, events: [{ ...event, game: "poe2", precision: "manual" }] },
  {
    ...feed,
    events: [
      {
        ...event,
        kind: "stash-sale",
        game: "both",
        precision: "derived-start",
        sourceUrl: event.sourceUrl + "/filter-account-type/staff",
      },
    ],
  },
];

test("schema v1 accepts supported payloads and rejects malformed events", () => {
  for (const input of valid) assert.deepEqual(parsePromotionFeed(input), input);
  for (const input of invalid) assert.throws(() => parsePromotionFeed(input));
});

test("optional stash section round-trips the shared manual/API/failure/expiry samples", () => {
  for (const sample of Object.values(samples))
    assert.deepEqual(parsePromotionFeed(sample), sample);
});

test("the pre-extension consumer keeps reading drops from the extended feed", () => {
  for (const sample of Object.values(samples)) {
    const extended = { ...sample, events: [event] };
    assert.deepEqual(parseLegacy(extended), {
      schemaVersion: 1,
      generatedAt: sample.generatedAt,
      events: [event],
    });
  }
});

const changeStash = (change) => {
  const value = structuredClone(samples.confirmed);
  change(value.stashSales);
  return value;
};
const badStash = [
  null,
  {},
  { ...samples.manual.stashSales, version: 2 },
  ...[
    (s) => {
      s.observations = [];
    },
    (s) => {
      s.observations[0] = s.observations[1];
    },
    (s) => {
      s.observations[1].sourceUrl += "&lang=en";
    },
    (s) => {
      s.observations[1].game = "poe1";
    },
    (s) => {
      s.observations[1].status = "guessed";
    },
    (s) => {
      s.observations[1].checkedAt = "2026-02-30T00:00:00Z";
    },
    (s) => {
      delete s.observations[0].confirmedPeriod;
    },
    (s) => {
      s.observations[1].confirmedPeriod.productIds = [];
    },
    (s) => {
      s.observations[1].confirmedPeriod.productIds = [
        "CurrencyTab",
        "CurrencyTab",
      ];
    },
    (s) => {
      s.observations[1].confirmedPeriod.productIds = Array.from(
        { length: 101 },
        (_, i) => `Tab${i}`,
      );
    },
    (s) => {
      s.observations[1].confirmedPeriod.observedAt = "2026-09-11T02:00:00Z";
    },
    (s) => {
      s.observations[1].confirmedPeriod.endsAt =
        s.observations[1].confirmedPeriod.startsAt;
    },
    (s) => {
      s.anchor.sourceUrl = "https://example.com";
    },
    (s) => {
      s.anchor.origin = "manual";
    },
    (s) => {
      s.nextEstimate.intervalDays = 42;
    },
    (s) => {
      s.nextEstimate.startDate = "2026-02-30";
    },
    (s) => {
      s.nextEstimate.startDate = "2026-10-03";
    },
    (s) => {
      s.nextEstimate.timeZone = "UTC";
    },
    (s) => {
      s.nextEstimate.basisOrigin = "estimated";
    },
    (s) => {
      s.nextEstimate.basisSourceUrl = "https://example.com";
    },
  ].map((change) => changeStash(change).stashSales),
];

test("stash source scopes and precise or date-only fields fail closed", () => {
  for (const stashSales of badStash)
    assert.throws(() => parsePromotionFeed({ ...feed, stashSales }));
  for (const change of [
    (s) => {
      s.anchor.startDate = "2026-02-30";
    },
    (s) => {
      s.anchor.scope = [{ service: "kakao", game: "both" }];
    },
    (s) => {
      s.anchor.sourceUrls = ["https://example.com"];
    },
    (s) => {
      s.anchor.sourceUrls = Array.from(
        { length: 5 },
        (_, i) => `https://poe.kakaogames.com/forum/view-thread/${i}`,
      );
    },
    (s) => {
      s.anchor.sourceUrls = [
        "https://poe.kakaogames.com/forum/view-thread/3998528/filter-account-type/staff",
      ];
    },
  ]) {
    const sample = structuredClone(samples.manual);
    change(sample.stashSales);
    assert.throws(() => parsePromotionFeed(sample));
  }
});

test("validator matches the actual launcher consumer when available", async (t) => {
  const path = resolve(
    process.env.PROMOTIONS_CONSUMER_MODULE ?? "src/shared/promotions.ts",
  );
  if (!existsSync(path)) {
    if (process.env.PROMOTIONS_CONSUMER_MODULE)
      throw new Error("Explicit consumer module missing");
    t.skip(
      "Launcher feature not merged yet; pass PROMOTIONS_CONSUMER_MODULE for cross-worktree comparison",
    );
    return;
  }
  // The launcher uses bundler-style imports; keep this Node-only check dependency-free.
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        context.parentURL?.endsWith(".ts") &&
        /^\.\.?\//.test(specifier) &&
        !extname(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(() => hooks.deregister());
  const consumer = await import(pathToFileURL(path).href);
  for (const input of [...valid, ...Object.values(samples)])
    assert.deepEqual(
      parsePromotionFeed(input),
      consumer.parsePromotionFeed(input),
    );
  for (const input of invalid)
    assert.throws(() => consumer.parsePromotionFeed(input));
  for (const stashSales of badStash)
    assert.throws(() => consumer.parsePromotionFeed({ ...feed, stashSales }));
});

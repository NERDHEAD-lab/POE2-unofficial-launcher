import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePromotionFeed } from "./contract.mjs";

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
  const consumer = await import(pathToFileURL(path).href);
  for (const input of valid)
    assert.deepEqual(
      parsePromotionFeed(input),
      consumer.parsePromotionFeed(input),
    );
  for (const input of invalid)
    assert.throws(() => consumer.parsePromotionFeed(input));
});

import assert from "node:assert/strict";
import test from "node:test";
import { verifyPublished } from "./verify-published.mjs";
import samples from "./fixtures/stash-sales-contract.json" with { type: "json" };

const expected = {
  schemaVersion: 1,
  generatedAt: "2026-09-04T08:00:00Z",
  events: [],
};
test("public verification waits through 404 and stale JSON until exact validated content arrives", async () => {
  const responses = [
    new Response("", { status: 404 }),
    Response.json({ ...expected, generatedAt: "2026-09-03T08:00:00Z" }),
    Response.json(expected),
  ];
  let calls = 0;
  await verifyPublished(expected, {
    fetchResponse: async () => responses[calls++],
    pause: async () => {},
  });
  assert.equal(calls, 3);
});
test("invalid or unchanged public responses fail within the retry bound", async () => {
  let calls = 0;
  await assert.rejects(
    verifyPublished(expected, {
      attempts: 2,
      fetchResponse: async () => {
        calls++;
        return Response.json({ schemaVersion: 2 });
      },
      pause: async () => {},
    }),
    /not verified/,
  );
  assert.equal(calls, 2);
});

test("public verification rejects a feed whose legacy publisher stripped the stash anchor", async () => {
  const { stashSales: _stash, ...stripped } = samples.manual;
  await assert.rejects(
    verifyPublished(samples.manual, {
      attempts: 1,
      fetchResponse: async () => Response.json(stripped),
      pause: async () => {},
    }),
    /not verified/,
  );
});

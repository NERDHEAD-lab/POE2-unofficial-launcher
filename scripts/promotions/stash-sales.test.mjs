import assert from "node:assert/strict";
import test from "node:test";
import { collect } from "./collect.mjs";
import { SHOP_SOURCES } from "./contract.mjs";
import samples from "./fixtures/stash-sales-contract.json" with { type: "json" };

const now = new Date("2026-09-11T01:00:00.000Z");
const special = {
  start: "2026-09-11T00:00:01+00:00",
  end: "2026-09-15T00:00:00+00:00",
};
const tab = (change = {}) => ({
  id: "CurrencyTab",
  tags: ["StashTabs", "PoE2StashTabs"],
  guild: false,
  cost: 75,
  baseCost: 75,
  special: null,
  ...change,
});
const oldTab = (change = {}) => ({
  id: "CurrencyTab",
  guild: false,
  cost: 75,
  originalCost: 75,
  onSpecial: false,
  ...change,
});
const defaults = (source) =>
  source.game === "poe1"
    ? { items: [oldTab()], total: 1 }
    : { data: [tab()], meta: {} };

async function run({ previous = null, at = now, payload, fail, clock } = {}) {
  return collect({
    previous,
    overrides: { events: [], disabledIds: [] },
    now: at,
    clock,
    pause: async () => {},
    fetchText: async (url) => {
      const source = SHOP_SOURCES.find((source) => source.sourceUrl === url);
      if (fail?.(url, source)) throw new Error("HTTP 503");
      if (source) return JSON.stringify(payload?.(source) ?? defaults(source));
      if (url.endsWith("/rss"))
        return "<rss><channel><item><title>Build Showcase</title></item></channel></rss>";
      return '<table class="forumTable"></table>';
    },
  });
}
const observation = (result, service = "ggg", game = "poe2") =>
  result.feed.stashSales?.observations.find(
    (x) => x.service === service && x.game === game,
  );
const apiRun = (products, other = {}) =>
  run({
    ...other,
    payload: (s) =>
      s.game === "poe2" ? { data: products, meta: {} } : defaults(s),
  });

test("full-price catalogs seed the announced dates without claiming API confirmation", async () => {
  const result = await run({ at: new Date(samples.manual.generatedAt) });
  assert.deepEqual(
    result.feed.stashSales?.anchor,
    samples.manual.stashSales.anchor,
  );
  assert.deepEqual(
    result.feed.stashSales.nextEstimate,
    samples.manual.stashSales.nextEstimate,
  );
  assert.equal(result.feed.stashSales.observations.length, 4);
  assert.ok(
    result.feed.stashSales.observations.every(
      (x) => x.status === "ok" && x.confirmedPeriod === null,
    ),
  );
  assert.deepEqual(result.feed.events, []);
});

test("only discounted personal stash products contribute exact normalized API periods", async () => {
  const result = await apiRun([
    tab({ cost: 60, special }),
    tab({ id: "PremiumStashTab", cost: 30, baseCost: 40, special }),
    tab({ id: "WeaponEffect", tags: ["WeaponEffects"], cost: 10, special }),
    tab({
      id: "GuildCurrencyTab",
      tags: ["GuildStashTabs", "PoE2GuildStashTabs"],
      guild: true,
      cost: 10,
      special,
    }),
    tab({ id: "StashTabBundle", cost: 150, baseCost: 150, discount: 30 }),
  ]);
  assert.deepEqual(
    observation(result)?.confirmedPeriod,
    samples.confirmed.stashSales.observations[1].confirmedPeriod,
  );
  assert.deepEqual(
    result.feed.stashSales.anchor,
    samples.confirmed.stashSales.anchor,
  );
  assert.deepEqual(
    result.feed.stashSales.nextEstimate,
    samples.confirmed.stashSales.nextEstimate,
  );
  assert.deepEqual(result.feed.events, []);
});

test("a discounted variant inherits a missing tag list but never overwrites its own tags", async () => {
  const result = await apiRun([
    tab({
      variants: [
        { id: "VariantTab", cost: 50, baseCost: 75, special },
        {
          id: "NotATab",
          tags: ["WeaponEffects"],
          cost: 50,
          baseCost: 75,
          special,
        },
      ],
    }),
  ]);
  assert.deepEqual(observation(result)?.confirmedPeriod?.productIds, [
    "VariantTab",
  ]);
});

test("unrelated specials and bundle discounts do not establish an API anchor", async () => {
  const result = await apiRun([
    tab({ id: "StashTabBundle", discount: 30 }),
    tab({ id: "WeaponEffect", tags: ["WeaponEffects"], cost: 10, special }),
  ]);
  assert.equal(observation(result)?.status, "ok");
  assert.equal(observation(result)?.confirmedPeriod, null);
  assert.equal(result.feed.stashSales.anchor.origin, "manual-announcement");
});

test("PoE1 price-only sale reports unavailable period; regular bundle savings are not a sale", async () => {
  const result = await run({
    payload: (s) =>
      s.game === "poe1"
        ? { items: [oldTab({ cost: 60, onSpecial: true })], total: 1 }
        : defaults(s),
  });
  assert.equal(
    observation(result, "kakao", "poe1")?.status,
    "period-unavailable",
  );
  assert.equal(observation(result, "kakao", "poe1")?.confirmedPeriod, null);
  const bundle = await run({
    payload: (s) =>
      s.game === "poe1"
        ? {
            items: [
              oldTab({
                id: "StashTabBundle",
                cost: 150,
                originalCost: 150,
                discount: 30,
              }),
            ],
            total: 1,
          }
        : defaults(s),
  });
  assert.equal(observation(bundle, "kakao", "poe1")?.status, "ok");
});

test("a later PoE1 API period can confirm only its identified discounted personal tabs", async () => {
  const result = await run({
    payload: (s) =>
      s.game === "poe1"
        ? {
            items: [
              oldTab({ cost: 60, onSpecial: true, special }),
              oldTab({
                id: "WeaponEffect",
                cost: 10,
                onSpecial: true,
                special,
              }),
            ],
            total: 2,
          }
        : defaults(s),
  });
  assert.deepEqual(
    observation(result, "kakao", "poe1")?.confirmedPeriod?.productIds,
    ["CurrencyTab"],
  );
});

test("request failures preserve the last successful time and unexpired confirmed evidence", async () => {
  const result = await run({
    previous: samples.confirmed,
    at: new Date(samples.unavailable.generatedAt),
    fail: (_url, s) => s?.service === "ggg" && s.game === "poe2",
  });
  assert.deepEqual(
    observation(result),
    samples.unavailable.stashSales.observations[1],
  );
  assert.deepEqual(
    result.feed.stashSales.anchor,
    samples.confirmed.stashSales.anchor,
  );
});

test("cache expires at end even on failure while the API anchor stays durable", async () => {
  const result = await run({
    previous: samples.confirmed,
    at: new Date("2026-09-15T00:00:00Z"),
    fail: (_url, s) => !!s,
  });
  assert.equal(observation(result)?.confirmedPeriod, null);
  assert.equal(observation(result)?.status, "unavailable");
  assert.deepEqual(
    result.feed.stashSales.anchor,
    samples.confirmed.stashSales.anchor,
  );
});

test("successful full-price observation clears cached current sale without losing the anchor", async () => {
  const result = await run({ previous: samples.confirmed });
  assert.equal(observation(result)?.confirmedPeriod, null);
  assert.equal(observation(result)?.status, "ok");
  assert.deepEqual(
    result.feed.stashSales.anchor,
    samples.confirmed.stashSales.anchor,
  );
});

test("empty, malformed, incomplete and ambiguous catalogs never become successful no-sale observations", async () => {
  const broken = [
    { data: [] },
    {},
    { data: [tab({ cost: "60", special })] },
    {
      data: [
        tab(),
        tab({ id: "PremiumStashTab", tags: null, cost: 60, special }),
      ],
    },
    {
      data: [
        tab(),
        tab({ id: "PremiumStashTab", tags: "StashTabs", cost: 60, special }),
      ],
    },
    {
      data: [
        tab({
          variants: [
            { id: "VariantTab", tags: null, cost: 60, baseCost: 75, special },
          ],
        }),
      ],
    },
    {
      data: [
        tab({
          cost: 60,
          special: { ...special, start: "2026-02-30T00:00:00Z" },
        }),
      ],
    },
    { data: [tab({ cost: 60, special: { ...special, end: special.start } })] },
    {
      data: [
        tab({ cost: 60, special }),
        tab({
          id: "PremiumStashTab",
          cost: 20,
          special: { ...special, end: "2026-09-16T00:00:00Z" },
        }),
      ],
    },
  ];
  for (const payload of broken) {
    const result = await run({
      previous: samples.confirmed,
      payload: (s) => (s.game === "poe2" ? payload : defaults(s)),
    });
    assert.equal(observation(result)?.status, "unavailable");
    assert.deepEqual(
      observation(result)?.confirmedPeriod,
      samples.confirmed.stashSales.observations[1].confirmedPeriod,
    );
  }
});

test("an equal-start API observation does not swap the persisted anchor between services", async () => {
  const prior = structuredClone(samples.confirmed);
  prior.stashSales.anchor.service = "kakao";
  prior.stashSales.anchor.sourceUrl = SHOP_SOURCES[3].sourceUrl;
  prior.stashSales.nextEstimate.basisSourceUrl = SHOP_SOURCES[3].sourceUrl;
  const result = await apiRun([tab({ cost: 60, special })], {
    previous: prior,
  });
  assert.deepEqual(result.feed.stashSales?.anchor, prior.stashSales.anchor);
});

test("a newer observed sale replaces the manual basis and generates only its next period", async () => {
  const result = await apiRun([tab({ cost: 60, special })], {
    previous: samples.manual,
  });
  assert.equal(result.feed.stashSales?.anchor.origin, "api");
  assert.equal(result.feed.stashSales?.nextEstimate.startDate, "2026-10-02");
});

test("estimates stop after the end date in Seoul and never roll forward without confirmation", async () => {
  const justBefore = await run({
    previous: samples.manual,
    at: new Date("2026-09-15T14:59:59Z"),
  });
  assert.equal(justBefore.feed.stashSales?.nextEstimate?.endDate, "2026-09-15");
  const atEnd = await run({
    previous: justBefore.feed,
    at: new Date("2026-09-15T15:00:00Z"),
  });
  assert.equal(atEnd.feed.stashSales?.nextEstimate, null);
  const later = await run({
    previous: atEnd.feed,
    at: new Date("2026-12-01T00:00:00Z"),
  });
  assert.equal(later.feed.stashSales?.nextEstimate, null);
  assert.deepEqual(
    later.feed.stashSales?.anchor,
    samples.manual.stashSales.anchor,
  );
});

test("API UTC dates are converted to Seoul before the one-time calendar shift", async () => {
  const previous = structuredClone(samples.confirmed);
  Object.assign(previous.stashSales.anchor, {
    startsAt: "2026-12-18T20:00:00Z",
    endsAt: "2026-12-22T20:00:00Z",
    observedAt: "2026-12-19T00:00:00Z",
  });
  previous.stashSales.nextEstimate = null;
  const result = await run({ previous, at: new Date("2026-12-23T00:00:00Z") });
  assert.equal(result.feed.stashSales?.nextEstimate?.startDate, "2027-01-09");
  assert.equal(result.feed.stashSales?.nextEstimate?.endDate, "2027-01-13");
});

test("RSS failure cannot block actual API confirmation or erase known drops", async () => {
  const drop = {
    id: "existing-drop",
    kind: "twitch-drops",
    game: "poe2",
    startsAt: "2026-09-11T00:00:00Z",
    endsAt: "2026-09-12T00:00:00Z",
    sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
    precision: "exact",
  };
  const result = await apiRun([tab({ cost: 60, special })], {
    previous: { ...samples.manual, events: [drop] },
    fail: (url) => url.endsWith("/rss"),
  });
  assert.deepEqual(result.feed.events, [drop]);
  assert.equal(result.feed.stashSales?.anchor.origin, "api");
  assert.ok(result.warnings.some((x) => x.includes("503")));
});

test("the run summary distinguishes a manual prediction from actual API observations", async () => {
  const manual = await run();
  assert.match(manual.summary ?? "", /manual-announcement/);
  assert.match(manual.summary ?? "", /2026-09-11/);
  const confirmed = await apiRun([tab({ cost: 60, special })]);
  assert.match(confirmed.summary ?? "", /CurrencyTab/);
  assert.match(confirmed.summary ?? "", /2026-09-11T00:00:01.000Z/);
  assert.match(confirmed.summary ?? "", /API confirmed/);
});

test("checkedAt and observedAt reflect each completed API request instead of the run start", async () => {
  let time = now.getTime();
  const result = await run({
    clock: () => new Date(time),
    payload: (source) => {
      time += 60_000;
      return source.game === "poe2"
        ? { data: [tab({ cost: 60, special })], meta: {} }
        : defaults(source);
    },
  });
  assert.equal(observation(result)?.checkedAt, "2026-09-11T01:02:00.000Z");
  assert.equal(
    observation(result)?.confirmedPeriod?.observedAt,
    "2026-09-11T01:02:00.000Z",
  );
  assert.equal(result.feed.generatedAt, "2026-09-11T01:04:00.000Z");
});

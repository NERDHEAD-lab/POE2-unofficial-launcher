import assert from "node:assert/strict";
import test from "node:test";
import { parseArticle, parseRss, mergePromotions } from "./collector.mjs";

// Minimal structural fixtures from the GGG staff posts named below; times are facts.
const article = (content, published = "Jul 24, 2026, 6:25:44 AM") =>
  `<table><tr class="newsPost"><td><div class="content">${content}</div></td></tr><tr class="newsPostInfo"><td><span class="staff"></span><span class="post_date">${published}</span></td></tr></table><script>window.momentTimezone = 'Asia/Seoul';</script>`;
const source = (id) => `https://www.pathofexile.com/forum/view-thread/${id}`;

test("RSS decodes CDATA descriptions and ignores unrelated posts", () => {
  const result = parseRss(
    `<rss><channel><item><title>News</title><link>${source(1)}</link><description><![CDATA[<p>Twitch Drops</p>]]></description><pubDate>Thu, 03 Sep 2026 03:00:00 +0000</pubDate></item><item><title>Build Showcase</title></item></channel></rss>`,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].url, source(1));
  assert.throws(() => parseRss("<html>Checking your browser</html>"));
});

test("3987475 uses PDT and excludes Support a Streamer and cross-game FAQ", () => {
  const html = article(
    `<h1>Twitch Drops</h1><h3>Nautical Explorer Back Attachment</h3><strong>Start Time: July 24th 1:00 PM PDT</strong><br><strong>End Time: August 1st 4:59 AM PDT</strong><br>Path of Exile 1 category<h1>Support a Streamer</h1>Start Time: July 25th 1:00 PM PDT<br>End Time: August 2nd 1:00 PM PDT<div class="forum-faq">Path of Exile 2 category</div>`,
  );
  const [event] = parseArticle(html, source(3987475));
  assert.equal(event.game, "poe1");
  assert.equal(event.startsAt, "2026-07-24T20:00:00.000Z");
  assert.equal(event.endsAt, "2026-08-01T11:59:00.000Z");
  assert.equal(parseArticle(html, source(3987475)).length, 1);
});

test("separate weeks stay separate and retain IDs when a period is corrected", () => {
  const html = article(
    `<h1>Twitch Drops</h1><h2>Week 1</h2>Start Time: July 24th 1PM PDT<br>End Time: July 31st 1PM PDT<br>Path of Exile 2 category<h2>Week 2</h2>Start Time: July 31st 1PM PDT<br>End Time: August 7th 1PM PDT<br>Path of Exile 2 category`,
  );
  const events = parseArticle(html, source(2));
  assert.equal(events.length, 2);
  assert.notEqual(events[0].id, events[1].id);
  assert.deepEqual(
    parseArticle(html.replace("August 7th", "August 8th"), source(2)).map(
      (x) => x.id,
    ),
    events.map((x) => x.id),
  );
});

test("4000901 derives start only from an explicit 24-hour duration", () => {
  const html = article(
    `Twitch Drops will be available for 24 hours once the race begins. Path of Exile 1 stream. Twitch Drops end at 2PM PDT on September 4, or Sep 05, 2026 6:00 AM (GMT+9) in your local time.`,
    "Sep 3, 2026, 12:00:00 PM",
  );
  const [event] = parseArticle(html, source(4000901));
  assert.equal(event.startsAt, "2026-09-03T21:00:00.000Z");
  assert.equal(event.endsAt, "2026-09-04T21:00:00.000Z");
});

test("4001078 reads the drops section without confusing realm/patch times", () => {
  const html = article(
    `<h1>Launch Information</h1>Sep 05, 2026 3:00 AM (GMT+9)<h1>New Twitch Drops</h1>Path of Exile 2 Directory<br>Drops will be enabled from September 4th 1PM PDT until September 11th 1PM PDT, or Sep 05, 2026 5:00 AM (GMT+9) until Sep 12, 2026 5:00 AM (GMT+9) in your local time.`,
    "Sep 4, 2026, 7:30:00 AM",
  );
  const [event] = parseArticle(html, source(4001078));
  assert.equal(event.game, "poe2");
  assert.equal(event.startsAt, "2026-09-04T20:00:00.000Z");
  assert.equal(event.endsAt, "2026-09-11T20:00:00.000Z");
});

test("historical stash announcements are no longer parsed into promotion events", () => {
  const html = article(
    `Stash Tab Sale<br>The Stash Tab sale ends at <strong>Apr 07, 2026 10:00 AM (GMT+9)</strong><br>both Path of Exile 1 and 2`,
    "Apr 3, 2026, 9:00:00 AM",
  );
  assert.throws(() => parseArticle(html, source(3926103)), /No supported/);
});

test("unknown game, missing boundaries and non-staff HTML cannot publish", () => {
  assert.throws(() =>
    parseArticle(
      article(
        "Twitch Drops Start Time: July 24th 1PM PDT<br>End Time: July 31st 1PM PDT",
      ),
      source(3),
    ),
  );
  assert.throws(() =>
    parseArticle(article("Twitch Drops Path of Exile 2 category"), source(3)),
  );
  assert.throws(() => parseArticle("<html>Just a moment</html>", source(3)));
});

test("Eastern-time drops produce precise UTC bounds", () => {
  const html = article(
    "Twitch Drops<br>Start Time: Apr 2, 2026 8PM EDT<br>End Time: Apr 6, 2026 9PM EDT<br>Path of Exile 2 category",
    "Apr 2, 2026, 8:00:00 PM",
  ).replace("Asia/Seoul", "America/New_York");
  const [event] = parseArticle(html, source(3926103));
  assert.equal(event.startsAt, "2026-04-03T00:00:00.000Z");
  assert.equal(event.endsAt, "2026-04-07T01:00:00.000Z");
});

test("overrides win; disabled IDs stay removed; reposts do not duplicate campaigns", () => {
  const now = new Date("2026-09-04T02:00:00Z");
  const base = {
    id: "ggg-1-twitch",
    kind: "twitch-drops",
    game: "poe2",
    startsAt: "2026-09-04T00:00:00Z",
    endsAt: "2026-09-08T00:00:00Z",
    sourceUrl: source(1),
    precision: "exact",
  };
  const previous = {
    schemaVersion: 1,
    generatedAt: "2026-09-04T00:00:00Z",
    events: [base],
  };
  const repost = {
    ...base,
    id: "ggg-2-twitch",
    sourceUrl: source(2),
    startsAt: "2026-09-04T00:00:00.000Z",
  };
  const result = mergePromotions(
    previous,
    [repost],
    { events: [], disabledIds: [] },
    now,
  );
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, base.id);
  assert.equal(
    mergePromotions(previous, [], { events: [], disabledIds: [base.id] }, now)
      .events.length,
    0,
  );
  assert.equal(
    mergePromotions(
      previous,
      [],
      {
        events: [
          { ...base, precision: "manual", endsAt: "2026-09-09T00:00:00Z" },
        ],
        disabledIds: [],
      },
      now,
    ).events[0].endsAt,
    "2026-09-09T00:00:00Z",
  );
});

test("a staff reply cannot authenticate a non-staff original post", () => {
  const html =
    article(
      "Twitch Drops Start Time: July 24th 1PM PDT<br>End Time: July 31st 1PM PDT<br>Path of Exile 1 category",
    ).replace('<span class="staff"></span>', "") +
    '<tr class="newsPostInfo"><td><span class="staff"></span></td></tr>';
  assert.throws(() => parseArticle(html, source(4)), /staff/i);
});

const sale = {
  id: "ggg-1-twitch",
  kind: "twitch-drops",
  game: "poe2",
  startsAt: "2026-09-04T00:00:00Z",
  endsAt: "2026-09-08T00:00:00Z",
  sourceUrl: source(1),
  precision: "exact",
};
const previousFeed = (events) => ({
  schemaVersion: 1,
  generatedAt: "2026-09-04T00:00:00Z",
  events,
});
const now = new Date("2026-09-04T01:00:00Z");
const overrides = { events: [], disabledIds: [] };

test("different drops starts are different schedules", () => {
  const result = mergePromotions(
    previousFeed([sale]),
    [
      {
        ...sale,
        id: "ggg-2-twitch",
        sourceUrl: source(2),
        startsAt: "2026-09-04T01:00:00Z",
      },
    ],
    overrides,
    now,
  );
  assert.equal(result.events.length, 2);
});

test("canonical source replacement removes deleted sections", () => {
  const old = [
    sale,
    { ...sale, id: "deleted", startsAt: "2026-09-05T00:00:00Z" },
  ].map((event) => ({
    ...event,
    sourceUrl: `${source(1)}/filter-account-type/staff`,
  }));
  assert.deepEqual(
    mergePromotions(previousFeed(old), [sale], overrides, now).events,
    [sale],
  );
});

test("manual schedules take precedence and cannot duplicate automatic schedules", () => {
  const manual = { ...sale, id: "manual-copy", precision: "manual" };
  assert.deepEqual(
    mergePromotions(
      previousFeed([sale]),
      [],
      { ...overrides, events: [manual] },
      now,
    ).events,
    [manual],
  );
});

test("a disabled prior ID cannot return via a duplicate repost", () => {
  const repost = { ...sale, id: "repost", sourceUrl: source(2) };
  assert.equal(
    mergePromotions(
      previousFeed([sale]),
      [repost],
      { ...overrides, disabledIds: [sale.id] },
      now,
    ).events.length,
    0,
  );
});

test("invalid or non-manual overrides fail before expiry/disabled filtering", () => {
  for (const event of [{ ...sale, endsAt: "invalid" }, sale]) {
    assert.throws(() =>
      mergePromotions(
        null,
        [],
        { events: [event], disabledIds: [event.id] },
        now,
      ),
    );
  }
});

test("ended schedules are removed at the exact boundary; active and upcoming remain", () => {
  const expired = {
    ...sale,
    id: "old",
    startsAt: "2026-09-03T00:00:00Z",
    endsAt: "2026-09-04T01:00:00Z",
  };
  const upcoming = {
    ...sale,
    id: "upcoming",
    startsAt: "2026-09-05T00:00:00Z",
  };
  assert.deepEqual(
    mergePromotions(previousFeed([expired, sale, upcoming]), [], overrides, now)
      .events,
    [sale, upcoming],
  );
});

test("winter PST, year rollover and DST-invalid dates are handled explicitly", () => {
  const body =
    "Twitch Drops Start Time: December 31st 11PM PST<br>End Time: January 1st 1AM PST<br>Path of Exile 1 category";
  const [event] = parseArticle(
    article(body, "Dec 30, 2026, 9:00:00 AM"),
    source(5),
  );
  assert.equal(event.startsAt, "2027-01-01T07:00:00.000Z");
  assert.equal(event.endsAt, "2027-01-01T09:00:00.000Z");
  for (const date of ["Mar 8, 2026, 2:30:00 AM", "Nov 1, 2026, 1:30:00 AM"]) {
    const html = article(
      "Stash Tab Sale<br>The Stash Tab sale ends at Nov 2, 2026 9PM EST<br>both Path of Exile 1 and 2",
      date,
    ).replace("Asia/Seoul", "America/New_York");
    assert.throws(() => parseArticle(html, source(6)), /local source date/);
  }
});

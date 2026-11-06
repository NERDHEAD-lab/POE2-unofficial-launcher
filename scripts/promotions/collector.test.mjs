import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  parseArticle,
  parseRss,
  mergePromotions,
  compileGameRules,
} from "./collector.mjs";

// Minimal structural fixtures from the GGG staff posts named below; times are facts.
const article = (content, published = "Jul 24, 2026, 6:25:44 AM") =>
  `<table><tr class="newsPost"><td><div class="content">${content}</div></td></tr><tr class="newsPostInfo"><td><span class="staff"></span><span class="post_date">${published}</span></td></tr></table><script>window.momentTimezone = 'Asia/Seoul';</script>`;
const source = (id) => `https://www.pathofexile.com/forum/view-thread/${id}`;
const exilecon = readFileSync(
  new URL("./fixtures/exilecon-4012689.html", import.meta.url),
  "utf8",
);

test("4012689 publishes its shared viewing directory for both games using the explicit GMT+9 dates", () => {
  const events = parseArticle(exilecon, source(4012689));
  assert.deepEqual(
    events.map(({ game, startsAt, endsAt }) => ({ game, startsAt, endsAt })),
    ["poe1", "poe2"].map((game) => ({
      game,
      startsAt: "2026-11-06T20:30:00.000Z",
      endsAt: "2026-11-08T06:59:00.000Z",
    })),
  );
  assert.notEqual(events[0].id, events[1].id);
  assert.deepEqual(
    events.map((event) => event.title),
    ["ExileCon 트위치 드롭스", "ExileCon 트위치 드롭스"],
  );
  assert.deepEqual(
    events.map((event) => event.id),
    [
      "ggg-4012689-twitch-591814b46c-poe1",
      "ggg-4012689-twitch-591814b46c-poe2",
    ],
  );
  assert.ok(
    events.every(
      (event) =>
        event.watchUrl === "https://www.twitch.tv/directory/category/exilecon",
    ),
  );
  assert.deepEqual(
    parseArticle(
      exilecon.replace("Nov 08, 2026 3:59 PM", "Nov 08, 2026 4:59 PM"),
      source(4012689),
    ).map((event) => event.id),
    events.map((event) => event.id),
  );
});

test("display names use decoded reward headings and never instructional headings or a thread ID", () => {
  const range =
    "Start Time: July 24th 1PM PDT<br>End Time: July 31st 1PM PDT<br>Path of Exile 2 category";
  const [reward] = parseArticle(
    article(`<h2>Week 1 - Raven&#39;s &amp; Moon</h2>${range} Twitch Drops`),
    source(4012689),
  );
  assert.equal(reward.title, "Week 1 - Raven's & Moon 트위치 드롭스");
  assert.notEqual(reward.title, "ExileCon 트위치 드롭스");
  for (const heading of [
    "How to Participate",
    "Launch Information",
    "Linking your Path of Exile Account to Twitch",
  ])
    assert.equal(
      parseArticle(
        article(`<h2>${heading}</h2>${range} Twitch Drops`),
        source(2),
      )[0].title,
      "트위치 드롭스",
    );
});

test("viewing links prefer the event directory over channels and exclude FAQ, account and creator links", () => {
  const withLinks = exilecon
    .replace(
      "http://www.twitch.tv/pathofexile",
      "https://www.twitch.tv/pathofexile",
    )
    .replace(
      "during this time:",
      `during this time:
      <a href="https://dashboard.twitch.tv/drops">Creator Dashboard</a>
      <a href="https://www.twitch.tv/drops/inventory">Twitch Inventory</a>
      <a href="https://www.twitch.tv/settings">Twitch settings</a>
      <div class="forum-faq"><a href="https://www.twitch.tv/directory/category/unrelated">Another directory</a></div>`,
    );
  assert.equal(
    parseArticle(withLinks, source(4012689))[0].watchUrl,
    "https://www.twitch.tv/directory/category/exilecon",
  );
  const withoutDirectory = withLinks.replace(
    "https://www.twitch.tv/directory/category/exilecon",
    "",
  );
  assert.equal(
    parseArticle(withoutDirectory, source(4012689))[0].watchUrl,
    "https://www.twitch.tv/pathofexile",
  );
  assert.equal(
    parseArticle(
      withoutDirectory.replace(
        "https://www.twitch.tv/pathofexile",
        "http://www.twitch.tv/pathofexile",
      ),
      source(4012689),
    )[0].watchUrl,
    undefined,
  );
  assert.throws(
    () =>
      parseArticle(
        withLinks.replace(
          "during this time:",
          'during this time: <a href="https://www.twitch.tv/directory/category/other-event">Another directory</a>',
        ),
        source(4012689),
      ),
    /Ambiguous Twitch viewing URL/,
  );
});

test("localized date labels use the source IANA zone while explicit GMT offsets keep precedence", () => {
  // Regional variants exercise the IANA fallback; only the GMT+9 fixture is a saved source.
  for (const [zone, start, end] of [
    [
      "America/Chicago",
      "Nov 06, 2026 2:30 PM (CST)",
      "Nov 08, 2026 12:59 AM (CST)",
    ],
    [
      "Asia/Shanghai",
      "Nov 07, 2026 4:30 AM (CST)",
      "Nov 08, 2026 2:59 PM (CST)",
    ],
  ]) {
    const variant = exilecon
      .replace("Asia/Seoul", zone)
      .replace("Nov 07, 2026 5:30 AM (GMT+9)", start)
      .replace("Nov 08, 2026 3:59 PM (GMT+9)", end);
    const [event] = parseArticle(variant, source(4012689));
    assert.equal(event.startsAt, "2026-11-06T20:30:00.000Z");
    assert.equal(event.endsAt, "2026-11-08T06:59:00.000Z");
  }
  assert.deepEqual(
    parseArticle(
      exilecon.replace("Asia/Seoul", "America/Chicago"),
      source(4012689),
    ),
    parseArticle(exilecon, source(4012689)).map((event) => ({
      ...event,
      sourcePublishedAt: "2026-11-06T10:52:47.000Z",
    })),
  );
  const [range] = parseArticle(
    article(
      "Twitch Drops Path of Exile 2 directory<br>Drops will be enabled from Nov 06, 2026 2:30 PM CST until Nov 08, 2026 12:59 AM CST",
      "Nov 6, 2026, 4:52:47 AM",
    ).replace("Asia/Seoul", "America/Chicago"),
    source(4012689),
  );
  assert.equal(range.startsAt, "2026-11-06T20:30:00.000Z");
  assert.equal(range.endsAt, "2026-11-08T06:59:00.000Z");
});

test("unmatched viewing text stays unknown and declaration order resolves overlapping game evidence", () => {
  for (const replacement of [
    "Exilecon broadcast",
    '<span class="forum-faq">Exilecon directory</span>',
  ]) {
    const events = parseArticle(
      exilecon.replace("Exilecon directory", replacement),
      source(4012689),
    );
    assert.deepEqual(
      events.map((event) => [event.game, event.gameUnknown]),
      [
        ["poe1", true],
        ["poe2", true],
      ],
    );
  }
  const overlap = parseArticle(
    exilecon.replace(
      "Exilecon directory",
      "Exilecon directory or Path of Exile 1 category",
    ),
    source(4012689),
  );
  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].game, "poe1");
  assert.equal(overlap[0].gameUnknown, undefined);
  const [single] = parseArticle(
    exilecon.replace("Exilecon directory", "Path of Exile 1 category"),
    source(4012689),
  );
  assert.equal(single.game, "poe1");
  // This pre-change ID must stay valid even when the post mentions both games.
  assert.equal(single.id, "ggg-4012689-twitch-591814b46c");
});

test("shared drops survive recollection and reposts per game, then replace and expire normally", () => {
  const events = parseArticle(exilecon, source(4012689));
  const controls = { events: [], disabledIds: [] };
  const collectedAt = new Date("2026-11-06T12:00:00Z");
  const first = mergePromotions(null, events, controls, collectedAt);
  const second = mergePromotions(first, events, controls, collectedAt);
  assert.deepEqual(second.events, first.events);
  const newWatchUrl = "https://www.twitch.tv/directory/category/future-event";
  const moved = mergePromotions(
    first,
    parseArticle(
      exilecon.replace(
        "https://www.twitch.tv/directory/category/exilecon",
        newWatchUrl,
      ),
      source(4012689),
    ),
    controls,
    collectedAt,
  );
  assert.deepEqual(
    moved.events.map((event) => event.id),
    events.map((event) => event.id),
  );
  assert.ok(moved.events.every((event) => event.watchUrl === newWatchUrl));
  const repost = mergePromotions(
    second,
    parseArticle(exilecon, source(4012690)),
    controls,
    collectedAt,
  );
  assert.deepEqual(repost.events, first.events);
  assert.deepEqual(
    mergePromotions(
      first,
      events,
      { ...controls, disabledIds: [events[0].id] },
      collectedAt,
    ).events,
    [events[1]],
  );
  const corrected = parseArticle(
    exilecon
      .replace("Exilecon directory", "Path of Exile 1 category")
      .replace("Nov 08, 2026 3:59 PM", "Nov 08, 2026 4:59 PM"),
    source(4012689),
  );
  assert.deepEqual(
    mergePromotions(first, corrected, controls, collectedAt).events,
    corrected,
  );
  assert.deepEqual(
    mergePromotions(first, events, controls, new Date("2026-11-08T06:59:00Z"))
      .events,
    [],
  );
});

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
  assert.deepEqual(
    events.map((event) => event.title),
    ["Week 1 트위치 드롭스", "Week 2 트위치 드롭스"],
  );
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

test("unknown games use compatibility copies but missing boundaries and non-staff HTML still fail", () => {
  assert.deepEqual(
    parseArticle(
      article(
        "Twitch Drops Start Time: July 24th 1PM PDT<br>End Time: July 31st 1PM PDT",
      ),
      source(3),
    ).map((event) => [event.game, event.gameUnknown]),
    [
      ["poe1", true],
      ["poe2", true],
    ],
  );
  assert.throws(() =>
    parseArticle(article("Twitch Drops Path of Exile 2 category"), source(3)),
  );
  assert.throws(() => parseArticle("<html>Just a moment</html>", source(3)));
});

test("ordered rules use literal keywords, fixed case-insensitivity, first match and an explicit OFF stop", () => {
  const first = {
    type: "keyword",
    value: "EXILECON DIRECTORY",
    games: { poe1: false, poe2: true },
  };
  const off = {
    type: "regex",
    value: "directory",
    games: { poe1: false, poe2: false },
  };
  const parse = (rules) =>
    parseArticle(
      exilecon,
      source(4012689),
      undefined,
      compileGameRules({ rules }),
    );
  assert.deepEqual(
    parse([first, off]).map((event) => [event.game, event.gameUnknown]),
    [["poe2", undefined]],
  );
  assert.deepEqual(parse([off, first]), []);
  assert.ok(
    parse([{ ...first, value: "Exilecon.directory" }]).every(
      (event) => event.gameUnknown,
    ),
  );
  assert.equal(
    parse([{ ...first, type: "regex", value: "Exilecon.directory" }])[0].game,
    "poe2",
  );
});

test("game mapping changes retain every surviving projection ID", () => {
  const controls = { events: [], disabledIds: [] };
  const now = new Date("2026-11-06T12:00:00Z");
  const rule = (games) =>
    compileGameRules({
      rules: [{ type: "keyword", value: "Exilecon directory", games }],
    });
  const one = mergePromotions(
    null,
    parseArticle(
      exilecon,
      source(4012689),
      undefined,
      rule({ poe1: true, poe2: false }),
    ),
    controls,
    now,
  );
  const both = mergePromotions(
    one,
    parseArticle(exilecon, source(4012689)),
    controls,
    now,
  );
  assert.equal(
    both.events.find((event) => event.game === "poe1").id,
    one.events[0].id,
  );
  assert.equal(
    both.events.find((event) => event.game === "poe2").id,
    "ggg-4012689-twitch-591814b46c-poe2",
  );
  const two = mergePromotions(
    both,
    parseArticle(
      exilecon,
      source(4012689),
      undefined,
      rule({ poe1: false, poe2: true }),
    ),
    controls,
    now,
  );
  assert.deepEqual(
    two.events.map((event) => event.id),
    [both.events.find((event) => event.game === "poe2").id],
  );
  const repost = mergePromotions(
    one,
    parseArticle(exilecon, source(9), "2026-11-06T12:00:00Z"),
    controls,
    now,
  );
  assert.equal(
    repost.events.find((event) => event.game === "poe1").id,
    one.events[0].id,
  );
  assert.ok(
    repost.events.every(
      (event) =>
        event.sourceUrl === source(9) &&
        event.sourceGroupId === "ggg-9-twitch-591814b46c",
    ),
  );
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

test("latest automatic publication wins as one metadata record while manual and stable ties retain priority", () => {
  const first = {
    ...sale,
    title: "old",
    watchUrl: "https://www.twitch.tv/old",
    sourcePublishedAt: "2026-09-01T00:00:00Z",
  };
  const latest = {
    ...sale,
    id: "ggg-2-twitch",
    sourceUrl: source(2),
    sourceGroupId: "ggg-2-twitch-0123456789",
    title: "new",
    watchUrl: "https://www.twitch.tv/new",
    gameUnknown: true,
    precision: "derived-start",
    sourcePublishedAt: "2026-09-02T00:00:00Z",
  };
  assert.deepEqual(
    mergePromotions(previousFeed([first]), [latest], overrides, now).events,
    [{ ...latest, id: first.id }],
  );
  const manual = { ...first, id: "manual", precision: "manual" };
  assert.deepEqual(
    mergePromotions(
      previousFeed([first]),
      [latest],
      { ...overrides, events: [manual] },
      now,
    ).events,
    [manual],
  );
  for (const date of [undefined, first.sourcePublishedAt]) {
    const stable = { ...first, sourcePublishedAt: date };
    assert.deepEqual(
      mergePromotions(
        null,
        [stable, { ...latest, sourcePublishedAt: date }],
        overrides,
        now,
      ).events,
      [stable].map(({ sourcePublishedAt, ...event }) =>
        sourcePublishedAt === undefined
          ? event
          : { ...event, sourcePublishedAt },
      ),
    );
  }
  const withoutDate = { ...first };
  delete withoutDate.sourcePublishedAt;
  assert.deepEqual(
    mergePromotions(null, [withoutDate, latest], overrides, now).events,
    [latest],
  );
  const noTitle = { ...latest };
  delete noTitle.title;
  assert.equal(
    mergePromotions(previousFeed([first]), [noTitle], overrides, now).events[0]
      .title,
    undefined,
  );
});

test("publication metadata uses RSS then dated staff information and never invents a missing year", () => {
  const content =
    "Twitch Drops<br>Start Time: Jul 24, 2026 1PM PDT<br>End Time: Jul 31, 2026 1PM PDT<br>Path of Exile 2 category";
  assert.equal(
    parseArticle(article(content), source(9))[0].sourcePublishedAt,
    "2026-07-23T21:25:44.000Z",
  );
  assert.equal(
    parseArticle(article(content), source(9), "2026-07-24T00:00:00Z")[0]
      .sourcePublishedAt,
    "2026-07-24T00:00:00Z",
  );
  for (const published of ["", "Jul 24, 6:25:44 AM"])
    assert.equal(
      parseArticle(article(content, published), source(9))[0].sourcePublishedAt,
      undefined,
    );
});

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
      `Twitch Drops<br>Start Time: ${date}<br>End Time: Nov 2, 2026 9PM EST<br>Path of Exile 1 category`,
      date,
    ).replace("Asia/Seoul", "America/New_York");
    assert.throws(() => parseArticle(html, source(6)), /local source date/);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { collect, collectToFile } from "./collect.mjs";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
} from "node:fs/promises";
import { resolve, join, sep } from "node:path";

const previous = {
  schemaVersion: 1,
  generatedAt: "2026-09-04T00:00:00Z",
  events: [
    {
      id: "ggg-1-twitch-370116f319",
      kind: "twitch-drops",
      game: "poe2",
      startsAt: "2026-09-04T00:00:00Z",
      endsAt: "2026-09-08T00:00:00Z",
      sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
      precision: "exact",
    },
  ],
};
const shopReply = (url) =>
  JSON.stringify(
    url.includes("categories")
      ? {
          items: [
            {
              id: "CurrencyTab",
              guild: false,
              cost: 75,
              originalCost: 75,
              onSpecial: false,
            },
          ],
          total: 1,
        }
      : {
          data: [
            {
              id: "CurrencyTab",
              guild: false,
              tags: ["StashTabs"],
              cost: 75,
              baseCost: 75,
            },
          ],
          meta: {},
        },
  );
const options = {
  previous,
  overrides: { events: [], disabledIds: [] },
  now: new Date("2026-09-04T01:00:00Z"),
  pause: async () => {},
};

test("failed discovery preserves existing drops and reports all shop sources unavailable", async () => {
  const result = await collect({
    ...options,
    fetchText: async () => "<html>challenge</html>",
  });
  assert.deepEqual(result.feed.events, previous.events);
  assert.ok(
    result.feed.stashSales.observations.every(
      (x) => x.status === "unavailable",
    ),
  );
});

test("invalid previous input leaves previous output byte-for-byte intact", async (t) => {
  await mkdir(".tmp", { recursive: true });
  const parent = await realpath(resolve(".tmp"));
  const dir = await mkdtemp(join(parent, "promotions-file-test-"));
  t.after(async () => {
    assert.ok((await realpath(dir)).startsWith(parent + sep));
    await rm(dir, { recursive: true });
  });
  const output = join(dir, "promotions.json");
  const original = JSON.stringify({ ...previous, schemaVersion: 2 });
  await writeFile(output, original);
  await assert.rejects(
    collectToFile({
      ...options,
      output,
      fetchText: async () => "<html>challenge</html>",
    }),
  );
  assert.equal(await readFile(output, "utf8"), original);
});

const rss =
  "<rss><channel><item><title>Build Showcase</title></item></channel></rss>";
const emptyForum = '<table class="forumTable"></table>';
const drop =
  '<table><tr class="newsPost"><td><div class="content">Twitch Drops<br>Start Time: Sep 4, 2026 12AM UTC<br>End Time: Sep 8, 2026 12AM UTC<br>Path of Exile 2 category</div></td></tr><tr class="newsPostInfo"><td><span class="staff"></span><span class="post_date">Sep 4, 2026, 9:00:00 AM</span></td></tr></table><script>window.momentTimezone = "Asia/Seoul";</script>';

test("bootstrap finds page-two schedules with a hard three-page bound", async () => {
  const calls = [];
  const { feed } = await collect({
    ...options,
    previous: null,
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      calls.push(url);
      if (url.endsWith("/rss")) return rss;
      if (url.endsWith("/news/page/2"))
        return '<table class="forumTable"><a href="/forum/view-thread/2">Twitch Drops</a></table>';
      if (url.includes("view-forum")) return emptyForum;
      return drop;
    },
  });
  assert.equal(feed.events[0]?.kind, "twitch-drops");
  assert.equal(calls.filter((url) => url.includes("view-forum")).length, 6);
  assert.ok(calls.every((url) => !url.endsWith("/page/4")));
});

test("fresh and stale feeds retain the same bounded discovery window", async () => {
  for (const [generatedAt, expectedPages] of [
    ["2026-09-04T00:00:00Z", 6],
    ["2026-08-01T00:00:00Z", 6],
  ]) {
    const calls = [];
    await collect({
      ...options,
      previous: { ...previous, generatedAt },
      fetchText: async (url) => {
        if (url.includes("/api/")) return shopReply(url);
        calls.push(url);
        if (url.endsWith("/rss")) return rss;
        if (url.includes("view-forum")) return emptyForum;
        return drop;
      },
    });
    assert.equal(
      calls.filter((url) => url.includes("view-forum")).length,
      expectedPages,
    );
  }
});

test("a failed page-two source is rediscovered on the next scheduled run", async () => {
  let recovered = false;
  const config = {
    ...options,
    previous: null,
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      if (url.endsWith("/rss")) return rss;
      if (url.endsWith("/news"))
        return '<table class="forumTable"><a href="/forum/view-thread/1">Twitch Drops</a></table>';
      if (url.endsWith("/news/page/2"))
        return '<table class="forumTable"><a href="/forum/view-thread/2">Twitch Drops</a></table>';
      if (url.includes("view-forum")) return emptyForum;
      if (url.includes("/view-thread/2/")) {
        if (!recovered) throw new Error("HTTP 503");
        return drop.replace("Sep 4, 2026 12AM UTC", "Sep 4, 2026 1AM UTC");
      }
      return drop;
    },
  };
  const first = await collect(config);
  assert.equal(first.feed.events.length, 1);
  recovered = true;
  const second = await collect({
    ...config,
    previous: first.feed,
    now: new Date("2026-09-04T07:00:00Z"),
  });
  assert.equal(second.feed.events.length, 2);
});

test("a failed bootstrap discovery page still allows successful shop observations", async () => {
  const result = await collect({
    ...options,
    previous: null,
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      if (url.endsWith("/rss")) return rss;
      if (url.endsWith("/page/2")) throw new Error("HTTP 503");
      return emptyForum;
    },
  });
  assert.deepEqual(result.feed.events, []);
  assert.ok(
    result.feed.stashSales.observations.every((x) => x.status === "ok"),
  );
  assert.ok(result.warnings.some((x) => x.includes("503")));
});

test("a failed source is preserved while a different source advances", async () => {
  const { feed, warnings } = await collect({
    ...options,
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      if (url.endsWith("/rss")) return rss;
      if (url.includes("view-forum"))
        return '<table class="forumTable"><a href="/forum/view-thread/2">Twitch Drops</a></table>';
      if (url.includes("/view-thread/1/")) throw new Error("HTTP 503");
      return drop.replace("Sep 4, 2026 12AM UTC", "Sep 4, 2026 1AM UTC");
    },
  });
  assert.equal(feed.events.length, 2);
  assert.deepEqual(
    feed.events.find((event) => event.id === previous.events[0].id),
    previous.events[0],
  );
  assert.equal(warnings.length, 1);
});

test("failed active source preserves last known events and reports the source", async () => {
  const { feed, warnings } = await collect({
    ...options,
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      if (url.endsWith("/rss"))
        return "<rss><channel><item><title>Build Showcase</title></item></channel></rss>";
      if (url.includes("view-forum"))
        return '<table class="forumTable"></table>';
      throw new Error("HTTP 503");
    },
  });
  assert.deepEqual(feed.events, previous.events);
  assert.equal(warnings.length, 1);
});

test("disabled official source is rechecked so a repost stays disabled on later runs", async () => {
  const calls = [];
  const config = {
    ...options,
    previous: null,
    overrides: { events: [], disabledIds: ["ggg-1-twitch-370116f319"] },
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      calls.push(url);
      if (url.endsWith("/rss")) return rss;
      if (url.includes("view-forum"))
        return '<table class="forumTable"><a href="/forum/view-thread/2">Twitch Drops</a></table>';
      return drop;
    },
  };
  const first = await collect(config);
  const second = await collect({ ...config, previous: first.feed });
  assert.equal(first.feed.events.length, 0);
  assert.equal(second.feed.events.length, 0);
  assert.equal(
    calls.filter((url) => url.includes("/view-thread/1/")).length,
    2,
  );
});

test("an unavailable disabled source cannot silently re-enable its reposts", async () => {
  const result = await collect({
    ...options,
    overrides: { events: [], disabledIds: ["ggg-1-twitch-370116f319"] },
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      if (url.endsWith("/rss")) return rss;
      if (url.includes("view-forum")) return emptyForum;
      throw new Error("HTTP 503");
    },
  });
  assert.deepEqual(result.feed.events, []);
  assert.ok(result.warnings.some((x) => /disabled source/i.test(x)));
});

test("legacy stash events and stash-only forum announcements do not enter the drops feed", async () => {
  const result = await collect({
    ...options,
    previous: {
      ...previous,
      events: [{ ...previous.events[0], kind: "stash-sale", game: "both" }],
    },
    fetchText: async (url) => {
      if (url.includes("/api/")) return shopReply(url);
      if (url.endsWith("/rss"))
        return "<rss><channel><item><title>Stash Tab Sale</title></item></channel></rss>";
      if (url.includes("view-forum"))
        return '<table class="forumTable"><a href="/forum/view-thread/2">Stash Tab Sale</a></table>';
      throw new Error("Stash-only source must not be fetched");
    },
  });
  assert.deepEqual(result.feed.events, []);
  assert.deepEqual(result.warnings, []);
});

test("unavailable shop APIs cannot block newly discovered drops", async () => {
  const result = await collect({
    ...options,
    previous: null,
    fetchText: async (url) => {
      if (url.includes("/api/")) throw new Error("HTTP 403");
      if (url.endsWith("/rss")) return rss;
      if (url.includes("view-forum"))
        return '<table class="forumTable"><a href="/forum/view-thread/2">Twitch Drops</a></table>';
      return drop;
    },
  });
  assert.equal(result.feed.events.length, 1);
  assert.equal(result.feed.events[0].kind, "twitch-drops");
  assert.ok(
    result.feed.stashSales.observations.every(
      (x) => x.status === "unavailable",
    ),
  );
});

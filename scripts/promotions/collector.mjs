import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { parsePromotionFeed, scheduleKey } from "./contract.mjs";

const candidate = /\btwitch\s+drops?\b/i;
const text = (html) =>
  parse(`<div>${html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")}</div>`).text;
export function canonicalSource(url) {
  const match =
    /^https:\/\/www\.pathofexile\.com\/forum\/view-thread\/(\d+)(?:\/filter-account-type\/staff)?$/.exec(
      url,
    );
  if (!match) throw new Error("Not an official GGG announcement URL");
  return `https://www.pathofexile.com/forum/view-thread/${match[1]}`;
}

export function parseRss(xml) {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<item>/i.test(xml))
    throw new Error("Invalid GGG RSS response");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].flatMap(([, item]) => {
    const field = (tag) =>
      text(
        new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i").exec(item)?.[1] ??
          "",
      ).trim();
    if (!candidate.test(`${field("title")} ${field("description")}`)) return [];
    const published = Date.parse(field("pubDate"));
    if (!Number.isFinite(published))
      throw new Error("RSS publication time missing");
    return [
      {
        url: canonicalSource(field("link")),
        publishedAt: new Date(published).toISOString(),
      },
    ];
  });
}

export function parseForum(html) {
  const root = parse(html);
  if (!root.querySelector(".forumTable"))
    throw new Error("Invalid GGG forum response");
  return root
    .querySelectorAll('a[href^="/forum/view-thread/"]')
    .flatMap((link) => {
      if (!candidate.test(link.text)) return [];
      const path = /^\/forum\/view-thread\/\d+/.exec(
        link.getAttribute("href"),
      )?.[0];
      return path
        ? [{ url: canonicalSource(`https://www.pathofexile.com${path}`) }]
        : [];
    });
}

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const datePattern =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?,?\s+(\d{1,2})(?::(\d\d))?(?::(\d\d))?\s*(AM|PM)\s*(?:\(?\s*(PDT|PST|EDT|EST|UTC|GMT(?:[+-]\d{1,2}(?::\d\d)?)?)\)?)?/i;

function offsetMinutes(zone, instant) {
  const fixed = { PDT: -420, PST: -480, EDT: -240, EST: -300, UTC: 0, GMT: 0 };
  if (zone in fixed) return fixed[zone];
  const label = zone.startsWith("GMT")
    ? zone
    : new Intl.DateTimeFormat("en", {
        timeZone: zone,
        timeZoneName: "longOffset",
      })
        .formatToParts(new Date(instant))
        .find((x) => x.type === "timeZoneName").value;
  if (label === "GMT") return 0;
  const match = /^GMT([+-])(\d{1,2})(?::(\d\d))?$/.exec(label);
  if (!match || Number(match[2]) > 14 || Number(match[3] ?? 0) > 59)
    throw new Error("Unknown source timezone");
  return (
    (match[1] === "+" ? 1 : -1) *
    (Number(match[2]) * 60 + Number(match[3] ?? 0))
  );
}

function calendarTime(value, reference, fallbackZone) {
  const match = datePattern.exec(value);
  if (!match) throw new Error("Missing explicit date");
  const [
    ,
    month,
    day,
    year,
    hours,
    minutes = "0",
    seconds = "0",
    meridiem,
    literalZone,
  ] = match;
  const zone = literalZone?.toUpperCase() ?? fallbackZone;
  if (
    !zone ||
    +hours < 1 ||
    +hours > 12 ||
    +minutes > 59 ||
    +seconds > 59 ||
    +day < 1 ||
    +day > 31
  )
    throw new Error("Incomplete source date");
  const monthNumber = months.indexOf(month.slice(0, 3).toLowerCase());
  let yearNumber = year ? Number(year) : new Date(reference).getUTCFullYear();
  // Announcements near New Year can refer to the following January.
  if (!year && new Date(reference).getUTCMonth() === 11 && monthNumber === 0)
    yearNumber++;
  const wall = Date.UTC(
    yearNumber,
    monthNumber,
    +day,
    (+hours % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0),
    +minutes,
    +seconds,
  );
  if (new Date(wall).getUTCMonth() !== monthNumber)
    throw new Error("Invalid calendar date");
  let instant = wall;
  for (let i = 0; i < 3; i++)
    instant = wall - offsetMinutes(zone, instant) * 60_000;
  if (instant + offsetMinutes(zone, instant) * 60_000 !== wall)
    throw new Error("Nonexistent local source date");
  if (
    !["PDT", "PST", "EDT", "EST", "UTC"].includes(zone) &&
    !zone.startsWith("GMT")
  ) {
    for (const delta of [-3600_000, 3600_000]) {
      if (
        instant + delta + offsetMinutes(zone, instant + delta) * 60_000 ===
        wall
      )
        throw new Error("Ambiguous local source date");
    }
  }
  return new Date(instant).toISOString();
}

function twitchGame(section) {
  const one = /Path of Exile(?:\s+1)?\s+(?:category|directory|stream)/i.test(
    section,
  );
  const two = /Path of Exile\s+2\s+(?:category|directory|stream)/i.test(
    section,
  );
  if (one === two) throw new Error("Ambiguous Twitch game category");
  return one ? "poe1" : "poe2";
}

export function parseArticle(html, sourceUrl, publishedAt) {
  sourceUrl = canonicalSource(sourceUrl);
  const root = parse(html);
  const post = root.querySelector(".newsPost");
  const content = post?.querySelector(".content");
  const info = post?.nextElementSibling;
  if (
    !content ||
    !info?.classList.contains("newsPostInfo") ||
    !info.querySelector(".staff")
  )
    throw new Error("Original GGG staff post not found");
  const zone = /window\.momentTimezone\s*=\s*['"]([^'"]+)['"]/.exec(html)?.[1];
  const published =
    publishedAt ??
    calendarTime(
      info.querySelector(".post_date")?.text ?? "",
      Date.now(),
      zone,
    );
  for (const node of content.querySelectorAll(
    ".forum-faq, .forum-faq-show-all, script, style",
  ))
    node.remove();
  const body = text(
    content.innerHTML
      .replace(
        /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
        (_, level, heading) => `\n@@${level}:${text(heading)}\n`,
      )
      .replace(/<br\s*\/?>/gi, "\n"),
  );
  const thread = /\d+$/.exec(sourceUrl)[0];
  const events = [];
  const add = (kind, game, startsAt, endsAt, section, precision = "exact") => {
    if (Math.abs(Date.parse(startsAt) - Date.parse(published)) > 60 * 86400_000)
      throw new Error("Event too far from publication");
    const suffix = `twitch-${createHash("sha256").update(section.toLowerCase().trim()).digest("hex").slice(0, 10)}`;
    events.push({
      id: `ggg-${thread}-${suffix}`,
      kind,
      game,
      startsAt,
      endsAt,
      sourceUrl,
      precision,
    });
  };

  if (/twitch\s+drops?/i.test(body)) {
    // Keep section headings so Support-a-Streamer and quest ranges cannot become drops.
    const chunks = body.split(/(?=\n@@[1-6]:)/);
    let excluded = false;
    let heading = "drops";
    for (const chunk of chunks) {
      const title = /^\s*@@[1-6]:([^\n]+)/.exec(chunk)?.[1];
      if (title) {
        heading = title;
        if (/support a streamer|discord|quest|how do|faq/i.test(title))
          excluded = true;
        else if (/twitch|drops?|week\s*\d/i.test(title)) excluded = false;
      }
      if (excluded) continue;
      const labelled = [
        ...chunk.matchAll(
          /Start Time:\s*([^\n]+)[\s\S]*?End Time:\s*([^\n]+)/gi,
        ),
      ];
      for (const [index, match] of labelled.entries()) {
        const starts = calendarTime(match[1], published);
        add(
          "twitch-drops",
          twitchGame(chunk),
          starts,
          calendarTime(match[2], starts),
          `${heading}:${index}`,
        );
      }
      if (labelled.length) continue;
      const range =
        /Drops?\s+will\s+be\s+enabled\s+from\s+(.+?)\s+until\s+([^\n]+)/i.exec(
          chunk,
        );
      if (range) {
        const starts = calendarTime(range[1], published);
        add(
          "twitch-drops",
          twitchGame(chunk),
          starts,
          calendarTime(range[2], starts),
          heading,
        );
        continue;
      }
      const duration =
        /Twitch Drops?\s+will\s+be\s+available\s+for\s+(\d+)\s+hours/i.exec(
          chunk,
        );
      const ending = /Twitch Drops?\s+ends?\s+at\s+([^\n]+)/i.exec(chunk);
      if (duration && ending && +duration[1] <= 168) {
        // These posts supply an explicit local date with UTC offset after "or".
        const end = calendarTime(ending[1], published, zone);
        add(
          "twitch-drops",
          twitchGame(chunk),
          new Date(Date.parse(end) - +duration[1] * 3600_000).toISOString(),
          end,
          heading,
        );
      }
    }
    if (!events.some((x) => x.kind === "twitch-drops"))
      throw new Error("No supported Twitch date range");
  }
  if (!events.length) throw new Error("No supported promotion");
  return parsePromotionFeed({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    events,
  }).events;
}

export function mergePromotions(previous, parsed, overrides, now = new Date()) {
  if (
    !overrides ||
    !Array.isArray(overrides.events) ||
    !Array.isArray(overrides.disabledIds) ||
    !overrides.disabledIds.every((x) => typeof x === "string")
  )
    throw new Error("Invalid overrides");
  const validate = (events) =>
    parsePromotionFeed({
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      events,
    }).events;
  parsed = validate(parsed);
  const manual = validate(overrides.events);
  if (manual.some((event) => event.precision !== "manual"))
    throw new Error("Overrides require manual precision");
  const old = previous ? parsePromotionFeed(previous).events : [];
  const byId = new Map(old.map((event) => [event.id, event]));
  // A successfully reparsed source replaces all its sections (including deleted weeks).
  for (const source of new Set(
    parsed.map((x) => canonicalSource(x.sourceUrl)),
  )) {
    for (const [id, event] of byId)
      if (canonicalSource(event.sourceUrl) === source) byId.delete(id);
  }
  for (const event of parsed) byId.set(event.id, event);
  for (const event of manual) byId.set(event.id, event);
  const disabled = new Set(overrides.disabledIds);
  const disabledSchedules = new Set(
    [...old, ...parsed, ...manual]
      .filter((event) => disabled.has(event.id))
      .map(scheduleKey),
  );
  const oldSchedules = new Map(old.map((event) => [scheduleKey(event), event]));
  const campaigns = new Map();
  for (const event of byId.values()) {
    const signature = scheduleKey(event);
    if (disabled.has(event.id) || disabledSchedules.has(signature)) continue;
    const earlier = campaigns.get(signature);
    if (!earlier || event.precision === "manual")
      campaigns.set(signature, event);
  }
  // Keep an old ID for an unchanged reposted schedule, unless that ID now names
  // a corrected schedule. Manual IDs are deliberately authoritative.
  const result = [...campaigns.entries()].map(([key, event]) => {
    const prior = oldSchedules.get(key);
    return prior &&
      event.precision !== "manual" &&
      (!byId.has(prior.id) || scheduleKey(byId.get(prior.id)) === key)
      ? { ...event, id: prior.id }
      : event;
  });
  return parsePromotionFeed({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    events: result
      .filter((event) => event.kind === "twitch-drops")
      .filter((event) => Date.parse(event.endsAt) > now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  });
}

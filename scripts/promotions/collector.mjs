import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import gameRules from "./game-rules.json" with { type: "json" };
import {
  isTwitchWatchUrl,
  parsePromotionFeed,
  scheduleKey,
  isUtcInstant,
} from "./contract.mjs";

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

export function compileGameRules(value) {
  if (!value || !Array.isArray(value.rules))
    throw new Error("Invalid game rules");
  return value.rules.map((rule) => {
    if (
      !rule ||
      !["regex", "keyword"].includes(rule.type) ||
      typeof rule.value !== "string" ||
      !rule.value.trim() ||
      !rule.games ||
      typeof rule.games.poe1 !== "boolean" ||
      typeof rule.games.poe2 !== "boolean"
    )
      throw new Error("Invalid game rule");
    const regex = rule.type === "regex" ? new RegExp(rule.value, "i") : null;
    return {
      matches: regex
        ? (section) => regex.test(section)
        : (section) => section.toLowerCase().includes(rule.value.toLowerCase()),
      games: ["poe1", "poe2"].filter((game) => rule.games[game]),
    };
  });
}

const defaultGameRules = compileGameRules(gameRules);

function twitchGames(section, rules) {
  const rule = rules.find((entry) => entry.matches(section));
  return rule
    ? { games: rule.games, unknown: false }
    : { games: ["poe1", "poe2"], unknown: true };
}

function markWatchLinks(content) {
  const links = [];
  for (const anchor of content.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!isTwitchWatchUrl(href)) continue;
    const url = new URL(href);
    // The consumer accepts Twitch subdomains; source discovery only recognizes
    // explicit viewing links, never account/help/Creator Dashboard destinations.
    if (!["twitch.tv", "www.twitch.tv"].includes(url.hostname)) continue;
    const category =
      /^\/directory\/(?:category|game)\/[^/]+\/?$/i.test(url.pathname) &&
      /category|directory/i.test(anchor.text);
    const channel =
      /^\/[a-z0-9_]+\/?$/i.test(url.pathname) &&
      !/^\/(?:directory|drops|settings|login|signup|subscriptions|wallet|inventory|dashboard)\/?$/i.test(
        url.pathname,
      ) &&
      /twitch\.tv\/|stream|broadcast|watch|live/i.test(anchor.text);
    if (!category && !channel) continue;
    anchor.insertAdjacentHTML("afterend", ` @@TwitchLink${links.length}@@`);
    links.push({ url: href, category });
  }
  return links;
}

function twitchWatchUrl(section, links) {
  const candidates = [...section.matchAll(/@@TwitchLink(\d+)@@/g)]
    .map(([, index]) => links[Number(index)])
    .filter(Boolean);
  const directories = candidates.filter((link) => link.category);
  const urls = [
    ...new Set(
      (directories.length ? directories : candidates).map((link) => link.url),
    ),
  ];
  if (urls.length > 1) throw new Error("Ambiguous Twitch viewing URL");
  return urls[0];
}

function twitchDisplayTitle(heading, section, body) {
  if (
    /\bExileCon\s+livestream\b/i.test(body) &&
    /\bofficial\s+ExileCon\s+broadcast\b/i.test(body) &&
    /\bExileCon\s+directory\b/i.test(section)
  )
    return "ExileCon 트위치 드롭스";
  const name = heading
    .replace(/@@TwitchLink\d+@@/g, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (
    /^(?:drops?|twitch(?:\s+drops?)?)$/i.test(name) ||
    /^(?:how\s+(?:to|do)\b|launch\s+information\b|faqs?\b|frequently\s+asked\b|(?:link|linking|connect|connecting)\b.*\baccount\b|account\s+(?:linking|connection)\b)/i.test(
      name,
    )
  )
    return "트위치 드롭스";
  const title = /\btwitch\s+drops?\b/i.test(name)
    ? name
    : `${name} 트위치 드롭스`;
  return !name || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(title) || [...title].length > 200
    ? "트위치 드롭스"
    : title;
}

export function parseArticle(
  html,
  sourceUrl,
  publishedAt,
  rules = defaultGameRules,
) {
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
  let sourcePublishedAt = publishedAt;
  if (sourcePublishedAt !== undefined && !isUtcInstant(sourcePublishedAt))
    throw new Error("Invalid source publication time");
  if (sourcePublishedAt === undefined) {
    const postDate = info.querySelector(".post_date")?.text ?? "";
    // A source year is required; the legacy date parser may otherwise infer one.
    if (datePattern.exec(postDate)?.[3]) {
      try {
        sourcePublishedAt = calendarTime(postDate, Date.now(), zone);
      } catch {
        /* Unknown source timezone leaves publication metadata absent. */
      }
    }
  }
  const published = sourcePublishedAt ?? Date.now();
  for (const node of content.querySelectorAll(
    ".forum-faq, .forum-faq-show-all, script, style",
  ))
    node.remove();
  const watchLinks = markWatchLinks(content);
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
  let validatedDrops = 0;
  const add = (
    kind,
    classification,
    startsAt,
    endsAt,
    section,
    watchUrl,
    precision = "exact",
    displayTitle,
  ) => {
    if (
      sourcePublishedAt !== undefined &&
      Math.abs(Date.parse(startsAt) - Date.parse(sourcePublishedAt)) >
        60 * 86400_000
    )
      throw new Error("Event too far from publication");
    const suffix = `twitch-${createHash("sha256").update(section.toLowerCase().trim()).digest("hex").slice(0, 10)}`;
    const candidate = {
      id: `ggg-${thread}-${suffix}`,
      sourceGroupId: `ggg-${thread}-${suffix}`,
      kind,
      game: "poe1",
      startsAt,
      endsAt,
      sourceUrl,
      ...(sourcePublishedAt === undefined ? {} : { sourcePublishedAt }),
      ...(displayTitle === undefined ? {} : { title: displayTitle }),
      ...(watchUrl === undefined ? {} : { watchUrl }),
      ...(classification.unknown ? { gameUnknown: true } : {}),
      precision,
    };
    // OFF is a successful empty result only after the whole drop is validated.
    parsePromotionFeed({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      events: [candidate],
    });
    validatedDrops++;
    const { games } = classification;
    for (const game of games) {
      events.push({
        ...candidate,
        id: `ggg-${thread}-${suffix}${games.length > 1 ? `-${game}` : ""}`,
        game,
      });
    }
  };

  if (/twitch\s+drops?/i.test(body)) {
    // Keep section headings so Support-a-Streamer and quest ranges cannot become drops.
    const chunks = body.split(/(?=\n@@[1-6]:)/);
    let excluded = false;
    let heading = "drops";
    for (const chunk of chunks) {
      const title = /^\s*@@[1-6]:([^\n]+)/
        .exec(chunk)?.[1]
        ?.replace(/ @@TwitchLink\d+@@/g, "");
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
        const starts = calendarTime(match[1], published, zone);
        add(
          "twitch-drops",
          twitchGames(chunk, rules),
          starts,
          calendarTime(match[2], starts, zone),
          `${heading}:${index}`,
          twitchWatchUrl(chunk, watchLinks),
          "exact",
          twitchDisplayTitle(heading, chunk, body),
        );
      }
      if (labelled.length) continue;
      const range =
        /Drops?\s+will\s+be\s+enabled\s+from\s+(.+?)\s+until\s+([^\n]+)/i.exec(
          chunk,
        );
      if (range) {
        const starts = calendarTime(range[1], published, zone);
        add(
          "twitch-drops",
          twitchGames(chunk, rules),
          starts,
          calendarTime(range[2], starts, zone),
          heading,
          twitchWatchUrl(chunk, watchLinks),
          "exact",
          twitchDisplayTitle(heading, chunk, body),
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
          twitchGames(chunk, rules),
          new Date(Date.parse(end) - +duration[1] * 3600_000).toISOString(),
          end,
          heading,
          twitchWatchUrl(chunk, watchLinks),
          "exact",
          twitchDisplayTitle(heading, chunk, body),
        );
      }
    }
    if (!validatedDrops) throw new Error("No supported Twitch date range");
  }
  if (!validatedDrops) throw new Error("No supported promotion");
  return parsePromotionFeed({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    events,
  }).events;
}

export function mergePromotions(
  previous,
  parsed,
  overrides,
  now = new Date(),
  successfulSources = [],
) {
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
  const preferred = (event, earlier) =>
    !earlier ||
    event.precision === "manual" ||
    (earlier.precision !== "manual" &&
      event.sourcePublishedAt !== undefined &&
      (earlier.sourcePublishedAt === undefined ||
        Date.parse(event.sourcePublishedAt) >
          Date.parse(earlier.sourcePublishedAt)));
  const byId = new Map(old.map((event) => [event.id, event]));
  // A successfully reparsed source replaces all its sections (including deleted weeks).
  for (const source of new Set([
    ...parsed.map((x) => canonicalSource(x.sourceUrl)),
    ...successfulSources.map(canonicalSource),
  ])) {
    for (const [id, event] of byId)
      if (canonicalSource(event.sourceUrl) === source) byId.delete(id);
  }
  for (const event of parsed) {
    const earlier = byId.get(event.id);
    // A same-schedule retained alias may equal an older source's raw ID.
    // Compare before insertion so a failed latest source is not overwritten.
    if (
      !earlier ||
      scheduleKey(earlier) !== scheduleKey(event) ||
      preferred(event, earlier)
    )
      byId.set(event.id, event);
  }
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
    if (preferred(event, earlier)) campaigns.set(signature, event);
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

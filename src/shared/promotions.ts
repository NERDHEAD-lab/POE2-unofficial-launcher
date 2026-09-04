import {
  parseStashSales,
  type StashSales,
  type StashEstimate,
  type StashTarget,
} from "./stash-sales";

export interface EventNotificationPreferences {
  types: { twitch: boolean; stash: boolean };
  channels: { inApp: boolean; windows: boolean };
}

export interface PromotionEvent {
  id: string;
  kind: "twitch-drops" | "stash-sale";
  game: "poe1" | "poe2" | "both";
  startsAt: string;
  endsAt: string;
  sourceUrl: string;
  precision: "exact" | "derived-start" | "manual";
  /** Present only on normalized, API-confirmed shop events. */
  targets?: StashTarget[];
}

export interface PromotionFeed {
  schemaVersion: 1;
  generatedAt: string;
  events: PromotionEvent[];
  stashSales?: StashSales;
}

export interface PromotionSnapshot {
  revision: number;
  /** Active schedules regardless of notification settings or dismissal. */
  activeEvents: PromotionEvent[];
  upcomingEvents: PromotionEvent[];
  events: PromotionEvent[];
  stashEstimate?: StashEstimate | null;
}

export interface PromotionDismissRequest {
  key: string;
  mode: "session" | "schedule";
}

export type PromotionDismissResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid-request" | "service-unavailable" | "save-failed";
    };

export function promotionScheduleKey(event: PromotionEvent): string {
  if (event.kind === "stash-sale" && event.targets)
    return `stash-sale:api:${Date.parse(event.startsAt)}:${Date.parse(event.endsAt)}`;
  return `${event.kind}:${event.game}:${Date.parse(event.startsAt)}:${Date.parse(event.endsAt)}`;
}

export const TWITCH_LINKS = {
  POE1: "https://www.twitch.tv/directory/category/path-of-exile",
  POE2: "https://www.twitch.tv/directory/category/path-of-exile-2",
} as const;

export const STASH_LINKS = [
  {
    service: "GGG",
    games: [
      {
        game: "POE",
        url: "https://www.pathofexile.com/shop/category/stash-tabs",
      },
      { game: "POE2", url: "https://pathofexile2.com/shop/stash-tabs" },
    ],
  },
  {
    service: "KakaoGames",
    games: [
      {
        game: "POE",
        url: "https://poe.kakaogames.com/shop/category/stash-tabs",
      },
      { game: "POE2", url: "https://poe2.kakaogames.com/shop/stash-tabs" },
    ],
  },
] as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeEventPreferences(
  value: unknown,
): EventNotificationPreferences {
  const input = record(value);
  const types = record(input.types);
  const channels = record(input.channels);
  return {
    types: {
      twitch: typeof types.twitch === "boolean" ? types.twitch : true,
      stash: typeof types.stash === "boolean" ? types.stash : true,
    },
    channels: {
      inApp: typeof channels.inApp === "boolean" ? channels.inApp : true,
      windows: typeof channels.windows === "boolean" ? channels.windows : false,
    },
  };
}

export function isUtcInstant(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  )
    return false;
  const time = Date.parse(value);
  return (
    Number.isFinite(time) &&
    new Date(time).toISOString() === value.replace(/(?<=:\d\d)Z$/, ".000Z")
  );
}

export function parsePromotionFeed(value: unknown): PromotionFeed {
  const feed = record(value);
  if (
    feed.schemaVersion !== 1 ||
    !isUtcInstant(feed.generatedAt) ||
    !Array.isArray(feed.events) ||
    feed.events.length > 200
  ) {
    throw new Error("Invalid promotion feed");
  }
  const ids = new Set<string>();
  const events = feed.events.map((entry): PromotionEvent => {
    const item = record(entry);
    if (
      typeof item.id !== "string" ||
      !/^[a-z0-9:-]{1,160}$/.test(item.id) ||
      ids.has(item.id) ||
      !["twitch-drops", "stash-sale"].includes(item.kind as string) ||
      !["poe1", "poe2", "both"].includes(item.game as string) ||
      (item.kind === "twitch-drops" && item.game === "both") ||
      !["exact", "derived-start", "manual"].includes(
        item.precision as string,
      ) ||
      !isUtcInstant(item.startsAt) ||
      !isUtcInstant(item.endsAt) ||
      Date.parse(item.endsAt) <= Date.parse(item.startsAt) ||
      Date.parse(item.endsAt) - Date.parse(item.startsAt) > 90 * 86400_000 ||
      typeof item.sourceUrl !== "string" ||
      !/^https:\/\/www\.pathofexile\.com\/forum\/view-thread\/\d+(?:\/filter-account-type\/staff)?$/.test(
        item.sourceUrl,
      )
    ) {
      throw new Error("Invalid promotion event");
    }
    ids.add(item.id);
    return {
      id: item.id,
      kind: item.kind as PromotionEvent["kind"],
      game: item.game as PromotionEvent["game"],
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      sourceUrl: item.sourceUrl,
      precision: item.precision as PromotionEvent["precision"],
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: feed.generatedAt,
    events,
    ...(feed.stashSales === undefined
      ? {}
      : { stashSales: parseStashSales(feed.stashSales, isUtcInstant) }),
  };
}

/** All confirmed events, shared by display, dismissal, and native delivery. */
export function getPromotionEvents(
  feed: PromotionFeed | null,
): PromotionEvent[] {
  if (!feed) return [];
  const groups = new Map<string, PromotionEvent>();
  const observations = [...(feed.stashSales?.observations ?? [])].sort((a, b) =>
    `${a.service}:${a.game}`.localeCompare(`${b.service}:${b.game}`),
  );
  for (const observation of observations) {
    const period = observation.confirmedPeriod;
    if (!period) continue;
    const key = `${Date.parse(period.startsAt)}:${Date.parse(period.endsAt)}`;
    const target = { service: observation.service, game: observation.game };
    const event = groups.get(key);
    if (event) {
      event.targets!.push(target);
      if (event.game !== target.game) event.game = "both";
    } else {
      groups.set(key, {
        id: `shop-stash:${key}`,
        kind: "stash-sale",
        game: target.game,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        sourceUrl: observation.sourceUrl,
        precision: "exact",
        targets: [target],
      });
    }
  }
  return [...feed.events, ...groups.values()];
}

export function promotionMatchesTarget(
  event: PromotionEvent,
  service: "GGG" | "KakaoGames",
  game: "POE" | "POE2",
): boolean {
  return (
    !event.targets ||
    event.targets.some(
      (target) =>
        target.service === (service === "GGG" ? "ggg" : "kakao") &&
        target.game === (game === "POE" ? "poe1" : "poe2"),
    )
  );
}

export function isPromotionActive(
  event: PromotionEvent,
  now = Date.now(),
): boolean {
  return Date.parse(event.startsAt) <= now && now < Date.parse(event.endsAt);
}

export function formatPromotionPeriod(
  event: Pick<PromotionEvent, "startsAt" | "endsAt">,
  timeZone?: string,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone,
  });
  const crossesYear = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone,
  });
  if (
    crossesYear.format(new Date(event.startsAt)) !==
    crossesYear.format(new Date(event.endsAt))
  ) {
    const full = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    return `${full.format(new Date(event.startsAt))} ~ ${full.format(new Date(event.endsAt))}`;
  }
  return `${formatter.format(new Date(event.startsAt))} ~ ${formatter.format(new Date(event.endsAt))}`;
}

export function promotionTitle(event: PromotionEvent): string {
  return event.kind === "stash-sale"
    ? "보관함 할인"
    : `${event.game === "poe1" ? "PoE 1" : "PoE 2"} 트위치 드롭스`;
}

export function promotionActions(
  event: PromotionEvent,
): { label: string; url: string }[] {
  return event.kind === "twitch-drops"
    ? [
        {
          label: `${event.game === "poe1" ? "PoE 1" : "PoE 2"} Twitch`,
          url: TWITCH_LINKS[event.game === "poe1" ? "POE1" : "POE2"],
        },
      ]
    : STASH_LINKS.flatMap(({ service, games }) =>
        games
          .filter(({ game }) => promotionMatchesTarget(event, service, game))
          .map(({ game, url }) => ({
            label: `${service === "KakaoGames" ? "Kakao" : service} ${game}`,
            url,
          })),
      );
}

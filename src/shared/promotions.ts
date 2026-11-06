import {
  parseStashSales,
  type StashSales,
  type StashEstimate,
  type StashTarget,
} from "./stash-sales";

export interface EventNotificationPreferences {
  types: { twitch: boolean; stash: boolean };
  channels: { inApp: boolean; windows: boolean };
  reminders: {
    presets: number[];
    custom: { enabled: boolean; value: number; unit: ReminderUnit };
  };
}

export type ReminderUnit = "day" | "hour" | "minute" | "second";

export const EVENT_REMINDER_PRESETS = [
  { seconds: 1800, label: "30분 전" },
  { seconds: 3600, label: "1시간 전" },
  { seconds: 86400, label: "하루 전" },
] as const;

const REMINDER_UNITS: Record<ReminderUnit, number> = {
  day: 86400,
  hour: 3600,
  minute: 60,
  second: 1,
};

export interface PromotionEvent {
  id: string;
  kind: "twitch-drops" | "stash-sale";
  game: "poe1" | "poe2" | "both";
  startsAt: string;
  endsAt: string;
  sourceUrl: string;
  /** Actual source publication instant, absent when it cannot be established. */
  sourcePublishedAt?: string;
  /** Producer's raw source/section group, independent from retained event IDs. */
  sourceGroupId?: string;
  /** Optional producer-supplied display name; not part of notification identity. */
  title?: string;
  /** Unknown classification uses per-game compatibility copies. */
  gameUnknown?: boolean;
  /** Optional Twitch destination; absent in older schema 1 feeds. */
  watchUrl?: string;
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

/** An app notification phase, independent from the source feed schema. */
export interface PromotionNotification extends PromotionEvent {
  reminderSeconds?: number;
}

export interface PromotionSnapshot {
  revision: number;
  /** Active schedules regardless of notification settings or dismissal. */
  activeEvents: PromotionEvent[];
  upcomingEvents: PromotionEvent[];
  events: PromotionNotification[];
  stashEstimate?: StashEstimate | null;
}

export interface PromotionDismissRequest {
  key: string;
  mode: "session" | "schedule";
  notificationId?: string;
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

export function promotionNotificationKey(event: PromotionNotification): string {
  const schedule = promotionScheduleKey(event);
  return event.reminderSeconds === undefined
    ? schedule
    : `${schedule}:reminder:${event.reminderSeconds}`;
}

export function toReminderSeconds(
  value: number,
  unit: ReminderUnit,
): number | null {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Object.hasOwn(REMINDER_UNITS, unit)
  )
    return null;
  // Interpret the stored number's canonical decimal, avoiding multiplication noise.
  const [decimal, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = decimal.split(".");
  const scale = Number(exponent) - fraction.length;
  let seconds = BigInt(whole + fraction) * BigInt(REMINDER_UNITS[unit]);
  if (scale >= 0) seconds *= 10n ** BigInt(scale);
  else {
    const divisor = 10n ** BigInt(-scale);
    if (seconds % divisor !== 0n) return null;
    seconds /= divisor;
  }
  return seconds > 0n && seconds * 1000n <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(seconds)
    : null;
}

export function selectedReminderSeconds(
  reminders: EventNotificationPreferences["reminders"],
): number[] {
  const custom = reminders.custom.enabled
    ? toReminderSeconds(reminders.custom.value, reminders.custom.unit)
    : null;
  return [
    ...new Set([...reminders.presets, ...(custom === null ? [] : [custom])]),
  ].sort((a, b) => a - b);
}

/** The latest reached phase only; never replay earlier selected reminders. */
export function promotionNotificationAt(
  event: PromotionEvent,
  offsets: number[],
  now = Date.now(),
): PromotionNotification | undefined {
  if (isPromotionActive(event, now)) return event;
  const start = Date.parse(event.startsAt);
  if (now >= start) return undefined;
  const reminderSeconds = offsets.find((seconds) => {
    const dueAt = start - seconds * 1000;
    return Number.isSafeInteger(dueAt) && dueAt <= now;
  });
  return reminderSeconds === undefined
    ? undefined
    : { ...event, reminderSeconds };
}

export function isPromotionNotificationCurrent(
  event: PromotionNotification,
  now = Date.now(),
): boolean {
  return event.reminderSeconds === undefined
    ? isPromotionActive(event, now)
    : now < Date.parse(event.startsAt) &&
        now >= Date.parse(event.startsAt) - event.reminderSeconds * 1000;
}

export function formatPromotionCountdown(
  at: string,
  now = Date.now(),
  phase: "start" | "end" = "start",
): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(at) - now) / 1000));
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분 ${seconds % 60}초 ${phase === "end" ? "뒤에 종료됩니다" : "뒤부터 시작합니다"}`;
}

export const TWITCH_LINKS = {
  POE1: "https://www.twitch.tv/directory/category/path-of-exile",
  POE2: "https://www.twitch.tv/directory/category/path-of-exile-2",
} as const;

export function isTwitchWatchUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^https:\/\/[^/?#@]+(?:[/?#]|$)/i.test(value) ||
    /[\s\p{Cc}\\]/u.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*twitch\.tv$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

export function promotionWatchUrl(event: PromotionEvent): string {
  return (
    event.watchUrl ?? TWITCH_LINKS[event.game === "poe1" ? "POE1" : "POE2"]
  );
}

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

function parseEventTitle(value: unknown): string {
  if (typeof value !== "string" || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value))
    throw new Error("Invalid promotion title");
  const title = value.replace(/\s+/gu, " ").trim();
  if (!title || [...title].length > 200)
    throw new Error("Invalid promotion title");
  return title;
}

export function normalizeEventPreferences(
  value: unknown,
): EventNotificationPreferences {
  const input = record(value);
  const types = record(input.types);
  const channels = record(input.channels);
  const reminders = record(input.reminders);
  const custom = record(reminders.custom);
  const validUnit =
    typeof custom.unit === "string" &&
    Object.hasOwn(REMINDER_UNITS, custom.unit);
  const unit = validUnit ? (custom.unit as ReminderUnit) : "minute";
  const validCustom =
    typeof custom.value === "number" &&
    toReminderSeconds(custom.value, unit) !== null;
  return {
    types: {
      twitch: typeof types.twitch === "boolean" ? types.twitch : true,
      stash: typeof types.stash === "boolean" ? types.stash : true,
    },
    channels: {
      inApp: typeof channels.inApp === "boolean" ? channels.inApp : true,
      windows: typeof channels.windows === "boolean" ? channels.windows : false,
    },
    reminders: {
      presets: EVENT_REMINDER_PRESETS.filter(
        ({ seconds }) =>
          Array.isArray(reminders.presets) &&
          reminders.presets.includes(seconds),
      ).map(({ seconds }) => seconds),
      custom: {
        enabled: custom.enabled === true && validUnit && validCustom,
        value: validCustom ? (custom.value as number) : 30,
        unit,
      },
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

function isSourceGroup(
  value: unknown,
  sourceUrl: unknown,
  kind: unknown,
): boolean {
  if (
    typeof value !== "string" ||
    typeof sourceUrl !== "string" ||
    kind !== "twitch-drops"
  )
    return false;
  const group = /^ggg-(\d+)-twitch-[a-f0-9]{10}$/.exec(value);
  return (
    !!group &&
    /\/view-thread\/(\d+)(?:\/filter-account-type\/staff)?$/.exec(
      sourceUrl,
    )?.[1] === group[1]
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
    const title =
      item.title === undefined ? undefined : parseEventTitle(item.title);
    if (
      typeof item.id !== "string" ||
      !/^[a-z0-9:-]{1,160}$/.test(item.id) ||
      ids.has(item.id) ||
      !["twitch-drops", "stash-sale"].includes(item.kind as string) ||
      !["poe1", "poe2", "both"].includes(item.game as string) ||
      (item.kind === "twitch-drops" && item.game === "both") ||
      (item.gameUnknown !== undefined &&
        typeof item.gameUnknown !== "boolean") ||
      (item.sourcePublishedAt !== undefined &&
        !isUtcInstant(item.sourcePublishedAt)) ||
      (item.sourceGroupId !== undefined &&
        !isSourceGroup(item.sourceGroupId, item.sourceUrl, item.kind)) ||
      (item.watchUrl !== undefined &&
        (item.kind !== "twitch-drops" || !isTwitchWatchUrl(item.watchUrl))) ||
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
      ...(item.sourceGroupId === undefined
        ? {}
        : { sourceGroupId: item.sourceGroupId as string }),
      ...(item.sourcePublishedAt === undefined
        ? {}
        : { sourcePublishedAt: item.sourcePublishedAt as string }),
      ...(title === undefined ? {} : { title }),
      ...(item.gameUnknown === undefined
        ? {}
        : { gameUnknown: item.gameUnknown as boolean }),
      ...(item.watchUrl === undefined
        ? {}
        : { watchUrl: item.watchUrl as string }),
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
  if (event.title !== undefined) return event.title;
  if (event.gameUnknown && event.kind === "twitch-drops")
    return "트위치 드롭스";
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
          label: "Twitch에서 시청",
          url: promotionWatchUrl(event),
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

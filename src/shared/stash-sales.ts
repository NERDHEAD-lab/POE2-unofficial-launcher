export interface StashTarget {
  service: "ggg" | "kakao";
  game: "poe1" | "poe2";
}
export interface StashPeriod {
  startsAt: string;
  endsAt: string;
  observedAt: string;
  productIds: string[];
}
export interface StashObservation extends StashTarget {
  sourceUrl: string;
  checkedAt: string;
  status: "ok" | "unavailable" | "period-unavailable";
  confirmedPeriod: StashPeriod | null;
}
export interface StashApiAnchor extends StashTarget {
  origin: "api";
  sourceUrl: string;
  startsAt: string;
  endsAt: string;
  observedAt: string;
}
export interface StashManualAnchor {
  origin: "manual-announcement";
  startDate: string;
  endDate: string;
  timeZone: "Asia/Seoul";
  sourceUrls: string[];
  scope: StashTarget[];
}
/** Estimates cannot enter the notification/event pipeline. */
export interface StashEstimate {
  startDate: string;
  endDate: string;
  timeZone: "Asia/Seoul";
  intervalDays: 21;
  basisOrigin: "api" | "manual-announcement";
  basisSourceUrl: string;
}
export interface StashSales {
  version: 1;
  observations: StashObservation[];
  anchor: StashApiAnchor | StashManualAnchor | null;
  nextEstimate: StashEstimate | null;
}
export const STASH_API_URLS = {
  "ggg:poe1":
    "https://www.pathofexile.com/api/shop-microtransaction-categories/stash-tabs",
  "ggg:poe2": "https://pathofexile2.com/api/shop-microtransactions?game=poe2",
  "kakao:poe1":
    "https://poe.kakaogames.com/api/shop-microtransaction-categories/stash-tabs",
  "kakao:poe2":
    "https://poe2.kakaogames.com/api/shop-microtransactions?game=poe2",
} as const;
const DAY = 86400_000;
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid stash sale feed");
}
function target(value: unknown): StashTarget {
  const item = record(value);
  requireValue(item.service === "ggg" || item.service === "kakao");
  requireValue(item.game === "poe1" || item.game === "poe2");
  return { service: item.service, game: item.game };
}
function date(value: unknown): string {
  requireValue(typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value));
  const instant = Date.parse(`${value}T00:00:00Z`);
  requireValue(
    Number.isFinite(instant) &&
      new Date(instant).toISOString().slice(0, 10) === value,
  );
  return value;
}
const kstDate = (instant: string) =>
  new Date(Date.parse(instant) + 9 * 3600_000).toISOString().slice(0, 10);
const plus21 = (value: string) =>
  new Date(Date.parse(`${value}T00:00:00Z`) + 21 * DAY)
    .toISOString()
    .slice(0, 10);
const announcement = (value: unknown): value is string =>
  typeof value === "string" &&
  /^https:\/\/(?:www\.pathofexile\.com|poe(?:2)?\.kakaogames\.com)\/forum\/view-thread\/\d+$/.test(
    value,
  );

export function parseStashSales(
  value: unknown,
  isUtc: (value: unknown) => value is string,
): StashSales {
  const input = record(value);
  requireValue(
    input.version === 1 &&
      Array.isArray(input.observations) &&
      input.observations.length === 4,
  );
  function period(value: unknown) {
    const item = record(value);
    requireValue(
      isUtc(item.startsAt) && isUtc(item.endsAt) && isUtc(item.observedAt),
    );
    const duration = Date.parse(item.endsAt) - Date.parse(item.startsAt);
    requireValue(duration > 0 && duration <= 90 * DAY);
    return {
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      observedAt: item.observedAt,
    };
  }
  function api(value: unknown) {
    const item = record(value);
    const scope = target(value);
    requireValue(
      item.sourceUrl === STASH_API_URLS[`${scope.service}:${scope.game}`],
    );
    return { ...scope, sourceUrl: item.sourceUrl as string };
  }
  const seen = new Set<string>();
  const observations = input.observations.map((value): StashObservation => {
    const item = record(value);
    const source = api(value);
    const key = `${source.service}:${source.game}`;
    requireValue(!seen.has(key));
    seen.add(key);
    requireValue(isUtc(item.checkedAt));
    requireValue(
      item.status === "ok" ||
        item.status === "unavailable" ||
        item.status === "period-unavailable",
    );
    let confirmedPeriod: StashPeriod | null = null;
    if (item.confirmedPeriod !== null) {
      requireValue(item.status !== "period-unavailable");
      const timing = period(item.confirmedPeriod);
      const ids = record(item.confirmedPeriod).productIds;
      requireValue(Array.isArray(ids) && ids.length > 0 && ids.length <= 100);
      requireValue(
        ids.every(
          (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(id),
        ) && new Set(ids).size === ids.length,
      );
      requireValue(Date.parse(timing.observedAt) <= Date.parse(item.checkedAt));
      confirmedPeriod = { ...timing, productIds: [...ids] as string[] };
    }
    return {
      ...source,
      checkedAt: item.checkedAt,
      status: item.status,
      confirmedPeriod,
    };
  });
  let anchor: StashSales["anchor"] = null;
  if (input.anchor !== null) {
    const item = record(input.anchor);
    if (item.origin === "api") {
      anchor = { origin: "api", ...api(item), ...period(item) };
    } else {
      requireValue(
        item.origin === "manual-announcement" && item.timeZone === "Asia/Seoul",
      );
      const startDate = date(item.startDate),
        endDate = date(item.endDate);
      requireValue(
        endDate >= startDate &&
          Date.parse(endDate) - Date.parse(startDate) <= 90 * DAY,
      );
      requireValue(
        Array.isArray(item.sourceUrls) &&
          item.sourceUrls.length > 0 &&
          item.sourceUrls.length <= 4 &&
          new Set(item.sourceUrls).size === item.sourceUrls.length &&
          item.sourceUrls.every(announcement),
      );
      requireValue(
        Array.isArray(item.scope) &&
          item.scope.length > 0 &&
          item.scope.length <= 4,
      );
      const scope = item.scope.map(target);
      requireValue(
        new Set(scope.map((item) => `${item.service}:${item.game}`)).size ===
          scope.length,
      );
      anchor = {
        origin: "manual-announcement",
        startDate,
        endDate,
        timeZone: "Asia/Seoul",
        sourceUrls: [...item.sourceUrls] as string[],
        scope,
      };
    }
  }
  let nextEstimate: StashEstimate | null = null;
  if (input.nextEstimate !== null) {
    const item = record(input.nextEstimate);
    requireValue(
      anchor &&
        item.timeZone === "Asia/Seoul" &&
        item.intervalDays === 21 &&
        item.basisOrigin === anchor.origin,
    );
    const startDate = date(item.startDate),
      endDate = date(item.endDate);
    const basisStart =
      anchor.origin === "api" ? kstDate(anchor.startsAt) : anchor.startDate;
    const basisEnd =
      anchor.origin === "api" ? kstDate(anchor.endsAt) : anchor.endDate;
    const sources =
      anchor.origin === "api" ? [anchor.sourceUrl] : anchor.sourceUrls;
    requireValue(
      startDate === plus21(basisStart) &&
        endDate === plus21(basisEnd) &&
        typeof item.basisSourceUrl === "string" &&
        sources.includes(item.basisSourceUrl),
    );
    nextEstimate = {
      startDate,
      endDate,
      timeZone: "Asia/Seoul",
      intervalDays: 21,
      basisOrigin: anchor.origin,
      basisSourceUrl: item.basisSourceUrl,
    };
  }
  return { version: 1, observations, anchor, nextEstimate };
}
export function currentStashEstimate(
  estimate: StashEstimate | null | undefined,
  now = Date.now(),
): StashEstimate | null {
  return estimate &&
    now < Date.parse(`${estimate.endDate}T00:00:00+09:00`) + DAY
    ? estimate
    : null;
}
export function formatStashEstimate(estimate: StashEstimate): string {
  const sameYear =
    estimate.startDate.slice(0, 4) === estimate.endDate.slice(0, 4);
  const short = (value: string) =>
    `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
  return sameYear
    ? `${short(estimate.startDate)} ~ ${short(estimate.endDate)}`
    : `${estimate.startDate} ~ ${estimate.endDate}`;
}

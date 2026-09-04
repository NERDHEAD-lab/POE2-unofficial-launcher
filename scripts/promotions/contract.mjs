// schemaVersion 1 consumer contract, mirrored from src/shared/promotions.ts.
// Keep this collector deployable before the launcher feature is merged.
export const scheduleKey = (event) =>
  `${event.kind}:${event.game}:${Date.parse(event.startsAt)}:${Date.parse(event.endsAt)}`;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function isUtcInstant(value) {
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

export function parsePromotionFeed(value) {
  const feed = record(value);
  if (
    feed.schemaVersion !== 1 ||
    !isUtcInstant(feed.generatedAt) ||
    !Array.isArray(feed.events) ||
    feed.events.length > 200
  ) {
    throw new Error("Invalid promotion feed");
  }
  const ids = new Set();
  const events = feed.events.map((entry) => {
    const item = record(entry);
    if (
      typeof item.id !== "string" ||
      !/^[a-z0-9:-]{1,160}$/.test(item.id) ||
      ids.has(item.id) ||
      !["twitch-drops", "stash-sale"].includes(item.kind) ||
      !["poe1", "poe2", "both"].includes(item.game) ||
      (item.kind === "twitch-drops" && item.game === "both") ||
      !["exact", "derived-start", "manual"].includes(item.precision) ||
      !isUtcInstant(item.startsAt) ||
      !isUtcInstant(item.endsAt) ||
      Date.parse(item.endsAt) <= Date.parse(item.startsAt) ||
      Date.parse(item.endsAt) - Date.parse(item.startsAt) > 90 * 86400_000 ||
      typeof item.sourceUrl !== "string" ||
      !/^https:\/\/www\.pathofexile\.com\/forum\/view-thread\/\d+(?:\/filter-account-type\/staff)?$/.test(
        item.sourceUrl,
      )
    )
      throw new Error("Invalid promotion event");
    ids.add(item.id);
    return {
      id: item.id,
      kind: item.kind,
      game: item.game,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      sourceUrl: item.sourceUrl,
      precision: item.precision,
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: feed.generatedAt,
    events,
    ...("stashSales" in feed
      ? { stashSales: parseStashSales(feed.stashSales) }
      : {}),
  };
}

export const SHOP_SOURCES = [
  {
    service: "ggg",
    game: "poe1",
    sourceUrl:
      "https://www.pathofexile.com/api/shop-microtransaction-categories/stash-tabs",
  },
  {
    service: "ggg",
    game: "poe2",
    sourceUrl: "https://pathofexile2.com/api/shop-microtransactions?game=poe2",
  },
  {
    service: "kakao",
    game: "poe1",
    sourceUrl:
      "https://poe.kakaogames.com/api/shop-microtransaction-categories/stash-tabs",
  },
  {
    service: "kakao",
    game: "poe2",
    sourceUrl:
      "https://poe2.kakaogames.com/api/shop-microtransactions?game=poe2",
  },
];

function requireStash(condition) {
  if (!condition) throw new Error("Invalid stash sales section");
}

function scopeOf(value, withSource = false) {
  const item = record(value);
  const source = SHOP_SOURCES.find(
    (x) => x.service === item.service && x.game === item.game,
  );
  requireStash(source && (!withSource || source.sourceUrl === item.sourceUrl));
  return withSource
    ? { ...source }
    : { service: source.service, game: source.game };
}

function utcPeriod(value) {
  const item = record(value);
  const duration = Date.parse(item.endsAt) - Date.parse(item.startsAt);
  requireStash(
    isUtcInstant(item.startsAt) &&
      isUtcInstant(item.endsAt) &&
      duration > 0 &&
      duration <= 90 * 86400_000 &&
      isUtcInstant(item.observedAt),
  );
  return {
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    observedAt: item.observedAt,
  };
}

export function isCalendarDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\d$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}

function datePeriod(value) {
  const item = record(value);
  const duration = Date.parse(item.endDate) - Date.parse(item.startDate);
  requireStash(
    isCalendarDate(item.startDate) &&
      isCalendarDate(item.endDate) &&
      duration >= 0 &&
      duration <= 90 * 86400_000 &&
      item.timeZone === "Asia/Seoul",
  );
  return {
    startDate: item.startDate,
    endDate: item.endDate,
    timeZone: "Asia/Seoul",
  };
}

function announcementUrl(value) {
  return (
    typeof value === "string" &&
    /^https:\/\/(?:www\.pathofexile\.com|poe\.kakaogames\.com|poe2\.kakaogames\.com)\/forum\/view-thread\/\d+$/.test(
      value,
    )
  );
}

function uniqueStrings(value, limit, valid) {
  requireStash(
    Array.isArray(value) &&
      value.length > 0 &&
      value.length <= limit &&
      new Set(value).size === value.length &&
      value.every(valid),
  );
  return [...value];
}

export function parseStashSales(value) {
  const item = record(value);
  requireStash(
    item.version === 1 &&
      Array.isArray(item.observations) &&
      item.observations.length === 4,
  );
  const scopes = new Set();
  const observations = item.observations.map((value) => {
    const observation = record(value);
    const source = scopeOf(observation, true);
    const key = `${source.service}:${source.game}`;
    requireStash(
      !scopes.has(key) &&
        isUtcInstant(observation.checkedAt) &&
        ["ok", "unavailable", "period-unavailable"].includes(
          observation.status,
        ),
    );
    scopes.add(key);
    const confirmedPeriod =
      observation.confirmedPeriod === null
        ? null
        : {
            ...utcPeriod(observation.confirmedPeriod),
            productIds: uniqueStrings(
              record(observation.confirmedPeriod).productIds,
              100,
              (id) =>
                typeof id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(id),
            ),
          };
    requireStash(
      observation.status !== "period-unavailable" || confirmedPeriod === null,
    );
    requireStash(
      !confirmedPeriod ||
        Date.parse(confirmedPeriod.observedAt) <=
          Date.parse(observation.checkedAt),
    );
    return {
      ...source,
      checkedAt: observation.checkedAt,
      status: observation.status,
      confirmedPeriod,
    };
  });
  let anchor = null;
  if (item.anchor !== null) {
    const value = record(item.anchor);
    requireStash(["api", "manual-announcement"].includes(value.origin));
    if (value.origin === "api") {
      anchor = { origin: "api", ...scopeOf(value, true), ...utcPeriod(value) };
    } else {
      const sourceUrls = uniqueStrings(value.sourceUrls, 4, announcementUrl);
      requireStash(
        Array.isArray(value.scope) &&
          value.scope.length > 0 &&
          value.scope.length <= 4,
      );
      const scope = value.scope.map((x) => scopeOf(x));
      requireStash(
        new Set(scope.map((x) => `${x.service}:${x.game}`)).size ===
          scope.length,
      );
      anchor = {
        origin: "manual-announcement",
        ...datePeriod(value),
        sourceUrls,
        scope,
      };
    }
  }
  let nextEstimate = null;
  if (item.nextEstimate !== null) {
    const estimate = record(item.nextEstimate);
    requireStash(
      anchor &&
        estimate.intervalDays === 21 &&
        estimate.basisOrigin === anchor.origin &&
        (anchor.origin === "api"
          ? estimate.basisSourceUrl === anchor.sourceUrl
          : anchor.sourceUrls.includes(estimate.basisSourceUrl)),
    );
    const kstDate = (utc) =>
      new Date(Date.parse(utc) + 9 * 3600_000).toISOString().slice(0, 10);
    const plus21 = (date) =>
      new Date(Date.parse(`${date}T00:00:00Z`) + 21 * 86400_000)
        .toISOString()
        .slice(0, 10);
    requireStash(
      estimate.startDate ===
        plus21(
          anchor.origin === "api" ? kstDate(anchor.startsAt) : anchor.startDate,
        ) &&
        estimate.endDate ===
          plus21(
            anchor.origin === "api" ? kstDate(anchor.endsAt) : anchor.endDate,
          ),
    );
    nextEstimate = {
      ...datePeriod(estimate),
      intervalDays: 21,
      basisOrigin: estimate.basisOrigin,
      basisSourceUrl: estimate.basisSourceUrl,
    };
  }
  return { version: 1, observations, anchor, nextEstimate };
}

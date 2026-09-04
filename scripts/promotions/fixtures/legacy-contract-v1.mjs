// Frozen pre-stash-section consumer mirror from afba18e5; compatibility fixture only.
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
  return { schemaVersion: 1, generatedAt: feed.generatedAt, events };
}

import { SHOP_SOURCES, isCalendarDate, parseStashSales } from "./contract.mjs";
import manualSeed from "./stash-seed.json" with { type: "json" };

const DAY = 86400_000;
// The legacy category API has no tags. Only independently identified personal
// products may establish a sale; generic bundle "discount" is not a special.
const POE1_PERSONAL_IDS = new Set([
  "UpgradeToPremiumStashTab",
  "PremiumStashTab",
  "StashTab",
  "TradeStashTab",
  "StashTabBundle",
  "TradeStashTabBundle",
  "PremiumStashTabBundle",
  "CurrencyTab",
  "FragmentTab",
  "GemTab",
  "MapTab",
  "FlaskTab",
  "UniqueTab",
  "PremiumQuadTab",
  "BreachTab",
  "DeliriumTab",
  "EssenceTab",
  "DivinationTab",
  "BlightTab",
  "MetamorphTab",
  "DelveTab",
]);
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

function apiTime(value) {
  const match =
    typeof value === "string" &&
    /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{3})?(Z|[+-](\d\d):(\d\d))$/.exec(
      value,
    );
  check(
    match &&
      isCalendarDate(match[1]) &&
      +match[2] < 24 &&
      +match[3] < 60 &&
      +match[4] < 60 &&
      (!match[6] ||
        (+match[6] <= 14 &&
          +match[7] < 60 &&
          (+match[6] !== 14 || +match[7] === 0))),
    "Invalid API timestamp",
  );
  const time = Date.parse(value);
  check(Number.isFinite(time), "Invalid API timestamp");
  return new Date(time).toISOString();
}

function inspectShop(source, payload, now) {
  const items = source.game === "poe2" ? payload?.data : payload?.items;
  check(
    Array.isArray(items) && items.length > 0 && items.length <= 5000,
    "Invalid shop catalog",
  );
  if (source.game === "poe1")
    check(payload.total === items.length, "Incomplete PoE1 category catalog");
  const rows = items.flatMap((item) => {
    check(
      item && typeof item === "object" && !Array.isArray(item),
      "Invalid shop product",
    );
    if (source.game === "poe2")
      check(
        Array.isArray(item.tags) &&
          item.tags.every((tag) => typeof tag === "string"),
        "Invalid product tags",
      );
    check(
      item.variants === undefined || Array.isArray(item.variants),
      "Invalid variants",
    );
    return [
      item,
      ...(item.variants ?? []).map((variant) => {
        check(
          variant && typeof variant === "object" && !Array.isArray(variant),
          "Invalid variant",
        );
        check(
          variant.tags === undefined ||
            (Array.isArray(variant.tags) &&
              variant.tags.every((tag) => typeof tag === "string")),
          "Invalid variant tags",
        );
        return {
          ...variant,
          tags: variant.tags ?? item.tags,
          guild: variant.guild ?? item.guild,
        };
      }),
    ];
  });
  const personal = rows.filter(
    (item) =>
      item.guild !== true &&
      (source.game === "poe2"
        ? Array.isArray(item.tags) &&
          item.tags.some(
            (tag) => tag === "StashTabs" || tag === "PoE2StashTabs",
          ) &&
          !item.tags.some(
            (tag) => tag === "GuildStashTabs" || tag === "PoE2GuildStashTabs",
          )
        : POE1_PERSONAL_IDS.has(item.id)),
  );
  check(
    personal.length > 0 && personal.length <= 200,
    "No identifiable personal stash products",
  );
  const periods = new Map();
  let missingPeriod = false;
  const discountedIds = [];
  for (const item of personal) {
    const baseCost = source.game === "poe2" ? item.baseCost : item.originalCost;
    check(
      typeof item.id === "string" &&
        /^[A-Za-z0-9_-]{1,160}$/.test(item.id) &&
        typeof item.cost === "number" &&
        Number.isFinite(item.cost) &&
        item.cost >= 0 &&
        typeof baseCost === "number" &&
        Number.isFinite(baseCost) &&
        baseCost >= item.cost,
      "Invalid personal stash price",
    );
    if (source.game === "poe1")
      check(typeof item.onSpecial === "boolean", "Missing legacy special flag");
    const discounted =
      item.cost < baseCost && (source.game !== "poe1" || item.onSpecial);
    if (!discounted && !(source.game === "poe1" && item.onSpecial)) continue;
    if (discounted) discountedIds.push(item.id);
    if (!item.special) {
      missingPeriod = true;
      continue;
    }
    if (!discounted) continue;
    const startsAt = apiTime(item.special.start);
    const endsAt = apiTime(item.special.end);
    const start = Date.parse(startsAt),
      end = Date.parse(endsAt);
    check(
      end > start &&
        end - start <= 90 * DAY &&
        start <= now.getTime() &&
        now.getTime() < end,
      "Inconsistent current sale period",
    );
    const key = `${startsAt}:${endsAt}`;
    const period = periods.get(key) ?? {
      startsAt,
      endsAt,
      observedAt: now.toISOString(),
      productIds: [],
    };
    period.productIds.push(item.id);
    periods.set(key, period);
  }
  check(periods.size <= 1, "Conflicting personal stash sale periods");
  // Do not combine exact prices with an unrelated or incomplete period.
  check(
    !(missingPeriod && periods.size),
    "Incomplete personal stash sale periods",
  );
  const confirmedPeriod = [...periods.values()][0] ?? null;
  if (confirmedPeriod) {
    confirmedPeriod.productIds = [
      ...new Set(confirmedPeriod.productIds),
    ].sort();
    check(
      confirmedPeriod.productIds.length <= 100,
      "Too many confirmed stash products",
    );
  }
  return {
    observation: {
      ...source,
      checkedAt: now.toISOString(),
      status: missingPeriod ? "period-unavailable" : "ok",
      confirmedPeriod,
    },
    personalCount: personal.length,
    discountedIds: [...new Set(discountedIds)].sort(),
  };
}

const seoulDate = (utc) =>
  new Date(Date.parse(utc) + 9 * 3600_000).toISOString().slice(0, 10);
const addDays = (date, days) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);

function estimate(anchor, now) {
  if (!anchor) return null;
  const startDate = addDays(
    anchor.origin === "api" ? seoulDate(anchor.startsAt) : anchor.startDate,
    21,
  );
  const endDate = addDays(
    anchor.origin === "api" ? seoulDate(anchor.endsAt) : anchor.endDate,
    21,
  );
  const expiresAt = Date.parse(addDays(endDate, 1) + "T00:00:00+09:00");
  if (now.getTime() >= expiresAt) return null;
  return {
    startDate,
    endDate,
    timeZone: "Asia/Seoul",
    intervalDays: 21,
    basisOrigin: anchor.origin,
    basisSourceUrl:
      anchor.origin === "api" ? anchor.sourceUrl : anchor.sourceUrls.at(-1),
  };
}

export async function collectStashSales({ previous, fetchText, pause, clock }) {
  const observations = [],
    reports = [],
    warnings = [];
  let anchor = previous?.anchor ?? structuredClone(manualSeed);
  for (const source of SHOP_SOURCES) {
    await pause();
    const prior = previous?.observations.find(
      (x) => x.service === source.service && x.game === source.game,
    );
    try {
      const payload = JSON.parse(await fetchText(source.sourceUrl));
      const result = inspectShop(source, payload, clock());
      observations.push(result.observation);
      reports.push(result);
      const period = result.observation.confirmedPeriod;
      if (
        period &&
        (anchor?.origin !== "api" ||
          Date.parse(period.startsAt) > Date.parse(anchor.startsAt))
      ) {
        anchor = {
          origin: "api",
          ...source,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          observedAt: period.observedAt,
        };
      }
    } catch (error) {
      const now = clock();
      const observation = {
        ...source,
        checkedAt: prior?.checkedAt ?? now.toISOString(),
        status: "unavailable",
        confirmedPeriod:
          prior?.confirmedPeriod &&
          Date.parse(prior.confirmedPeriod.endsAt) > now.getTime()
            ? prior.confirmedPeriod
            : null,
      };
      observations.push(observation);
      reports.push({ observation, personalCount: null, discountedIds: null });
      warnings.push(`${source.sourceUrl}: ${error.message}`);
    }
  }
  const now = clock();
  for (const observation of observations)
    if (
      observation.confirmedPeriod &&
      Date.parse(observation.confirmedPeriod.endsAt) <= now.getTime()
    )
      observation.confirmedPeriod = null;
  const stashSales = parseStashSales({
    version: 1,
    observations,
    anchor,
    nextEstimate: estimate(anchor, now),
  });
  return { stashSales, reports, warnings };
}

export function collectionSummary(feed, reports, warnings) {
  const stash = feed.stashSales;
  const rows = reports.map(
    ({ observation: o, personalCount, discountedIds }) => {
      const p = o.confirmedPeriod;
      const evidence = p
        ? `${o.status === "ok" ? "API confirmed" : "Cached API confirmation"}: ${p.startsAt} - ${p.endsAt}; ${p.productIds.join(", ")}`
        : "No confirmed period";
      return `| ${o.service} ${o.game} | ${o.status} | ${o.checkedAt} | ${personalCount ?? "unavailable"} | ${discountedIds?.join(", ") || "-"} | ${evidence} |`;
    },
  );
  return [
    "## Promotion collection",
    `Generated: ${feed.generatedAt}; Twitch drops: ${feed.events.length}`,
    "",
    "| Source | Status | Last successful check (first failure: attempt) | Personal products | Discounted product IDs | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Anchor: ${stash.anchor?.origin ?? "none"}; ${stash.anchor?.sourceUrl ?? stash.anchor?.sourceUrls.join(", ") ?? "-"}`,
    `Date-only estimate (never an API confirmation): ${stash.nextEstimate ? `${stash.nextEstimate.startDate} - ${stash.nextEstimate.endDate} Asia/Seoul; +21 days once` : "none"}`,
    ...(warnings.length
      ? [
          "",
          "Warnings:",
          ...warnings.map((warning) => `- ${warning.replace(/[\r\n|]/g, " ")}`),
        ]
      : []),
    "",
  ].join("\n");
}

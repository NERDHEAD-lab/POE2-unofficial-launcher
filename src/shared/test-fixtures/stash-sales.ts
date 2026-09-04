import { STASH_API_URLS, type StashObservation } from "../stash-sales";

export const stashSection = {
  version: 1 as const,
  observations: [
    {
      service: "kakao" as const,
      game: "poe2" as const,
      sourceUrl:
        "https://poe2.kakaogames.com/api/shop-microtransactions?game=poe2",
      checkedAt: "2026-09-04T00:00:00Z",
      status: "ok" as const,
      confirmedPeriod: null,
    },
    ...(
      [
        ["ggg", "poe1"],
        ["ggg", "poe2"],
        ["kakao", "poe1"],
      ] as const
    ).map(([service, game]) => ({
      service,
      game,
      sourceUrl: STASH_API_URLS[`${service}:${game}`],
      checkedAt: "2026-09-04T00:00:00Z",
      status: "ok" as const,
      confirmedPeriod: null,
    })),
  ],
  anchor: {
    origin: "manual-announcement" as const,
    startDate: "2026-08-21",
    endDate: "2026-08-25",
    timeZone: "Asia/Seoul" as const,
    sourceUrls: [
      "https://poe.kakaogames.com/forum/view-thread/3991174",
      "https://poe.kakaogames.com/forum/view-thread/3998528",
    ],
    scope: [
      { service: "kakao" as const, game: "poe1" as const },
      { service: "kakao" as const, game: "poe2" as const },
    ],
  },
  nextEstimate: {
    startDate: "2026-09-11",
    endDate: "2026-09-15",
    timeZone: "Asia/Seoul" as const,
    intervalDays: 21 as const,
    basisOrigin: "manual-announcement" as const,
    basisSourceUrl: "https://poe.kakaogames.com/forum/view-thread/3998528",
  },
};

export const stashObservations = (
  ...overrides: StashObservation[]
): StashObservation[] =>
  stashSection.observations.map(
    (item) =>
      overrides.find(
        (other) => other.service === item.service && other.game === item.game,
      ) ?? item,
  );

export const observedStashPeriod = {
  startsAt: "2026-09-04T00:00:00Z",
  endsAt: "2026-09-08T00:00:00Z",
  observedAt: "2026-09-04T00:00:00Z",
  productIds: ["PremiumStashTab", "StashTab", "CurrencyTab"],
};

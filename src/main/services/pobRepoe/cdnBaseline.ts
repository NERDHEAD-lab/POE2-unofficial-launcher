export const REPOE_POE2_BASE_URL = "https://repoe-fork.github.io/poe2";
export const GGPK_POE2_VERSION_URL = "https://ggpk.exposed/version?poe=2";

export interface RePoeCdnBaselineTarget {
  id: string;
  url: string;
}

export interface RePoeCdnBaselineResult extends RePoeCdnBaselineTarget {
  ok: boolean;
  status: number;
  statusText: string;
}

export interface RePoePassiveTreeJsonBaselineResult {
  englishPassiveCount: number;
  koreanPassiveCount: number;
  overlapCount: number;
  overlapRatio: number;
}

type BaselineFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "statusText">>;

type JsonFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

const REPOE_TREE_EN_URL = `${REPOE_POE2_BASE_URL}/passive_skill_trees/Default.json`;
const REPOE_TREE_KO_URL = `${REPOE_POE2_BASE_URL}/Korean/passive_skill_trees/Default.json`;
const MIN_PASSIVE_KEY_OVERLAP = 0.8;

export const REPOE_POE2_CDN_BASELINE_TARGETS: RePoeCdnBaselineTarget[] = [
  {
    id: "repoe-version",
    url: `${REPOE_POE2_BASE_URL}/version.txt`,
  },
  {
    id: "repoe-tree-ko",
    url: REPOE_TREE_KO_URL,
  },
  {
    id: "repoe-tree-en",
    url: REPOE_TREE_EN_URL,
  },
  {
    id: "ggpk-poe2-version",
    url: GGPK_POE2_VERSION_URL,
  },
];

export async function checkRePoeCdnBaseline(
  fetcher: BaselineFetch = fetch,
): Promise<RePoeCdnBaselineResult[]> {
  return Promise.all(
    REPOE_POE2_CDN_BASELINE_TARGETS.map(async (target) => {
      const response = await fetcher(target.url, {
        method: "HEAD",
        redirect: "follow",
      });

      return {
        ...target,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      };
    }),
  );
}

export function assertRePoeCdnBaseline(
  results: RePoeCdnBaselineResult[],
): void {
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return;
  }

  const details = failed
    .map(
      (result) =>
        `${result.id} ${result.status} ${result.statusText}: ${result.url}`,
    )
    .join("; ");

  throw new Error(`RePoE CDN baseline failed: ${details}`);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

async function fetchJson(
  url: string,
  id: string,
  fetcher: JsonFetch,
): Promise<unknown> {
  const response = await fetcher(url, {
    method: "GET",
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(
      `RePoE CDN JSON baseline failed: ${id} ${response.status} ${response.statusText}: ${url}`,
    );
  }
  return response.json();
}

function passiveKeys(value: unknown, id: string): string[] {
  if (!isRecord(value) || !isRecord(value.passives)) {
    throw new Error(`RePoE passive tree JSON missing passives: ${id}`);
  }
  return Object.keys(value.passives);
}

export async function checkRePoePassiveTreeJsonBaseline(
  fetcher: JsonFetch = fetch,
): Promise<RePoePassiveTreeJsonBaselineResult> {
  const [englishTree, koreanTree] = await Promise.all([
    fetchJson(REPOE_TREE_EN_URL, "repoe-tree-en", fetcher),
    fetchJson(REPOE_TREE_KO_URL, "repoe-tree-ko", fetcher),
  ]);
  const englishKeys = passiveKeys(englishTree, "repoe-tree-en");
  const koreanKeySet = new Set(passiveKeys(koreanTree, "repoe-tree-ko"));
  const overlapCount = englishKeys.filter((key) =>
    koreanKeySet.has(key),
  ).length;
  const overlapRatio =
    englishKeys.length > 0 ? overlapCount / englishKeys.length : 0;

  return {
    englishPassiveCount: englishKeys.length,
    koreanPassiveCount: koreanKeySet.size,
    overlapCount,
    overlapRatio,
  };
}

export function assertRePoePassiveTreeJsonBaseline(
  result: RePoePassiveTreeJsonBaselineResult,
): void {
  if (
    result.englishPassiveCount > 0 &&
    result.koreanPassiveCount > 0 &&
    result.overlapRatio >= MIN_PASSIVE_KEY_OVERLAP
  ) {
    return;
  }

  throw new Error(
    `RePoE passive tree JSON baseline failed: en=${result.englishPassiveCount}, ko=${result.koreanPassiveCount}, overlap=${result.overlapCount}, ratio=${result.overlapRatio.toFixed(3)}`,
  );
}

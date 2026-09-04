/* global fetch, AbortSignal, Buffer, process, URL, console */
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { parsePromotionFeed } from "./contract.mjs";
import {
  canonicalSource,
  parseArticle,
  parseForum,
  parseRss,
  mergePromotions,
} from "./collector.mjs";

export async function fetchOfficial(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "PoE-Unofficial-Launcher-Promotions/1.0 (+https://github.com/NERDHEAD-lab/POE2-unofficial-launcher)",
      Accept: "text/html, application/rss+xml",
    },
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function collect({
  previous = null,
  overrides,
  fetchText = fetchOfficial,
  pause = () => delay(500),
  now = new Date(),
}) {
  if (previous) previous = parsePromotionFeed(previous);
  // Validate controls before requests. Disabled official IDs retain their source
  // as a candidate even after the published feed no longer contains the event.
  mergePromotions(previous, [], overrides, now);
  const disabledSources = new Set(
    overrides.disabledIds.flatMap((id) => {
      const match = /^ggg-(\d+)-/.exec(id);
      return match
        ? [`https://www.pathofexile.com/forum/view-thread/${match[1]}`]
        : [];
    }),
  );
  const candidates = new Map();
  const discover = (items) => {
    for (const item of items)
      candidates.set(item.url, { ...candidates.get(item.url), ...item });
  };
  // Fail the run on discovery failure; an error/challenge page is not an empty feed.
  discover(parseRss(await fetchText("https://www.pathofexile.com/news/rss")));
  // Keep the bounded window on every run so an initially failed page-two source
  // is retried even when other successful sources advance generatedAt.
  const pages = 3;
  for (const board of ["news", "2211"]) {
    for (let page = 1; page <= pages; page++) {
      await pause();
      discover(
        parseForum(
          await fetchText(
            `https://www.pathofexile.com/forum/view-forum/${board}${page === 1 ? "" : `/page/${page}`}`,
          ),
        ),
      );
    }
  }
  for (const event of previous?.events ?? []) {
    if (Date.parse(event.endsAt) > now.getTime()) {
      const url = canonicalSource(event.sourceUrl);
      if (!candidates.has(url)) candidates.set(url, { url });
    }
  }
  for (const url of disabledSources)
    if (!candidates.has(url)) candidates.set(url, { url });
  if (candidates.size > 60) throw new Error("Unexpected candidate volume");
  const parsed = [];
  const warnings = [];
  for (const item of candidates.values()) {
    const known =
      previous?.events.filter(
        (event) => canonicalSource(event.sourceUrl) === item.url,
      ) ?? [];
    if (
      !disabledSources.has(item.url) &&
      known.length &&
      known.every((event) => Date.parse(event.endsAt) <= now.getTime())
    )
      continue;
    await pause();
    try {
      parsed.push(
        ...parseArticle(
          await fetchText(`${item.url}/filter-account-type/staff`),
          item.url,
          item.publishedAt,
        ),
      );
    } catch (error) {
      if (disabledSources.has(item.url))
        throw new Error(
          `Cannot validate disabled source ${item.url}: ${error.message}`,
        );
      // A failed candidate keeps its last validated events; other sources may advance.
      warnings.push(`${item.url}: ${error.message}`);
    }
  }
  if (warnings.length && !parsed.length && !previous?.events.length)
    throw new Error(`No validated promotions: ${warnings.join("; ")}`);
  return { feed: mergePromotions(previous, parsed, overrides, now), warnings };
}

async function readJson(path, optional = false) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function collectToFile({
  output,
  previousPath = output,
  ...options
}) {
  const previous = await readJson(previousPath, true);
  const overrides = await readJson(
    new URL("./overrides.json", import.meta.url),
  );
  const result = await collect({ ...options, previous, overrides });
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result.feed, null, 2)}\n`);
  await rename(temporary, output);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (key) => args[args.indexOf(key) + 1];
  if (
    !args.includes("--output") ||
    ![2, 4].includes(args.length) ||
    args.some((value, index) =>
      index % 2 === 0
        ? !["--output", "--previous"].includes(value)
        : value.startsWith("--"),
    ) ||
    new Set(args.filter((_, index) => index % 2 === 0)).size !== args.length / 2
  )
    throw new Error(
      "Usage: node scripts/promotions/collect.mjs --output <promotions.json> [--previous <promotions.json>]",
    );
  const output = resolve(option("--output"));
  const { feed, warnings } = await collectToFile({
    output,
    previousPath: args.includes("--previous")
      ? resolve(option("--previous"))
      : output,
  });
  console.log(`Validated ${feed.events.length} events -> ${output}`);
  for (const warning of warnings) console.warn(warning);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

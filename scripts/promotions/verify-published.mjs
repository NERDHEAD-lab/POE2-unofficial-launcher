import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { parsePromotionFeed } from "./contract.mjs";

export const PUBLIC_URL =
  "https://nerdhead-lab.github.io/POE2-unofficial-launcher/promotions.json";

export async function verifyPublished(
  expected,
  {
    attempts = 20,
    fetchResponse = () =>
      fetch(PUBLIC_URL, {
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      }),
    pause = () => delay(15_000),
  } = {},
) {
  const wanted = JSON.stringify(parsePromotionFeed(expected));
  let failure = "No response";
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchResponse();
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (Buffer.byteLength(body) > 256 * 1024)
        throw new Error("Public feed too large");
      if (JSON.stringify(parsePromotionFeed(JSON.parse(body))) !== wanted)
        throw new Error("Public feed differs from collected feed");
      return;
    } catch (error) {
      failure = error.message;
    }
    if (attempt + 1 < attempts) await pause();
  }
  throw new Error(`Public promotions.json not verified: ${failure}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3)
      throw new Error(
        "Usage: node scripts/promotions/verify-published.mjs <candidate.json>",
      );
    await verifyPublished(JSON.parse(await readFile(process.argv[2], "utf8")));
    console.log(`HTTP 200 and validated contents match: ${PUBLIC_URL}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

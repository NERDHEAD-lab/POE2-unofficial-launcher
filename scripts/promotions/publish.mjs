import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePromotionFeed } from "./contract.mjs";

// Explicit publishing command. collect.mjs never calls this module.
export function publishFeed({ pages, input, revision }) {
  const feed = parsePromotionFeed(JSON.parse(readFileSync(input, "utf8")));
  if (!/^[a-f0-9]{40}$/.test(revision ?? ""))
    throw new Error("Expected collection revision SHA");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: pages,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  if (git("branch", "--show-current") !== "gh-pages")
    throw new Error("Expected gh-pages checkout");
  if (git("status", "--porcelain", "--untracked-files=all"))
    throw new Error("Pages checkout must be clean");
  if (git("rev-parse", "HEAD") !== revision)
    throw new Error("Collection revision no longer matches checkout");
  git("fetch", "origin", "gh-pages");
  if (
    git(
      "diff",
      "--name-only",
      revision,
      "origin/gh-pages",
      "--",
      "promotions.json",
    )
  )
    throw new Error(
      "Remote promotions.json changed during collection; collect again",
    );
  git("merge", "--ff-only", "origin/gh-pages");
  writeFileSync(
    join(pages, "promotions.json"),
    `${JSON.stringify(feed, null, 2)}\n`,
  );
  git("add", "--", "promotions.json");
  const changed = git("diff", "--cached", "--name-only");
  if (!changed) return { changed: false, revision: git("rev-parse", "HEAD") };
  if (changed !== "promotions.json")
    throw new Error("Unexpected staged Pages changes");
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "github-actions[bot]@users.noreply.github.com");
  git("commit", "-m", "chore: update event promotions");
  // A competing push is a hard failure; never force-push or merge JSON after collection.
  git("push", "origin", "HEAD:gh-pages");
  return { changed: true, revision: git("rev-parse", "HEAD") };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [pages, input, revision, ...extra] = process.argv.slice(2);
    if (!pages || !input || !revision || extra.length)
      throw new Error(
        "Usage: node scripts/promotions/publish.mjs <pages-checkout> <candidate.json> <collection-revision>",
      );
    console.log(
      JSON.stringify(
        publishFeed({ pages: resolve(pages), input: resolve(input), revision }),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

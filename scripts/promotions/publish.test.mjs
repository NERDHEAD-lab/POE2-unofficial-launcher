import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { publishFeed } from "./publish.mjs";
import samples from "./fixtures/stash-sales-contract.json" with { type: "json" };

const feed = {
  schemaVersion: 1,
  generatedAt: "2026-09-04T08:00:00Z",
  events: [],
  stashSales: samples.manual.stashSales,
};
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
function repo(t, initialFeed = false) {
  const parent = resolve(".tmp");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "promotions-git-test-"));
  t.after(() => {
    assert.ok(realpathSync(root).startsWith(realpathSync(parent) + sep));
    rmSync(root, { recursive: true, force: true });
  });
  const origin = join(root, "origin.git"),
    pages = join(root, "pages"),
    other = join(root, "other");
  git(root, "init", "--bare", origin);
  git(root, "clone", origin, pages);
  git(pages, "switch", "-c", "gh-pages");
  git(pages, "config", "user.name", "Test");
  git(pages, "config", "user.email", "test@example.invalid");
  writeFileSync(join(pages, "index.html"), "original site");
  if (initialFeed)
    writeFileSync(join(pages, "promotions.json"), JSON.stringify(feed));
  git(pages, "add", ".");
  git(pages, "commit", "-m", "initial");
  git(pages, "push", "origin", "gh-pages");
  git(root, "clone", "--branch", "gh-pages", origin, other);
  git(other, "config", "user.name", "Test");
  git(other, "config", "user.email", "test@example.invalid");
  const revision = git(pages, "rev-parse", "HEAD");
  const input = join(root, "candidate.json");
  writeFileSync(
    input,
    JSON.stringify({ ...feed, generatedAt: "2026-09-04T09:00:00Z" }),
  );
  return { root, origin, pages, other, revision, input };
}
const remoteWrite = (r, file, value) => {
  writeFileSync(join(r.other, file), value);
  git(r.other, "add", file);
  git(r.other, "commit", "-m", "concurrent update");
  git(r.other, "push", "origin", "gh-pages");
};

test("initial publication writes only promotions.json and identical repeat is a no-op", (t) => {
  const r = repo(t);
  assert.equal(publishFeed(r).changed, true);
  assert.equal(
    git(r.pages, "diff", "--name-only", r.revision, "HEAD"),
    "promotions.json",
  );
  assert.equal(
    readFileSync(join(r.pages, "index.html"), "utf8"),
    "original site",
  );
  assert.equal(
    git(r.origin, "rev-parse", "gh-pages"),
    git(r.pages, "rev-parse", "HEAD"),
  );
  assert.deepEqual(
    JSON.parse(git(r.origin, "show", "gh-pages:promotions.json")).stashSales,
    feed.stashSales,
  );
  assert.equal(
    publishFeed({ ...r, revision: git(r.pages, "rev-parse", "HEAD") }).changed,
    false,
  );
});

test("concurrent site changes survive in the published branch", (t) => {
  const r = repo(t);
  remoteWrite(r, "themes.json", '{"theme":"preserve me"}');
  publishFeed(r);
  assert.equal(
    git(r.origin, "show", "gh-pages:themes.json"),
    '{"theme":"preserve me"}',
  );
  assert.equal(
    git(r.pages, "diff", "--name-only", "HEAD^", "HEAD"),
    "promotions.json",
  );
});

test("a concurrent feed edit aborts instead of merging stale JSON", (t) => {
  const r = repo(t, true);
  const replacement = JSON.stringify({
    ...feed,
    generatedAt: "2026-09-04T10:00:00Z",
  });
  remoteWrite(r, "promotions.json", replacement);
  assert.throws(() => publishFeed(r), /changed during collection/);
  assert.equal(git(r.origin, "show", "gh-pages:promotions.json"), replacement);
});

test("invalid JSON and dirty checkout cannot modify the remote", (t) => {
  const r = repo(t, true);
  writeFileSync(r.input, '{"schemaVersion":2}');
  assert.throws(() => publishFeed(r), /Invalid promotion feed/);
  assert.equal(git(r.origin, "rev-parse", "gh-pages"), r.revision);
  writeFileSync(r.input, JSON.stringify(feed));
  writeFileSync(join(r.pages, "unknown.txt"), "preserve");
  assert.throws(() => publishFeed(r), /clean/);
  assert.equal(git(r.origin, "rev-parse", "gh-pages"), r.revision);
});

test("failed push is reported without overwriting the remote feed", (t) => {
  const r = repo(t, true);
  writeFileSync(join(r.origin, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", {
    mode: 0o755,
  });
  assert.throws(() => publishFeed(r), /push/);
  assert.equal(git(r.origin, "rev-parse", "gh-pages"), r.revision);
});

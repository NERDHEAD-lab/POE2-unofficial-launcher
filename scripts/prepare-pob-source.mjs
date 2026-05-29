import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const DEFAULT_REPO = "PathOfBuildingCommunity/PathOfBuilding-PoE2";
const CACHE_DIR = path.resolve(
  process.env.POB_SOURCE_CACHE_DIR ?? ".cache/pob-source",
);
const SOURCE_ROOT = path.join(CACHE_DIR, "src");
const SENTINEL = path.join(SOURCE_ROOT, "Modules", "Build.lua");

const parseGitHubRepo = (repoUrl) => {
  const httpsMatch = repoUrl.match(
    /^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i,
  );
  if (httpsMatch) {
    return httpsMatch[1];
  }

  const sshMatch = repoUrl.match(
    /^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i,
  );
  return sshMatch?.[1] ?? null;
};

const configuredRepoUrl = process.env.POB_SOURCE_REPO_URL;
const repoSlug =
  process.env.POB_SOURCE_REPO ??
  (configuredRepoUrl ? parseGitHubRepo(configuredRepoUrl) : DEFAULT_REPO);
const repoUrl =
  configuredRepoUrl ?? `https://github.com/${repoSlug ?? DEFAULT_REPO}.git`;

const git = (args, options = {}) =>
  execFileSync("git", args, {
    cwd: options.cwd ?? process.cwd(),
    stdio: options.stdio ?? "inherit",
    encoding: "utf8",
  });

const gitOutput = (args) =>
  execFileSync("git", args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();

const getJson = (url, redirectsLeft = 3) =>
  new Promise((resolve, reject) => {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "poe2-launcher-pob-source-prepare",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const request = https.get(url, { headers }, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location &&
        redirectsLeft > 0
      ) {
        response.resume();
        resolve(getJson(response.headers.location, redirectsLeft - 1));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `GitHub release lookup failed with ${response.statusCode}: ${body.slice(0, 200)}`,
            ),
          );
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
  });

const latestReleaseTagFromGitHub = async () => {
  if (!repoSlug) {
    throw new Error("POB_SOURCE_REPO is required for GitHub release lookup");
  }

  const release = await getJson(
    `https://api.github.com/repos/${repoSlug}/releases/latest`,
  );
  if (!release || typeof release.tag_name !== "string") {
    throw new Error("Latest GitHub release did not include tag_name");
  }

  return release.tag_name;
};

const latestTagFromGit = () => {
  const refs = gitOutput(["ls-remote", "--tags", "--refs", repoUrl]);
  const tags = refs
    .split(/\r?\n/)
    .map((line) => line.match(/refs\/tags\/(.+)$/)?.[1])
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  if (!tags[0]) {
    throw new Error(`No release tags found in ${repoUrl}`);
  }

  return tags[0];
};

const resolveRef = async () => {
  const explicitRef = process.env.POB_SOURCE_REF;
  if (explicitRef) {
    return explicitRef;
  }

  try {
    return await latestReleaseTagFromGitHub();
  } catch (error) {
    console.warn(`[pob-source] Latest release lookup failed: ${error.message}`);
    console.warn("[pob-source] Falling back to the highest remote tag.");
    return latestTagFromGit();
  }
};

const ensureClone = () => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(path.dirname(CACHE_DIR), { recursive: true });
    git(["clone", "--filter=blob:none", "--no-checkout", repoUrl, CACHE_DIR]);
    return;
  }

  const gitDir = path.join(CACHE_DIR, ".git");
  if (!fs.existsSync(gitDir)) {
    throw new Error(
      `${CACHE_DIR} already exists but is not a git checkout. Remove it or set POB_SOURCE_CACHE_DIR.`,
    );
  }

  git(["-C", CACHE_DIR, "remote", "set-url", "origin", repoUrl]);
};

const checkoutRef = (ref) => {
  git(["-C", CACHE_DIR, "fetch", "--tags", "--prune", "origin"]);

  let checkoutTarget = ref;
  try {
    git(["-C", CACHE_DIR, "fetch", "--depth", "1", "origin", ref]);
    checkoutTarget = "FETCH_HEAD";
  } catch (error) {
    console.warn(
      `[pob-source] Shallow fetch for ${ref} failed; trying fetched refs instead.`,
    );
  }

  git(["-C", CACHE_DIR, "checkout", "--detach", checkoutTarget]);
};

const writeGitHubEnv = () => {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) {
    return;
  }

  fs.appendFileSync(
    githubEnv,
    ["POB_SOURCE_REQUIRED=1", ""].join(os.EOL),
    "utf8",
  );
};

const main = async () => {
  const ref = await resolveRef();
  console.log(`[pob-source] Repository: ${repoUrl}`);
  console.log(`[pob-source] Ref: ${ref}`);
  console.log(`[pob-source] Cache: ${CACHE_DIR}`);

  ensureClone();
  checkoutRef(ref);

  if (!fs.existsSync(SENTINEL)) {
    throw new Error(`PoB source checkout is missing ${SENTINEL}`);
  }

  const commit = gitOutput(["-C", CACHE_DIR, "rev-parse", "HEAD"]);
  writeGitHubEnv();

  console.log(`[pob-source] Checked out ${commit}`);
  console.log(`[pob-source] Source root: ${SOURCE_ROOT}`);
};

main().catch((error) => {
  console.error(`[pob-source] ${error.stack ?? error.message}`);
  process.exitCode = 1;
});

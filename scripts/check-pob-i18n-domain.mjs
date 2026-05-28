#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_POB_I18N_DIR = path.resolve(
  scriptDir,
  "..",
  "packages",
  "pob-ui",
  "src",
  "i18n",
);

const KNOWN_GAME_DATA_KEYS = new Set([
  "Critical Strike Chance",
  "Fire Damage",
  "Cold Damage",
  "Lightning Damage",
  "Chaos Damage",
  "Physical Damage",
  "Energy Shield",
]);

function flattenKeys(value, prefix = "") {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child !== null && !Array.isArray(child) && typeof child === "object") {
      return [fullKey, ...flattenKeys(child, fullKey)];
    }
    return [fullKey];
  });
}

export function isLikelyPobGameDataKey(key) {
  const segments = key.split(".");
  return segments.some(
    (segment) =>
      KNOWN_GAME_DATA_KEYS.has(segment) ||
      /\s/.test(segment) ||
      /[%+#]/.test(segment) ||
      /\bto\b/i.test(segment),
  );
}

export function findPobI18nDomainViolations(json, filePath = "<inline>") {
  return flattenKeys(json)
    .filter(isLikelyPobGameDataKey)
    .map((key) => ({ filePath, key }));
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function checkPobI18nDomain(i18nDir = DEFAULT_POB_I18N_DIR) {
  const entries = await fs.readdir(i18nDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(i18nDir, entry.name));

  const violations = [];
  for (const filePath of jsonFiles) {
    violations.push(
      ...findPobI18nDomainViolations(await readJsonFile(filePath), filePath),
    );
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await checkPobI18nDomain();
  if (violations.length > 0) {
    console.error(
      "PoB game-data strings must stay out of packages/pob-ui/src/i18n keys.",
    );
    for (const violation of violations) {
      console.error(`- ${violation.filePath}: ${violation.key}`);
    }
    process.exitCode = 1;
  }
}

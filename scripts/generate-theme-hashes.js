const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/**
 * POE2 Unofficial Launcher - Theme Asset Hash Generator
 * 
 * This script scans 'themes.json', calculates 8-character MD5 hashes for all assets,
 * and updates 'themes.json' with 'assetsHashes' field.
 * 
 * Usage: node scripts/generate-theme-hashes.js
 */

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: File not found at ${filePath}`);
    return null;
  }
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(fileBuffer).digest("hex").substring(0, 8);
}

function processThemes() {
  const siblingGHPagesDir = [
    path.join(__dirname, ".."), // Same repo (CI or local root context)
    path.join(__dirname, "../../POE2-unofficial-launcher-gh-pages"), // Local sibling
    path.join(__dirname, "../../POE2-quick-launch-for-kakao-gh-pages"),
  ].find((p) => fs.existsSync(path.join(p, "themes.json")));

  if (!siblingGHPagesDir) {
    console.error("Error: Could not find gh-pages sibling directory.");
    process.exit(1);
  }

  const themesJsonPath = path.join(siblingGHPagesDir, "themes.json");
  if (!fs.existsSync(themesJsonPath)) {
    console.error(`Error: themes.json not found at ${themesJsonPath}`);
    process.exit(1);
  }

  console.log(`Processing themes from: ${themesJsonPath}`);
  const data = JSON.parse(fs.readFileSync(themesJsonPath, "utf8"));

  const processCategory = (category) => {
    if (!data[category]) return;
    
    data[category] = data[category].map((theme) => {
      const hashes = {};
      let updated = false;

      for (const [key, relPath] of Object.entries(theme.assets)) {
        const fullPath = path.join(siblingGHPagesDir, relPath);
        const hash = getFileHash(fullPath);
        if (hash) {
          hashes[key] = hash;
          updated = true;
        }
      }

      if (updated) {
        theme.assetsHashes = hashes;
      }
      return theme;
    });
  };

  processCategory("poe1");
  processCategory("poe2");

  fs.writeFileSync(themesJsonPath, JSON.stringify(data, null, 2), "utf8");
  console.log("Successfully updated themes.json with asset hashes.");
}

processThemes();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/**
 * POE2 Unofficial Launcher - Developer Notice List Generator
 *
 * This script scans the 'notice/' directory for Markdown files and
 * generates a 'list.json' file that serves as an index for the launcher.
 *
 * Usage: node scripts/generate-notice-list.js
 */

const NOTICE_DIR = path.join(__dirname, "../notice");
const OUTPUT_FILE = path.join(NOTICE_DIR, "list.json");

function getHash(content) {
  // Normalize line endings to LF to ensure consistent hashes across OSes
  const normalizedContent = content.replace(/\r\n/g, "\n");
  return crypto.createHash("md5").update(normalizedContent).digest("hex");
}

function generateList() {
  if (!fs.existsSync(NOTICE_DIR)) {
    console.error(`Error: Notice directory not found at ${NOTICE_DIR}`);
    process.exit(1);
  }

  // Load existing list to preserve dates for unchanged files
  let existingNotices = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existingNotices = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
    } catch {
      console.warn("Could not parse existing list.json, starting fresh.");
    }
  }

  const files = fs.readdirSync(NOTICE_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md") && f !== "README.md");

  const today = new Date().toISOString().split("T")[0];

  // Find max ID from existing notices for new entries
  let maxId = 0;
  existingNotices.forEach((n) => {
    if (n.id && n.id > maxId) maxId = n.id;
  });

  const notices = mdFiles.map((filename) => {
    const filePath = path.join(NOTICE_DIR, filename);
    const content = fs.readFileSync(filePath, "utf8");
    const currentHash = getHash(content);

    // Find existing entry by URL (which includes filename)
    const url = `https://nerdhead-lab.github.io/POE2-unofficial-launcher/notice/${filename}`;
    const existing = existingNotices.find((n) => n.url === url);

    // Extract title from filename or first line
    let title = filename.replace(/\.md$/, "");
    const firstLine = content.split("\n")[0];
    if (firstLine.startsWith("# ")) {
      title = firstLine.replace("# ", "").trim();
    }

    let date = today;
    let id = existing?.id;

    // Logic: If file exists and hash matches, keep original date.
    // Otherwise (new file or changed content), use today's date.
    if (existing && existing.hash === currentHash) {
      date = existing.date;
    } else if (existing && !existing.hash) {
      date = existing.date;
    }

    // Assign new ID if not exists
    if (!id) {
      maxId += 1;
      id = maxId;
    }

    return {
      id: id,
      title: title,
      url: url,
      date: date,
      priority: filename.includes("priority") || filename.includes("notice"),
      hash: currentHash, // Store hash for next comparison
    };
  });

  // Sort: Simple ID ascending (1, 2, 3...)
  notices.sort((a, b) => a.id - b.id);

  const jsonContent = JSON.stringify(notices, null, 2);
  fs.writeFileSync(OUTPUT_FILE, jsonContent, "utf8");
  console.log(
    `Successfully generated ${OUTPUT_FILE} with ${notices.length} items.`,
  );

  // gh-pages detection & sync (ADR-020)
  const siblingGHPagesDir = [
    path.join(__dirname, "../../POE2-unofficial-launcher-gh-pages"),
    path.join(__dirname, "../../POE2-quick-launch-for-kakao-gh-pages"),
  ].find((p) => fs.existsSync(p));

  if (siblingGHPagesDir) {
    console.log(`Detected sibling gh-pages directory: ${siblingGHPagesDir}`);
    const targetNoticeDir = path.join(siblingGHPagesDir, "notice");

    if (!fs.existsSync(targetNoticeDir)) {
      fs.mkdirSync(targetNoticeDir, { recursive: true });
    }

    // Copy list.json
    fs.writeFileSync(
      path.join(targetNoticeDir, "list.json"),
      jsonContent,
      "utf8",
    );

    // Copy all markdown files
    mdFiles.forEach((f) => {
      fs.copyFileSync(path.join(NOTICE_DIR, f), path.join(targetNoticeDir, f));
    });

    console.log(
      `Successfully synced ${notices.length} notices to gh-pages branch.`,
    );
  }
}

generateList();

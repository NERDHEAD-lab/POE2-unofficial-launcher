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

function generateList() {
  if (!fs.existsSync(NOTICE_DIR)) {
    console.error(`Error: Notice directory not found at ${NOTICE_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(NOTICE_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md") && f !== "README.md");

  const notices = mdFiles.map((filename) => {
    const filePath = path.join(NOTICE_DIR, filename);
    const stats = fs.statSync(filePath);

    // Extract title from filename (e.g., "v1.0.0-release.md" -> "v1.0.0-release")
    // You can also read the first line of the file if it starts with "# "
    let title = filename.replace(/\.md$/, "");
    const content = fs.readFileSync(filePath, "utf8");
    const firstLine = content.split("\n")[0];
    if (firstLine.startsWith("# ")) {
      title = firstLine.replace("# ", "").trim();
    }

    return {
      title: title,
      url: `https://nerdhead-lab.github.io/POE2-unofficial-launcher/notice/${filename}`,
      date: stats.mtime.toISOString().split("T")[0], // YYYY-MM-DD
      priority: filename.includes("priority") || filename.includes("notice"),
    };
  });

  // Sort by date descending
  notices.sort((a, b) => new Date(b.date) - new Date(a.date));

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

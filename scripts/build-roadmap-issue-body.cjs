#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const defaultSource = path.join(root, "docs", "Roadmap.md");
const issueHeader = [
  "> [!NOTE]",
  "> 이 이슈는 `master` 브랜치의 `docs/Roadmap.md`와 자동 동기화됩니다.",
  "> 이슈 본문을 직접 수정하지 말고 `docs/Roadmap.md`를 수정해 주세요.",
  "",
  "",
].join("\n");

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function stripIssueOmitBlocks(markdown) {
  return markdown.replace(
    /<!-- issue-sync:omit-start -->[\s\S]*?<!-- issue-sync:omit-end -->\r?\n?/g,
    "",
  );
}

function stripRoadmapRefs(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+\(\[ref\]\([^)]+\)\)/g, ""))
    .join("\n");
}

function buildIssueBody(markdown) {
  return `${issueHeader}${stripRoadmapRefs(stripIssueOmitBlocks(markdown))
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

function main() {
  const source = path.resolve(readArgValue("--source") || defaultSource);
  const output = readArgValue("--output");
  const markdown = fs.readFileSync(source, "utf8");
  const issueBody = buildIssueBody(markdown);

  if (/\[ref\]\(/.test(issueBody)) {
    throw new Error("Roadmap issue body still contains ref links.");
  }

  if (/issue-sync:omit/.test(issueBody)) {
    throw new Error("Roadmap issue body still contains issue-sync markers.");
  }

  if (output) {
    fs.writeFileSync(path.resolve(output), issueBody, "utf8");
    return;
  }

  process.stdout.write(issueBody);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildIssueBody,
  stripIssueOmitBlocks,
  stripRoadmapRefs,
};

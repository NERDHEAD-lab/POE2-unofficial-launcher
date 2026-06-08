#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { buildIssueBody } = require("./build-roadmap-issue-body.cjs");

const root = path.resolve(__dirname, "..");
const defaultRoadmap = path.join(root, "docs", "Roadmap.md");
const defaultTemplate = path.join(
  root,
  "docs",
  "roadmap",
  "developer-roadmap-notice.template.md",
);

const INJECT_START = "<!-- roadmap-notice:inject-start -->";
const INJECT_END = "<!-- roadmap-notice:inject-end -->";

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRoadmapChecklist(markdown) {
  const match = markdown.match(/^## P0[\s\S]*$/m);
  if (!match) {
    throw new Error("Roadmap content does not contain a P0 section.");
  }

  return match[0].trim();
}

function buildRoadmapNotice(template, roadmap) {
  const checklist = extractRoadmapChecklist(buildIssueBody(roadmap));
  const replacement = [
    INJECT_START,
    "<!-- 이 영역은 scripts/build-roadmap-notice.cjs가 docs/Roadmap.md에서 생성합니다. -->",
    "",
    checklist,
    "",
    INJECT_END,
  ].join("\n");

  const pattern = new RegExp(
    `${escapeRegExp(INJECT_START)}[\\s\\S]*?${escapeRegExp(INJECT_END)}`,
  );

  if (!pattern.test(template)) {
    throw new Error("Roadmap notice template is missing injection markers.");
  }

  return `${template.replace(pattern, replacement).trimEnd()}\n`;
}

function main() {
  const roadmapPath = path.resolve(readArgValue("--roadmap") || defaultRoadmap);
  const templatePath = path.resolve(
    readArgValue("--template") || defaultTemplate,
  );
  const output = readArgValue("--output");

  const roadmap = fs.readFileSync(roadmapPath, "utf8");
  const template = fs.readFileSync(templatePath, "utf8");
  const notice = buildRoadmapNotice(template, roadmap);

  if (/\[ref\]\(/.test(notice)) {
    throw new Error("Roadmap notice still contains ref links.");
  }

  if (/issue-sync:omit/.test(notice)) {
    throw new Error("Roadmap notice still contains issue-sync markers.");
  }

  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, notice, "utf8");
    return;
  }

  process.stdout.write(notice);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRoadmapNotice,
  extractRoadmapChecklist,
};

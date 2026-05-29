#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const port = process.env.POE2_AGENT_DEBUG_PORT || "9323";
const buildName = process.env.POE2_AGENT_BUILD_NAME || "Imported Build2";
const secondBuildName = process.env.POE2_AGENT_SECOND_BUILD_NAME || "";
const timeoutMs = Number(process.env.POE2_AGENT_TIMEOUT_MS || "180000");
const startedAt = new Date();
const stamp = startedAt
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+$/, "")
  .replace("T", "-");
const logFile =
  process.env.POE2_AGENT_LOG_FILE ||
  path.join(repoRoot, "docs", "check", `pob-tree-agent-${stamp}.log`);
const treePerfPattern = /\[(?:pob-tree|POB_TREE)\]/i;
const treeCanvasPattern = /\[(?:pob-tree|POB_TREE)\].*canvas-draw/i;
const lines = [];
let devProcess = null;

const record = (scope, line) => {
  const text = `[${new Date().toISOString()}] [${scope}] ${line}`;
  lines.push(text);
  console.log(text);
};

const appendChunk = (scope, chunk) => {
  String(chunk)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .forEach((line) => record(scope, line));
};

const deadline = () => Date.now() + timeoutMs;

const waitUntil = async (description, predicate, endAt, intervalMs = 250) => {
  let lastError = null;
  while (Date.now() < endAt) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await delay(intervalMs);
  }
  const detail =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${description}.${detail}`);
};

const countTreePerfLines = () =>
  lines.filter((line) => treePerfPattern.test(line)).length;

const waitForQuietTreeLogs = async (endAt, quietMs = 1500) => {
  let previousCount = countTreePerfLines();
  let lastChangedAt = Date.now();
  while (Date.now() < endAt) {
    await delay(200);
    const nextCount = countTreePerfLines();
    if (nextCount !== previousCount) {
      previousCount = nextCount;
      lastChangedAt = Date.now();
    }
    if (Date.now() - lastChangedAt >= quietMs) return;
  }
};

const waitForTargetTranslationPass = async (buildName, endAt) => {
  const targetEndAt = Math.min(endAt, Date.now() + 8000);
  while (Date.now() < targetEndAt) {
    const completed = lines.some(
      (line) =>
        line.includes(`build=/${buildName}:`) &&
        /translate-tree [1-9]\d*(?:\.\d+)?ms/.test(line),
    );
    if (completed) return true;
    await delay(250);
  }
  return false;
};

const captureTreeState = async (page, label) => {
  const state = await page.evaluate(() => {
    const text = (selector) =>
      document
        .querySelector(selector)
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null;
    const selectedBuild = Array.from(
      document.querySelectorAll(".pob-build-row"),
    ).find((row) => row.classList.contains("selected"));
    const treeSelect = document.querySelector(
      ".pob-passive-tree-selector select",
    );
    const titleInput = document.querySelector(".pob-edit-title-input");
    const classSelect = document.querySelector(
      ".pob-build-metadata-field select",
    );
    const ascendancySelect = document.querySelectorAll(
      ".pob-build-metadata-field select",
    )[1];

    return {
      title:
        titleInput instanceof HTMLInputElement
          ? titleInput.value
          : text(".pob-edit-title-block"),
      selectedBuild:
        selectedBuild?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      treeClass:
        treeSelect instanceof HTMLSelectElement
          ? (treeSelect.selectedOptions[0]?.textContent?.trim() ?? null)
          : null,
      treeVersion: text(".pob-passive-tree-version"),
      treeAlloc: text(".pob-passive-tree-alloc"),
      metadataClass:
        classSelect instanceof HTMLSelectElement
          ? (classSelect.selectedOptions[0]?.textContent?.trim() ?? null)
          : null,
      metadataAscendancy:
        ascendancySelect instanceof HTMLSelectElement
          ? (ascendancySelect.selectedOptions[0]?.textContent?.trim() ?? null)
          : null,
    };
  });
  record("agent", `${label} tree-state ${JSON.stringify(state)}`);
  return state;
};

const captureItemTooltipState = async (page, label, endAt) => {
  const itemsTab = page.locator(".pob-mode-tab", { hasText: /아이템|Items/i });
  if ((await itemsTab.count()) === 0) {
    record("agent", `${label} item-tooltip-state skipped: no items tab`);
    return null;
  }

  await itemsTab.first().click();
  const itemRow = page.locator(".pob-items-row").first();
  await itemRow.waitFor({
    state: "visible",
    timeout: Math.max(1000, endAt - Date.now()),
  });
  await itemRow.hover();
  await page.locator(".pob-item-tooltip.is-floating").waitFor({
    state: "visible",
    timeout: Math.max(1000, Math.min(10000, endAt - Date.now())),
  });

  const state = await page.evaluate(() => {
    const tooltip = document.querySelector(".pob-item-tooltip.is-floating");
    const header = tooltip?.querySelector(".pob-item-tooltip-rarity");
    const separator = tooltip?.querySelector(".pob-item-tooltip-separator");
    const headerStyles = header ? window.getComputedStyle(header) : null;
    const separatorStyles = separator
      ? window.getComputedStyle(separator)
      : null;

    return {
      hasTooltip: Boolean(tooltip),
      hasAssetHeader: header?.classList.contains("has-asset-header") ?? false,
      headerLeft: headerStyles
        ?.getPropertyValue("--pob-tooltip-header-left")
        .trim(),
      headerMiddle: headerStyles
        ?.getPropertyValue("--pob-tooltip-header-middle")
        .trim(),
      headerRight: headerStyles
        ?.getPropertyValue("--pob-tooltip-header-right")
        .trim(),
      hasAssetSeparator:
        separator?.classList.contains("has-asset-separator") ?? false,
      separatorImage: separatorStyles?.backgroundImage ?? null,
      text: tooltip?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    };
  });
  record("agent", `${label} item-tooltip-state ${JSON.stringify(state)}`);
  return state;
};

const captureModePanelState = async (page, label) => {
  const state = await page.evaluate(() => {
    const activeTab = document.querySelector(".pob-mode-tab.is-active");
    const visibleSlot = document.querySelector(
      ".pob-mode-panel-slot:not([hidden])",
    );
    const mountedModes = Array.from(
      document.querySelectorAll(".pob-mode-panel-slot"),
    )
      .filter((slot) => slot.childElementCount > 0)
      .map((slot) => slot.getAttribute("data-pob-mode"));
    const text =
      visibleSlot?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) ??
      null;

    return {
      activeTab: activeTab?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      visibleMode: visibleSlot?.getAttribute("data-pob-mode") ?? null,
      mountedModes,
      hasPlaceholder: Boolean(
        visibleSlot?.querySelector(".pob-mode-placeholder-body"),
      ),
      hasBusy: Boolean(visibleSlot?.querySelector('[aria-busy="true"]')),
      text,
    };
  });
  record("agent", `${label} mode-panel-state ${JSON.stringify(state)}`);
  return state;
};

const runRapidModeSwitch = async (page, label) => {
  const modeTabs = page.locator(".pob-mode-tab");
  const count = await modeTabs.count();
  if (count < 2) {
    record("agent", `${label} rapid-switch skipped: only ${count} tabs`);
    return;
  }
  const sequence = [1, 2, 3, 4, 5, 0].filter((index) => index < count);
  const started = Date.now();
  for (const index of sequence) {
    const before = Date.now();
    await modeTabs.nth(index).click();
    record(
      "agent",
      `${label} rapid-switch click index=${index} elapsed=${Date.now() - before}ms`,
    );
    await delay(80);
  }
  await delay(1000);
  await captureModePanelState(
    page,
    `${label} rapid-switch-complete elapsed=${Date.now() - started}ms`,
  );
};

const waitForCdp = async (endAt) =>
  waitUntil(
    `Electron CDP endpoint on port ${port}`,
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (!response.ok) return false;
      const body = await response.json();
      return typeof body.webSocketDebuggerUrl === "string";
    },
    endAt,
  );

const pageLabel = (page) => {
  const url = page.url();
  if (url.includes("/pob.html")) return "pob";
  if (url.includes("localhost")) return "launcher";
  return "page";
};

const wirePageLogs = (page, wiredPages) => {
  if (wiredPages.has(page)) return;
  wiredPages.add(page);
  page.on("console", (msg) => {
    record(`renderer:${pageLabel(page)}:${msg.type()}`, msg.text());
  });
  page.on("pageerror", (err) => {
    record(`renderer:${pageLabel(page)}:pageerror`, err.stack || err.message);
  });
};

const allPages = (browser) =>
  browser.contexts().flatMap((context) => context.pages());

const wireBrowserLogs = (browser) => {
  const wiredPages = new WeakSet();
  for (const context of browser.contexts()) {
    context.on("page", (page) => wirePageLogs(page, wiredPages));
    for (const page of context.pages()) wirePageLogs(page, wiredPages);
  }
  return wiredPages;
};

const findPage = (browser, predicate) =>
  allPages(browser).find((page) => predicate(page));

const waitForPage = async (browser, description, predicate, endAt) =>
  waitUntil(
    description,
    async () => findPage(browser, predicate) ?? false,
    endAt,
  );

const clickIfVisible = async (locator, timeout = 1000) => {
  try {
    await locator.waitFor({ state: "visible", timeout });
    await locator.click();
    return true;
  } catch {
    return false;
  }
};

const selectBuild = async (page, name, endAt) => {
  while (Date.now() < endAt) {
    const row = page.locator(".pob-build-row", { hasText: name }).first();
    if ((await row.count()) > 0 && (await row.isVisible())) {
      await row.click();
      return;
    }

    const folderButtons = await page.locator(".pob-folder-label").all();
    for (const folderButton of folderButtons) {
      if (await folderButton.isVisible()) {
        await folderButton.click().catch(() => undefined);
      }
    }
    await delay(500);
  }
  throw new Error(`Unable to find build row: ${name}`);
};

const stopDevProcess = async () => {
  if (!devProcess || devProcess.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(devProcess.pid), "/t", "/f"],
        { stdio: "ignore" },
      );
      killer.on("close", resolve);
      killer.on("error", resolve);
    });
    return;
  }
  devProcess.kill("SIGTERM");
};

const writeAgentLog = async () => {
  await mkdir(path.dirname(logFile), { recursive: true });
  await writeFile(logFile, `${lines.join("\n")}\n`, "utf8");
  record("agent", `wrote log file: ${logFile}`);
};

const run = async () => {
  const endAt = deadline();
  record("agent", `starting hidden Electron agent on CDP port ${port}`);
  record("agent", `target build: ${buildName}`);
  if (secondBuildName) {
    record("agent", `second target build: ${secondBuildName}`);
  }

  const devCommand =
    process.platform === "win32"
      ? {
          command: "cmd.exe",
          args: ["/d", "/s", "/c", "npm run dev:agent:app"],
        }
      : { command: "npm", args: ["run", "dev:agent:app"] };

  devProcess = spawn(devCommand.command, devCommand.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      POE2_AGENT_MODE: "1",
      POE2_AGENT_DEBUG_PORT: port,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  devProcess.stdout.on("data", (chunk) => appendChunk("dev:stdout", chunk));
  devProcess.stderr.on("data", (chunk) => appendChunk("dev:stderr", chunk));

  await waitForCdp(endAt);
  record("agent", "CDP endpoint is ready");

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const wiredPages = wireBrowserLogs(browser);

  const launcherPage = await waitForPage(
    browser,
    "launcher page",
    (page) =>
      page.url().includes("localhost:54321") &&
      !page.url().includes("pob.html"),
    endAt,
  );
  await launcherPage.evaluate(() => {
    window.localStorage.setItem("pob:treePerf", "1");
  });
  record("agent", "enabled pob:treePerf localStorage flag");

  const launchButton = launcherPage.locator(".pob-launch-button").first();
  await launchButton.waitFor({ state: "visible", timeout: 30000 });
  await launchButton.click();
  record("agent", "clicked PoB Unofficial Wrapper launcher button");

  const confirmButton = launcherPage
    .locator(".pob-installer-actions .btn-primary", {
      hasText: "이 경로로 등록",
    })
    .first();
  if (await clickIfVisible(confirmButton, 5000)) {
    record("agent", "confirmed detected PoB install location");
  }

  const pobPage = await waitForPage(
    browser,
    "PoB wrapper page",
    (page) => page.url().includes("/pob.html"),
    endAt,
  );
  wirePageLogs(pobPage, wiredPages);
  await pobPage.evaluate(() => {
    window.localStorage.setItem("pob:treePerf", "1");
  });
  record("agent", "PoB wrapper page attached");

  await selectBuild(pobPage, buildName, endAt);
  record("agent", `selected build: ${buildName}`);

  await pobPage
    .locator(".pob-passive-tree-canvas")
    .waitFor({ state: "visible", timeout: Math.max(1000, endAt - Date.now()) });

  await waitUntil(
    `pob tree canvas-draw perf log for ${buildName}`,
    () =>
      lines.some(
        (line) =>
          treeCanvasPattern.test(line) && line.includes(`build=/${buildName}:`),
      ),
    endAt,
    500,
  );
  await waitForTargetTranslationPass(buildName, endAt);
  await waitForQuietTreeLogs(endAt);
  await captureTreeState(pobPage, buildName);
  record("agent", "passive tree canvas is visible");
  await captureItemTooltipState(pobPage, buildName, endAt);

  const countTreeStage = (pattern) =>
    lines.filter((line) => pattern.test(line)).length;
  const luaSnapshotBeforeWarmReturn = countTreeStage(/lua:pob\.tree\.snapshot/);
  const translateTreeBeforeWarmReturn = countTreeStage(/translate-tree/);
  const modeTabs = pobPage.locator(".pob-mode-tab");
  if ((await modeTabs.count()) >= 2) {
    await modeTabs.nth(1).click();
    await delay(300);
    await modeTabs.nth(0).click();
    await pobPage.locator(".pob-passive-tree-canvas").waitFor({
      state: "visible",
      timeout: Math.max(1000, endAt - Date.now()),
    });
    await delay(1000);
    const luaSnapshotAfterWarmReturn = countTreeStage(
      /lua:pob\.tree\.snapshot/,
    );
    const translateTreeAfterWarmReturn = countTreeStage(/translate-tree/);
    record(
      "agent",
      [
        "warm-return tab switch completed",
        `lua-snapshot-delta=${
          luaSnapshotAfterWarmReturn - luaSnapshotBeforeWarmReturn
        }`,
        `translate-tree-delta=${
          translateTreeAfterWarmReturn - translateTreeBeforeWarmReturn
        }`,
      ].join(" "),
    );
  }

  await runRapidModeSwitch(pobPage, buildName);

  if (secondBuildName) {
    await selectBuild(pobPage, secondBuildName, endAt);
    record("agent", `selected second build: ${secondBuildName}`);
    await pobPage.locator(".pob-passive-tree-canvas").waitFor({
      state: "visible",
      timeout: Math.max(1000, endAt - Date.now()),
    });
    await waitUntil(
      `pob tree canvas-draw perf log for ${secondBuildName}`,
      () =>
        lines.some(
          (line) =>
            treeCanvasPattern.test(line) &&
            line.includes(`build=/${secondBuildName}:`),
        ),
      endAt,
      500,
    );
    await waitForTargetTranslationPass(secondBuildName, endAt);
    await waitForQuietTreeLogs(endAt);
    await captureTreeState(pobPage, secondBuildName);
  }

  const treePerfLines = lines.filter((line) => treePerfPattern.test(line));
  record("agent", `captured ${treePerfLines.length} tree perf log lines`);
  await browser.close();
};

run()
  .then(async () => {
    await stopDevProcess();
    await writeAgentLog();
  })
  .catch(async (err) => {
    record(
      "agent:error",
      err instanceof Error ? err.stack || err.message : String(err),
    );
    await stopDevProcess();
    await writeAgentLog();
    process.exitCode = 1;
  });

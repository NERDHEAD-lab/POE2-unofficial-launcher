"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const LAUNCHER = path.join(__dirname, "hidden-electron-launch.cjs");
const FIXTURE = path.join(__dirname, "hidden-electron-launch-fixture.cjs");
const TARGET = "http://localhost:54321/";
const tempRoots = [];

const runLauncher = (
  args,
  runId = `qa-launcher-${crypto.randomBytes(8).toString("hex")}`,
) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LAUNCHER, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_HIDDEN_WINDOWS_RUN_ID: runId,
      },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    );
  });

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

test.after(() => {
  for (const root of tempRoots)
    fs.rmSync(root, { recursive: true, force: true });
});

test("project dev:wsl delegates unique-port readiness to the project launcher", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve("package.json"), "utf8"),
  );
  const command = packageJson.scripts["dev:wsl"];
  assert.match(command, /scripts\/qa\/hidden-electron-launch\.cjs/);
  assert.match(command, /--ready-file/);
  assert.doesNotMatch(command, /--ready-url|\b9222\b/);
  assert.doesNotMatch(command, /ELECTRON_QA_USER_DATA_DIR|profile-/);
  const mainSource = fs.readFileSync(path.resolve("src/main/main.ts"), "utf8");
  assert.match(mainSource, /process\.env\.ELECTRON_START_HIDDEN === "true"/);
  assert.match(mainSource, /process\.env\.ELECTRON_QA_RUN_ID/);
  assert.match(mainSource, /searchParams\.set\("codexQaRun", qaRunId\)/);
});

test("rejects a pre-existing CDP responder instead of accepting its target", async () => {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify([{ url: TARGET }]));
  });
  const port = await listen(server);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hidden-electron-port-"));
  tempRoots.push(root);
  const readyPath = path.join(root, "ready.json");
  try {
    const result = await runLauncher([
      "--ready-file",
      readyPath,
      "--candidate-port",
      String(port),
      "--child-script",
      FIXTURE,
      "--",
      "serve",
      TARGET,
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not exclusively available/);
    assert.equal(fs.existsSync(readyPath), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fails when its own child exits before exact renderer readiness", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hidden-electron-exit-"));
  tempRoots.push(root);
  const readyPath = path.join(root, "ready.json");
  const result = await runLauncher([
    "--ready-file",
    readyPath,
    "--timeout-ms",
    "3000",
    "--child-script",
    FIXTURE,
    "--",
    "exit",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /exited before renderer readiness/);
  assert.equal(fs.existsSync(readyPath), false);
});

test("rejects an alive responder exposing only the unmarked base target", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hidden-electron-base-"));
  tempRoots.push(root);
  const readyPath = path.join(root, "ready.json");
  const result = await runLauncher([
    "--ready-file",
    readyPath,
    "--timeout-ms",
    "3000",
    "--child-script",
    FIXTURE,
    "--",
    "serve",
    TARGET,
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /exited before renderer readiness/);
  assert.equal(fs.existsSync(readyPath), false);
});

test("rejects an alive responder marked for a different QA run", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "hidden-electron-foreign-"),
  );
  tempRoots.push(root);
  const readyPath = path.join(root, "ready.json");
  const foreignTarget = new URL(TARGET);
  foreignTarget.searchParams.set("codexQaRun", "different-run");
  const result = await runLauncher([
    "--ready-file",
    readyPath,
    "--timeout-ms",
    "3000",
    "--child-script",
    FIXTURE,
    "--",
    "serve",
    foreignTarget.toString(),
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /exited before renderer readiness/);
  assert.equal(fs.existsSync(readyPath), false);
});

test("writes readiness only for its alive child on its selected unique port", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hidden-electron-ready-"));
  tempRoots.push(root);
  const readyPath = path.join(root, "ready.json");
  const runId = `qa-own-${crypto.randomBytes(8).toString("hex")}`;
  const result = await runLauncher(
    [
      "--ready-file",
      readyPath,
      "--timeout-ms",
      "3000",
      "--child-script",
      FIXTURE,
      "--",
      "serve-own",
      TARGET,
    ],
    runId,
  );
  assert.equal(result.code, 0, result.stderr);
  const ready = JSON.parse(fs.readFileSync(readyPath, "utf8"));
  const expectedTarget = new URL(TARGET);
  expectedTarget.searchParams.set("codexQaRun", runId);
  assert.equal(ready.rendererTarget, expectedTarget.toString());
  assert.equal(ready.runId, runId);
  assert.deepEqual(ready.ownershipMarker, {
    name: "codexQaRun",
    value: runId,
  });
  assert.equal(path.isAbsolute(ready.profilePath), true);
  const profileFromCwd = path.relative(process.cwd(), ready.profilePath);
  assert.ok(
    profileFromCwd === ".." ||
      profileFromCwd.startsWith(`..${path.sep}`) ||
      path.isAbsolute(profileFromCwd),
  );
  const profileFromTemp = path.relative(os.tmpdir(), ready.profilePath);
  assert.notEqual(profileFromTemp, "");
  assert.equal(profileFromTemp.startsWith(`..${path.sep}`), false);
  tempRoots.push(ready.profilePath);
  assert.ok(Number.isInteger(ready.port));
  assert.ok(Number.isInteger(ready.childPid));
});

test("accepts an explicit absolute outside-cwd profile and reports its ownership", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "hidden-electron-explicit-ready-"),
  );
  tempRoots.push(root);
  const readyPath = path.join(root, "ready.json");
  const runId = `qa-explicit-${crypto.randomBytes(8).toString("hex")}`;
  const profileTemplate = path.join(
    os.tmpdir(),
    "poe2-explicit-codex-qa",
    "{runId}",
  );
  const result = await runLauncher(
    [
      "--ready-file",
      readyPath,
      "--profile-path",
      profileTemplate,
      "--timeout-ms",
      "3000",
      "--child-script",
      FIXTURE,
      "--",
      "serve-own",
      TARGET,
    ],
    runId,
  );
  assert.equal(result.code, 0, result.stderr);
  const ready = JSON.parse(fs.readFileSync(readyPath, "utf8"));
  assert.equal(
    path.normalize(ready.profilePath),
    path.normalize(profileTemplate.replace("{runId}", runId)),
  );
  assert.equal(ready.runId, runId);
  assert.equal(ready.ownershipMarker.value, runId);
  tempRoots.push(ready.profilePath);
});

test("rejects relative and inside-cwd explicit profiles before child launch", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "hidden-electron-invalid-profile-"),
  );
  tempRoots.push(root);
  for (const [label, profilePath, message] of [
    ["relative", "relative-profile", /must be absolute/],
    [
      "inside-cwd",
      path.join(process.cwd(), ".tmp", "invalid-qa-profile"),
      /outside the Vite working directory/,
    ],
  ]) {
    const readyPath = path.join(root, `${label}.ready.json`);
    const result = await runLauncher([
      "--ready-file",
      readyPath,
      "--profile-path",
      profilePath,
      "--child-script",
      FIXTURE,
      "--",
      "serve-own",
      TARGET,
    ]);
    assert.equal(result.code, 1, label);
    assert.match(result.stderr, message, label);
    assert.equal(fs.existsSync(readyPath), false, label);
  }
});

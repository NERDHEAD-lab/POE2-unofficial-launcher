"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const { toWindowsPath } = require("./run-hidden-windows.cjs");

const RUNNER_PATH = path.join(__dirname, "run-hidden-windows.cjs");
const FIXTURE_PATH = path.join(__dirname, "run-hidden-windows-fixture.cjs");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runPublic = (args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      shell: false,
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

const parseJson = (text, label) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} was not JSON: ${text}\n${error.message}`);
  }
};

const parseTrailingJson = (text, label) => {
  for (
    let index = text.lastIndexOf("\n{");
    index >= 0;
    index = text.lastIndexOf("\n{", index - 1)
  ) {
    try {
      return JSON.parse(text.slice(index + 1));
    } catch {
      // Keep scanning for the final complete structured object after relayed output.
    }
  }
  return parseJson(text, label);
};

const assertPidDeadThroughPublicRunner = async (artifactRoot, pid, label) => {
  const probe = await runPublic([
    "sync",
    "--cwd",
    process.cwd(),
    "--run-root",
    path.join(artifactRoot, "pid-probes"),
    "--timeout-ms",
    "10000",
    "--",
    "@node",
    toWindowsPath(FIXTURE_PATH),
    "pid-alive",
    String(pid),
  ]);
  assert.equal(probe.code, 1, `${label}: ${probe.stderr}`);
};

const waitForJson = async (filePath, predicate, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      const value = readJson(filePath);
      if (predicate(value)) return value;
    }
    await sleep(25);
  }
  throw new Error(`${label} not observed: ${filePath}`);
};

test("public detached output metadata path is copy-pasteable into stop and leaves no secret or child", async () => {
  const marker = `public-secret-${crypto.randomBytes(12).toString("hex")}`;
  const evidenceParent = path.join(
    process.cwd(),
    ".tmp",
    "windows-runner-public-evidence",
  );
  fs.mkdirSync(evidenceParent, { recursive: true });
  const artifactRoot = fs.mkdtempSync(path.join(evidenceParent, "public-e2e-"));
  const runRoot = path.join(artifactRoot, "requests");
  const readyPath = path.join(artifactRoot, "ready.json");
  let detached;
  let metadata;
  let stopped = false;
  try {
    detached = await runPublic(
      [
        "detached",
        "--cwd",
        process.cwd(),
        "--run-root",
        runRoot,
        "--stdout",
        path.join(artifactRoot, "{runId}.stdout.log"),
        "--stderr",
        path.join(artifactRoot, "{runId}.stderr.log"),
        "--metadata",
        path.join(artifactRoot, "{runId}.metadata.json"),
        "--ready-file",
        readyPath,
        "--ready-timeout-ms",
        "5000",
        "--ready-interval-ms",
        "25",
        "--pass-env",
        "RUNNER_SECRET_MARKER",
        "--",
        "@node",
        toWindowsPath(FIXTURE_PATH),
        "secret-check",
        toWindowsPath(readyPath),
      ],
      { RUNNER_SECRET_MARKER: marker },
    );
    assert.equal(detached.code, 0, detached.stderr);
    assert.doesNotMatch(
      `${detached.stdout}${detached.stderr}`,
      new RegExp(marker),
    );
    const publicMetadata = parseJson(detached.stdout, "detached output");
    assert.match(publicMetadata.metadataPath, /^\/mnt\/[a-z]\//);
    assert.equal("argv" in publicMetadata, false);

    metadata = JSON.parse(fs.readFileSync(publicMetadata.metadataPath, "utf8"));
    assert.equal(metadata.status, "running");
    assert.equal("argv" in metadata, false);
    assert.equal(
      fs.existsSync(path.join(runRoot, publicMetadata.runId, "request.json")),
      false,
    );

    const stop = await runPublic([
      "stop",
      "--metadata",
      publicMetadata.metadataPath,
      "--timeout-ms",
      "10000",
    ]);
    assert.equal(stop.code, 0, stop.stderr);
    assert.doesNotMatch(`${stop.stdout}${stop.stderr}`, new RegExp(marker));
    const stopResult = parseJson(stop.stdout, "stop output");
    assert.equal(stopResult.status, "stopped");
    assert.equal(stopResult.cleanup.stopped, true);
    assert.equal(stopResult.childAliveAfterCleanup, false);
    assert.equal(stopResult.targetAliveAfterCleanup, false);
    stopped = true;

    const persistedResultPath = path.join(
      runRoot,
      publicMetadata.runId,
      "result.json",
    );
    const persistedResult = readJson(persistedResultPath);
    fs.writeFileSync(
      persistedResultPath,
      `${JSON.stringify({ ...persistedResult, workerPid: persistedResult.workerPid + 1 }, null, 2)}\n`,
      "utf8",
    );
    const mismatch = await runPublic([
      "stop",
      "--metadata",
      publicMetadata.metadataPath,
      "--timeout-ms",
      "10000",
    ]);
    assert.equal(mismatch.code, 125, mismatch.stderr);
    fs.writeFileSync(
      persistedResultPath,
      `${JSON.stringify(persistedResult, null, 2)}\n`,
      "utf8",
    );

    await assertPidDeadThroughPublicRunner(
      artifactRoot,
      metadata.childPid,
      "stopped supervisor",
    );

    const persisted = [
      publicMetadata.metadataPath,
      publicMetadata.stdoutPath,
      publicMetadata.stderrPath,
      path.join(runRoot, publicMetadata.runId, "result.json"),
    ]
      .map((filePath) =>
        fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "",
      )
      .join("\n");
    assert.doesNotMatch(persisted, new RegExp(marker));
    process.stdout.write(
      `${JSON.stringify({ runId: publicMetadata.runId, childPid: metadata.childPid, workerPid: metadata.workerPid, metadataPath: publicMetadata.metadataPath, stdoutPath: publicMetadata.stdoutPath, stderrPath: publicMetadata.stderrPath, status: stopResult.status, cleanupStopped: stopResult.cleanup.stopped, childAliveAfterCleanup: stopResult.childAliveAfterCleanup })}\n`,
    );
  } finally {
    if (!stopped && detached?.code === 0) {
      const publicMetadata = parseJson(detached.stdout, "cleanup metadata");
      const cleanup = await runPublic([
        "stop",
        "--metadata",
        publicMetadata.metadataPath,
        "--timeout-ms",
        "10000",
      ]);
      assert.equal(cleanup.code, 0, cleanup.stderr);
    }
    if (!stopped) {
      process.stderr.write(`Public E2E evidence retained at ${artifactRoot}\n`);
    }
  }
});

test("public sync relay and logs redact a named secret split across chunks", async () => {
  const marker = `public-split-secret-${crypto.randomBytes(16).toString("hex")}`;
  const evidenceParent = path.join(
    process.cwd(),
    ".tmp",
    "windows-runner-public-evidence",
  );
  fs.mkdirSync(evidenceParent, { recursive: true });
  const artifactRoot = fs.mkdtempSync(
    path.join(evidenceParent, "public-secret-redaction-"),
  );
  const runRoot = path.join(artifactRoot, "requests");
  const result = await runPublic(
    [
      "sync",
      "--cwd",
      process.cwd(),
      "--run-root",
      runRoot,
      "--pass-env",
      "RUNNER_SECRET_MARKER",
      "--timeout-ms",
      "10000",
      "--",
      "@node",
      toWindowsPath(FIXTURE_PATH),
      "split-secret",
    ],
    { RUNNER_SECRET_MARKER: marker },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(marker));
  assert.match(result.stdout, /stdout:<redacted>:done/);
  assert.match(result.stderr, /stderr:<redacted>:done/);
  const persisted = fs
    .readdirSync(runRoot, { recursive: true })
    .filter((entry) => typeof entry === "string")
    .map((entry) => path.join(runRoot, entry))
    .filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile())
    .map((entry) => fs.readFileSync(entry, "utf8"))
    .join("\n");
  assert.doesNotMatch(persisted, new RegExp(marker));
  assert.match(persisted, /<redacted>/);
});

test("public sync cleanup failure prints structured liveness detail and exits 125", async () => {
  const injectionName = "CODEX_HIDDEN_WINDOWS_TEST_INJECT_CLEANUP_FAILURE";
  const evidenceParent = path.join(
    process.cwd(),
    ".tmp",
    "windows-runner-public-evidence",
  );
  fs.mkdirSync(evidenceParent, { recursive: true });
  const artifactRoot = fs.mkdtempSync(
    path.join(evidenceParent, "public-sync-cleanup-failure-"),
  );
  const result = await runPublic(
    [
      "sync",
      "--cwd",
      process.cwd(),
      "--run-root",
      path.join(artifactRoot, "requests"),
      "--timeout-ms",
      "100",
      "--pass-env",
      injectionName,
      "--",
      "@node",
      toWindowsPath(FIXTURE_PATH),
      "hold",
    ],
    { [injectionName]: "inject-cleanup-failure" },
  );
  assert.equal(result.code, 125, result.stderr);
  const structured = parseTrailingJson(result.stdout, "sync cleanup failure");
  assert.equal(structured.status, "cleanup-failed");
  assert.equal(structured.cleanup.stopped, false);
  assert.equal(structured.cleanup.actualStoppedBeforeInjection, true);
  assert.equal(structured.childAliveAfterCleanup, false);
  assert.equal(structured.targetAliveAfterCleanup, false);
});

test("public detached readiness cleanup failure returns structured result and exact exit 125 before startup succeeds", async () => {
  const cleanupInjectionName =
    "CODEX_HIDDEN_WINDOWS_TEST_INJECT_CLEANUP_FAILURE";
  const evidenceParent = path.join(
    process.cwd(),
    ".tmp",
    "windows-runner-public-evidence",
  );
  fs.mkdirSync(evidenceParent, { recursive: true });
  const artifactRoot = fs.mkdtempSync(
    path.join(evidenceParent, "public-cleanup-failure-"),
  );
  const runRoot = path.join(artifactRoot, "requests");
  const readyPath = path.join(artifactRoot, "never-ready.json");
  let internalMetadata;
  const detached = await runPublic(
    [
      "detached",
      "--cwd",
      process.cwd(),
      "--run-root",
      runRoot,
      "--stdout",
      path.join(artifactRoot, "{runId}.stdout.log"),
      "--stderr",
      path.join(artifactRoot, "{runId}.stderr.log"),
      "--metadata",
      path.join(artifactRoot, "{runId}.metadata.json"),
      "--ready-file",
      readyPath,
      "--ready-timeout-ms",
      "250",
      "--ready-interval-ms",
      "25",
      "--pass-env",
      cleanupInjectionName,
      "--",
      "@node",
      toWindowsPath(FIXTURE_PATH),
      "hold",
    ],
    { [cleanupInjectionName]: "inject-cleanup-failure" },
  );
  assert.equal(detached.code, 125, detached.stderr);
  const result = parseJson(detached.stdout, "readiness cleanup failure");
  const metadataPath = path.join(artifactRoot, `${result.runId}.metadata.json`);
  internalMetadata = readJson(metadataPath);
  try {
    assert.equal(result.status, "cleanup-failed");
    assert.equal(result.cleanup.stopped, false);
    assert.equal(result.cleanup.actualStoppedBeforeInjection, true);
    assert.equal(result.childAliveAfterCleanup, false);
    assert.equal(result.targetAliveAfterCleanup, false);
    assert.equal(internalMetadata.status, "cleanup-failed");
    assert.match(result.error, /could not verify/i);
    process.stdout.write(
      `${JSON.stringify({ runId: result.runId, workerPid: internalMetadata.workerPid, supervisorPid: internalMetadata.childPid, targetPid: internalMetadata.targetPid, status: result.status, exitCode: detached.code, metadataPath })}\n`,
    );
  } finally {
    if (internalMetadata?.childPid) {
      await assertPidDeadThroughPublicRunner(
        artifactRoot,
        internalMetadata.childPid,
        "cleanup-failed supervisor",
      );
      await assertPidDeadThroughPublicRunner(
        artifactRoot,
        internalMetadata.targetPid,
        "job-contained target",
      );
    }
  }
});

test(
  "public stop accepts natural detached exit only with verified Job cleanup and dead descendants",
  { timeout: 45_000 },
  async () => {
    const evidenceParent = path.join(
      process.cwd(),
      ".tmp",
      "windows-runner-public-evidence",
    );
    fs.mkdirSync(evidenceParent, { recursive: true });
    const artifactRoot = fs.mkdtempSync(
      path.join(evidenceParent, "public-natural-exit-"),
    );
    const runRoot = path.join(artifactRoot, "requests");
    const pidPath = path.join(artifactRoot, "descendant-pids.json");

    const detached = await runPublic([
      "detached",
      "--cwd",
      process.cwd(),
      "--run-root",
      runRoot,
      "--stdout",
      path.join(artifactRoot, "{runId}.stdout.log"),
      "--stderr",
      path.join(artifactRoot, "{runId}.stderr.log"),
      "--metadata",
      path.join(artifactRoot, "{runId}.metadata.json"),
      "--",
      "@node",
      toWindowsPath(FIXTURE_PATH),
      "orphan-exit",
      toWindowsPath(pidPath),
      "750",
    ]);
    assert.equal(detached.code, 0, detached.stderr);
    const publicMetadata = parseJson(detached.stdout, "natural-exit metadata");
    const metadata = await waitForJson(
      publicMetadata.metadataPath,
      (value) => value.status === "exited",
      "natural exited metadata",
    );
    const resultPath = path.join(runRoot, publicMetadata.runId, "result.json");
    const finalized = await waitForJson(
      resultPath,
      (value) => value.status === "exited",
      "natural exited result",
    );
    const fixturePids = readJson(pidPath);

    assert.equal(finalized.cleanup.stopped, true);
    assert.equal(finalized.cleanup.mechanism, "job-close");
    assert.equal(finalized.childAliveAfterCleanup, false);
    assert.equal(finalized.targetAliveAfterCleanup, false);
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify({ ...finalized, targetPid: finalized.targetPid + 1 }, null, 2)}\n`,
      "utf8",
    );
    const mismatch = await runPublic([
      "stop",
      "--metadata",
      publicMetadata.metadataPath,
      "--timeout-ms",
      "10000",
    ]);
    assert.equal(mismatch.code, 125, mismatch.stderr);
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify(finalized, null, 2)}\n`,
      "utf8",
    );
    const stop = await runPublic([
      "stop",
      "--metadata",
      publicMetadata.metadataPath,
      "--timeout-ms",
      "10000",
    ]);
    assert.equal(stop.code, 0, stop.stderr);
    const stopResult = parseJson(stop.stdout, "natural-exit stop result");
    assert.equal(stopResult.status, "exited");
    assert.equal(stopResult.cleanup.stopped, true);
    assert.equal(stopResult.childAliveAfterCleanup, false);
    assert.equal(stopResult.targetAliveAfterCleanup, false);

    for (const [label, pid] of [
      ["worker", metadata.workerPid],
      ["supervisor", metadata.childPid],
      ["target", metadata.targetPid],
      ["held grandchild", fixturePids.grandchildPid],
    ]) {
      await assertPidDeadThroughPublicRunner(artifactRoot, pid, label);
    }
    process.stdout.write(
      `${JSON.stringify({ runId: publicMetadata.runId, workerPid: metadata.workerPid, supervisorPid: metadata.childPid, targetPid: metadata.targetPid, grandchildPid: fixturePids.grandchildPid, status: stopResult.status, cleanupStopped: stopResult.cleanup.stopped, childAliveAfterCleanup: stopResult.childAliveAfterCleanup, targetAliveAfterCleanup: stopResult.targetAliveAfterCleanup, metadataPath: publicMetadata.metadataPath })}\n`,
    );
  },
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test(
  "public stop retries a transient metadata replacement gap",
  { timeout: 30_000 },
  async () => {
    const evidenceParent = path.join(
      process.cwd(),
      ".tmp",
      "windows-runner-public-evidence",
    );
    fs.mkdirSync(evidenceParent, { recursive: true });
    const artifactRoot = fs.mkdtempSync(
      path.join(evidenceParent, "public-metadata-gap-"),
    );
    const readyPath = path.join(artifactRoot, "ready.json");
    const detached = await runPublic([
      "detached",
      "--cwd",
      process.cwd(),
      "--run-root",
      path.join(artifactRoot, "requests"),
      "--stdout",
      path.join(artifactRoot, "{runId}.stdout.log"),
      "--stderr",
      path.join(artifactRoot, "{runId}.stderr.log"),
      "--metadata",
      path.join(artifactRoot, "{runId}.metadata.json"),
      "--ready-file",
      readyPath,
      "--ready-timeout-ms",
      "5000",
      "--",
      "@node",
      toWindowsPath(FIXTURE_PATH),
      "hold",
      toWindowsPath(readyPath),
    ]);
    assert.equal(detached.code, 0, detached.stderr);
    const metadata = parseJson(detached.stdout, "metadata gap detached");
    const backupPath = `${metadata.metadataPath}.gap-backup`;
    fs.renameSync(metadata.metadataPath, backupPath);
    fs.writeFileSync(metadata.metadataPath, "{", "utf8");
    let stopped = false;
    const restore = setTimeout(() => {
      fs.rmSync(metadata.metadataPath, { force: true });
      fs.renameSync(backupPath, metadata.metadataPath);
    }, 200);
    try {
      const stop = await runPublic([
        "stop",
        "--metadata",
        metadata.metadataPath,
        "--timeout-ms",
        "10000",
      ]);
      assert.equal(stop.code, 0, stop.stderr);
      assert.equal(
        parseJson(stop.stdout, "metadata gap stop").status,
        "stopped",
      );
      stopped = true;
    } finally {
      clearTimeout(restore);
      if (fs.existsSync(backupPath)) {
        fs.rmSync(metadata.metadataPath, { force: true });
        fs.renameSync(backupPath, metadata.metadataPath);
      }
      if (!stopped && fs.existsSync(metadata.metadataPath)) {
        const cleanup = await runPublic([
          "stop",
          "--metadata",
          metadata.metadataPath,
          "--timeout-ms",
          "10000",
        ]);
        assert.equal(cleanup.code, 0, cleanup.stderr);
      }
    }
  },
);

test(
  "public stop waits for terminal metadata carrying the same finalization after result-first gap",
  { timeout: 30_000 },
  async () => {
    const injectionName = "CODEX_HIDDEN_WINDOWS_TEST_FINALIZATION_GAP_MS";
    const evidenceParent = path.join(
      process.cwd(),
      ".tmp",
      "windows-runner-public-evidence",
    );
    fs.mkdirSync(evidenceParent, { recursive: true });
    const artifactRoot = fs.mkdtempSync(
      path.join(evidenceParent, "public-finalization-gap-"),
    );
    const runRoot = path.join(artifactRoot, "requests");
    const readyPath = path.join(artifactRoot, "ready.json");
    const detached = await runPublic(
      [
        "detached",
        "--cwd",
        process.cwd(),
        "--run-root",
        runRoot,
        "--stdout",
        path.join(artifactRoot, "{runId}.stdout.log"),
        "--stderr",
        path.join(artifactRoot, "{runId}.stderr.log"),
        "--metadata",
        path.join(artifactRoot, "{runId}.metadata.json"),
        "--ready-file",
        readyPath,
        "--ready-timeout-ms",
        "5000",
        "--pass-env",
        injectionName,
        "--",
        "@node",
        toWindowsPath(FIXTURE_PATH),
        "hold",
        toWindowsPath(readyPath),
      ],
      { [injectionName]: "500" },
    );
    assert.equal(detached.code, 0, detached.stderr);
    const publicMetadata = parseJson(detached.stdout, "finalization gap");
    const resultPath = path.join(runRoot, publicMetadata.runId, "result.json");
    const stopPromise = runPublic([
      "stop",
      "--metadata",
      publicMetadata.metadataPath,
      "--timeout-ms",
      "10000",
      "--cleanup-grace-ms",
      "250",
    ]);
    const resultFirst = await waitForJson(
      resultPath,
      (value) => value.status === "stopped",
      "result-first stopped result",
    );
    assert.equal(readJson(publicMetadata.metadataPath).status, "running");
    const stop = await stopPromise;
    assert.equal(stop.code, 0, stop.stderr);
    const stopped = parseJson(stop.stdout, "finalization gap stop");
    const terminalMetadata = readJson(publicMetadata.metadataPath);
    assert.equal(stopped.finalizationId, resultFirst.finalizationId);
    assert.equal(terminalMetadata.finalizationId, resultFirst.finalizationId);
    assert.equal(terminalMetadata.status, "stopped");
  },
);

test(
  "public stop fails closed when terminal metadata write never follows the finalized result",
  { timeout: 30_000 },
  async () => {
    const injectionName =
      "CODEX_HIDDEN_WINDOWS_TEST_INJECT_TERMINAL_METADATA_FAILURE";
    const evidenceParent = path.join(
      process.cwd(),
      ".tmp",
      "windows-runner-public-evidence",
    );
    fs.mkdirSync(evidenceParent, { recursive: true });
    const artifactRoot = fs.mkdtempSync(
      path.join(evidenceParent, "public-terminal-metadata-failure-"),
    );
    const runRoot = path.join(artifactRoot, "requests");
    const readyPath = path.join(artifactRoot, "ready.json");
    const detached = await runPublic(
      [
        "detached",
        "--cwd",
        process.cwd(),
        "--run-root",
        runRoot,
        "--stdout",
        path.join(artifactRoot, "{runId}.stdout.log"),
        "--stderr",
        path.join(artifactRoot, "{runId}.stderr.log"),
        "--metadata",
        path.join(artifactRoot, "{runId}.metadata.json"),
        "--ready-file",
        readyPath,
        "--ready-timeout-ms",
        "5000",
        "--pass-env",
        injectionName,
        "--",
        "@node",
        toWindowsPath(FIXTURE_PATH),
        "hold",
        toWindowsPath(readyPath),
      ],
      { [injectionName]: "inject-terminal-metadata-failure" },
    );
    assert.equal(detached.code, 0, detached.stderr);
    const publicMetadata = parseJson(detached.stdout, "terminal failure");
    const stop = await runPublic([
      "stop",
      "--metadata",
      publicMetadata.metadataPath,
      "--timeout-ms",
      "10000",
      "--cleanup-grace-ms",
      "100",
    ]);
    assert.equal(stop.code, 125, stop.stderr);
    const result = parseJson(stop.stdout, "terminal metadata failure stop");
    assert.equal(result.status, "stopped");
    assert.match(
      result.terminalMetadataError,
      /terminal metadata write failure/i,
    );
    assert.equal(readJson(publicMetadata.metadataPath).status, "running");
    await assertPidDeadThroughPublicRunner(
      artifactRoot,
      result.pid,
      "terminal metadata failure supervisor",
    );
    await assertPidDeadThroughPublicRunner(
      artifactRoot,
      result.targetPid,
      "terminal metadata failure target",
    );
  },
);

test(
  "public sync and detached handshake cleanup failure return structured exit 125",
  { timeout: 45_000 },
  async () => {
    const injectionName = "CODEX_HIDDEN_WINDOWS_TEST_INJECT_HANDSHAKE_FAILURE";
    const evidenceParent = path.join(
      process.cwd(),
      ".tmp",
      "windows-runner-public-evidence",
    );
    fs.mkdirSync(evidenceParent, { recursive: true });
    for (const mode of ["sync", "detached"]) {
      const artifactRoot = fs.mkdtempSync(
        path.join(evidenceParent, `public-handshake-${mode}-`),
      );
      const args = [
        mode,
        "--cwd",
        process.cwd(),
        "--run-root",
        path.join(artifactRoot, "requests"),
      ];
      if (mode === "detached") {
        args.push(
          "--stdout",
          path.join(artifactRoot, "{runId}.stdout.log"),
          "--stderr",
          path.join(artifactRoot, "{runId}.stderr.log"),
          "--metadata",
          path.join(artifactRoot, "{runId}.metadata.json"),
        );
      }
      args.push(
        "--pass-env",
        injectionName,
        "--",
        "@node",
        toWindowsPath(FIXTURE_PATH),
        "hold",
      );
      const outcome = await runPublic(args, {
        [injectionName]: "inject-handshake-cleanup-failure",
      });
      assert.equal(outcome.code, 125, `${mode}: ${outcome.stderr}`);
      const result =
        mode === "sync"
          ? parseTrailingJson(outcome.stdout, `${mode} handshake`)
          : parseJson(outcome.stdout, `${mode} handshake`);
      assert.equal(result.status, "cleanup-failed", mode);
      assert.equal(result.cleanup.stopped, false, mode);
      assert.equal(result.cleanup.actualStoppedBeforeInjection, true, mode);
      assert.equal(result.childAliveAfterCleanup, false, mode);
      assert.equal(result.targetAliveAfterCleanup, false, mode);
      assert.match(result.error, /supervisor start handshake failure/i, mode);
      await assertPidDeadThroughPublicRunner(
        artifactRoot,
        result.pid,
        `${mode} handshake supervisor`,
      );
      await assertPidDeadThroughPublicRunner(
        artifactRoot,
        result.targetPid,
        `${mode} handshake target`,
      );
    }
  },
);

test(
  "public detached expands one ready-file placeholder for worker and child then stops exactly",
  { timeout: 30_000 },
  async () => {
    const evidenceParent = path.join(
      process.cwd(),
      ".tmp",
      "windows-runner-public-evidence",
    );
    fs.mkdirSync(evidenceParent, { recursive: true });
    const artifactRoot = fs.mkdtempSync(
      path.join(evidenceParent, "public-ready-placeholder-"),
    );
    const runRoot = path.join(artifactRoot, "requests");
    const readyTemplate = path.join(artifactRoot, "ready-{runId}.json");
    let publicMetadata;
    let internalMetadata;
    let stopped = false;
    try {
      const detached = await runPublic([
        "detached",
        "--cwd",
        process.cwd(),
        "--run-root",
        runRoot,
        "--stdout",
        path.join(artifactRoot, "{runId}.stdout.log"),
        "--stderr",
        path.join(artifactRoot, "{runId}.stderr.log"),
        "--metadata",
        path.join(artifactRoot, "{runId}.metadata.json"),
        "--ready-file",
        readyTemplate,
        "--ready-timeout-ms",
        "5000",
        "--ready-interval-ms",
        "25",
        "--",
        "@node",
        toWindowsPath(FIXTURE_PATH),
        "hold",
        toWindowsPath(readyTemplate),
      ]);
      assert.equal(detached.code, 0, detached.stderr);
      publicMetadata = parseJson(detached.stdout, "placeholder ready metadata");
      internalMetadata = readJson(publicMetadata.metadataPath);
      const expandedReadyPath = readyTemplate.replace(
        "{runId}",
        publicMetadata.runId,
      );
      assert.equal(fs.existsSync(expandedReadyPath), true);
      const ready = readJson(expandedReadyPath);
      assert.equal(ready.pid, internalMetadata.targetPid);
      assert.doesNotMatch(
        JSON.stringify({ internalMetadata, ready, expandedReadyPath }),
        /\{runId\}/,
      );

      const stop = await runPublic([
        "stop",
        "--metadata",
        publicMetadata.metadataPath,
        "--timeout-ms",
        "10000",
      ]);
      assert.equal(stop.code, 0, stop.stderr);
      const result = parseJson(stop.stdout, "placeholder ready stop");
      assert.equal(result.status, "stopped");
      assert.equal(result.cleanup.stopped, true);
      assert.equal(result.childAliveAfterCleanup, false);
      assert.equal(result.targetAliveAfterCleanup, false);
      stopped = true;
      await assertPidDeadThroughPublicRunner(
        artifactRoot,
        internalMetadata.childPid,
        "placeholder ready supervisor",
      );
      await assertPidDeadThroughPublicRunner(
        artifactRoot,
        internalMetadata.targetPid,
        "placeholder ready target",
      );
      process.stdout.write(
        `${JSON.stringify({ runId: publicMetadata.runId, workerPid: internalMetadata.workerPid, supervisorPid: internalMetadata.childPid, targetPid: internalMetadata.targetPid, readyPath: expandedReadyPath, status: result.status, cleanupStopped: result.cleanup.stopped })}\n`,
      );
    } finally {
      if (!stopped && publicMetadata?.metadataPath) {
        const cleanup = await runPublic([
          "stop",
          "--metadata",
          publicMetadata.metadataPath,
          "--timeout-ms",
          "10000",
        ]);
        assert.equal(cleanup.code, 0, cleanup.stderr);
      }
    }
  },
);

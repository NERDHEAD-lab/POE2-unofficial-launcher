"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { Readable } = require("node:stream");

const {
  assertSecretsAbsentFromArgv,
  buildRequest,
  createRunId,
  finalizedIdentityMatches,
  fromWindowsPath,
  parseArgs,
  resolvePublicPathOption,
  sanitizeMetadataForOutput,
  toWindowsPath,
  validateStopMetadata,
} = require("./run-hidden-windows.cjs");
const { createExactValueRedactor } = require("./run-hidden-windows-worker.cjs");

test("parses exact argv, cwd, non-secret literal env, and named secret pass-through", () => {
  const options = parseArgs([
    "sync",
    "--cwd",
    "/mnt/d/project with spaces",
    "--literal-env",
    "ONE=value with spaces",
    "--pass-env",
    "PATH",
    "--env-path",
    "PROFILE_PATH=.tmp/profile-{runId}",
    "--timeout-ms",
    "1234",
    "--",
    "@node",
    "script with spaces.cjs",
    "--literal=$x&y",
  ]);

  assert.deepEqual(options.argv, [
    "@node",
    "script with spaces.cjs",
    "--literal=$x&y",
  ]);
  assert.equal(options.cwd, "/mnt/d/project with spaces");
  assert.deepEqual(options.literalEnv, { ONE: "value with spaces" });
  assert.deepEqual(options.passEnv, ["PATH"]);
  assert.deepEqual(options.pathEnv, {
    PROFILE_PATH: ".tmp/profile-{runId}",
  });
  assert.equal(options.timeoutMs, 1234);
});

test("retires ambiguous literal env and forbids named secrets in argv", () => {
  assert.throws(
    () => parseArgs(["sync", "--env", "TOKEN=value", "--", "@node"]),
    /--env was retired/,
  );
  assert.throws(
    () =>
      assertSecretsAbsentFromArgv(
        ["@node", "app.cjs", "--token=secret-marker"],
        { TOKEN: "secret-marker" },
      ),
    /Secrets in argv are forbidden/,
  );
});

test("requires detached logs and rejects shell-shaped missing command boundaries", () => {
  assert.throws(
    () => parseArgs(["detached", "--", "@node", "app.cjs"]),
    /requires both --stdout and --stderr/,
  );
  assert.throws(() => parseArgs(["sync", "@node"]), /Unknown option/);
});

test("converts mounted WSL and absolute Windows paths without shell interpolation", () => {
  assert.equal(
    toWindowsPath("/mnt/d/project with spaces/file.js"),
    "D:\\project with spaces\\file.js",
  );
  assert.equal(
    fromWindowsPath("D:\\project with spaces\\file.js"),
    "/mnt/d/project with spaces/file.js",
  );
  assert.equal(
    resolvePublicPathOption("D:\\project with spaces\\file.js", "unused"),
    "/mnt/d/project with spaces/file.js",
  );
});

test("returns detached public filesystem paths in copy-paste-safe WSL form", () => {
  const metadata = sanitizeMetadataForOutput({
    schemaVersion: 1,
    runId: "run-1",
    status: "running",
    workerPid: 10,
    childPid: 11,
    targetPid: 12,
    command: { basename: "@node", argvSha256: "a".repeat(64) },
    cwd: "D:\\project",
    stdoutPath: "D:\\project\\out.log",
    stderrPath: "D:\\project\\err.log",
    metadataPath: "D:\\project\\metadata.json",
    startedAt: "now",
  });

  assert.equal(metadata.cwd, "/mnt/d/project");
  assert.equal(metadata.stdoutPath, "/mnt/d/project/out.log");
  assert.equal(metadata.stderrPath, "/mnt/d/project/err.log");
  assert.equal(metadata.metadataPath, "/mnt/d/project/metadata.json");
  assert.equal("argv" in metadata, false);
});

test("persists pass-through names but never their sensitive values", () => {
  const marker = "unit-secret-marker";
  const previous = process.env.RUNNER_UNIT_SECRET;
  process.env.RUNNER_UNIT_SECRET = marker;
  const temporaryRoot = fs.mkdtempSync(
    path.join(process.cwd(), ".tmp", "hidden-runner-request-"),
  );
  try {
    const options = parseArgs([
      "sync",
      "--run-root",
      temporaryRoot,
      "--pass-env",
      "RUNNER_UNIT_SECRET",
      "--",
      "@node",
      "fixture.cjs",
    ]);
    const run = buildRequest(options);
    const persisted = fs.readFileSync(run.requestPath, "utf8");
    assert.match(persisted, /RUNNER_UNIT_SECRET/);
    assert.doesNotMatch(persisted, new RegExp(marker));
    assert.deepEqual(run.request.passEnvNames, ["RUNNER_UNIT_SECRET"]);
    assert.equal("env" in run.request, false);
  } finally {
    if (previous === undefined) delete process.env.RUNNER_UNIT_SECRET;
    else process.env.RUNNER_UNIT_SECRET = previous;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("expands one run ID across ready-file, child argv, cwd, and environment", () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(process.cwd(), ".tmp", "hidden-runner-expansion-"),
  );
  try {
    const options = parseArgs([
      "detached",
      "--cwd",
      process.cwd(),
      "--run-root",
      temporaryRoot,
      "--stdout",
      path.join(temporaryRoot, "{runId}.stdout.log"),
      "--stderr",
      path.join(temporaryRoot, "{runId}.stderr.log"),
      "--ready-file",
      ".tmp/ready-{runId}.json",
      "--literal-env",
      "RUN_LABEL=label-{runId}",
      "--env-path",
      "RUN_PATH=.tmp/path-{runId}",
      "--",
      "@node",
      "fixture.cjs",
      "hold",
      ".tmp/ready-{runId}.json",
    ]);

    const run = buildRequest(options);
    const { runId } = run.request;
    assert.doesNotMatch(JSON.stringify(run.request), /\{runId\}/);
    assert.equal(
      fromWindowsPath(run.request.readiness.value),
      path.resolve(`.tmp/ready-${runId}.json`),
    );
    assert.equal(
      path.resolve(run.request.argv.at(-1)),
      fromWindowsPath(run.request.readiness.value),
    );
    assert.equal(run.request.literalEnv.RUN_LABEL, `label-${runId}`);
    assert.equal(
      fromWindowsPath(run.request.literalEnv.RUN_PATH),
      path.resolve(`.tmp/path-${runId}`),
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("redacts exact UTF-8 secret bytes across arbitrary stream chunks", async () => {
  const secret = "한글-secret-marker";
  const redactor = createExactValueRedactor({ SECRET: secret });
  const chunks = [];
  redactor.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  Readable.from([
    Buffer.from("before:한", "utf8"),
    Buffer.from("글-secret-", "utf8"),
    Buffer.from("marker:after", "utf8"),
  ]).pipe(redactor);
  await new Promise((resolve, reject) => {
    redactor.once("end", resolve);
    redactor.once("error", reject);
  });
  const output = Buffer.concat(chunks).toString("utf8");
  assert.equal(output, "before:<redacted>:after");
  assert.doesNotMatch(output, new RegExp(secret));
});

test("creates collision-safe run IDs", () => {
  const ids = new Set(Array.from({ length: 100 }, createRunId));
  assert.equal(ids.size, 100);
});

test("keeps the reusable runner and skill free of project-specific recipes", () => {
  const files = [
    "SKILL.md",
    "scripts/run-hidden-windows.cjs",
    "scripts/run-hidden-windows-bootstrap.js",
    "scripts/run-hidden-windows-worker.cjs",
    "scripts/run-hidden-windows-job-supervisor.ps1",
  ].map((relativePath) =>
    fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"),
  );
  for (const source of files) {
    assert.doesNotMatch(
      source,
      /project_poe2|POE2|Kakao|localhost:54321|\b9222\b|npm run/i,
    );
  }
});

test("keeps the GUI bootstrap and descendant launches statically hidden", () => {
  const publicRunner = fs.readFileSync(
    path.join(__dirname, "run-hidden-windows.cjs"),
    "utf8",
  );
  const bootstrap = fs.readFileSync(
    path.join(__dirname, "run-hidden-windows-bootstrap.js"),
    "utf8",
  );
  const worker = fs.readFileSync(
    path.join(__dirname, "run-hidden-windows-worker.cjs"),
    "utf8",
  );
  const supervisor = fs.readFileSync(
    path.join(__dirname, "run-hidden-windows-job-supervisor.ps1"),
    "utf8",
  );

  assert.match(publicRunner, /"\/\/B"/);
  assert.match(publicRunner, /"\/\/NoLogo"/);
  assert.match(publicRunner, /shell: false/);
  assert.match(publicRunner, /windowsHide: true/);
  assert.match(bootstrap, /shell\.Run\(command, 0, false\)/);
  assert.doesNotMatch(bootstrap, /,\s*\)/);
  assert.match(worker, /shell: false/);
  assert.match(worker, /windowsHide: true/);
  assert.match(supervisor, /CREATE_SUSPENDED/);
  assert.match(supervisor, /CREATE_NO_WINDOW/);
  assert.match(supervisor, /AssignProcessToJobObject/);
  assert.match(supervisor, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
  assert.ok(
    supervisor.indexOf("if (!AssignProcessToJobObject") <
      supervisor.indexOf("ResumeThread(process.hThread)"),
  );
});

test("visibility probe uses a high-frequency native ownership monitor", () => {
  const probe = fs.readFileSync(
    path.join(__dirname, "run-hidden-windows-visibility-probe.cjs"),
    "utf8",
  );

  assert.match(probe, /CreateToolhelp32Snapshot/);
  assert.match(probe, /Process32FirstW/);
  assert.match(probe, /EnumWindows/);
  assert.match(probe, /IsWindowVisible/);
  assert.match(probe, /GetForegroundWindow/);
  assert.match(probe, /GetGUIThreadInfo/);
  assert.doesNotMatch(probe, /Get-CimInstance|Get-Process/);
});

test("validates stop ownership metadata and rejects path/token mismatches", () => {
  const temporaryRoot = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(
    path.join(temporaryRoot, "hidden-runner-unit-"),
  );
  const metadataPath = path.join(directory, "metadata.json");
  const metadata = {
    schemaVersion: 1,
    runId: "20260813-1234-abcdef",
    ownerToken: "a".repeat(64),
    workerPid: 10,
    childPid: 11,
    targetPid: 12,
    metadataPath: toWindowsPath(metadataPath),
    controlPath: toWindowsPath(path.join(directory, "control.json")),
    resultPath: toWindowsPath(path.join(directory, "result.json")),
  };

  assert.equal(validateStopMetadata(metadataPath, metadata), metadata);
  assert.throws(
    () =>
      validateStopMetadata(metadataPath, { ...metadata, ownerToken: "bad" }),
    /ownership token/,
  );
  assert.throws(
    () =>
      validateStopMetadata(metadataPath, {
        ...metadata,
        metadataPath: "D:\\unrelated\\metadata.json",
      }),
    /does not match/,
  );
  fs.rmSync(directory, { recursive: true, force: true });
});

test("requires finalized stopped/exited identity and cleanup to match metadata", () => {
  const metadata = {
    runId: "run-identity",
    finalizationId: "f".repeat(32),
    workerPid: 10,
    childPid: 11,
    targetPid: 12,
  };
  const result = {
    runId: "run-identity",
    finalizationId: "f".repeat(32),
    status: "stopped",
    workerPid: 10,
    pid: 11,
    targetPid: 12,
    cleanup: { stopped: true },
    childAliveAfterCleanup: false,
    targetAliveAfterCleanup: false,
  };
  assert.equal(finalizedIdentityMatches(metadata, result, "stopped"), true);
  assert.equal(
    finalizedIdentityMatches(
      metadata,
      { ...result, finalizationId: "e".repeat(32) },
      "stopped",
    ),
    false,
  );
  assert.equal(
    finalizedIdentityMatches(
      metadata,
      { ...result, runId: "other" },
      "stopped",
    ),
    false,
  );
  assert.equal(
    finalizedIdentityMatches(metadata, { ...result, pid: 99 }, "stopped"),
    false,
  );
  assert.equal(
    finalizedIdentityMatches(metadata, { ...result, targetPid: 99 }, "stopped"),
    false,
  );
  assert.equal(
    finalizedIdentityMatches(
      metadata,
      { ...result, status: "exited" },
      "exited",
    ),
    true,
  );
  assert.equal(
    finalizedIdentityMatches(
      metadata,
      { ...result, status: "exited", workerPid: 99 },
      "exited",
    ),
    false,
  );
  assert.equal(
    finalizedIdentityMatches(
      metadata,
      { ...result, status: "exited", targetPid: 99 },
      "exited",
    ),
    false,
  );
});

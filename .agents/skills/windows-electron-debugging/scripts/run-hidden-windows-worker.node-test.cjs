"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const {
  cleanupProcessTree,
  executeDetachedRequest,
  executeSyncRequest,
  isPidAlive,
} = require("./run-hidden-windows-worker.cjs");

const WORKER_PATH = path.join(__dirname, "run-hidden-windows-worker.cjs");
const FIXTURE_PATH = path.join(__dirname, "run-hidden-windows-fixture.cjs");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tempDirectories = [];

const createRun = (mode, overrides = {}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hidden-runner-"));
  tempDirectories.push(directory);
  const runId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  return {
    schemaVersion: 1,
    mode,
    runId,
    ownerToken: crypto.randomBytes(32).toString("hex"),
    argv: ["@node", FIXTURE_PATH, "echo", "0"],
    cwd: directory,
    literalEnv: {},
    passEnvNames: [],
    passEnvValues: {},
    timeoutMs: mode === "sync" ? 5000 : 0,
    cleanupGraceMs: 750,
    stdoutPath: path.join(directory, "stdout.log"),
    stderrPath: path.join(directory, "stderr.log"),
    metadataPath: path.join(directory, "metadata.json"),
    controlPath: path.join(directory, "control.json"),
    resultPath: path.join(directory, "result.json"),
    ...overrides,
  };
};

const writeJson = (filePath, value) =>
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const readIfPresent = (filePath) =>
  fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "<missing>";

const diagnostics = (request) =>
  [
    `metadata=${request.metadataPath}: ${readIfPresent(request.metadataPath)}`,
    `result=${request.resultPath}: ${readIfPresent(request.resultPath)}`,
    `stdout=${request.stdoutPath}: ${readIfPresent(request.stdoutPath).slice(0, 1000)}`,
    `stderr=${request.stderrPath}: ${readIfPresent(request.stderrPath).slice(0, 1000)}`,
  ].join("\n");

const waitForStep = async (name, predicate, request, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(
    `${name} was not observed within ${timeoutMs}ms.\n${diagnostics(request)}`,
  );
};

const startDetachedOwner = (request, extraEnv = {}) => {
  const requestPath = path.join(
    path.dirname(request.resultPath),
    "request.json",
  );
  const persistedRequest = { ...request };
  delete persistedRequest.passEnvValues;
  writeJson(requestPath, persistedRequest);
  const worker = spawn(
    process.execPath,
    [WORKER_PATH, "--request", requestPath],
    {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, ...extraEnv },
    },
  );
  return { worker, requestPath };
};

const stopDetachedOwner = async (request, ownerToken = request.ownerToken) => {
  writeJson(request.controlPath, {
    schemaVersion: 1,
    action: "stop",
    runId: request.runId,
    ownerToken,
  });
  await waitForStep(
    "stop result",
    () => fs.existsSync(request.resultPath),
    request,
    8000,
  );
  return readJson(request.resultPath);
};

const cleanupOwnerAndAssert = async (workerPid, childPid) => {
  if (isPidAlive(workerPid)) await cleanupProcessTree(workerPid, 750);
  if (childPid && isPidAlive(childPid)) {
    await cleanupProcessTree(childPid, 750);
  }
  await waitForStep(
    "worker exit after cleanup",
    () => !isPidAlive(workerPid),
    {
      metadataPath: "",
      resultPath: "",
      stdoutPath: "",
      stderrPath: "",
    },
    5000,
  );
  assert.equal(isPidAlive(workerPid), false);
  if (childPid) assert.equal(isPidAlive(childPid), false);
};

test.after(() => {
  for (const directory of tempDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("sync preserves argv, cwd, non-secret literal env, stdout, stderr, and exit code", async () => {
  const request = createRun("sync", {
    argv: [
      "@node",
      FIXTURE_PATH,
      "echo",
      "7",
      "argument with spaces",
      "$literal&value",
    ],
    literalEnv: { RUNNER_EXPLICIT_ENV: "explicit value" },
  });

  const result = await executeSyncRequest(request);

  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 7);
  assert.equal(result.signal, null);
  const stdout = fs.readFileSync(request.stdoutPath, "utf8");
  const payload = JSON.parse(stdout.trim());
  assert.deepEqual(payload.argv, ["argument with spaces", "$literal&value"]);
  assert.equal(path.normalize(payload.cwd), path.normalize(request.cwd));
  assert.equal(payload.explicitEnv, "explicit value");
  assert.equal(fs.readFileSync(request.stderrPath, "utf8"), "fixture-stderr\n");
});

test("sync redacts named secret values split across stdout and stderr chunks", async () => {
  const secret = `split-secret-${crypto.randomBytes(16).toString("hex")}`;
  const request = createRun("sync", {
    argv: ["@node", FIXTURE_PATH, "split-secret"],
    passEnvValues: { RUNNER_SECRET_MARKER: secret },
  });

  const result = await executeSyncRequest(request);

  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 0);
  for (const filePath of [request.stdoutPath, request.stderrPath]) {
    const output = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(output, new RegExp(secret));
    assert.match(output, /<redacted>/);
  }
});

test(
  "sync natural target exit closes its Job and kills a held grandchild",
  { timeout: 15_000 },
  async () => {
    const request = createRun("sync");
    const pidPath = path.join(
      path.dirname(request.resultPath),
      "natural-sync-pids.json",
    );
    request.argv = ["@node", FIXTURE_PATH, "orphan-exit", pidPath];
    let pids;
    try {
      const result = await executeSyncRequest(request);
      pids = readJson(pidPath);

      assert.equal(result.status, "exited");
      assert.equal(result.exitCode, 0);
      assert.equal(isPidAlive(result.pid), false);
      assert.equal(isPidAlive(pids.parentPid), false);
      assert.equal(isPidAlive(pids.grandchildPid), false);
    } finally {
      if (pids?.grandchildPid && isPidAlive(pids.grandchildPid)) {
        await cleanupProcessTree(pids.grandchildPid, 750);
      }
      if (pids?.grandchildPid) {
        assert.equal(isPidAlive(pids.grandchildPid), false);
      }
    }
  },
);

test("sync timeout cleans the exact owned parent and grandchild tree", async () => {
  const request = createRun("sync");
  const pidPath = path.join(path.dirname(request.resultPath), "tree-pids.json");
  request.argv = ["@node", FIXTURE_PATH, "tree", pidPath];
  request.timeoutMs = 500;

  const result = await executeSyncRequest(request);
  const pids = readJson(pidPath);

  assert.equal(result.status, "timed-out");
  assert.equal(result.timedOut, true);
  assert.equal(result.cleanup.stopped, true);
  assert.equal(result.childAliveAfterCleanup, false);
  assert.equal(isPidAlive(pids.parentPid), false);
  assert.equal(isPidAlive(pids.grandchildPid), false);
});

test("sync timeout reports cleanup-failed when exact-tree death cannot be verified", async () => {
  const request = createRun("sync", {
    argv: ["@node", FIXTURE_PATH, "hold"],
    timeoutMs: 100,
  });
  let supervisorPid;
  const startedAt = Date.now();
  const result = await executeSyncRequest(request, {
    cleanupProcessTree: async (pid) => {
      supervisorPid = pid;
      return { stopped: false, forced: true };
    },
    isPidAlive: (pid) => pid !== supervisorPid,
    outputDoneNeverSettles: true,
  });
  try {
    assert.ok(Date.now() - startedAt < 3000);
    assert.equal(result.status, "cleanup-failed");
    assert.equal(result.cleanup.stopped, false);
    assert.equal(result.childAliveAfterCleanup, false);
    assert.equal(result.targetAliveAfterCleanup, true);
  } finally {
    await cleanupProcessTree(result.pid, 750);
    assert.equal(isPidAlive(result.pid), false);
    assert.equal(isPidAlive(result.targetPid), false);
  }
});

test("immediate target exit waits for supervisor handshake before finalizing", async () => {
  const request = createRun("detached", {
    argv: ["@node", FIXTURE_PATH, "immediate-exit", "0"],
  });

  const result = await executeDetachedRequest(request);

  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 0);
  assert.ok(Number.isInteger(result.pid));
  assert.ok(Number.isInteger(result.targetPid));
  assert.equal(result.cleanup.stopped, true);
  assert.equal(result.childAliveAfterCleanup, false);
  assert.equal(result.targetAliveAfterCleanup, false);
  const metadata = readJson(request.metadataPath);
  assert.equal(metadata.childPid, result.pid);
  assert.equal(metadata.targetPid, result.targetPid);
  assert.match(result.finalizationId, /^[a-f0-9]{32}$/);
  assert.equal(metadata.finalizationId, result.finalizationId);
});

test("detached finalization writes result before terminal metadata", async () => {
  const request = createRun("detached", {
    argv: ["@node", FIXTURE_PATH, "immediate-exit", "0"],
  });
  const writes = [];
  const result = await executeDetachedRequest(request, {
    cleanupProcessTree,
    writeJsonAtomic: (filePath, value) => {
      writes.push({ filePath, status: value.status });
      writeJson(filePath, value);
    },
  });

  assert.equal(result.status, "exited");
  const resultIndex = writes.findIndex(
    (write) =>
      write.filePath === request.resultPath && write.status === "exited",
  );
  const terminalMetadataIndex = writes.findIndex(
    (write) =>
      write.filePath === request.metadataPath && write.status === "exited",
  );
  assert.ok(resultIndex >= 0);
  assert.ok(terminalMetadataIndex > resultIndex);
  const persistedResult = readJson(request.resultPath);
  const terminalMetadata = readJson(request.metadataPath);
  assert.equal(terminalMetadata.finalizationId, persistedResult.finalizationId);
});

test("supervisor handshake cleanup failure preserves typed cleanup and liveness", async () => {
  for (const mode of ["sync", "detached"]) {
    const request = createRun(mode, {
      argv: ["@node", FIXTURE_PATH, "hold"],
    });
    const result = await (mode === "sync"
      ? executeSyncRequest(request, {
          injectSupervisorStartFailure: true,
          cleanupProcessTree: async (pid, graceMs) => {
            const actual = await cleanupProcessTree(pid, graceMs);
            return { ...actual, stopped: false, injectedForTest: true };
          },
        })
      : executeDetachedRequest(request, {
          injectSupervisorStartFailure: true,
          cleanupProcessTree: async (pid, graceMs) => {
            const actual = await cleanupProcessTree(pid, graceMs);
            return { ...actual, stopped: false, injectedForTest: true };
          },
        }));

    assert.equal(result.status, "cleanup-failed", mode);
    assert.equal(result.cleanup.stopped, false, mode);
    assert.equal(result.cleanup.injectedForTest, true, mode);
    assert.equal(result.childAliveAfterCleanup, false, mode);
    assert.equal(result.targetAliveAfterCleanup, false, mode);
    assert.match(result.error, /supervisor start handshake failure/i, mode);
    assert.equal(isPidAlive(result.pid), false, mode);
    assert.equal(isPidAlive(result.targetPid), false, mode);
  }
});

test("worker consumes named secret, deletes request, redacts metadata, and stops exactly", async () => {
  const secret = `secret-${crypto.randomBytes(12).toString("hex")}`;
  const request = createRun("detached", {
    passEnvNames: ["RUNNER_SECRET_MARKER"],
  });
  const readyPath = path.join(path.dirname(request.resultPath), "ready.json");
  request.argv = ["@node", FIXTURE_PATH, "secret-check", readyPath];
  request.readiness = {
    kind: "file",
    value: readyPath,
    timeoutMs: 3000,
    intervalMs: 25,
  };
  const { worker, requestPath } = startDetachedOwner(request, {
    RUNNER_SECRET_MARKER: secret,
  });
  let childPid;
  try {
    await waitForStep(
      "metadata creation",
      () => fs.existsSync(request.metadataPath),
      request,
      5000,
    );
    await waitForStep(
      "readiness artifact",
      () => fs.existsSync(readyPath),
      request,
      5000,
    );
    await waitForStep(
      "running metadata",
      () => readJson(request.metadataPath).status === "running",
      request,
      8000,
    );
    const metadata = readJson(request.metadataPath);
    childPid = metadata.childPid;
    assert.equal(metadata.workerPid, worker.pid);
    assert.equal(metadata.command.basename, "@node");
    assert.match(metadata.command.argvSha256, /^[a-f0-9]{64}$/);
    assert.equal("argv" in metadata, false);
    assert.equal(fs.existsSync(requestPath), false);
    assert.equal(readJson(readyPath).secretPresent, true);

    const result = await stopDetachedOwner(request);
    assert.equal(result.status, "stopped");
    assert.equal(result.cleanup.stopped, true);
    assert.equal(result.childAliveAfterCleanup, false);
    await waitForStep(
      "worker natural exit",
      () => !isPidAlive(worker.pid),
      request,
      5000,
    );

    const persisted = [
      requestPath,
      request.metadataPath,
      request.resultPath,
      request.stdoutPath,
      request.stderrPath,
    ]
      .map(readIfPresent)
      .join("\n");
    assert.doesNotMatch(persisted, new RegExp(secret));
  } finally {
    await cleanupOwnerAndAssert(worker.pid, childPid);
  }
});

test("detached rejects wrong ownership then stops its exact tree", async () => {
  const request = createRun("detached");
  const readyPath = path.join(path.dirname(request.resultPath), "ready.json");
  request.argv = ["@node", FIXTURE_PATH, "hold", readyPath];
  request.readiness = {
    kind: "file",
    value: readyPath,
    timeoutMs: 3000,
    intervalMs: 25,
  };
  const { worker } = startDetachedOwner(request);
  let childPid;
  try {
    await waitForStep(
      "metadata creation",
      () => fs.existsSync(request.metadataPath),
      request,
      5000,
    );
    await waitForStep(
      "readiness artifact",
      () => fs.existsSync(readyPath),
      request,
      5000,
    );
    await waitForStep(
      "running metadata",
      () => readJson(request.metadataPath).status === "running",
      request,
      8000,
    );
    const metadata = readJson(request.metadataPath);
    childPid = metadata.childPid;

    writeJson(request.controlPath, {
      schemaVersion: 1,
      action: "stop",
      runId: request.runId,
      ownerToken: "0".repeat(64),
    });
    await waitForStep(
      "ownership mismatch metadata",
      () =>
        readJson(request.metadataPath).lastControlError ===
        "ownership-mismatch",
      request,
      5000,
    );
    assert.equal(isPidAlive(childPid), true);

    const result = await stopDetachedOwner(request);
    assert.equal(result.status, "stopped");
    assert.equal(result.cleanup.stopped, true);
    assert.equal(result.childAliveAfterCleanup, false);
  } finally {
    await cleanupOwnerAndAssert(worker.pid, childPid);
  }
});

test("detached cleanup failure is fail-closed for readiness, timeout, and stop", async () => {
  const cases = ["readiness", "timeout", "stop"];
  for (const scenario of cases) {
    const request = createRun("detached", {
      argv: ["@node", FIXTURE_PATH, "hold"],
      timeoutMs: scenario === "timeout" ? 100 : 0,
    });
    if (scenario === "readiness") {
      request.readiness = {
        kind: "file",
        value: path.join(path.dirname(request.resultPath), "never-ready"),
        timeoutMs: 100,
        intervalMs: 25,
      };
    }
    const execution = executeDetachedRequest(request, {
      cleanupProcessTree: async () => ({ stopped: false, forced: true }),
    });
    try {
      await waitForStep(
        `${scenario} metadata creation`,
        () => fs.existsSync(request.metadataPath),
        request,
        3000,
      );
      const childPid = readJson(request.metadataPath).childPid;
      if (scenario === "stop") {
        writeJson(request.controlPath, {
          schemaVersion: 1,
          action: "stop",
          runId: request.runId,
          ownerToken: request.ownerToken,
        });
      }
      const result = await execution;
      assert.equal(result.status, "cleanup-failed", scenario);
      assert.equal(result.cleanup.stopped, false, scenario);
      assert.equal(result.childAliveAfterCleanup, true, scenario);
      assert.equal(readJson(request.metadataPath).status, "cleanup-failed");
      await cleanupProcessTree(childPid, 750);
      assert.equal(isPidAlive(childPid), false);
    } finally {
      if (fs.existsSync(request.metadataPath)) {
        const childPid = readJson(request.metadataPath).childPid;
        if (isPidAlive(childPid)) await cleanupProcessTree(childPid, 750);
        assert.equal(isPidAlive(childPid), false);
      }
    }
  }
});

test("initial detached metadata write failure cleans the spawned supervisor and target", async () => {
  const request = createRun("detached", {
    argv: ["@node", FIXTURE_PATH, "hold"],
  });
  let injected = false;
  const result = await executeDetachedRequest(request, {
    cleanupProcessTree,
    writeJsonAtomic: (filePath, value) => {
      if (!injected && filePath === request.metadataPath) {
        injected = true;
        throw new Error("injected initial metadata failure");
      }
      writeJson(filePath, value);
    },
  });

  assert.equal(injected, true);
  assert.equal(result.status, "metadata-error");
  assert.equal(result.cleanup.stopped, true);
  assert.equal(result.childAliveAfterCleanup, false);
  assert.equal(isPidAlive(result.pid), false);
  assert.equal(isPidAlive(result.targetPid), false);
  assert.equal(readJson(request.resultPath).status, "metadata-error");
});

test(
  "detached natural target exit closes its Job and kills a held grandchild",
  { timeout: 15_000 },
  async () => {
    const request = createRun("detached");
    const pidPath = path.join(
      path.dirname(request.resultPath),
      "natural-detached-pids.json",
    );
    request.argv = ["@node", FIXTURE_PATH, "orphan-exit", pidPath];
    let pids;
    try {
      const result = await executeDetachedRequest(request);
      pids = readJson(pidPath);

      assert.equal(result.status, "exited");
      assert.equal(result.exitCode, 0);
      assert.equal(isPidAlive(result.pid), false);
      assert.equal(isPidAlive(pids.parentPid), false);
      assert.equal(isPidAlive(pids.grandchildPid), false);
    } finally {
      if (pids?.grandchildPid && isPidAlive(pids.grandchildPid)) {
        await cleanupProcessTree(pids.grandchildPid, 750);
      }
      if (pids?.grandchildPid) {
        assert.equal(isPidAlive(pids.grandchildPid), false);
      }
    }
  },
);

test(
  "detached stop closes its Job and kills target plus held grandchild",
  { timeout: 15_000 },
  async () => {
    const request = createRun("detached");
    const pidPath = path.join(
      path.dirname(request.resultPath),
      "stopped-detached-pids.json",
    );
    request.argv = ["@node", FIXTURE_PATH, "tree", pidPath];
    request.readiness = {
      kind: "file",
      value: pidPath,
      timeoutMs: 3000,
      intervalMs: 25,
    };
    let pids;
    try {
      const execution = executeDetachedRequest(request);
      await waitForStep(
        "detached tree readiness",
        () => fs.existsSync(pidPath),
        request,
        5000,
      );
      pids = readJson(pidPath);
      writeJson(request.controlPath, {
        schemaVersion: 1,
        action: "stop",
        runId: request.runId,
        ownerToken: request.ownerToken,
      });

      const result = await execution;
      assert.equal(result.status, "stopped");
      assert.equal(result.cleanup.stopped, true);
      assert.equal(result.childAliveAfterCleanup, false);
      assert.equal(isPidAlive(result.pid), false);
      assert.equal(isPidAlive(pids.parentPid), false);
      assert.equal(isPidAlive(pids.grandchildPid), false);
    } finally {
      if (pids?.grandchildPid && isPidAlive(pids.grandchildPid)) {
        await cleanupProcessTree(pids.grandchildPid, 750);
      }
      if (pids?.grandchildPid) {
        assert.equal(isPidAlive(pids.grandchildPid), false);
      }
    }
  },
);

test("detached natural exit fully flushes large logs before result becomes visible", async () => {
  const byteCount = 512 * 1024;
  const request = createRun("detached", {
    argv: ["@node", FIXTURE_PATH, "large-exit", String(byteCount)],
  });

  const result = await executeDetachedRequest(request);

  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 0);
  assert.equal(fs.readFileSync(request.stdoutPath).length, byteCount);
  assert.equal(fs.readFileSync(request.stderrPath).length, byteCount);
  assert.equal(readJson(request.resultPath).finishedAt, result.finishedAt);
  assert.equal(readJson(request.metadataPath).status, "exited");
  assert.equal(isPidAlive(result.pid), false);
});

test("concurrent detached runs keep metadata, logs, and ownership isolated", async () => {
  const requests = [createRun("detached"), createRun("detached")];
  const owners = requests.map((request) => {
    request.argv = ["@node", FIXTURE_PATH, "hold"];
    return startDetachedOwner(request);
  });
  const childPids = [];
  try {
    for (const request of requests) {
      await waitForStep(
        "concurrent metadata",
        () => fs.existsSync(request.metadataPath),
        request,
        5000,
      );
      childPids.push(readJson(request.metadataPath).childPid);
    }
    assert.notEqual(requests[0].runId, requests[1].runId);
    assert.notEqual(childPids[0], childPids[1]);
    assert.notEqual(requests[0].stdoutPath, requests[1].stdoutPath);

    const firstResult = await stopDetachedOwner(requests[0]);
    assert.equal(firstResult.status, "stopped");
    assert.equal(isPidAlive(childPids[1]), true);
    const secondResult = await stopDetachedOwner(requests[1]);
    assert.equal(secondResult.status, "stopped");
  } finally {
    for (let index = 0; index < owners.length; index += 1) {
      await cleanupOwnerAndAssert(owners[index].worker.pid, childPids[index]);
    }
  }
});

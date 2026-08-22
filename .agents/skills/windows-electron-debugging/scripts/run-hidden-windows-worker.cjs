#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Transform } = require("node:stream");
const { finished } = require("node:stream/promises");

const SCHEMA_VERSION = 1;
const CONTROL_POLL_MS = 100;
const SUPERVISOR_START_TIMEOUT_MS = 10_000;
const OUTPUT_DRAIN_TIMEOUT_MS = 500;
const REDACTION_REPLACEMENT = Buffer.from("<redacted>", "utf8");
const JOB_SUPERVISOR_PATH = path.join(
  __dirname,
  "run-hidden-windows-job-supervisor.ps1",
);
const TEST_CLEANUP_FAILURE_ENV =
  "CODEX_HIDDEN_WINDOWS_TEST_INJECT_CLEANUP_FAILURE";
const TEST_HANDSHAKE_FAILURE_ENV =
  "CODEX_HIDDEN_WINDOWS_TEST_INJECT_HANDSHAKE_FAILURE";
const TEST_FINALIZATION_GAP_ENV =
  "CODEX_HIDDEN_WINDOWS_TEST_FINALIZATION_GAP_MS";
const TEST_TERMINAL_METADATA_FAILURE_ENV =
  "CODEX_HIDDEN_WINDOWS_TEST_INJECT_TERMINAL_METADATA_FAILURE";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const settleWithin = async (promise, timeoutMs) =>
  await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    sleep(timeoutMs).then(() => false),
  ]);

const redactExactValues = (buffer, secretBuffers, final) => {
  if (secretBuffers.length === 0) return { output: buffer, remainder: null };
  const longest = secretBuffers[0].length;
  const cutoff = final
    ? buffer.length
    : Math.max(0, buffer.length - longest + 1);
  const output = [];
  let cursor = 0;

  while (cursor < cutoff) {
    let matchIndex = -1;
    let matchLength = 0;
    for (const secret of secretBuffers) {
      const candidate = buffer.indexOf(secret, cursor);
      if (
        candidate >= 0 &&
        (matchIndex < 0 ||
          candidate < matchIndex ||
          (candidate === matchIndex && secret.length > matchLength))
      ) {
        matchIndex = candidate;
        matchLength = secret.length;
      }
    }
    if (matchIndex < 0 || matchIndex >= cutoff) {
      output.push(buffer.subarray(cursor, cutoff));
      cursor = cutoff;
      break;
    }
    if (matchIndex > cursor) output.push(buffer.subarray(cursor, matchIndex));
    output.push(REDACTION_REPLACEMENT);
    cursor = matchIndex + matchLength;
  }

  return {
    output: output.length === 1 ? output[0] : Buffer.concat(output),
    remainder: cursor < buffer.length ? buffer.subarray(cursor) : null,
  };
};

const createExactValueRedactor = (values) => {
  const secretBuffers = [
    ...new Map(
      Object.values(values || {})
        .filter((value) => typeof value === "string" && value.length > 0)
        .map((value) => {
          const buffer = Buffer.from(value, "utf8");
          return [buffer.toString("hex"), buffer];
        }),
    ).values(),
  ].sort((left, right) => right.length - left.length);
  let pending = Buffer.alloc(0);

  return new Transform({
    transform(chunk, _encoding, callback) {
      pending = Buffer.concat([pending, Buffer.from(chunk)]);
      const redacted = redactExactValues(pending, secretBuffers, false);
      pending = redacted.remainder || Buffer.alloc(0);
      callback(null, redacted.output);
    },
    flush(callback) {
      const redacted = redactExactValues(pending, secretBuffers, true);
      pending = Buffer.alloc(0);
      callback(null, redacted.output);
    },
  });
};

const writeJsonAtomic = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\r\n`,
    "utf8",
  );
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error?.code)) throw error;
    fs.rmSync(filePath, { force: true, maxRetries: 10, retryDelay: 10 });
    fs.renameSync(temporaryPath, filePath);
  }
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const getEnvironmentValue = (name) => {
  const key = Object.keys(process.env).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? process.env[key] : undefined;
};

const consumePassEnvironment = (names) => {
  const values = {};
  for (const name of names || []) {
    const key = Object.keys(process.env).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    );
    if (!key || process.env[key] === undefined) {
      throw new Error(`Named pass-through environment is unavailable: ${name}`);
    }
    values[name] = process.env[key];
    delete process.env[key];
  }
  return values;
};

const buildChildEnvironment = (literalEnv, passEnvValues, runId) => {
  const baseNames = [
    "SystemRoot",
    "WINDIR",
    "PATH",
    "PATHEXT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramW6432",
    "CommonProgramFiles",
    "CommonProgramFiles(x86)",
    "COMSPEC",
  ];
  const env = {};
  for (const name of baseNames) {
    const value = getEnvironmentValue(name);
    if (value !== undefined) env[name] = value;
  }
  Object.assign(env, literalEnv, passEnvValues);
  env.CODEX_HIDDEN_WINDOWS_RUN_ID = runId;
  env.CODEX_HIDDEN_WINDOWS_WORKER_PID = String(process.pid);
  return env;
};

const resolveCommand = (command) => {
  if (command === "@node") return process.execPath;
  if (command === "@pwsh") {
    const candidates = [
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found)
      throw new Error("PowerShell executable was not found for @pwsh.");
    return found;
  }
  return command;
};

const assertRequest = (request) => {
  if (request.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("Unsupported hidden Windows runner request schema.");
  }
  if (!["sync", "detached"].includes(request.mode)) {
    throw new Error("Runner request mode is invalid.");
  }
  if (!Array.isArray(request.argv) || request.argv.length === 0) {
    throw new Error("Runner request argv is empty.");
  }
  if (
    !request.literalEnv ||
    typeof request.literalEnv !== "object" ||
    Array.isArray(request.literalEnv)
  ) {
    throw new Error("Runner request literal environment is invalid.");
  }
  if (!Array.isArray(request.passEnvNames)) {
    throw new Error("Runner request pass-through names are invalid.");
  }
  if (!request.cwd || !path.win32.isAbsolute(request.cwd)) {
    throw new Error("Runner request cwd must be an absolute Windows path.");
  }
  for (const field of [
    "stdoutPath",
    "stderrPath",
    "resultPath",
    "metadataPath",
    "controlPath",
  ]) {
    if (!request[field] || !path.win32.isAbsolute(request[field])) {
      throw new Error(
        `Runner request ${field} must be an absolute Windows path.`,
      );
    }
  }
  if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 0) {
    throw new Error("Runner request timeout is invalid.");
  }
  if (
    !Number.isSafeInteger(request.cleanupGraceMs) ||
    request.cleanupGraceMs < 1
  ) {
    throw new Error("Runner request cleanup grace is invalid.");
  }
};

const openExclusiveLog = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, "wx");
  return fs.createWriteStream(filePath, {
    fd: descriptor,
    autoClose: true,
    encoding: "utf8",
  });
};

const waitForStreamClose = (stream) =>
  new Promise((resolve) => {
    if (stream.closed) resolve();
    else stream.once("close", resolve);
  });

const closeLogs = async (stdoutLog, stderrLog) => {
  stdoutLog.end();
  stderrLog.end();
  await Promise.all([
    waitForStreamClose(stdoutLog),
    waitForStreamClose(stderrLog),
  ]);
};

const finalizeCapturedOutput = async (
  child,
  stdoutLog,
  stderrLog,
  { forceAfterMs = OUTPUT_DRAIN_TIMEOUT_MS } = {},
) => {
  const drained = await settleWithin(child.outputDone, forceAfterMs);
  if (!drained) child.abortOutputCapture();
  await settleWithin(child.outputDone, forceAfterMs);
  stdoutLog.end();
  stderrLog.end();
  const logsClosed = await settleWithin(
    Promise.all([waitForStreamClose(stdoutLog), waitForStreamClose(stderrLog)]),
    forceAfterMs,
  );
  if (!logsClosed) {
    stdoutLog.destroy();
    stderrLog.destroy();
    await settleWithin(
      Promise.all([
        waitForStreamClose(stdoutLog),
        waitForStreamClose(stderrLog),
      ]),
      forceAfterMs,
    );
  }
  return { drained, logsClosed };
};

const isPidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
};

const runTaskkill = (pid, force) =>
  new Promise((resolve) => {
    const args = ["/PID", String(pid), "/T"];
    if (force) args.push("/F");
    const taskkill = spawn("C:\\Windows\\System32\\taskkill.exe", args, {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    taskkill.once("error", (error) =>
      resolve({ ok: false, error: error.message }),
    );
    taskkill.once("close", (code, signal) =>
      resolve({ ok: code === 0 || !isPidAlive(pid), code, signal }),
    );
  });

const cleanupProcessTree = async (pid, graceMs) => {
  if (!isPidAlive(pid)) {
    return { gracefulAttempted: false, forced: false, stopped: true };
  }

  const graceful = await runTaskkill(pid, false);
  const deadline = Date.now() + graceMs;
  while (isPidAlive(pid) && Date.now() < deadline) await sleep(50);
  if (!isPidAlive(pid)) {
    return {
      gracefulAttempted: true,
      graceful,
      forced: false,
      stopped: true,
    };
  }

  const forced = await runTaskkill(pid, true);
  const forceDeadline = Date.now() + graceMs;
  while (isPidAlive(pid) && Date.now() < forceDeadline) await sleep(50);
  return {
    gracefulAttempted: true,
    graceful,
    forced: true,
    forceResult: forced,
    stopped: !isPidAlive(pid),
  };
};

const summarizeCommand = (argv) => ({
  basename: path.win32.basename(argv[0]),
  argvSha256: crypto
    .createHash("sha256")
    .update(JSON.stringify(argv))
    .digest("hex"),
});

const cleanupOutcome = (
  baseStatus,
  cleanup,
  childPid,
  targetPid,
  isAlive = isPidAlive,
) => {
  const childAliveAfterCleanup = childPid ? isAlive(childPid) : false;
  const targetAliveAfterCleanup = targetPid ? isAlive(targetPid) : false;
  const succeeded =
    cleanup?.stopped === true &&
    !childAliveAfterCleanup &&
    !targetAliveAfterCleanup;
  return {
    status: succeeded ? baseStatus : "cleanup-failed",
    cleanup,
    childAliveAfterCleanup,
    targetAliveAfterCleanup,
    ...(succeeded
      ? {}
      : {
          error: `Owned process-tree cleanup could not verify supervisor ${childPid} and target ${targetPid ?? "unknown"} stopped.`,
        }),
  };
};

class SupervisorStartError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SupervisorStartError";
    this.code = "SUPERVISOR_START_FAILED";
    Object.assign(this, details);
  }
}

const createResult = (request, values) => ({
  schemaVersion: SCHEMA_VERSION,
  runId: request.runId,
  status: values.status,
  exitCode: values.exitCode ?? null,
  signal: values.signal ?? null,
  timedOut: Boolean(values.timedOut),
  pid: values.pid ?? null,
  targetPid: values.targetPid ?? null,
  workerPid: process.pid,
  cleanup: values.cleanup,
  childAliveAfterCleanup: values.childAliveAfterCleanup,
  targetAliveAfterCleanup: values.targetAliveAfterCleanup,
  finalizationId: values.finalizationId,
  terminalMetadataError: values.terminalMetadataError,
  error: values.error,
  finishedAt: new Date().toISOString(),
});

const checkReadiness = async (readiness) => {
  if (readiness.kind === "file") return fs.existsSync(readiness.value);
  if (readiness.kind === "url") {
    try {
      const response = await fetch(readiness.value, {
        signal: AbortSignal.timeout(Math.min(readiness.intervalMs, 2000)),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  throw new Error(`Unsupported readiness probe: ${readiness.kind}`);
};

const waitForReadiness = async (request, getTerminalState) => {
  if (!request.readiness) return;
  const { timeoutMs, intervalMs } = request.readiness;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const terminal = getTerminalState();
    if (terminal) {
      throw new Error(
        `Child exited before readiness (exitCode=${terminal.exitCode ?? "none"}, signal=${terminal.signal ?? "none"}).`,
      );
    }
    if (await checkReadiness(request.readiness)) return;
    await sleep(intervalMs);
  }
  throw new Error(`Readiness probe timed out after ${timeoutMs}ms.`);
};

const naturalExitOutcome = (child, exitCode, signal) => {
  const childAlive = isPidAlive(child.pid);
  const targetAlive = isPidAlive(child.targetPid);
  return {
    exitCode,
    signal,
    ...cleanupOutcome(
      "exited",
      {
        gracefulAttempted: false,
        forced: false,
        mechanism: "job-close",
        stopped: !childAlive && !targetAlive,
      },
      child.pid,
      child.targetPid,
    ),
  };
};

const waitForSupervisorStart = async (child, statusPath) => {
  const deadline = Date.now() + SUPERVISOR_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.spawnError) throw child.spawnError;
    if (fs.existsSync(statusPath)) {
      const status = readJson(statusPath);
      if (
        status.schemaVersion === SCHEMA_VERSION &&
        status.state === "running" &&
        Number.isInteger(status.targetPid) &&
        status.targetPid > 0
      ) {
        return status.targetPid;
      }
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Job supervisor exited before target assignment completed (exitCode=${child.exitCode ?? "none"}, signal=${child.signalCode ?? "none"}).`,
      );
    }
    await sleep(25);
  }
  throw new Error(
    `Job supervisor did not confirm suspended target assignment within ${SUPERVISOR_START_TIMEOUT_MS}ms.`,
  );
};

const spawnOwnedChild = async (
  request,
  stdoutLog,
  stderrLog,
  dependencies = { cleanupProcessTree },
) => {
  const cleanupOwnedTree =
    dependencies.cleanupProcessTree || cleanupProcessTree;
  const [command, ...args] = request.argv;
  const runDirectory = path.dirname(request.resultPath);
  const supervisorRequestPath = path.join(
    runDirectory,
    `supervisor-${process.pid}.request.json`,
  );
  const supervisorStatusPath = path.join(
    runDirectory,
    `supervisor-${process.pid}.status.json`,
  );
  writeJsonAtomic(supervisorRequestPath, {
    schemaVersion: SCHEMA_VERSION,
    ownerPid: process.pid,
    command: resolveCommand(command),
    arguments: args,
    cwd: request.cwd,
    statusPath: supervisorStatusPath,
  });

  const child = spawn(
    resolveCommand("@pwsh"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      JOB_SUPERVISOR_PATH,
      "-Request",
      supervisorRequestPath,
    ],
    {
      cwd: request.cwd,
      env: buildChildEnvironment(
        request.literalEnv || {},
        request.passEnvValues || {},
        request.runId,
      ),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.spawnError = null;
  child.terminalState = null;
  child.pendingTerminal = null;
  child.once("error", (error) => {
    child.spawnError = error;
    child.pendingTerminal = {
      status: "spawn-error",
      error: error.message,
    };
  });
  child.once("close", (exitCode, signal) => {
    child.pendingTerminal = { status: "exited", exitCode, signal };
    if (child.targetPid) {
      child.terminalState = naturalExitOutcome(child, exitCode, signal);
    }
  });
  const stdoutRedactor = createExactValueRedactor(request.passEnvValues);
  const stderrRedactor = createExactValueRedactor(request.passEnvValues);
  child.stdout.pipe(stdoutRedactor).pipe(stdoutLog, { end: false });
  child.stderr.pipe(stderrRedactor).pipe(stderrLog, { end: false });
  const capturedOutputDone = Promise.all([
    finished(stdoutRedactor),
    finished(stderrRedactor),
  ]);
  void capturedOutputDone.catch(() => {});
  child.outputDone = capturedOutputDone;
  if (dependencies.outputDoneNeverSettles === true) {
    child.outputDone = new Promise(() => {});
  }
  child.abortOutputCapture = () => {
    child.stdout.unpipe(stdoutRedactor);
    child.stderr.unpipe(stderrRedactor);
    child.stdout.destroy();
    child.stderr.destroy();
    stdoutRedactor.destroy();
    stderrRedactor.destroy();
  };

  try {
    child.targetPid = await waitForSupervisorStart(child, supervisorStatusPath);
    if (dependencies.injectSupervisorStartFailure === true) {
      throw new Error("Injected supervisor start handshake failure.");
    }
    if (child.pendingTerminal) {
      child.terminalState =
        child.pendingTerminal.status === "spawn-error"
          ? child.pendingTerminal
          : naturalExitOutcome(
              child,
              child.pendingTerminal.exitCode,
              child.pendingTerminal.signal,
            );
    }
    return child;
  } catch (error) {
    const hasPid = Number.isInteger(child.pid) && child.pid > 0;
    const isAlive = dependencies.isPidAlive || isPidAlive;
    const cleanup = hasPid
      ? await cleanupOwnedTree(child.pid, request.cleanupGraceMs)
      : { stopped: true, gracefulAttempted: false, forced: false };
    await finalizeCapturedOutput(child, stdoutLog, stderrLog);
    const outcome = cleanupOutcome(
      "spawn-error",
      cleanup,
      hasPid ? child.pid : null,
      child.targetPid,
      isAlive,
    );
    throw new SupervisorStartError(
      `${error.message}${outcome.error ? ` ${outcome.error}` : ""}`,
      {
        ...outcome,
        pid: hasPid ? child.pid : null,
        targetPid: child.targetPid ?? null,
      },
    );
  } finally {
    fs.rmSync(supervisorRequestPath, { force: true });
  }
};

const executeSyncRequest = async (
  request,
  dependencies = { cleanupProcessTree },
) => {
  assertRequest(request);
  const isAlive = dependencies.isPidAlive || isPidAlive;
  const stdoutLog = openExclusiveLog(request.stdoutPath);
  const stderrLog = openExclusiveLog(request.stderrPath);
  let child;
  let timeout;

  try {
    child = await spawnOwnedChild(request, stdoutLog, stderrLog, dependencies);
  } catch (error) {
    await closeLogs(stdoutLog, stderrLog);
    return createResult(request, {
      status: error.status || "spawn-error",
      pid: error.pid,
      targetPid: error.targetPid,
      cleanup: error.cleanup,
      childAliveAfterCleanup: error.childAliveAfterCleanup,
      targetAliveAfterCleanup: error.targetAliveAfterCleanup,
      error: error.message,
    });
  }

  return await new Promise((resolve) => {
    let settled = false;
    let terminationInProgress = false;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      await finalizeCapturedOutput(child, stdoutLog, stderrLog);
      resolve(
        createResult(request, {
          ...result,
          pid: child.pid,
          targetPid: child.targetPid,
        }),
      );
    };

    child.once("error", (error) => {
      void finish({ status: "spawn-error", error: error.message });
    });
    child.once("close", (exitCode, signal) => {
      if (terminationInProgress) return;
      void finish(naturalExitOutcome(child, exitCode, signal));
    });
    if (child.terminalState) void finish(child.terminalState);

    if (request.timeoutMs > 0) {
      timeout = setTimeout(() => {
        terminationInProgress = true;
        void (async () => {
          const cleanup = await dependencies.cleanupProcessTree(
            child.pid,
            request.cleanupGraceMs,
          );
          await finish({
            exitCode: null,
            signal: null,
            timedOut: true,
            ...cleanupOutcome(
              "timed-out",
              cleanup,
              child.pid,
              child.targetPid,
              isAlive,
            ),
          });
        })();
      }, request.timeoutMs);
    }
  });
};

const detachedMetadata = (request, child, status = "running") => ({
  schemaVersion: SCHEMA_VERSION,
  runId: request.runId,
  ownerToken: request.ownerToken,
  status,
  workerPid: process.pid,
  childPid: child.pid,
  targetPid: child.targetPid,
  cwd: request.cwd,
  command: summarizeCommand(request.argv),
  stdoutPath: request.stdoutPath,
  stderrPath: request.stderrPath,
  metadataPath: request.metadataPath,
  controlPath: request.controlPath,
  resultPath: request.resultPath,
  startedAt: new Date().toISOString(),
});

const executeDetachedRequest = async (
  request,
  dependencies = { cleanupProcessTree, writeJsonAtomic },
) => {
  assertRequest(request);
  const cleanupOwnedTree =
    dependencies.cleanupProcessTree || cleanupProcessTree;
  const writeAtomic = dependencies.writeJsonAtomic || writeJsonAtomic;
  const isAlive = dependencies.isPidAlive || isPidAlive;
  const stdoutLog = openExclusiveLog(request.stdoutPath);
  const stderrLog = openExclusiveLog(request.stderrPath);
  let child;

  try {
    child = await spawnOwnedChild(request, stdoutLog, stderrLog, {
      ...dependencies,
      cleanupProcessTree: cleanupOwnedTree,
    });
  } catch (error) {
    await closeLogs(stdoutLog, stderrLog);
    const result = createResult(request, {
      status: error.status || "spawn-error",
      pid: error.pid,
      targetPid: error.targetPid,
      cleanup: error.cleanup,
      childAliveAfterCleanup: error.childAliveAfterCleanup,
      targetAliveAfterCleanup: error.targetAliveAfterCleanup,
      error: error.message,
    });
    writeAtomic(request.resultPath, result);
    return result;
  }

  let childTerminal = child.terminalState;
  let handleTerminal = null;
  child.once("error", (error) => {
    childTerminal = { status: "spawn-error", error: error.message };
    handleTerminal?.();
  });
  child.once("close", (exitCode, signal) => {
    childTerminal = naturalExitOutcome(child, exitCode, signal);
    handleTerminal?.();
  });

  let metadata = detachedMetadata(
    request,
    child,
    request.readiness ? "starting" : "running",
  );
  try {
    writeAtomic(request.metadataPath, metadata);
  } catch (error) {
    const cleanup = await cleanupOwnedTree(child.pid, request.cleanupGraceMs);
    const outcome = cleanupOutcome(
      "metadata-error",
      cleanup,
      child.pid,
      child.targetPid,
      isAlive,
    );
    await finalizeCapturedOutput(child, stdoutLog, stderrLog);
    const result = createResult(request, {
      ...outcome,
      pid: child.pid,
      targetPid: child.targetPid,
      error: `${error.message}${outcome.error ? ` ${outcome.error}` : ""}`,
    });
    writeAtomic(request.resultPath, result);
    return result;
  }

  let timeout;
  let terminationInProgress = false;
  let finalizationPromise = null;
  let cleanupInProgressPromise = null;
  const finish = (values) => {
    if (finalizationPromise) return finalizationPromise;
    finalizationPromise = (async () => {
      if (timeout) clearTimeout(timeout);
      await finalizeCapturedOutput(child, stdoutLog, stderrLog);
      const finalizationId = crypto.randomBytes(16).toString("hex");
      const result = createResult(request, {
        ...values,
        pid: child.pid,
        targetPid: child.targetPid,
        finalizationId,
      });
      metadata = {
        ...metadata,
        status: result.status,
        finishedAt: result.finishedAt,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        cleanup: result.cleanup,
        childAliveAfterCleanup: result.childAliveAfterCleanup,
        targetAliveAfterCleanup: result.targetAliveAfterCleanup,
        error: result.error,
        finalizationId,
      };
      writeAtomic(request.resultPath, result);
      if (dependencies.finalizationGapMs > 0) {
        await sleep(dependencies.finalizationGapMs);
      }
      try {
        if (dependencies.injectTerminalMetadataFailure === true) {
          throw new Error("Injected terminal metadata write failure.");
        }
        writeAtomic(request.metadataPath, metadata);
        return result;
      } catch (error) {
        const failedResult = {
          ...result,
          terminalMetadataError: error.message,
        };
        writeAtomic(request.resultPath, failedResult);
        return failedResult;
      }
    })();
    return finalizationPromise;
  };

  const cleanupAndFinish = async (baseStatus, values = {}) => {
    if (cleanupInProgressPromise) return await cleanupInProgressPromise;
    cleanupInProgressPromise = (async () => {
      terminationInProgress = true;
      const cleanup = await cleanupOwnedTree(child.pid, request.cleanupGraceMs);
      return await finish({
        ...values,
        ...cleanupOutcome(
          baseStatus,
          cleanup,
          child.pid,
          child.targetPid,
          isAlive,
        ),
      });
    })();
    return await cleanupInProgressPromise;
  };

  handleTerminal = () => {
    if (terminationInProgress || !childTerminal) return;
    void finish(childTerminal);
  };

  if (request.readiness) {
    try {
      await waitForReadiness(request, () => childTerminal);
      metadata = {
        ...metadata,
        status: "running",
        readyAt: new Date().toISOString(),
      };
      writeAtomic(request.metadataPath, metadata);
    } catch (error) {
      if (childTerminal && !isPidAlive(child.pid)) {
        return await finish({
          status: "readiness-failed",
          error: error.message,
          cleanup: {
            gracefulAttempted: false,
            forced: false,
            stopped: true,
          },
          childAliveAfterCleanup: false,
          targetAliveAfterCleanup: false,
        });
      }
      return await cleanupAndFinish("readiness-failed", {
        error: error.message,
      });
    }
  }

  if (childTerminal) handleTerminal();

  if (request.timeoutMs > 0) {
    timeout = setTimeout(() => {
      void cleanupAndFinish("timed-out", { timedOut: true });
    }, request.timeoutMs);
  }

  while (!finalizationPromise && !cleanupInProgressPromise) {
    if (fs.existsSync(request.controlPath)) {
      let control;
      try {
        control = readJson(request.controlPath);
      } catch (error) {
        metadata = { ...metadata, lastControlError: "invalid-json" };
        writeAtomic(request.metadataPath, metadata);
        fs.rmSync(request.controlPath, { force: true });
        await sleep(CONTROL_POLL_MS);
        continue;
      }

      fs.rmSync(request.controlPath, { force: true });
      const ownsRequest =
        control.schemaVersion === SCHEMA_VERSION &&
        control.action === "stop" &&
        control.runId === request.runId &&
        control.ownerToken === request.ownerToken;
      if (!ownsRequest) {
        metadata = { ...metadata, lastControlError: "ownership-mismatch" };
        writeAtomic(request.metadataPath, metadata);
        await sleep(CONTROL_POLL_MS);
        continue;
      }

      void cleanupAndFinish("stopped");
      break;
    }
    await sleep(CONTROL_POLL_MS);
  }

  return await (finalizationPromise || cleanupInProgressPromise);
};

const main = async () => {
  const requestFlag = process.argv.indexOf("--request");
  if (requestFlag < 0 || !process.argv[requestFlag + 1]) {
    throw new Error("Worker requires --request <path>.");
  }
  const requestPath = process.argv[requestFlag + 1];
  let request;
  try {
    request = readJson(requestPath);
    assertRequest(request);
    request = {
      ...request,
      passEnvValues: consumePassEnvironment(request.passEnvNames),
    };
  } catch (error) {
    if (request?.resultPath) {
      writeJsonAtomic(
        request.resultPath,
        createResult(request, {
          status: "spawn-error",
          error: error.message,
        }),
      );
    }
    return;
  } finally {
    fs.rmSync(requestPath, { force: true });
  }
  let result;
  try {
    const injectedCleanupFailure =
      request.passEnvValues[TEST_CLEANUP_FAILURE_ENV] ===
      "inject-cleanup-failure";
    const injectedHandshakeFailure =
      request.passEnvValues[TEST_HANDSHAKE_FAILURE_ENV] ===
      "inject-handshake-cleanup-failure";
    const finalizationGapMs = Number(
      request.passEnvValues[TEST_FINALIZATION_GAP_ENV] || 0,
    );
    const injectedTerminalMetadataFailure =
      request.passEnvValues[TEST_TERMINAL_METADATA_FAILURE_ENV] ===
      "inject-terminal-metadata-failure";
    const runtimeDependencies = {
      ...(injectedCleanupFailure || injectedHandshakeFailure
        ? {
            cleanupProcessTree: async (pid, graceMs) => {
              const actual = await cleanupProcessTree(pid, graceMs);
              return {
                ...actual,
                actualStoppedBeforeInjection: actual.stopped,
                stopped: false,
                injectedForTest: true,
              };
            },
          }
        : {}),
      ...(injectedHandshakeFailure
        ? { injectSupervisorStartFailure: true }
        : {}),
      ...(Number.isSafeInteger(finalizationGapMs) && finalizationGapMs > 0
        ? { finalizationGapMs }
        : {}),
      ...(injectedTerminalMetadataFailure
        ? { injectTerminalMetadataFailure: true }
        : {}),
    };
    const hasRuntimeDependencies = Object.keys(runtimeDependencies).length > 0;
    result =
      request.mode === "detached"
        ? await executeDetachedRequest(
            request,
            hasRuntimeDependencies ? runtimeDependencies : undefined,
          )
        : await executeSyncRequest(
            request,
            hasRuntimeDependencies ? runtimeDependencies : undefined,
          );
  } catch (error) {
    result = createResult(request, {
      status: "spawn-error",
      error: error.message,
    });
    writeJsonAtomic(request.resultPath, result);
  }
  if (request.mode === "sync") writeJsonAtomic(request.resultPath, result);
};

if (require.main === module) {
  main().catch((error) => {
    // WSH has no terminal; request/result files are the only public error channel.
    process.exitCode = 1;
  });
}

module.exports = {
  buildChildEnvironment,
  cleanupProcessTree,
  cleanupOutcome,
  consumePassEnvironment,
  createExactValueRedactor,
  executeDetachedRequest,
  executeSyncRequest,
  isPidAlive,
  resolveCommand,
};

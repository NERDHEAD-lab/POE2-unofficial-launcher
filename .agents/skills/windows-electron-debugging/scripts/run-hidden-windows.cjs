#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SCHEMA_VERSION = 1;
const CLEANUP_FAILURE_EXIT_CODE = 125;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 20 * 1000;
const POLL_MS = 50;
const SCRIPT_DIR = __dirname;
const BOOTSTRAP_PATH = path.join(SCRIPT_DIR, "run-hidden-windows-bootstrap.js");
const WORKER_PATH = path.join(SCRIPT_DIR, "run-hidden-windows-worker.cjs");
const DEFAULT_RUN_ROOT = path.resolve(process.cwd(), ".tmp", "windows-runner");

const usage = `Usage:
  node run-hidden-windows.cjs sync [options] -- <command> [args...]
  node run-hidden-windows.cjs detached --stdout <path> --stderr <path> [options] -- <command> [args...]
  node run-hidden-windows.cjs stop --metadata <path> [--timeout-ms <ms>]

Options:
  --cwd <path>              Windows child working directory (default: current directory)
  --timeout-ms <ms>         Bounded child runtime; 0 means no detached runtime timeout
  --cleanup-grace-ms <ms>   Grace period before force tree cleanup (default: 3000)
  --literal-env <NAME=VALUE> Non-secret child environment value (repeatable; persisted transiently)
  --env-path <NAME=PATH>    Convert one mounted WSL path for child env (repeatable)
  --pass-env <NAME>         Pass one sensitive named WSL value without persisting it (repeatable)
  --stdout <path>           Detached stdout log (mandatory; {runId} supported)
  --stderr <path>           Detached stderr log (mandatory; {runId} supported)
  --metadata <path>         Detached metadata path; stop mode requires it
  --run-root <path>         Request/result root (default: .tmp/windows-runner)
  --ready-url <url>         Detached HTTP(S) readiness probe
  --ready-file <path>       Detached readiness file probe
  --ready-timeout-ms <ms>   Readiness deadline (default: 30000)
  --ready-interval-ms <ms>  Readiness polling interval (default: 250)

Reserved commands:
  @node                    Windows Node executable used by the hidden worker
  @pwsh                    Installed PowerShell 7, with Windows PowerShell fallback
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parsePositiveInteger = (value, name, { allowZero = false } = {}) => {
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${name} must be an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${name} is out of range.`);
  }
  return parsed;
};

const assertEnvName = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid environment name: ${name}`);
  }
};

const parseArgs = (argv) => {
  const [mode, ...rest] = argv;
  if (!["sync", "detached", "stop"].includes(mode)) {
    throw new Error(`Expected mode sync, detached, or stop.\n${usage}`);
  }

  const options = {
    mode,
    cwd: process.cwd(),
    timeoutMs:
      mode === "detached"
        ? 0
        : mode === "stop"
          ? DEFAULT_BOOTSTRAP_TIMEOUT_MS
          : DEFAULT_TIMEOUT_MS,
    cleanupGraceMs: 3000,
    literalEnv: {},
    pathEnv: {},
    passEnv: [],
    readyTimeoutMs: 30_000,
    readyIntervalMs: 250,
    runRoot: DEFAULT_RUN_ROOT,
    argv: [],
  };

  let index = 0;
  while (index < rest.length) {
    const token = rest[index];
    if (token === "--") {
      options.argv = rest.slice(index + 1);
      index = rest.length;
      break;
    }

    const readValue = () => {
      index += 1;
      if (index >= rest.length) throw new Error(`Missing value for ${token}.`);
      return rest[index];
    };

    switch (token) {
      case "--cwd":
        options.cwd = readValue();
        break;
      case "--timeout-ms":
        options.timeoutMs = parsePositiveInteger(readValue(), token, {
          allowZero: mode === "detached",
        });
        break;
      case "--cleanup-grace-ms":
        options.cleanupGraceMs = parsePositiveInteger(readValue(), token);
        break;
      case "--env":
        throw new Error(
          "--env was retired. Use --literal-env only for non-secret values or --pass-env NAME for sensitive values.",
        );
      case "--literal-env": {
        const assignment = readValue();
        const separator = assignment.indexOf("=");
        if (separator <= 0)
          throw new Error("--literal-env must be NAME=VALUE.");
        const name = assignment.slice(0, separator);
        assertEnvName(name);
        options.literalEnv[name] = assignment.slice(separator + 1);
        break;
      }
      case "--env-path": {
        const assignment = readValue();
        const separator = assignment.indexOf("=");
        if (separator <= 0) throw new Error("--env-path must be NAME=PATH.");
        const name = assignment.slice(0, separator);
        assertEnvName(name);
        options.pathEnv[name] = assignment.slice(separator + 1);
        break;
      }
      case "--pass-env": {
        const name = readValue();
        assertEnvName(name);
        options.passEnv.push(name);
        break;
      }
      case "--stdout":
        options.stdoutPath = readValue();
        break;
      case "--stderr":
        options.stderrPath = readValue();
        break;
      case "--metadata":
        options.metadataPath = readValue();
        break;
      case "--run-root":
        options.runRoot = readValue();
        break;
      case "--ready-url":
        options.readyUrl = readValue();
        break;
      case "--ready-file":
        options.readyFile = readValue();
        break;
      case "--ready-timeout-ms":
        options.readyTimeoutMs = parsePositiveInteger(readValue(), token);
        break;
      case "--ready-interval-ms":
        options.readyIntervalMs = parsePositiveInteger(readValue(), token);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
    index += 1;
  }

  if (mode === "stop") {
    if (!options.metadataPath) throw new Error("stop requires --metadata.");
    if (options.argv.length > 0)
      throw new Error("stop does not accept a command.");
  } else {
    if (options.argv.length === 0)
      throw new Error(`${mode} requires -- <command>.`);
    if (mode === "detached" && (!options.stdoutPath || !options.stderrPath)) {
      throw new Error("detached requires both --stdout and --stderr.");
    }
    if (options.readyUrl && options.readyFile) {
      throw new Error(
        "Use only one readiness probe: --ready-url or --ready-file.",
      );
    }
    if ((options.readyUrl || options.readyFile) && mode !== "detached") {
      throw new Error("Readiness probes are supported only in detached mode.");
    }
    if (options.readyUrl) {
      let url;
      try {
        url = new URL(options.readyUrl);
      } catch {
        throw new Error("--ready-url must be an absolute HTTP(S) URL.");
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("--ready-url must use HTTP or HTTPS.");
      }
    }
  }

  return options;
};

const toWindowsPath = (inputPath, basePath = process.cwd()) => {
  const resolved = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(basePath, inputPath);
  const match = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(resolved);
  if (!match) {
    if (/^[a-zA-Z]:[\\/]/.test(inputPath)) {
      return inputPath.replace(/\//g, "\\");
    }
    throw new Error(`Path is not on a Windows-mounted drive: ${resolved}`);
  }
  const suffix = match[2] ? `\\${match[2].replace(/\//g, "\\")}` : "\\";
  return `${match[1].toUpperCase()}:${suffix}`;
};

const fromWindowsPath = (windowsPath) => {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(windowsPath);
  if (!match) throw new Error(`Not an absolute Windows path: ${windowsPath}`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
};

const expandRunId = (value, runId) => value.replaceAll("{runId}", runId);

const resolvePathOption = (value, runId, basePath = process.cwd()) => {
  const expanded = expandRunId(value, runId);
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(basePath, expanded);
};

const resolvePublicPathOption = (value, runId, basePath = process.cwd()) =>
  resolvePathOption(
    /^[a-zA-Z]:[\\/]/.test(value) ? fromWindowsPath(value) : value,
    runId,
    basePath,
  );

const findWindowsNode = () => {
  const configured = process.env.CODEX_WINDOWS_NODE_EXE;
  const candidates = [
    configured,
    "/mnt/d/Program Files/nodejs/node.exe",
    "/mnt/c/Program Files/nodejs/node.exe",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      "Windows Node was not found. Set CODEX_WINDOWS_NODE_EXE to its /mnt/<drive>/... path.",
    );
  }
  return toWindowsPath(found);
};

const buildLiteralEnv = (options, runId) => {
  const env = Object.fromEntries(
    Object.entries(options.literalEnv).map(([name, value]) => [
      name,
      expandRunId(value, runId),
    ]),
  );
  for (const [name, value] of Object.entries(options.pathEnv)) {
    env[name] = toWindowsPath(expandRunId(value, runId));
  }
  return env;
};

const getPassEnvValues = (names) => {
  const values = {};
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(process.env, name)) {
      throw new Error(`Requested pass-through environment is not set: ${name}`);
    }
    values[name] = process.env[name];
  }
  return values;
};

const assertSecretsAbsentFromArgv = (argv, passEnvValues) => {
  for (const value of Object.values(passEnvValues)) {
    if (value && argv.some((argument) => argument.includes(value))) {
      throw new Error(
        "A --pass-env value appears in child argv. Secrets in argv are forbidden.",
      );
    }
  }
};

const createRunId = () =>
  `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;

const writeJsonAtomic = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error?.code)) throw error;
    fs.rmSync(filePath, { force: true, maxRetries: 10, retryDelay: 10 });
    fs.renameSync(temporaryPath, filePath);
  }
};

const buildRequest = (options) => {
  const runId = createRunId();
  const expandedArgv = options.argv.map((argument) =>
    expandRunId(argument, runId),
  );
  const passEnvValues = getPassEnvValues(options.passEnv);
  assertSecretsAbsentFromArgv(expandedArgv, passEnvValues);
  const runRoot = resolvePathOption(options.runRoot, runId);
  const runDirectory = path.join(runRoot, runId);
  fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(runDirectory, { recursive: false, mode: 0o700 });

  const stdoutPath = options.stdoutPath
    ? resolvePathOption(options.stdoutPath, runId)
    : path.join(runDirectory, "stdout.log");
  const stderrPath = options.stderrPath
    ? resolvePathOption(options.stderrPath, runId)
    : path.join(runDirectory, "stderr.log");
  if (path.normalize(stdoutPath) === path.normalize(stderrPath)) {
    throw new Error("stdout and stderr log paths must be different.");
  }

  const metadataPath = options.metadataPath
    ? resolvePathOption(options.metadataPath, runId)
    : path.join(runDirectory, "metadata.json");
  const readyFilePath = options.readyFile
    ? resolvePathOption(options.readyFile, runId)
    : null;
  const requestPath = path.join(runDirectory, "request.json");
  const resultPath = path.join(runDirectory, "result.json");
  const controlPath = path.join(runDirectory, "control.json");
  const bootstrapLogPath = path.join(runDirectory, "bootstrap.log");
  const request = {
    schemaVersion: SCHEMA_VERSION,
    mode: options.mode,
    runId,
    ownerToken: crypto.randomBytes(32).toString("hex"),
    argv: expandedArgv,
    cwd: toWindowsPath(expandRunId(options.cwd, runId)),
    literalEnv: buildLiteralEnv(options, runId),
    passEnvNames: options.passEnv,
    timeoutMs: options.timeoutMs,
    cleanupGraceMs: options.cleanupGraceMs,
    stdoutPath: toWindowsPath(stdoutPath),
    stderrPath: toWindowsPath(stderrPath),
    metadataPath: toWindowsPath(metadataPath),
    controlPath: toWindowsPath(controlPath),
    bootstrapLogPath: toWindowsPath(bootstrapLogPath),
    readiness: options.readyUrl
      ? {
          kind: "url",
          value: expandRunId(options.readyUrl, runId),
          timeoutMs: options.readyTimeoutMs,
          intervalMs: options.readyIntervalMs,
        }
      : readyFilePath
        ? {
            kind: "file",
            value: toWindowsPath(readyFilePath),
            timeoutMs: options.readyTimeoutMs,
            intervalMs: options.readyIntervalMs,
          }
        : null,
    resultPath: toWindowsPath(resultPath),
    requestPath: toWindowsPath(requestPath),
    workerPath: toWindowsPath(WORKER_PATH),
    windowsNodeExe: findWindowsNode(),
    createdAt: new Date().toISOString(),
  };
  writeJsonAtomic(requestPath, request);
  return {
    request,
    requestPath,
    resultPath,
    stdoutPath,
    stderrPath,
    metadataPath,
    controlPath,
    passEnvValues,
  };
};

const getWscriptPath = () => {
  const candidate = "/mnt/c/Windows/System32/wscript.exe";
  if (!fs.existsSync(candidate)) {
    throw new Error(`GUI bootstrap is unavailable: ${candidate}`);
  }
  return candidate;
};

const buildInteropEnvironment = (passEnvValues) => {
  const additions = Object.keys(passEnvValues);
  const existing = (process.env.WSLENV || "")
    .split(":")
    .filter(Boolean)
    .filter((entry) => !additions.includes(entry.split("/")[0]));
  return {
    ...process.env,
    ...passEnvValues,
    WSLENV: [...existing, ...additions].join(":"),
  };
};

const launchGuiBootstrap = ({ requestPath, passEnvValues }) =>
  new Promise((resolve, reject) => {
    const bootstrap = spawn(
      getWscriptPath(),
      [
        "//B",
        "//NoLogo",
        toWindowsPath(BOOTSTRAP_PATH),
        toWindowsPath(requestPath),
      ],
      {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
        env: buildInteropEnvironment(passEnvValues),
      },
    );
    bootstrap.once("error", reject);
    bootstrap.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `GUI bootstrap exited before worker launch (exitCode=${code ?? "none"}, signal=${signal ?? "none"}).`,
        ),
      );
    });
  });

const relayNewBytes = (filePath, stream, state) => {
  if (!fs.existsSync(filePath)) return;
  const size = fs.statSync(filePath).size;
  if (size <= state.offset) return;
  const length = size - state.offset;
  const buffer = Buffer.alloc(length);
  const descriptor = fs.openSync(filePath, "r");
  try {
    fs.readSync(descriptor, buffer, 0, length, state.offset);
  } finally {
    fs.closeSync(descriptor);
  }
  state.offset = size;
  stream.write(buffer);
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const readJsonTransient = (filePath) => {
  try {
    return readJson(filePath);
  } catch (error) {
    if (
      error?.code === "ENOENT" ||
      error instanceof SyntaxError ||
      /Unexpected end of JSON input/.test(error?.message || "")
    ) {
      return null;
    }
    throw error;
  }
};

const waitForJson = async (filePath, deadline, predicate = () => true) => {
  while (Date.now() < deadline) {
    const value = readJsonTransient(filePath);
    if (value && predicate(value)) return value;
    await sleep(POLL_MS);
  }
  return null;
};

const sanitizeResultForOutput = (result) => ({
  schemaVersion: result.schemaVersion,
  runId: result.runId,
  status: result.status,
  exitCode: result.exitCode,
  signal: result.signal,
  timedOut: result.timedOut,
  workerPid: result.workerPid,
  pid: result.pid,
  targetPid: result.targetPid,
  cleanup: result.cleanup,
  childAliveAfterCleanup: result.childAliveAfterCleanup,
  targetAliveAfterCleanup: result.targetAliveAfterCleanup,
  finalizationId: result.finalizationId,
  terminalMetadataError: result.terminalMetadataError,
  error: result.error,
  finishedAt: result.finishedAt,
});

const finalizedIdentityMatches = (metadata, result, expectedStatus) =>
  result.runId === metadata.runId &&
  result.status === expectedStatus &&
  typeof result.finalizationId === "string" &&
  result.finalizationId.length >= 32 &&
  result.finalizationId === metadata.finalizationId &&
  result.workerPid === metadata.workerPid &&
  result.pid === metadata.childPid &&
  result.targetPid === metadata.targetPid &&
  result.cleanup?.stopped === true &&
  result.childAliveAfterCleanup === false &&
  result.targetAliveAfterCleanup === false;

const unlinkRequestBestEffort = (run) => {
  if (run?.requestPath) fs.rmSync(run.requestPath, { force: true });
};

const waitForResult = async (run) => {
  const stdoutState = { offset: 0 };
  const stderrState = { offset: 0 };
  const outerTimeout =
    (run.request.timeoutMs > 0 ? run.request.timeoutMs : DEFAULT_TIMEOUT_MS) +
    DEFAULT_BOOTSTRAP_TIMEOUT_MS +
    run.request.cleanupGraceMs * 2;
  const deadline = Date.now() + outerTimeout;

  while (!fs.existsSync(run.resultPath)) {
    relayNewBytes(run.stdoutPath, process.stdout, stdoutState);
    relayNewBytes(run.stderrPath, process.stderr, stderrState);
    if (Date.now() >= deadline) {
      const bootstrapLogPath = path.join(
        path.dirname(run.requestPath),
        "bootstrap.log",
      );
      const bootstrapDetail = fs.existsSync(bootstrapLogPath)
        ? ` Bootstrap: ${fs.readFileSync(bootstrapLogPath, "utf8").trim()}`
        : " Bootstrap produced no log.";
      throw new Error(
        `Hidden Windows worker did not produce a result within ${outerTimeout}ms (run ${run.request.runId}).${bootstrapDetail}`,
      );
    }
    await sleep(POLL_MS);
  }

  relayNewBytes(run.stdoutPath, process.stdout, stdoutState);
  relayNewBytes(run.stderrPath, process.stderr, stderrState);
  const result = await waitForJson(run.resultPath, deadline);
  if (!result) {
    throw new Error(
      `Hidden Windows worker result was not readable before its bounded deadline (run ${run.request.runId}).`,
    );
  }
  return result;
};

const sanitizeMetadataForOutput = (metadata) => ({
  schemaVersion: metadata.schemaVersion,
  runId: metadata.runId,
  status: metadata.status,
  workerPid: metadata.workerPid,
  childPid: metadata.childPid,
  targetPid: metadata.targetPid,
  command: metadata.command,
  cwd: fromWindowsPath(metadata.cwd),
  stdoutPath: fromWindowsPath(metadata.stdoutPath),
  stderrPath: fromWindowsPath(metadata.stderrPath),
  metadataPath: fromWindowsPath(metadata.metadataPath),
  startedAt: metadata.startedAt,
});

const waitForDetachedMetadata = async (run) => {
  const deadline =
    Date.now() +
    DEFAULT_BOOTSTRAP_TIMEOUT_MS +
    (run.request.readiness?.timeoutMs ?? 0);
  while (true) {
    if (fs.existsSync(run.metadataPath)) {
      const metadata = readJsonTransient(run.metadataPath);
      if (!metadata) {
        await sleep(POLL_MS);
        continue;
      }
      if (metadata.status === "running") return metadata;
      if (
        [
          "exited",
          "spawn-error",
          "metadata-error",
          "readiness-failed",
        ].includes(metadata.status)
      ) {
        throw new Error(
          `Detached run ${run.request.runId} ended before becoming ready: ${metadata.status}.`,
        );
      }
    }
    if (fs.existsSync(run.resultPath)) {
      const result = readJsonTransient(run.resultPath);
      if (!result) {
        await sleep(POLL_MS);
        continue;
      }
      if (result.status === "cleanup-failed") {
        return { cleanupFailure: result };
      }
      if (
        [
          "spawn-error",
          "bootstrap-error",
          "metadata-error",
          "readiness-failed",
          "exited",
        ].includes(result.status)
      ) {
        throw new Error(
          result.error ||
            `Detached run ${run.request.runId} ended before becoming ready: ${result.status}.`,
        );
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Detached hidden Windows worker did not become ready within the bounded deadline (run ${run.request.runId}).`,
      );
    }
    await sleep(POLL_MS);
  }
};

const normalizeWindowsPath = (value) =>
  value.replace(/\//g, "\\").toLowerCase();

const validateStopMetadata = (metadataPath, metadata) => {
  if (metadata.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("Unsupported or missing runner metadata schema.");
  }
  if (!/^[0-9A-Za-z-]+$/.test(metadata.runId || "")) {
    throw new Error("Runner metadata has an invalid run ID.");
  }
  if (!/^[a-f0-9]{64}$/.test(metadata.ownerToken || "")) {
    throw new Error("Runner metadata ownership token is invalid.");
  }
  if (!Number.isInteger(metadata.workerPid) || metadata.workerPid <= 0) {
    throw new Error("Runner metadata worker PID is invalid.");
  }
  if (!Number.isInteger(metadata.childPid) || metadata.childPid <= 0) {
    throw new Error("Runner metadata child PID is invalid.");
  }
  if (!Number.isInteger(metadata.targetPid) || metadata.targetPid <= 0) {
    throw new Error("Runner metadata target PID is invalid.");
  }
  const expectedMetadataPath = toWindowsPath(metadataPath);
  if (
    normalizeWindowsPath(expectedMetadataPath) !==
    normalizeWindowsPath(metadata.metadataPath || "")
  ) {
    throw new Error(
      "Runner metadata path does not match its ownership record.",
    );
  }
  for (const field of ["controlPath", "resultPath"]) {
    if (typeof metadata[field] !== "string") {
      throw new Error(`Runner metadata ${field} is missing.`);
    }
  }
  return metadata;
};

const stopDetached = async (options) => {
  const metadataPath = resolvePublicPathOption(options.metadataPath, "stop");
  const metadataDeadline = Date.now() + options.timeoutMs;
  const rawMetadata = await waitForJson(metadataPath, metadataDeadline);
  if (!rawMetadata) {
    throw new Error(
      `Runner metadata was not readable within the bounded deadline: ${metadataPath}`,
    );
  }
  const metadata = validateStopMetadata(metadataPath, rawMetadata);
  if (metadata.status === "cleanup-failed") {
    const resultPath = fromWindowsPath(metadata.resultPath);
    const result = (await waitForJson(
      resultPath,
      metadataDeadline,
      (candidate) => candidate.runId === metadata.runId,
    )) || {
      schemaVersion: metadata.schemaVersion,
      runId: metadata.runId,
      status: metadata.status,
      exitCode: metadata.exitCode ?? null,
      signal: metadata.signal ?? null,
      timedOut: Boolean(metadata.timedOut),
      cleanup: metadata.cleanup,
      childAliveAfterCleanup: metadata.childAliveAfterCleanup,
      targetAliveAfterCleanup: metadata.targetAliveAfterCleanup,
      error:
        metadata.error ||
        "Owned cleanup failed and no finalized result artifact is available.",
    };
    process.stdout.write(
      `${JSON.stringify(sanitizeResultForOutput(result), null, 2)}\n`,
    );
    return CLEANUP_FAILURE_EXIT_CODE;
  }
  if (metadata.status === "stopped") {
    const resultPath = fromWindowsPath(metadata.resultPath);
    const result = await waitForJson(
      resultPath,
      metadataDeadline,
      (candidate) => candidate.runId === metadata.runId,
    );
    if (!result) throw new Error(`Stopped metadata has no matching result.`);
    const cleanupVerified = finalizedIdentityMatches(
      metadata,
      result,
      "stopped",
    );
    process.stdout.write(
      `${JSON.stringify(sanitizeResultForOutput(result), null, 2)}\n`,
    );
    return cleanupVerified ? 0 : CLEANUP_FAILURE_EXIT_CODE;
  }
  if (metadata.status === "exited") {
    const resultPath = fromWindowsPath(metadata.resultPath);
    const result = await waitForJson(
      resultPath,
      metadataDeadline,
      (candidate) => candidate.runId === metadata.runId,
    );
    if (!result) {
      throw new Error(
        `Exited metadata has no finalized result within the bounded deadline: ${resultPath}`,
      );
    }
    const cleanupVerified = finalizedIdentityMatches(
      metadata,
      result,
      "exited",
    );
    process.stdout.write(
      `${JSON.stringify(sanitizeResultForOutput(result), null, 2)}\n`,
    );
    return cleanupVerified ? 0 : CLEANUP_FAILURE_EXIT_CODE;
  }
  if (metadata.status === "spawn-error") {
    process.stdout.write(
      `${JSON.stringify(sanitizeMetadataForOutput(metadata), null, 2)}\n`,
    );
    return 1;
  }
  if (metadata.status !== "running") {
    throw new Error(
      `Runner metadata is not stoppable: status=${metadata.status}`,
    );
  }

  const controlPath = fromWindowsPath(metadata.controlPath);
  const resultPath = fromWindowsPath(metadata.resultPath);
  const alreadyFinalized = readJsonTransient(resultPath);
  if (
    alreadyFinalized?.runId === metadata.runId &&
    ["stopped", "exited", "cleanup-failed"].includes(alreadyFinalized.status)
  ) {
    const terminalMetadata = await waitForJson(
      metadataPath,
      metadataDeadline,
      (candidate) =>
        candidate.runId === metadata.runId &&
        candidate.status === alreadyFinalized.status &&
        candidate.finalizationId === alreadyFinalized.finalizationId,
    );
    const latestFinalized = readJsonTransient(resultPath);
    const outputResult =
      latestFinalized?.runId === alreadyFinalized.runId &&
      latestFinalized.finalizationId === alreadyFinalized.finalizationId
        ? latestFinalized
        : alreadyFinalized;
    process.stdout.write(
      `${JSON.stringify(sanitizeResultForOutput(outputResult), null, 2)}\n`,
    );
    if (outputResult.status === "cleanup-failed" || !terminalMetadata) {
      return CLEANUP_FAILURE_EXIT_CODE;
    }
    return finalizedIdentityMatches(
      terminalMetadata,
      outputResult,
      outputResult.status,
    )
      ? 0
      : CLEANUP_FAILURE_EXIT_CODE;
  }
  writeJsonAtomic(controlPath, {
    schemaVersion: SCHEMA_VERSION,
    action: "stop",
    runId: metadata.runId,
    ownerToken: metadata.ownerToken,
    requestedAt: new Date().toISOString(),
  });

  const deadline = Date.now() + options.timeoutMs + options.cleanupGraceMs * 2;
  while (Date.now() < deadline) {
    if (fs.existsSync(resultPath)) {
      const result = readJsonTransient(resultPath);
      if (!result) {
        await sleep(POLL_MS);
        continue;
      }
      if (result.runId === metadata.runId) {
        if (["stopped", "exited", "cleanup-failed"].includes(result.status)) {
          const terminalMetadata = await waitForJson(
            metadataPath,
            deadline,
            (candidate) =>
              candidate.runId === metadata.runId &&
              candidate.status === result.status &&
              candidate.finalizationId === result.finalizationId,
          );
          const latestResult = readJsonTransient(resultPath);
          const outputResult =
            latestResult?.runId === result.runId &&
            latestResult.finalizationId === result.finalizationId
              ? latestResult
              : result;
          process.stdout.write(
            `${JSON.stringify(sanitizeResultForOutput(outputResult), null, 2)}\n`,
          );
          if (!terminalMetadata || outputResult.status === "cleanup-failed") {
            return CLEANUP_FAILURE_EXIT_CODE;
          }
          return finalizedIdentityMatches(
            terminalMetadata,
            outputResult,
            outputResult.status,
          )
            ? 0
            : CLEANUP_FAILURE_EXIT_CODE;
        }
      }
    }
    await sleep(POLL_MS);
  }
  throw new Error(`Timed out stopping owned run ${metadata.runId}.`);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "stop") {
    process.exitCode = await stopDetached(options);
    return;
  }

  const run = buildRequest(options);
  try {
    await launchGuiBootstrap(run);

    if (options.mode === "detached") {
      const detachedOutcome = await waitForDetachedMetadata(run);
      if (detachedOutcome.cleanupFailure) {
        process.stdout.write(
          `${JSON.stringify(detachedOutcome.cleanupFailure, null, 2)}\n`,
        );
        process.exitCode = CLEANUP_FAILURE_EXIT_CODE;
        return;
      }
      const metadata = detachedOutcome;
      process.stdout.write(
        `${JSON.stringify(sanitizeMetadataForOutput(metadata), null, 2)}\n`,
      );
      return;
    }

    const result = await waitForResult(run);
    if (
      result.status === "bootstrap-error" ||
      result.status === "spawn-error"
    ) {
      throw new Error(
        result.error || `Hidden Windows run ${result.runId} failed.`,
      );
    }
    if (result.status === "cleanup-failed") {
      process.stdout.write(
        `${JSON.stringify(sanitizeResultForOutput(result), null, 2)}\n`,
      );
      process.exitCode = CLEANUP_FAILURE_EXIT_CODE;
      return;
    }
    if (result.timedOut) {
      process.stderr.write(
        `Hidden Windows run timed out after ${run.request.timeoutMs}ms and its owned tree was verified stopped (run ${run.request.runId}).\n`,
      );
      process.exitCode = 124;
      return;
    }
    if (typeof result.exitCode === "number") {
      process.exitCode = result.exitCode;
      return;
    }
    process.stderr.write(
      `Hidden Windows child exited by signal ${result.signal || "unknown"} (run ${run.request.runId}).\n`,
    );
    process.exitCode = 1;
  } catch (error) {
    unlinkRequestBestEffort(run);
    throw error;
  }
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`run-hidden-windows: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  SCHEMA_VERSION,
  CLEANUP_FAILURE_EXIT_CODE,
  assertSecretsAbsentFromArgv,
  buildInteropEnvironment,
  buildRequest,
  createRunId,
  fromWindowsPath,
  parseArgs,
  resolvePublicPathOption,
  finalizedIdentityMatches,
  readJsonTransient,
  sanitizeMetadataForOutput,
  sanitizeResultForOutput,
  toWindowsPath,
  validateStopMetadata,
};

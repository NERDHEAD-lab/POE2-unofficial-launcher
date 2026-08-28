#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_RENDERER_TARGET = "http://localhost:54321/";
const DEFAULT_TIMEOUT_MS = 30_000;
const PROFILE_TEMP_ROOT_NAME = "poe2-unofficial-launcher-codex-qa";
const POLL_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withQaRunMarker = (rendererTarget, runId) => {
  const markedTarget = new URL(rendererTarget);
  markedTarget.searchParams.set("codexQaRun", runId);
  return markedTarget.toString();
};
const resolveRunPath = (value) =>
  path.resolve(
    value.replaceAll(
      "{runId}",
      process.env.CODEX_HIDDEN_WINDOWS_RUN_ID || "missing-run-id",
    ),
  );

const resolveQaProfilePath = (
  profilePathTemplate,
  runId,
  cwd = process.cwd(),
  temporaryRoot = os.tmpdir(),
) => {
  const expanded = profilePathTemplate
    ? profilePathTemplate.replaceAll("{runId}", runId)
    : path.join(temporaryRoot, PROFILE_TEMP_ROOT_NAME, runId);
  if (!path.isAbsolute(expanded)) {
    throw new Error("QA profile path must be absolute");
  }
  const profilePath = path.resolve(expanded);
  const workingDirectory = path.resolve(cwd);
  const relative = path.relative(workingDirectory, profilePath);
  const isOutside =
    relative !== "" &&
    (relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative));
  if (!isOutside) {
    throw new Error(
      "QA profile path must be outside the Vite working directory",
    );
  }
  return profilePath;
};

const parseArgs = (argv) => {
  const options = {
    rendererTarget: DEFAULT_RENDERER_TARGET,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    childScript: path.resolve("node_modules/vite/bin/vite.js"),
    childArgs: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${token}`);
      return argv[index];
    };
    if (token === "--ready-file") options.readyFile = resolveRunPath(value());
    else if (token === "--renderer-target") options.rendererTarget = value();
    else if (token === "--profile-path") options.profilePath = value();
    else if (token === "--timeout-ms") options.timeoutMs = Number(value());
    else if (token === "--candidate-port")
      options.candidatePort = Number(value());
    else if (token === "--child-script")
      options.childScript = path.resolve(value());
    else if (token === "--") {
      options.childArgs = argv.slice(index + 1);
      break;
    } else throw new Error(`Unknown option: ${token}`);
  }
  if (!options.readyFile) throw new Error("--ready-file is required");
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  if (
    options.candidatePort !== undefined &&
    (!Number.isSafeInteger(options.candidatePort) ||
      options.candidatePort < 1 ||
      options.candidatePort > 65535)
  ) {
    throw new Error("--candidate-port must be between 1 and 65535");
  }
  return options;
};

const reserveUniquePort = (candidatePort = 0) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      reject(
        new Error(
          `CDP port ${candidatePort || "auto"} is not exclusively available: ${error.code || error.message}`,
        ),
      );
    });
    server.listen(
      { host: "127.0.0.1", port: candidatePort, exclusive: true },
      () => {
        const address = server.address();
        resolve({ server, port: address.port });
      },
    );
  });

const closeServer = (server) =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

const writeReadyFile = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error?.code)) throw error;
    fs.rmSync(filePath, { force: true });
    fs.renameSync(temporaryPath, filePath);
  }
};

const hasExactRendererTarget = async (port, rendererTarget) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return false;
    const targets = await response.json();
    return (
      Array.isArray(targets) &&
      targets.some((target) => target?.url === rendererTarget)
    );
  } catch {
    return false;
  }
};

const waitForOwnedRenderer = async (
  child,
  port,
  target,
  timeoutMs,
  getTerminalState = () => null,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const terminal = getTerminalState();
    if (terminal || child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Owned Vite child exited before renderer readiness (exitCode=${terminal?.exitCode ?? child.exitCode ?? "none"}, signal=${terminal?.signal ?? child.signalCode ?? "none"}, error=${terminal?.error?.message ?? "none"})`,
      );
    }
    if (await hasExactRendererTarget(port, target)) return;
    await sleep(POLL_MS);
  }
  throw new Error(
    `Owned Vite child did not expose exact renderer ${target} on unique port ${port} within ${timeoutMs}ms`,
  );
};

const waitForChildExit = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const runId = process.env.CODEX_HIDDEN_WINDOWS_RUN_ID;
  if (!runId) throw new Error("CODEX_HIDDEN_WINDOWS_RUN_ID is required");
  const ownedRendererTarget = withQaRunMarker(options.rendererTarget, runId);
  const profilePath = resolveQaProfilePath(options.profilePath, runId);

  const reservation = await reserveUniquePort(options.candidatePort);
  fs.mkdirSync(profilePath, { recursive: true });
  await closeServer(reservation.server);

  const child = spawn(
    process.execPath,
    [options.childScript, ...options.childArgs],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ELECTRON_START_HIDDEN: "true",
        ELECTRON_QA_RUN_ID: runId,
        ELECTRON_REMOTE_DEBUGGING_PORT: String(reservation.port),
        ELECTRON_QA_USER_DATA_DIR: profilePath,
      },
      shell: false,
      windowsHide: true,
      stdio: "inherit",
    },
  );
  const exitPromise = waitForChildExit(child);
  let terminalState = null;
  void exitPromise.then(
    (terminal) => {
      terminalState = terminal;
    },
    (error) => {
      terminalState = { error };
    },
  );

  await waitForOwnedRenderer(
    child,
    reservation.port,
    ownedRendererTarget,
    options.timeoutMs,
    () => terminalState,
  );
  writeReadyFile(options.readyFile, {
    schemaVersion: 1,
    runId,
    launcherPid: process.pid,
    childPid: child.pid,
    port: reservation.port,
    rendererTarget: ownedRendererTarget,
    profilePath,
    ownershipMarker: {
      name: "codexQaRun",
      value: runId,
    },
    readyAt: new Date().toISOString(),
  });

  const terminal = await exitPromise;
  if (typeof terminal.exitCode === "number")
    process.exitCode = terminal.exitCode;
  else {
    process.stderr.write(
      `Owned Vite child exited by signal ${terminal.signal || "unknown"}\n`,
    );
    process.exitCode = 1;
  }
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`hidden-electron-launch: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  hasExactRendererTarget,
  parseArgs,
  reserveUniquePort,
  resolveQaProfilePath,
  withQaRunMarker,
};

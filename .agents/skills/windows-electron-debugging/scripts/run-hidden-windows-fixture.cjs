#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { spawn } = require("node:child_process");

const [mode, ...args] = process.argv.slice(2);

if (mode === "echo") {
  const exitCode = Number(args.shift() || 0);
  process.stdout.write(
    `${JSON.stringify({ argv: args, cwd: process.cwd(), explicitEnv: process.env.RUNNER_EXPLICIT_ENV || null })}\n`,
  );
  process.stderr.write("fixture-stderr\n");
  process.exitCode = exitCode;
} else if (mode === "immediate-exit") {
  process.exitCode = Number(args[0] || 0);
} else if (mode === "hold") {
  const readyPath = args[0];
  if (readyPath) {
    fs.writeFileSync(
      readyPath,
      JSON.stringify({ pid: process.pid, parentPid: process.ppid }),
      "utf8",
    );
  }
  process.stdout.write(`hold-ready:${process.pid}\n`);
  setInterval(() => {}, 1000);
} else if (mode === "secret-check") {
  const readyPath = args[0];
  if (readyPath) {
    fs.writeFileSync(
      readyPath,
      JSON.stringify({
        pid: process.pid,
        parentPid: process.ppid,
        secretPresent: Boolean(process.env.RUNNER_SECRET_MARKER),
      }),
      "utf8",
    );
  }
  process.stdout.write(
    `secret-present:${Boolean(process.env.RUNNER_SECRET_MARKER)}\n`,
  );
  setInterval(() => {}, 1000);
} else if (mode === "large-exit") {
  const byteCount = Number(args[0] || 1024 * 1024);
  const stdoutChunk = "o".repeat(byteCount);
  const stderrChunk = "e".repeat(byteCount);
  process.stdout.write(stdoutChunk, () => {
    process.stderr.write(stderrChunk);
  });
} else if (mode === "split-secret") {
  const marker = process.env.RUNNER_SECRET_MARKER;
  if (!marker) throw new Error("split-secret requires RUNNER_SECRET_MARKER");
  const splitAt = Math.max(1, Math.floor(marker.length / 2));
  const emit = async (stream, prefix) => {
    stream.write(`${prefix}${marker.slice(0, splitAt)}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    stream.write(`${marker.slice(splitAt)}:done\n`);
  };
  void Promise.all([
    emit(process.stdout, "stdout:"),
    emit(process.stderr, "stderr:"),
  ]);
} else if (mode === "pid-alive") {
  const pid = Number(args[0]);
  try {
    process.kill(pid, 0);
    process.exitCode = 0;
  } catch {
    process.exitCode = 1;
  }
} else if (mode === "tree") {
  const pidPath = args[0];
  if (!pidPath) throw new Error("tree fixture requires a PID output path");
  const grandchild = spawn(process.execPath, [__filename, "hold"], {
    shell: false,
    windowsHide: true,
    stdio: "ignore",
  });
  fs.writeFileSync(
    pidPath,
    JSON.stringify({ parentPid: process.pid, grandchildPid: grandchild.pid }),
    "utf8",
  );
  setInterval(() => {}, 1000);
} else if (mode === "orphan-exit") {
  const pidPath = args[0];
  const exitDelayMs = Number(args[1] || 0);
  if (!pidPath)
    throw new Error("orphan-exit fixture requires a PID output path");
  const grandchild = spawn(process.execPath, [__filename, "hold"], {
    shell: false,
    windowsHide: true,
    stdio: "ignore",
  });
  fs.writeFileSync(
    pidPath,
    JSON.stringify({ parentPid: process.pid, grandchildPid: grandchild.pid }),
    "utf8",
  );
  grandchild.unref();
  if (exitDelayMs > 0) setTimeout(() => {}, exitDelayMs);
} else {
  throw new Error(`Unknown fixture mode: ${mode || "<missing>"}`);
}

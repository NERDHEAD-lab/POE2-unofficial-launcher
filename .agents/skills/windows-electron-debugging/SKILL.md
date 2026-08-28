---
name: windows-electron-debugging
description: Run any Windows command invisibly from WSL through one owned GUI-bootstrap runner, including Windows tests, lint, typecheck, builds, package commands, long-running processes, Electron launches, CDP inspection, screenshots, log collection, timeout handling, and exact process-tree cleanup. Use whenever an agent in WSL needs Windows execution or must debug or visually verify a Windows Electron GUI without showing or focusing terminals, console hosts, or app windows.
---

# Hidden WSL-to-Windows Execution

Use `scripts/run-hidden-windows.cjs` as the only WSL-facing entrypoint. Never
invoke `pwsh.exe`, `powershell.exe`, `cmd.exe`, Windows `node.exe`, Electron, or
another Windows executable directly from WSL.

The runner creates a request, enters Windows through GUI-subsystem
`wscript.exe //B //NoLogo`, starts its worker hidden, and launches children with
exact argv, `shell: false`, and `windowsHide: true`. Its supervisor creates the
target suspended, assigns it to a kill-on-close Windows Job, then resumes it so
natural root exit cannot orphan descendants. Keep fragile quoting, ownership,
timeout, redaction, and cleanup logic inside the bundled scripts.

## Run a bounded command

Pass a project-selected cwd and an argv array after `--`. Use `@node` for the
hidden worker's Windows Node or `@pwsh` for hidden PowerShell. Use
`--literal-env NAME=VALUE` only for non-secret values that may exist briefly in
the transient request. Use `--env-path` for a non-secret mounted path. Pass
sensitive values only as pre-existing named WSL variables with
`--pass-env NAME`; their values must never appear in CLI arguments or child
argv. The worker consumes named values from its inherited environment, redacts
persisted command data to basename plus an argv fingerprint, and deletes the
transient request before launching the child.

Named pass-through values are exact UTF-8 byte-redacted across output chunks
before logs or sync relay. Never let a child print secrets: transformed,
encoded, or binary representations are opaque and cannot be reliably redacted.

```bash
node <skill>/scripts/run-hidden-windows.cjs sync \
  --cwd <mounted-wsl-project-path> \
  --timeout-ms <bounded-ms> \
  --literal-env MODE=value \
  --pass-env SECRET_NAME \
  -- @node <windows-or-cwd-relative-script> <arg>...
```

The runner relays stdout and stderr separately and exits with the child exit
code. Exit `124` means a timeout whose owned tree was verified stopped. Exit
`125` means cleanup could not verify exact-tree death; treat it as actionable
failure and never claim the process stopped. Cleanup failure emits a structured
result containing cleanup detail and child-liveness evidence. On any runner
failure, diagnose its result/metadata/log artifacts; do not bypass the runner.

## Start a hidden long-running process

Use detached mode. Supply distinct stdout, stderr, and metadata paths. Include
`{runId}` to isolate concurrent runs. Configure an optional generic HTTP(S) or
file readiness probe when the caller needs proof that startup completed.

```bash
node <skill>/scripts/run-hidden-windows.cjs detached \
  --cwd <mounted-wsl-project-path> \
  --stdout <artifact-dir>/{runId}.stdout.log \
  --stderr <artifact-dir>/{runId}.stderr.log \
  --metadata <artifact-dir>/{runId}.metadata.json \
  --ready-url <caller-provided-url> \
  --ready-timeout-ms <bounded-ms> \
  --literal-env MODE=value \
  -- <command> <arg>...
```

Copy the returned WSL `metadataPath` verbatim into stop. Returned cwd/log/
metadata paths are WSL-safe even though internal ownership metadata remains in
Windows form. Record the run ID and child PID. Do not infer readiness merely
from process existence.

## Stop and clean up

Stop only from the metadata returned by detached mode. The runner validates the
schema, run ID, ownership token, metadata path, and known root PID before
requesting graceful then bounded force cleanup of that exact tree.

```bash
node <skill>/scripts/run-hidden-windows.cjs stop \
  --metadata <copy-returned-WSL-metadataPath-verbatim> \
  --timeout-ms <bounded-ms>
```

Never edit metadata, substitute a PID, kill by executable name, or touch an
unrelated process. Preserve requested logs and evidence; remove only artifacts
and temporary profiles owned by the completed run. Accept stop success only
when the result says `cleanup.stopped: true` and
`childAliveAfterCleanup: false` plus `targetAliveAfterCleanup: false` with
matching run/worker/supervisor/target identity; otherwise report cleanup failure.

## Verify Windows Electron

Launch Electron detached with caller-provided hidden-start, isolated user-data,
debugging, and application-specific environment values. Never use a normal user
profile. Use a readiness probe selected by the project, then inspect the owned
stdout/stderr logs before CDP or visual claims.

Run caller-selected CDP or screenshot scripts through sync mode while the
detached owner remains alive. Target the actual Electron renderer, not a mock
browser surface. Report the launcher argv/debug endpoint evidence, selected
target, fatal/runtime events, screenshot path, and relevant owned log excerpts.

Keep Electron hidden unless verification is impossible without visibility. Ask
before showing or focusing it. Stop the detached owner through metadata and
confirm cleanup after capture.

## Validate the runner

Run parser/static tests in WSL first:

```bash
node <skill>/scripts/run-hidden-windows.node-test.cjs
```

Run worker integration tests and the window-visibility probe only through the
public runner. Trust Windows evidence only after the native monitor observes at
least 20 samples over a held workload, no gap above 100 ms, zero visible owned
top-level windows, and zero owned foreground/focus samples. Report owned
console-host PIDs and names as informational evidence; an invisible console host
is not itself a failure.

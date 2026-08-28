#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const [outputPath, durationValue = "2500", intervalValue = "50"] =
  process.argv.slice(2);
const durationMs = Number(durationValue);
const intervalMs = Number(intervalValue);
if (!outputPath) throw new Error("visibility probe requires an output path");
if (!Number.isFinite(durationMs) || durationMs < 2500) {
  throw new Error("visibility probe duration must be at least 2500ms");
}
if (!Number.isFinite(intervalMs) || intervalMs < 20) {
  throw new Error("visibility probe interval must be at least 20ms");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startPowerShell = (script, extraEnv) => {
  const candidates = [
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  ];
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable)
    throw new Error("PowerShell is unavailable for visibility probe");
  const child = spawn(
    executable,
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`visibility probe PowerShell failed: ${stderr.trim()}`),
        );
      } else {
        resolve(JSON.parse(stdout.trim()));
      }
    });
  });
  return { child, completion };
};

const waitForFile = async (filePath, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`visibility monitor did not start within ${timeoutMs}ms`);
    }
    await sleep(20);
  }
};

const waitForExit = (child) =>
  new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once("error", reject);
    child.once("close", resolve);
  });

const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public sealed class ProbeWindow {
  public int pid { get; set; }
  public long hwnd { get; set; }
}

public sealed class ProbeProcess {
  public int pid { get; set; }
  public string name { get; set; }
}

public sealed class ProbeSample {
  public long elapsedMs { get; set; }
  public int[] ownedPids { get; set; }
  public ProbeWindow[] visible { get; set; }
  public int foregroundPid { get; set; }
  public int focusPid { get; set; }
}

public sealed class ProbeResult {
  public string runId { get; set; }
  public int workerPid { get; set; }
  public long durationMs { get; set; }
  public int requestedSampleIntervalMs { get; set; }
  public int sampleCount { get; set; }
  public long firstSampleMs { get; set; }
  public long lastSampleMs { get; set; }
  public long maxGapMs { get; set; }
  public int maxVisibleTopLevelWindowCount { get; set; }
  public int ownedForegroundCount { get; set; }
  public int ownedFocusCount { get; set; }
  public ProbeProcess[] consoleHosts { get; set; }
  public int consoleHostCount { get; set; }
  public ProbeSample[] samples { get; set; }
}

public static class RunnerWindowProbe {
  private const uint TH32CS_SNAPPROCESS = 0x00000002;
  private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct PROCESSENTRY32 {
    public uint dwSize;
    public uint cntUsage;
    public uint th32ProcessID;
    public IntPtr th32DefaultHeapID;
    public uint th32ModuleID;
    public uint cntThreads;
    public uint th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szExeFile;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct RECT {
    public int left;
    public int top;
    public int right;
    public int bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct GUITHREADINFO {
    public uint cbSize;
    public uint flags;
    public IntPtr hwndActive;
    public IntPtr hwndFocus;
    public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner;
    public IntPtr hwndMoveSize;
    public IntPtr hwndCaret;
    public RECT rcCaret;
  }

  private sealed class ProcessEntry {
    public int Pid;
    public int ParentPid;
    public string Name;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32 entry);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32 entry);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr handle);
  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  private static extern bool GetGUIThreadInfo(uint threadId, ref GUITHREADINFO info);

  private static List<ProcessEntry> SnapshotProcesses() {
    var result = new List<ProcessEntry>();
    IntPtr snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    try {
      var entry = new PROCESSENTRY32();
      entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
      if (!Process32FirstW(snapshot, ref entry)) return result;
      do {
        result.Add(new ProcessEntry {
          Pid = (int)entry.th32ProcessID,
          ParentPid = (int)entry.th32ParentProcessID,
          Name = entry.szExeFile ?? ""
        });
        entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
      } while (Process32NextW(snapshot, ref entry));
    } finally {
      CloseHandle(snapshot);
    }
    return result;
  }

  private static HashSet<int> FindOwned(List<ProcessEntry> processes, int rootPid) {
    var owned = new HashSet<int>();
    var queue = new Queue<int>();
    queue.Enqueue(rootPid);
    while (queue.Count > 0) {
      int pid = queue.Dequeue();
      if (!owned.Add(pid)) continue;
      foreach (var process in processes) {
        if (process.ParentPid == pid) queue.Enqueue(process.Pid);
      }
    }
    return owned;
  }

  private static int WindowPid(IntPtr window, out uint threadId) {
    uint pid;
    threadId = GetWindowThreadProcessId(window, out pid);
    return (int)pid;
  }

  public static ProbeResult Run(int rootPid, int durationMs, int intervalMs, string readyPath) {
    var stopwatch = Stopwatch.StartNew();
    var samples = new List<ProbeSample>();
    var consoleHosts = new Dictionary<int, ProbeProcess>();
    int maxVisible = 0;
    int ownedForegroundCount = 0;
    int ownedFocusCount = 0;
    long maxGap = 0;
    long previousSample = -1;

    do {
      long sampleStarted = stopwatch.ElapsedMilliseconds;
      if (previousSample >= 0) maxGap = Math.Max(maxGap, sampleStarted - previousSample);
      previousSample = sampleStarted;
      List<ProcessEntry> processes = SnapshotProcesses();
      HashSet<int> owned = FindOwned(processes, rootPid);
      var visible = new List<ProbeWindow>();
      EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
        uint threadId;
        int pid = WindowPid(hWnd, out threadId);
        if (owned.Contains(pid) && IsWindowVisible(hWnd)) {
          visible.Add(new ProbeWindow { pid = pid, hwnd = hWnd.ToInt64() });
        }
        return true;
      }, IntPtr.Zero);

      foreach (var process in processes) {
        if (!owned.Contains(process.Pid)) continue;
        string name = Path.GetFileNameWithoutExtension(process.Name);
        if (String.Equals(name, "conhost", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(name, "OpenConsole", StringComparison.OrdinalIgnoreCase)) {
          consoleHosts[process.Pid] = new ProbeProcess { pid = process.Pid, name = name };
        }
      }

      int foregroundPid = 0;
      int focusPid = 0;
      IntPtr foreground = GetForegroundWindow();
      uint foregroundThread = 0;
      if (foreground != IntPtr.Zero) {
        foregroundPid = WindowPid(foreground, out foregroundThread);
        if (owned.Contains(foregroundPid)) ownedForegroundCount++;
        var gui = new GUITHREADINFO();
        gui.cbSize = (uint)Marshal.SizeOf(typeof(GUITHREADINFO));
        if (foregroundThread != 0 && GetGUIThreadInfo(foregroundThread, ref gui) &&
            gui.hwndFocus != IntPtr.Zero) {
          uint focusThread;
          focusPid = WindowPid(gui.hwndFocus, out focusThread);
          if (owned.Contains(focusPid)) ownedFocusCount++;
        }
      }

      maxVisible = Math.Max(maxVisible, visible.Count);
      var ownedPids = new int[owned.Count];
      owned.CopyTo(ownedPids);
      Array.Sort(ownedPids);
      samples.Add(new ProbeSample {
        elapsedMs = sampleStarted,
        ownedPids = ownedPids,
        visible = visible.ToArray(),
        foregroundPid = foregroundPid,
        focusPid = focusPid
      });

      if (samples.Count == 1) {
        File.WriteAllText(readyPath, "ready");
      }
      long remaining = intervalMs - (stopwatch.ElapsedMilliseconds - sampleStarted);
      if (remaining > 0) Thread.Sleep((int)remaining);
    } while (stopwatch.ElapsedMilliseconds < durationMs);

    return new ProbeResult {
      runId = Environment.GetEnvironmentVariable("CODEX_HIDDEN_WINDOWS_RUN_ID"),
      workerPid = rootPid,
      durationMs = stopwatch.ElapsedMilliseconds,
      requestedSampleIntervalMs = intervalMs,
      sampleCount = samples.Count,
      firstSampleMs = samples.Count == 0 ? -1 : samples[0].elapsedMs,
      lastSampleMs = samples.Count == 0 ? -1 : samples[samples.Count - 1].elapsedMs,
      maxGapMs = maxGap,
      maxVisibleTopLevelWindowCount = maxVisible,
      ownedForegroundCount = ownedForegroundCount,
      ownedFocusCount = ownedFocusCount,
      consoleHosts = new List<ProbeProcess>(consoleHosts.Values).ToArray(),
      consoleHostCount = consoleHosts.Count,
      samples = samples.ToArray()
    };
  }
}
'@
$result = [RunnerWindowProbe]::Run(
  [int]$env:CODEX_HIDDEN_WINDOWS_WORKER_PID,
  ${Math.trunc(durationMs)},
  ${Math.trunc(intervalMs)},
  $env:RUNNER_VISIBILITY_READY_PATH
)
$result | ConvertTo-Json -Depth 8 -Compress
`;

const absoluteOutputPath = path.resolve(outputPath);
const readyPath = path.join(
  path.dirname(absoluteOutputPath),
  `visibility-ready-${process.pid}-${crypto.randomBytes(4).toString("hex")}`,
);

const run = async () => {
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  const monitor = startPowerShell(script, {
    RUNNER_VISIBILITY_READY_PATH: readyPath,
  });
  let sentinel;
  try {
    await waitForFile(readyPath, 10_000);
    const sentinelDurationMs = Math.max(2000, Math.trunc(durationMs - 300));
    sentinel = spawn(
      process.execPath,
      ["-e", `setTimeout(() => {}, ${sentinelDurationMs})`],
      { shell: false, windowsHide: true, stdio: "ignore" },
    );
    const [result] = await Promise.all([
      monitor.completion,
      waitForExit(sentinel),
    ]);
    fs.writeFileSync(
      absoluteOutputPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (
      result.maxVisibleTopLevelWindowCount !== 0 ||
      result.ownedForegroundCount !== 0 ||
      result.ownedFocusCount !== 0 ||
      result.maxGapMs > 100 ||
      result.sampleCount < 20
    ) {
      process.exitCode = 1;
    }
  } finally {
    fs.rmSync(readyPath, { force: true });
    if (sentinel && sentinel.exitCode === null) {
      sentinel.kill("SIGTERM");
      await waitForExit(sentinel).catch(() => {});
    }
    if (monitor.child.exitCode === null) {
      monitor.child.kill("SIGTERM");
    }
  }
};

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

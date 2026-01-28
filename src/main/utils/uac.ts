import { spawn } from "node:child_process";
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { app } from "electron";

// Registry Keys
const PROTOCOL_KEY = join(
  "HKCR",
  "daumgamestarter",
  "shell",
  "open",
  "command",
);
const BACKUP_KEY_PATH = join("HKCU", "Software", "DaumGames", "POE2", "Backup");
const BACKUP_VALUE_NAME = "OriginalStarterCommand";
const TASK_NAME = "SkipDaumGameStarterUAC";

/**
 * Gets the directory for storing bypass scripts and logs.
 */
function getWorkDirectory(): string {
  const workDir = join(app.getPath("userData"), "uac_bypass");
  if (!existsSync(workDir)) {
    try {
      mkdirSync(workDir, { recursive: true });
    } catch (e) {
      console.error("[UAC] Failed to create work directory:", e);
    }
  }
  return workDir;
}

/**
 * Executes a PowerShell command with Admin privileges (RunAs).
 */
async function runPowerShellAsAdmin(psCommand: string): Promise<boolean> {
  const encodedCommand = Buffer.from(psCommand, "utf16le").toString("base64");
  const wrapper = `Start-Process powershell -Verb RunAs -ArgumentList "-EncodedCommand ${encodedCommand}" -WindowStyle Hidden -Wait`;

  return new Promise((resolve) => {
    const child = spawn("powershell", ["-Command", wrapper], {
      windowsHide: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        console.error(`[UAC] PowerShell failed with code: ${code}`);
        resolve(false);
      }
    });

    child.on("error", (err) => {
      console.error(`[UAC] PowerShell execution error: ${err.message}`);
      resolve(false);
    });
  });
}

/**
 * Reads the current command from the registry.
 */
function getCurrentCommand(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("reg", ["query", PROTOCOL_KEY, "/ve"], {
      windowsHide: true,
    });
    let output = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const match = output.match(/REG_SZ\s+(.*)/);
      if (match && match[1]) {
        resolve(match[1].trim());
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Checks if the bypass is currently applied.
 */
export async function isUACBypassEnabled(): Promise<boolean> {
  const cmd = await getCurrentCommand();
  if (!cmd) return false;
  return cmd.toLowerCase().includes("proxy.vbs");
}

/**
 * Enables the UAC Bypass (Task Scheduler Method).
 */
export async function enableUACBypass(): Promise<boolean> {
  const currentCmd = await getCurrentCommand();
  if (!currentCmd) {
    console.error("[UAC] Could not read DaumGameStarter protocol command.");
    return false;
  }

  if (currentCmd.toLowerCase().includes("proxy.vbs")) {
    console.log("[UAC] UAC bypass is already enabled.");
    return true;
  }

  const workDir = getWorkDirectory();
  const proxyVbsPath = join(workDir, "proxy.vbs");
  const runnerVbsPath = join(workDir, "runner.vbs");
  const argsFilePath = join(workDir, "launch_args.txt");
  const debugLogPath = join(workDir, "uac_debug.log");

  const daumStarterForScript = extractExePath(currentCmd);
  if (!daumStarterForScript) {
    console.error(`[UAC] Could not extract valid exe path: ${currentCmd}`);
    return false;
  }

  // 1. Create runner.vbs (Runs as Admin via Task Scheduler)
  const runnerScriptContent = `
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Read argument from shared file
Set ts = fso.OpenTextFile("${argsFilePath.replaceAll("\\", "\\\\")}", 1)
arg = ts.ReadAll
ts.Close
arg = Trim(arg)

' Execution Log
Set logStream = CreateObject("ADODB.Stream")
logStream.Type = 2
logStream.Charset = "utf-8"
logStream.Open
logStream.WriteText Now & " [Runner] Starting..." & vbCrLf
logStream.WriteText Now & " [Runner] Target Exe: ${daumStarterForScript.replaceAll("\\", "\\\\")}" & vbCrLf
logStream.WriteText Now & " [Runner] Read arg: " & arg & vbCrLf

' Execute real starter
shell.Run """${daumStarterForScript.replaceAll("\\", "\\\\")}"" " & arg, 1, False

If Err.Number <> 0 Then
    logStream.WriteText Now & " [Runner] Error: " & Err.Description & vbCrLf
End If

logStream.SaveToFile "${debugLogPath.replaceAll("\\", "\\\\")}", 2
logStream.Close
`;

  try {
    writeFileSync(runnerVbsPath, runnerScriptContent, { encoding: "utf16le" });
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`[UAC] Failed to create runner script: ${error.message}`);
    return false;
  }

  // 2. Create proxy.vbs (Runs as User, triggers Task)
  const proxyScriptContent = `
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Capture protocol args
If WScript.Arguments.Count > 0 Then
    arg = WScript.Arguments(0)
Else
    arg = ""
End If

' Write arg to shared file
Set ts = fso.CreateTextFile("${argsFilePath.replaceAll("\\", "\\\\")}", True)
ts.WriteLine arg
ts.Close

' Log & Trigger Task (Silent)
Set logStream = CreateObject("ADODB.Stream")
logStream.Type = 2
logStream.Charset = "utf-8"
logStream.Open
logStream.WriteText Now & " [Proxy] Received args: " & arg & vbCrLf
logStream.WriteText Now & " [Proxy] Triggering Task: ${TASK_NAME}" & vbCrLf
logStream.SaveToFile "${debugLogPath.replaceAll("\\", "\\\\")}", 2
logStream.Close

shell.Run "schtasks /run /tn ""${TASK_NAME}""", 0, False
`;

  try {
    writeFileSync(proxyVbsPath, proxyScriptContent, { encoding: "utf16le" });
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`[UAC] Failed to create proxy script: ${error.message}`);
    return false;
  }

  // 3. Backup Registry
  await new Promise((resolve) => {
    const args = [
      "add",
      BACKUP_KEY_PATH,
      "/v",
      BACKUP_VALUE_NAME,
      "/t",
      "REG_SZ",
      "/d",
      currentCmd,
      "/f",
    ];
    const child = spawn("reg", args, { windowsHide: true });
    child.on("close", resolve);
  });

  // 4. Create Task & Update Protocol (Requires Elevation)
  const schCommand = `schtasks /create /tn "${TASK_NAME}" /tr "wscript.exe '${runnerVbsPath}'" /sc ONCE /st 00:00 /rl HIGHEST /f`;
  const newCmd = `wscript.exe "${proxyVbsPath}" "%1"`;
  const regPsScript = `Set-Item -Path "Registry::${PROTOCOL_KEY}" -Value '${newCmd}'`;

  console.log("[UAC] Applying bypass settings (Single UAC Prompt)...");
  const combinedScript = `${schCommand}\nif ($?) { ${regPsScript} } else { exit 1 }`;
  const result = await runPowerShellAsAdmin(combinedScript);

  if (result) {
    console.log("[UAC] Successfully applied bypass.");
  } else {
    console.error("[UAC] Failed to apply bypass.");
  }

  return result;
}

/**
 * Disables the UAC Bypass.
 */
export async function disableUACBypass(): Promise<boolean> {
  const backupCmd = await new Promise<string | null>((resolve) => {
    const child = spawn(
      "reg",
      ["query", BACKUP_KEY_PATH, "/v", BACKUP_VALUE_NAME],
      { windowsHide: true },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const match = out.match(/REG_SZ\s+(.*)/);
      resolve(match ? match[1].trim() : null);
    });
  });

  if (!backupCmd) {
    console.error("[UAC] No backup found. Cannot restore safely.");
    return false;
  }

  const regRestoreScript = `Set-Item -Path "Registry::${PROTOCOL_KEY}" -Value '${backupCmd}'`;
  const taskDeleteScript = `schtasks /delete /tn "${TASK_NAME}" /f`;
  const combinedRestoreScript = `${regRestoreScript}\n${taskDeleteScript}`;

  console.log("[UAC] Restoring original settings...");
  const result = await runPowerShellAsAdmin(combinedRestoreScript);

  if (!result) {
    console.error("[UAC] Failed to restore settings.");
    return false;
  }

  // Cleanup files
  const workDir = getWorkDirectory();
  try {
    ["proxy.vbs", "runner.vbs", "launch_args.txt", "uac_debug.log"].forEach(
      (f) => {
        const p = join(workDir, f);
        if (existsSync(p)) unlinkSync(p);
      },
    );
    console.log("[UAC] Cleanup complete.");
  } catch (e: unknown) {
    const error = e as Error;
    console.warn(`[UAC] Cleanup error: ${error.message}`);
  }

  return true;
}

/**
 * Extracts executable path from command string.
 */
function extractExePath(cmd: string): string | null {
  let exePath = "";

  if (cmd.startsWith('"')) {
    const nextQuote = cmd.indexOf('"', 1);
    if (nextQuote !== -1) {
      exePath = cmd.substring(1, nextQuote);
    }
  } else {
    const firstSpace = cmd.indexOf(" ");
    exePath = firstSpace >= 0 ? cmd.substring(0, firstSpace) : cmd;
  }

  if (exePath && exePath !== "%1" && exePath.toLowerCase().endsWith(".exe")) {
    return exePath;
  }

  const exeMatch = cmd.match(/([A-Z]:\\[^"]+\.exe)/i);
  return exeMatch ? exeMatch[1] : null;
}

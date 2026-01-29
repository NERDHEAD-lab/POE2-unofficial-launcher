import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { app, shell, dialog } from "electron";

import { PowerShellManager } from "./powershell";
import {
  DAUM_STARTER_PROTOCOL_KEY as PROTOCOL_KEY,
  getDaumGameStarterCommand,
} from "./registry";

// Registry Keys
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
 * Checks if the bypass is currently applied.
 */
export async function isUACBypassEnabled(): Promise<boolean> {
  const cmd = await getDaumGameStarterCommand();
  if (!cmd) {
    console.log("[UAC] Bypass check: No protocol command found.");
    return false;
  }
  const isEnabled = cmd.toLowerCase().includes("proxy.vbs");
  console.log(
    `[UAC] Bypass check: ${isEnabled ? "ENABLED" : "DISABLED"} (Current: ${cmd})`,
  );
  return isEnabled;
}

/**
 * Enables the UAC Bypass (Task Scheduler Method).
 */
export async function enableUACBypass(): Promise<boolean> {
  const currentCmd = await getDaumGameStarterCommand();
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

  // 3. Create Task & Update Registry (Requires Elevation)
  const schCommand = `schtasks /create /tn "${TASK_NAME}" /tr "wscript.exe '${runnerVbsPath}'" /sc ONCE /st 00:00 /rl HIGHEST /f`;

  const newCmd = `wscript.exe "${proxyVbsPath}" "%1"`;
  // Using the standardized helper for registry update
  const regUpdateCommand = `Set-Item -Path "${PROTOCOL_KEY}" -Value '${newCmd}' -Force`;

  console.log("[UAC] Applying bypass settings (Single UAC Prompt)...");
  const combinedScript = `
$ErrorActionPreference = "SilentlyContinue"
try {
    Write-Host "Creating Scheduled Task..."
    & ${schCommand}
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) { 
        # schtasks can return 1 for "already exists" which is fine if we use /f, but let's be safe
        # actually /f handles it.
    }

    Write-Host "Updating Registry..."
    ${regUpdateCommand}
    
    Write-Host "SUCCESS_MARKER"
} catch {
    Write-Error "Failed to apply UAC bypass: $_"
    exit 1
}
  `.trim();

  const result = await PowerShellManager.getInstance().execute(
    combinedScript,
    true,
  );
  const success = result.code === 0 && result.stdout.includes("SUCCESS_MARKER");

  if (success) {
    console.log("[UAC] Successfully applied bypass.");
  } else {
    console.error(
      "[UAC] Failed to apply bypass. Output:",
      result.stdout,
      result.stderr,
    );
  }

  return success;
}

/**
 * Disables the UAC Bypass.
 * Instead of restoring registry, it guides user to reinstall DaumGameStarter.
 */
export async function disableUACBypass(): Promise<boolean> {
  // Open the Daum Game Starter download/repair page
  await shell.openExternal(
    "https://gcdn.pcpf.kakaogames.com/static/daum/starter/download.html",
  );

  await dialog.showMessageBox({
    type: "info",
    title: "Daum 게임 스타터 복구 필요",
    message: "Daum 게임 스타터 설치 페이지가 열렸습니다.",
    detail:
      "UAC 우회 기능을 해제하려면, 열린 페이지에서 스타터를 수동으로 다운로드하여 설치(복구)해주세요.",
    buttons: ["확인"],
  });

  console.log(
    "[UAC] Guided user to reinstall DaumGameStarter for restoration.",
  );

  // Cleanup local files and scheduled task
  const workDir = getWorkDirectory();
  try {
    const taskDeleteScript = `schtasks /delete /tn "${TASK_NAME}" /f`;
    await PowerShellManager.getInstance().execute(taskDeleteScript, true);

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

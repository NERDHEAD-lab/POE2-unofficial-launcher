import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
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
 * Returns true ONLY if registry is set AND proxy script exists.
 */
export async function isUACBypassEnabled(): Promise<boolean> {
  const cmd = await getDaumGameStarterCommand();
  if (!cmd) {
    console.log("[UAC] Bypass check: No protocol command found.");
    return false;
  }

  const hasRegistryKey = cmd.toLowerCase().includes("proxy.vbs");
  const workDir = getWorkDirectory();
  const proxyPath = join(workDir, "proxy.vbs");
  const fileExists = existsSync(proxyPath);

  const isEnabled = hasRegistryKey && fileExists;

  console.log(
    `[UAC] Bypass check: ${isEnabled ? "ENABLED" : "DISABLED"} (Reg: ${hasRegistryKey}, File: ${fileExists})`,
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

  const workDir = getWorkDirectory();
  const proxyVbsPath = join(workDir, "proxy.vbs");

  // Check if already fully enabled (Registry + File)
  if (
    currentCmd.toLowerCase().includes("proxy.vbs") &&
    existsSync(proxyVbsPath)
  ) {
    console.log("[UAC] UAC bypass is already enabled and valid.");
    return true;
  }

  const runnerVbsPath = join(workDir, "runner.vbs");
  const argsFilePath = join(workDir, "launch_args.txt");
  const debugLogPath = join(workDir, "uac_debug.log");
  const backupFilePath = join(workDir, "original_command.txt");

  let daumStarterForScript: string | null = null;
  const isCurrentlyBypassed = currentCmd.toLowerCase().includes("proxy.vbs");

  // [New] Backup and Restore Strategy
  if (!isCurrentlyBypassed) {
    // Current is original: Save it
    try {
      // Use standard UTF-8 for backup file
      writeFileSync(backupFilePath, currentCmd, "utf8");
      console.log("[UAC] Backed up original command to:", backupFilePath);
    } catch (e) {
      console.error("[UAC] Failed to write backup file:", e);
    }
    daumStarterForScript = extractExePath(currentCmd);
  } else {
    // Already bypassed: Try to read from backup
    if (existsSync(backupFilePath)) {
      try {
        const backupCmd = readFileSync(backupFilePath, "utf8");
        console.log("[UAC] Using backed up command for extraction.");
        daumStarterForScript = extractExePath(backupCmd);
      } catch (e) {
        console.error("[UAC] Failed to read backup file:", e);
      }
    }
  }

  if (!daumStarterForScript) {
    console.error(
      `[UAC] Could not extract valid exe path from current or backup: ${currentCmd}`,
    );
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
    writeFileSync(runnerVbsPath, runnerScriptContent);
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

shell.Run "schtasks /run /tn """ & "${TASK_NAME}" & """", 0, False
`;

  try {
    writeFileSync(proxyVbsPath, proxyScriptContent);
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`[UAC] Failed to create proxy script: ${error.message}`);
    return false;
  }

  console.log("[UAC] Applying bypass settings (Single UAC Prompt)...");
  // [Fix] Use simpler PowerShell command structure.
  // Avoid complex arrays in literals to reduce quoting errors.
  const combinedScript = `
$ErrorActionPreference = "Stop"
try {
    Write-Output "Creating Task..."
    $runnerPath = '${runnerVbsPath.replaceAll("'", "''")}'
    $tr = "wscript.exe \`"$runnerPath\`""
    
    # [Fix] schtasks might emit a warning about past start time, which Stop preference treats as error.
    # We run it with SilentlyContinue for the specific command or catch it.
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & schtasks.exe /create /tn "${TASK_NAME}" /tr $tr /sc ONCE /st 00:00 /rl HIGHEST /f 2>&1
    $ErrorActionPreference = $oldPreference

    Write-Output "Updating Registry..."
    $val = 'wscript.exe "${proxyVbsPath.replaceAll("'", "''")}" "%1"'
    Set-Item -Path "${PROTOCOL_KEY}" -Value $val -Force
    
    Write-Output "SUCCESS_MARKER"
} catch {
    Write-Output "ERROR_OCCURRED: $($_.Exception.Message)"
}
  `.trim();

  const result = await PowerShellManager.getInstance().execute(
    combinedScript,
    true,
  );
  const success = result.code === 0 && result.stdout.includes("SUCCESS_MARKER");

  if (success) {
    console.log("[UAC] Successfully applied bypass settings.");
  } else {
    console.error(
      "[UAC] Failed to apply bypass settings. Registry might not have been updated.",
    );
    console.error("[UAC] PowerShell Logout STDOUT:", result.stdout);
    console.error("[UAC] PowerShell Logout STDERR:", result.stderr);
  }

  return success;
}

/**
 * Disables the UAC Bypass.
 * Restores the original registry key if backup exists.
 */
export async function disableUACBypass(
  silent: boolean = false,
): Promise<boolean> {
  const workDir = getWorkDirectory();
  const backupFilePath = join(workDir, "original_command.txt");
  let restored = false;

  // 1. Try to restore from backup
  if (existsSync(backupFilePath)) {
    try {
      const originalCmd = readFileSync(backupFilePath, "utf8").trim();

      // [New] Check if the executable in the backup actually exists
      const originalExe = extractExePath(originalCmd);
      if (originalExe && existsSync(originalExe)) {
        console.log("[UAC] Valid backup found. Restoring original command...");

        // [Fix] More robust PowerShell quoting for registry value restoration
        // We use a PowerShell variable to handle the string safely
        const regUpdateCommand = `
          $val = @"
${originalCmd}
"@
          Set-Item -Path "${PROTOCOL_KEY}" -Value $val -Force
          Write-Output "RESTORE_SUCCESS_MARKER"
        `.trim();

        const result = await PowerShellManager.getInstance().execute(
          regUpdateCommand,
          true,
        );

        if (
          result.code === 0 &&
          result.stdout.includes("RESTORE_SUCCESS_MARKER")
        ) {
          console.log("[UAC] Successfully restored original registry key.");
          restored = true;

          // Delete backup file ONLY after successful restoration
          try {
            if (existsSync(backupFilePath)) unlinkSync(backupFilePath);
          } catch (e) {
            console.warn(
              "[UAC] Failed to delete backup file after restore:",
              e,
            );
          }
        }
      } else {
        console.warn(
          "[UAC] Backup exists but target executable is missing or invalid:",
          originalExe,
        );
      }
    } catch (e) {
      console.error("[UAC] Failed to restore from backup:", e);
    }
  }

  if (!restored) {
    // Case 1: Backup missing or target exe lost -> Must reinstall
    console.log("[UAC] Auto-restore impossible. Guiding user to re-install.");
    if (!silent) {
      await shell.openExternal(
        "https://gcdn.pcpf.kakaogames.com/static/daum/starter/download.html",
      );

      await dialog.showMessageBox({
        type: "info",
        title: "Daum 게임 스타터 복구 필요",
        message: "UAC 우회 기능을 원복하는 중 문제가 발생했습니다.",
        detail:
          "열린 페이지에서 스타터를 수동으로 다운로드하여 설치(복구)해 주시거나, 재설치를 진행해 주세요.",
        buttons: ["확인"],
      });
    }
  } else {
    if (!silent) {
      await dialog.showMessageBox({
        type: "info",
        title: "UAC 우회 비활성화 완료",
        message: "UAC 우회 기능이 비활성화되고 원본 설정으로 복구되었습니다.",
        buttons: ["확인"],
      });
    }
  }

  // Cleanup local files and scheduled task
  try {
    const taskDeleteScript = `schtasks /delete /tn "${TASK_NAME}" /f`;
    await PowerShellManager.getInstance().execute(taskDeleteScript, true);

    [
      "proxy.vbs",
      "runner.vbs",
      "launch_args.txt",
      "uac_debug.log",
      // original_command.txt is handled above only on success
    ].forEach((f) => {
      const p = join(workDir, f);
      if (existsSync(p)) unlinkSync(p);
    });
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
    // [Fix] Never extract wscript.exe as the target game starter!
    // This happens when the bypass is already active and we try to re-enable/read the registry.
    if (exePath.toLowerCase().includes("wscript.exe")) {
      return null;
    }
    return exePath;
  }

  const exeMatch = cmd.match(/([A-Z]:\\[^"]+\.exe)/i);
  if (exeMatch && !exeMatch[1].toLowerCase().includes("wscript.exe")) {
    return exeMatch[1];
  }
  return null;
}

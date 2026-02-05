import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";

import { app, shell, dialog } from "electron";

import { logger } from "./logger";
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
      logger.error("[UAC] Failed to create work directory:", e);
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
    logger.log("[UAC] Bypass check: No protocol command found.");
    return false;
  }

  const hasRegistryKey = cmd.toLowerCase().includes("proxy.vbs");
  const workDir = getWorkDirectory();
  const proxyPath = join(workDir, "proxy.vbs");
  const fileExists = existsSync(proxyPath);

  const isEnabled = hasRegistryKey && fileExists;

  logger.log(
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
    logger.error("[UAC] Could not read DaumGameStarter protocol command.");
    return false;
  }

  const workDir = getWorkDirectory();
  const proxyVbsPath = join(workDir, "proxy.vbs");

  // Check if already fully enabled (Registry + File)
  if (
    currentCmd.toLowerCase().includes("proxy.vbs") &&
    existsSync(proxyVbsPath)
  ) {
    logger.log("[UAC] UAC bypass is already enabled and valid.");
    return true;
  }

  const runnerVbsPath = join(workDir, "runner.vbs");
  const argsFilePath = join(workDir, "launch_args.txt");
  const debugLogPath = join(workDir, "uac_debug.log");
  const backupFilePath = join(workDir, "original_command.txt");

  let daumStarterForScript: string | null = null;
  const isCurrentlyBypassed = currentCmd.toLowerCase().includes("proxy.vbs");

  // Backup and Restore Strategy
  if (!isCurrentlyBypassed) {
    // Current is original: Save it
    try {
      // Use standard UTF-8 for backup file
      writeFileSync(backupFilePath, currentCmd, "utf8");
      logger.log("[UAC] Backed up original command to:", backupFilePath);
    } catch (e) {
      logger.error("[UAC] Failed to write backup file:", e);
    }
    daumStarterForScript = extractExePath(currentCmd);
  } else {
    // Already bypassed: Try to read from backup
    if (existsSync(backupFilePath)) {
      try {
        const backupCmd = readFileSync(backupFilePath, "utf8");
        logger.log("[UAC] Using backed up command for extraction.");
        daumStarterForScript = extractExePath(backupCmd);
      } catch (e) {
        logger.error("[UAC] Failed to read backup file:", e);
      }
    }
  }

  if (!daumStarterForScript) {
    logger.error(
      `[UAC] Could not extract valid exe path from current or backup: ${currentCmd}`,
    );
    return false;
  }

  // 1. Create runner.vbs (Runs as Admin via Task Scheduler)
  const runnerScriptContent = `\ufeff
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Read argument from shared file
Set ts = fso.OpenTextFile("${argsFilePath}", 1)
arg = ts.ReadAll
ts.Close
arg = Trim(arg)

' Execution Log
Set logStream = CreateObject("ADODB.Stream")
logStream.Type = 2
logStream.Charset = "utf-8"
logStream.Open
logStream.WriteText Now & " [Runner] Starting..." & vbCrLf
logStream.WriteText Now & " [Runner] Target Exe: ${daumStarterForScript}" & vbCrLf
logStream.WriteText Now & " [Runner] Read arg: " & arg & vbCrLf

' Execute real starter
shell.Run """${daumStarterForScript}"" " & arg, 1, False

If Err.Number <> 0 Then
    logStream.WriteText Now & " [Runner] Error: " & Err.Description & vbCrLf
End If

logStream.SaveToFile "${debugLogPath}", 2
logStream.Close
`.trim();

  try {
    // Use UTF-16 LE with BOM for VBScript. WSH chokes on UTF-8 BOM as "Invalid character".
    // Prepend BOM and use utf16le encoding.
    writeFileSync(runnerVbsPath, "\ufeff" + runnerScriptContent, {
      encoding: "utf16le",
    });
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`[UAC] Failed to create runner script: ${error.message}`);
    return false;
  }

  // 2. Create proxy.vbs (Runs as User, triggers Task)
  const proxyScriptContent = `\ufeff
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Capture protocol args
If WScript.Arguments.Count > 0 Then
    arg = WScript.Arguments(0)
Else
    arg = ""
End If

' Write arg to shared file
Set ts = fso.CreateTextFile("${argsFilePath}", True)
ts.WriteLine arg
ts.Close

' Log & Trigger Task (Silent)
Set logStream = CreateObject("ADODB.Stream")
logStream.Type = 2
logStream.Charset = "utf-8"
logStream.Open
logStream.WriteText Now & " [Proxy] Received args: " & arg & vbCrLf
logStream.WriteText Now & " [Proxy] Triggering Task: ${TASK_NAME}" & vbCrLf
logStream.SaveToFile "${debugLogPath}", 2
logStream.Close

shell.Run "schtasks /run /tn """ & "${TASK_NAME}" & """", 0, False
`.trim();

  try {
    // [Fix] Use UTF-16 LE with BOM for VBScript. WSH chokes on UTF-8 BOM as "Invalid character".
    // Prepend BOM and use utf16le encoding.
    writeFileSync(proxyVbsPath, "\ufeff" + proxyScriptContent, {
      encoding: "utf16le",
    });
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`[UAC] Failed to create proxy script: ${error.message}`);
    return false;
  }

  logger.log("[UAC] Applying bypass settings (Single UAC Prompt)...");
  // Use simpler PowerShell command structure.
  // Avoid complex arrays in literals to reduce quoting errors.
  const combinedScript = `
$ErrorActionPreference = "Stop"
try {
    Write-Output "Creating Task..."
    $runnerPath = '${runnerVbsPath.replaceAll("'", "''")}'
    $trArg = 'wscript.exe \\"{0}\\"' -f $runnerPath
    
    # Relax error preference for schtasks because it emits a warning for past time (/ST 00:00)
    # which 'Stop' treats as a fatal exception.
    $oldPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & schtasks.exe /create /tn "${TASK_NAME}" /tr $trArg /sc ONCE /st 00:00 /rl HIGHEST /f 2>&1
    $ErrorActionPreference = $oldPref
    
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Updating Registry..."
        
        # Target HKCU explicitly. HKCR is a merged view and writing to it is unreliable.
        $hkcuPath = "Registry::HKEY_CURRENT_USER\\Software\\Classes\\daumgamestarter\\shell\\open\\command"
        $proxyPath = '${proxyVbsPath.replaceAll("'", "''")}'
        $val = 'wscript.exe "{0}" "%1"' -f $proxyPath
        
        Write-Output "Target Key: $hkcuPath"
        Write-Output "Target Val: $val"

        # Ensure path exists
        if (-not (Test-Path $hkcuPath)) {
            New-Item -Path $hkcuPath -Force | Out-Null
        }

        try {
            Set-Item -Path $hkcuPath -Value $val -Force -ErrorAction Stop
            
            # Verify
            $verifyVal = (Get-Item -Path $hkcuPath).GetValue("")
            Write-Output "Verification: $verifyVal"
            
            if ($verifyVal -eq $val) {
                Write-Output "SUCCESS_MARKER"
            } else {
                Write-Output "ERROR_REGISTRY_MISMATCH"
            }
        } catch {
            Write-Output "ERROR_REGISTRY_WRITE: $($_.Exception.Message)"
        }
    } else {
        Write-Output "ERROR_SCHTASKS: $out"
    }
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
    logger.log("[UAC] Successfully applied bypass settings.");
    // Create standalone cleanup script for Uninstaller
    const originalCmd = readFileSync(backupFilePath, "utf8").trim();
    createCleanupScript(originalCmd);
  } else {
    logger.error(
      "[UAC] Failed to apply bypass settings. Registry might not have been updated.",
    );
    logger.error("[UAC] PowerShell Logout STDOUT:", result.stdout);
    logger.error("[UAC] PowerShell Logout STDERR:", result.stderr);
  }

  return success;
}

/**
 * Creates a standalone batch file to cleanup UAC settings.
 * This is called by the NSIS uninstaller.
 */
function createCleanupScript(originalCmd: string): void {
  const workDir = getWorkDirectory();
  const batPath = join(workDir, "uninstall_uac.bat");

  // Escape special characters for Batch/PowerShell
  // We strictly need to restore the registry value.
  const escapedCmd = originalCmd
    .replaceAll('"', '\\"')
    .replace(/\r?\n/g, "") // Single line
    .replace(/%/g, "%%"); // Escape % to %% for Batch file execution

  const batContent = `\ufeff
@echo off
chcp 65001 >nul

:: Check for permissions
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run
)

:: Re-launch as admin with Wait
echo Requesting admin privileges...
powershell -Command "Start-Process -FilePath '%comspec%' -ArgumentList '/c', '\\"%~f0\\"' -Verb RunAs -Wait"
exit /b

:run
:: 1. Delete Schedule Task
schtasks /delete /tn "${TASK_NAME}" /f >nul 2>&1

:: 2. Restore Registry (via PowerShell for safety)
:: Use double single-quotes for PowerShell string if needed
powershell -NoProfile -ExecutionPolicy Bypass -Command "$val = '${escapedCmd.replaceAll("'", "''")}'; Set-Item -Path '${PROTOCOL_KEY}' -Value $val -Force" >nul 2>&1
  `.trim();

  try {
    // Batch files (.bat) don't support UTF-16 well, and UTF-8 BOM can cause syntax errors
    // in the first command for some CMD environments. Use plain UTF-8 (without BOM).
    writeFileSync(batPath, batContent, { encoding: "utf8" });
    logger.log("[UAC] Created cleanup script at:", batPath);
  } catch (e) {
    logger.error("[UAC] Failed to create cleanup script:", e);
  }
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

      // Check if the executable in the backup actually exists
      const originalExe = extractExePath(originalCmd);
      if (originalExe && existsSync(originalExe)) {
        logger.log("[UAC] Valid backup found. Restoring original command...");

        // More robust PowerShell quoting for registry value restoration
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
          logger.log("[UAC] Successfully restored original registry key.");
          restored = true;

          // Delete backup file ONLY after successful restoration
          try {
            if (existsSync(backupFilePath)) unlinkSync(backupFilePath);
          } catch (e) {
            logger.warn("[UAC] Failed to delete backup file after restore:", e);
          }
        }
      } else {
        logger.warn(
          "[UAC] Backup exists but target executable is missing or invalid:",
          originalExe,
        );
      }
    } catch (e) {
      logger.error("[UAC] Failed to restore from backup:", e);
    }
  }

  if (!restored) {
    // Case 1: Backup missing or target exe lost -> Must reinstall
    logger.log("[UAC] Auto-restore impossible. Guiding user to re-install.");
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
      "uninstall_uac.bat", // Clean up the helper script too
      // original_command.txt is handled above only on success
    ].forEach((f) => {
      const p = join(workDir, f);
      if (existsSync(p)) unlinkSync(p);
    });
    logger.log("[UAC] Cleanup complete.");
  } catch (e: unknown) {
    const error = e as Error;
    logger.warn(`[UAC] Cleanup error: ${error.message}`);
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
    // Never extract wscript.exe as the target game starter!
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

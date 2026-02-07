/**
 * DaumGameStarterFeature.ts
 *
 * [목적]
 * 카카오 게임즈에서 패스 오브 엑자일(PoE, PoE2) 실행 시 사용하는 'daumgamestarter://' 프로토콜 호출을 가로챕니다.
 * 일반적인 실행 시 발생하는 UAC(사용자 계정 컨트롤) 승인 창을 우회하기 위해,
 * '작업 스케줄러'에 관리자 권한으로 등록된 작업을 프록시(VBScript)를 통해 트리거하는 방식으로 관리자 권한 실행을 중계합니다.
 *
 * [동작 메커니즘]
 * 1. 브라우저가 'daumgamestarter://' 호출 -> 레지스트리에 등록된 'proxy.vbs' 실행 (사용자 권한)
 * 2. 'proxy.vbs'가 전달된 인자를 'launch_args.txt'에 저장 후 스케줄러 작업 트리거
 * 3. 스케줄러가 'runner.vbs' 실행 (관리자 권한)
 * 4. 'runner.vbs'가 'launch_args.txt'에서 인자를 읽어 실제 'DaumGameStarter.exe' 실행
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "fs";
import { join } from "path";

import { app, shell, dialog } from "electron";

import { logger } from "../../logger";
import { PowerShellManager } from "../../powershell";
import { updateUninstallScript } from "../manager";
import { UacFeature } from "../types";

const PROTOCOL_KEY =
  "HKCU:\\Software\\Classes\\daumgamestarter\\shell\\open\\command";
const TASK_NAME = "SkipDaumGameStarterUAC"; // 원본 작업명 복구

export const DaumGameStarterFeature: UacFeature & {
  enableWithExe(
    workDir: string,
    originalExe: string,
    originalCmd: string,
  ): Promise<boolean>;
} = {
  async isEnabled(): Promise<boolean> {
    try {
      const result = await PowerShellManager.getInstance().execute(
        `Get-ItemProperty -Path "${PROTOCOL_KEY}" -Name "(default)" | Select-Object -ExpandProperty "(default)"`,
        false,
      );
      if (result.code !== 0 || !result.stdout) return false;

      const workDir = getWorkDirectory();
      const proxyPath = join(workDir, "proxy.vbs");
      return result.stdout.includes("proxy.vbs") && existsSync(proxyPath);
    } catch {
      return false;
    }
  },

  async enable(): Promise<boolean> {
    const workDir = getWorkDirectory();
    try {
      // 1. Get Current Command
      const result = await PowerShellManager.getInstance().execute(
        `Get-ItemProperty -Path "${PROTOCOL_KEY}" -Name "(default)" | Select-Object -ExpandProperty "(default)"`,
        false,
      );

      if (result.code !== 0 || !result.stdout.trim()) {
        logger.error("[DaumGameStarter] Failed to read original registry key.");
        return false;
      }

      const currentCmd = result.stdout.trim();
      const proxyVbsPath = join(workDir, "proxy.vbs");

      // Skip if already fully enabled
      if (
        currentCmd.toLowerCase().includes("proxy.vbs") &&
        existsSync(proxyVbsPath)
      ) {
        logger.log("[DaumGameStarter] UAC Bypass is already active and valid.");
        return true;
      }

      const originalExe = extractExePath(currentCmd);

      if (!originalExe || !existsSync(originalExe)) {
        // If already bypassed, try reading from backup
        const backupFilePath = join(workDir, "original_command.txt");
        if (
          currentCmd.toLowerCase().includes("proxy.vbs") &&
          existsSync(backupFilePath)
        ) {
          try {
            const backupCmd = readFileSync(backupFilePath, "utf8").trim();
            const backupExe = extractExePath(backupCmd);
            if (backupExe && existsSync(backupExe)) {
              return this.enableWithExe(workDir, backupExe, backupCmd);
            }
          } catch (e) {
            logger.error("[DaumGameStarter] Failed to read backup command:", e);
          }
        }
        logger.error(
          `[DaumGameStarter] Original executable not found or invalid. (Path: ${originalExe})`,
        );
        return false;
      }

      return this.enableWithExe(workDir, originalExe, currentCmd);
    } catch (e) {
      logger.error("[DaumGameStarter] Failed to enable UAC bypass:", e);
      return false;
    }
  },

  async enableWithExe(
    workDir: string,
    originalExe: string,
    originalCmd: string,
  ): Promise<boolean> {
    const backupFilePath = join(workDir, "original_command.txt");
    const isCurrentlyBypassed = originalCmd.toLowerCase().includes("proxy.vbs");

    // Only backup if not already bypassed
    if (!isCurrentlyBypassed && !existsSync(backupFilePath)) {
      try {
        writeFileSync(backupFilePath, originalCmd, { encoding: "utf8" });
        logger.log(
          "[DaumGameStarter] Created backup of original registry command.",
        );
      } catch (e) {
        logger.error("[DaumGameStarter] Failed to save backup command:", e);
      }
    }

    // 2. Create Scripts (AS-IS Logic)
    createProxyScripts(workDir, originalExe);

    // 3. Register Task & Update Registry
    const proxyVbsPath = join(workDir, "proxy.vbs");
    const runnerVbsPath = join(workDir, "runner.vbs");

    const combinedScript = `
      $ErrorActionPreference = "Stop"
      try {
          Write-Output "Creating Task..."
          $runnerPath = '${runnerVbsPath.replaceAll("'", "''")}'
          $trArg = 'wscript.exe \\"{0}\\"' -f $runnerPath
          
          $oldPref = $ErrorActionPreference
          $ErrorActionPreference = "Continue"
          $out = & schtasks.exe /create /tn "${TASK_NAME}" /tr $trArg /sc ONCE /st 00:00 /rl HIGHEST /f 2>&1
          $ErrorActionPreference = $oldPref

          if ($LASTEXITCODE -eq 0) {
              Write-Output "Updating Registry..."
              $hkcuPath = "Registry::HKEY_CURRENT_USER\\Software\\Classes\\daumgamestarter\\shell\\open\\command"
              $proxyPath = '${proxyVbsPath.replaceAll("'", "''")}'
              $val = 'wscript.exe "{0}" "%1"' -f $proxyPath

              if (-not (Test-Path $hkcuPath)) {
                  New-Item -Path $hkcuPath -Force | Out-Null
              }

              Set-Item -Path $hkcuPath -Value $val -Force -ErrorAction Stop
              
              $verifyVal = (Get-Item -Path $hkcuPath).GetValue("")
              if ($verifyVal -eq $val) {
                  Write-Output "SUCCESS_MARKER"
              }
          }
      } catch {
          Write-Output "ERROR: $($_.Exception.Message)"
      }
    `.trim();

    const updateResult = await PowerShellManager.getInstance().execute(
      combinedScript,
      true,
    );

    if (
      updateResult.code === 0 &&
      updateResult.stdout.includes("SUCCESS_MARKER")
    ) {
      logger.log("[DaumGameStarter] UAC Bypass enabled successfully.");
      await updateUninstallScript();
      return true;
    } else {
      logger.error(
        `[DaumGameStarter] Failed to enable: ${updateResult.stdout}`,
      );
      return false;
    }
  },

  async disable(silent: boolean = false): Promise<boolean> {
    const workDir = getWorkDirectory();
    const backupFilePath = join(workDir, "original_command.txt");
    let restored = false;

    if (existsSync(backupFilePath)) {
      try {
        const originalCmd = readFileSync(backupFilePath, "utf8").trim();
        const originalExe = extractExePath(originalCmd);
        if (originalExe && existsSync(originalExe)) {
          const escapedCmd = originalCmd.replaceAll("'", "''");
          const regUpdateCommand = `
            $val = '${escapedCmd}'
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
            restored = true;
            if (existsSync(backupFilePath)) unlinkSync(backupFilePath);
          }
        }
      } catch (e) {
        logger.error(
          "[DaumGameStarter] Failed to restore original settings:",
          e,
        );
      }
    }

    if (!restored) {
      // [Restore AS-IS UI Logic] 안내 페이지 오픈 및 다이얼로그 가이드
      logger.log(
        "[DaumGameStarter] Auto-restore impossible. Guiding user to re-install.",
      );
      if (!silent) {
        shell.openExternal(
          "https://gcdn.pcpf.kakaogames.com/static/daum/starter/download.html",
        );

        dialog.showMessageBox({
          type: "info",
          title: "Daum 게임 스타터 복구 필요",
          message: "UAC 우회 기능을 복구하는 중에 문제가 발생했습니다.",
          detail:
            "원래의 레지스트리 백업을 찾을 수 없거나 실행 파일이 유실되었습니다.\n열린 페이지에서 스타터를 수동으로 다운로드하여 재설치해주시기 바랍니다.",
          buttons: ["확인"],
        });
      }
    }

    // Cleanup Everything (AS-IS)
    try {
      await PowerShellManager.getInstance().execute(
        `schtasks /delete /tn "${TASK_NAME}" /f`,
        true,
      );
      [
        "proxy.vbs",
        "runner.vbs",
        "launch_args.txt",
        "uac_debug.log",
        "uninstall_uac.bat",
      ].forEach((f) => {
        const p = join(workDir, f);
        if (existsSync(p)) unlinkSync(p);
      });
      logger.log("[DaumGameStarter] Bypass disabled and cleaned up.");
    } catch {
      /* ignore */
    }

    await updateUninstallScript();
    return true;
  },

  async getCleanupCommands(): Promise<string[]> {
    const workDir = getWorkDirectory();
    const backupFilePath = join(workDir, "original_command.txt");

    if (existsSync(backupFilePath)) {
      try {
        const originalCmd = readFileSync(backupFilePath, "utf8").trim();
        // Escape for batch/powershell combined
        const escapedCmd = originalCmd
          .replaceAll('"', '\\"')
          .replace(/\r?\n/g, "")
          .replace(/%/g, "%%");

        return [
          `:: Restore Registry (DaumGameStarter)`,
          `schtasks /delete /tn "${TASK_NAME}" /f >nul 2>&1`,
          `powershell -NoProfile -ExecutionPolicy Bypass -Command "$val = '${escapedCmd.replaceAll("'", "''")}'; Set-Item -Path '${PROTOCOL_KEY}' -Value $val -Force" >nul 2>&1`,
        ];
      } catch {
        return [];
      }
    }
    return [];
  },
};

// --- Helpers ---

function getWorkDirectory(): string {
  const workDir = join(app.getPath("userData"), "uac_bypass");
  if (!existsSync(workDir)) {
    try {
      mkdirSync(workDir, { recursive: true });
    } catch (e) {
      logger.error("[DaumGameStarter] Failed to create work directory:", e);
    }
  }
  return workDir;
}

function extractExePath(cmdIdx: string): string | null {
  let exePath = "";
  if (cmdIdx.startsWith('"')) {
    const nextQuote = cmdIdx.indexOf('"', 1);
    if (nextQuote !== -1) exePath = cmdIdx.substring(1, nextQuote);
  } else {
    const firstSpace = cmdIdx.indexOf(" ");
    exePath = firstSpace >= 0 ? cmdIdx.substring(0, firstSpace) : cmdIdx;
  }

  if (exePath && exePath !== "%1" && exePath.toLowerCase().endsWith(".exe")) {
    // SECURITY: Reject wscript.exe
    if (exePath.toLowerCase().includes("wscript.exe")) return null;
    return exePath;
  }

  // Fallback regex
  const exeMatch = cmdIdx.match(/([A-Z]:\\[^"]+\.exe)/i);
  if (exeMatch && !exeMatch[1].toLowerCase().includes("wscript.exe")) {
    return exeMatch[1];
  }
  return null;
}

function createProxyScripts(workDir: string, originalExe: string) {
  const proxyPath = join(workDir, "proxy.vbs");
  const runnerPath = join(workDir, "runner.vbs");
  const argsFilePath = join(workDir, "launch_args.txt");
  const debugLogPath = join(workDir, "uac_debug.log");

  // 1. Create runner.vbs (Runs as Admin via Task Scheduler)
  const runnerContent = `\ufeff
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Read argument from shared file
Set ts = fso.OpenTextFile("${argsFilePath}", 1)
arg = ts.ReadAll
ts.Close
arg = Trim(arg)

' Execution Log (AS-IS)
Set logStream = CreateObject("ADODB.Stream")
logStream.Type = 2
logStream.Charset = "utf-8"
logStream.Open
logStream.WriteText Now & " [Runner] Starting..." & vbCrLf
logStream.WriteText Now & " [Runner] Target Exe: ${originalExe}" & vbCrLf
logStream.WriteText Now & " [Runner] Read arg: " & arg & vbCrLf

' Execute real starter
shell.Run """${originalExe}"" " & arg, 1, False

If Err.Number <> 0 Then
    logStream.WriteText Now & " [Runner] Error: " & Err.Description & vbCrLf
End If

logStream.SaveToFile "${debugLogPath}", 2
logStream.Close
`.trim();

  // 2. Create proxy.vbs (Runs as User, triggers Task)
  const proxyContent = `\ufeff
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

' Log & Trigger Task (Silent AS-IS)
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

  // Use UTF-16 LE with BOM (utf16le in node)
  writeFileSync(proxyPath, "\ufeff" + proxyContent, { encoding: "utf16le" });
  writeFileSync(runnerPath, "\ufeff" + runnerContent, { encoding: "utf16le" });
}

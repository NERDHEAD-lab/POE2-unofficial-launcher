import { spawn, ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";

import { Logger } from "./logger";
import {
  FONT_FORCE_APPLY_TARGETS,
  normalizeFontForceApplyState,
} from "../../shared/font-force-apply";
import { AppContext } from "../events/types";

import type { FontForceApplyPolicy } from "../../shared/types";

export class UACDeniedException extends Error {
  constructor(message = "관리자 권한 요청이 사용자에 의해 취소되었습니다.") {
    super(message);
    this.name = "UACDeniedException";
  }
}

const POWERSHELL_BLOCKED_GUIDANCE =
  "PowerShell 실행이 Windows에 의해 거부되었거나 명령이 보안 정책으로 차단되었습니다. 백신/EDR 또는 Windows 보안 정책(AppLocker, WDAC, 그룹 정책, Defender ASR 등)이 원인일 수 있습니다.";

type ProcessError = Error & {
  code?: string | number;
};

type PowerShellBlockedReasonContext = "spawn" | "command";

export class PowerShellBlockedException extends Error {
  public commandSubmitted = false;

  constructor(reason: string, cause?: unknown) {
    super(`${POWERSHELL_BLOCKED_GUIDANCE} 원본 오류: ${reason}`);
    this.name = "PowerShellBlockedException";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const isPowerShellBlockedReason = (
  reason: unknown,
  context: PowerShellBlockedReasonContext = "spawn",
): boolean => {
  const code =
    typeof reason === "object" && reason !== null && "code" in reason
      ? String((reason as ProcessError).code).toUpperCase()
      : "";
  if (code === "EPERM" || code === "EACCES") return true;

  const text = formatUnknownError(reason).toLowerCase();
  const isExplicitPolicyBlock =
    text.includes("blocked by group policy") ||
    text.includes("blocked by your system administrator") ||
    text.includes("disabled on this system") ||
    text.includes("running scripts is disabled") ||
    text.includes("그룹 정책") ||
    text.includes("시스템 관리자") ||
    text.includes("스크립트를 실행할 수 없");
  if (isExplicitPolicyBlock) return true;

  if (context === "command") return false;

  return (
    text.includes("eperm") ||
    text.includes("eacces") ||
    text.includes("access is denied") ||
    text.includes("access denied") ||
    text.includes("permission denied") ||
    text.includes("operation not permitted") ||
    text.includes("unauthorizedaccessexception") ||
    text.includes("액세스가 거부")
  );
};

const createPowerShellBlockedException = (
  reason: unknown,
  cause?: unknown,
): PowerShellBlockedException => {
  return new PowerShellBlockedException(formatUnknownError(reason), cause);
};

interface PSResult {
  stdout: string;
  stderr: string;
  code: number | null;
  /** Present only when failure is proven to precede socket submission. */
  notSubmitted?: true;
}

interface IPCRequest {
  id: string;
  command: string;
}

interface IPCResponse {
  id: string;
  stdout: string;
  stderr: string;
  code?: number | null;
  error?: string;
}

interface SessionState {
  server: net.Server | null;
  socket: net.Socket | null;
  process: ChildProcess | null;
  pendingRequests: Map<string, (res: PSResult) => void>;
  pipePath: string | null;
  initializing: Promise<void> | null;
  rejectInit?: (reason: unknown) => void;
}

const quotePowerShellString = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`;

const quotePowerShellArray = (values: string[]): string =>
  `@(${values.map(quotePowerShellString).join(", ")})`;

const buildDeferredFontCleanupFunctions = (): string => `
  function Remove-Or-DeferFontFile([string]$fontPath) {
    if ([string]::IsNullOrWhiteSpace($fontPath) -or -not (Test-Path $fontPath)) { return }
    try {
      Remove-Item -LiteralPath $fontPath -Force -ErrorAction Stop
    } catch {
      $MOVEFILE_DELAY_UNTIL_REBOOT = 0x4
      $scheduled = $Win32API::MoveFileEx($fontPath, $null, $MOVEFILE_DELAY_UNTIL_REBOOT)
      if ($scheduled) {
        Write-Output "Scheduled font cleanup after reboot: $fontPath"
        return
      }

      $nativeError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      try {
        Add-PendingDeleteRegistry $fontPath $nativeError
      } catch {
        Write-Output "Failed to schedule font cleanup after reboot: $fontPath (MoveFileEx=$nativeError, Registry=$($_.Exception.Message))"
      }
    }
  }

  function Add-PendingDeleteRegistry([string]$fontPath, [int]$moveFileError) {
    $sessionManagerPath = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager"
    $pendingName = "PendingFileRenameOperations"
    $deletePath = if ($fontPath.StartsWith("\\??\\")) { $fontPath } else { "\\??\\$fontPath" }

    $prop = Get-ItemProperty -Path $sessionManagerPath -Name $pendingName -ErrorAction SilentlyContinue
    $pending = @()
    if ($prop -and $null -ne $prop.$pendingName) {
      $pending = @($prop.$pendingName)
    }

    $alreadyScheduled = $false
    for ($i = 0; $i -lt $pending.Count; $i += 2) {
      $source = $pending[$i]
      $destination = if ($i + 1 -lt $pending.Count) { $pending[$i + 1] } else { "" }
      if ($source -ieq $deletePath -and [string]::IsNullOrEmpty($destination)) {
        $alreadyScheduled = $true
        break
      }
    }

    if (-not $alreadyScheduled) {
      $pending = @($pending) + $deletePath + ""
    }

    if ($prop) {
      Set-ItemProperty -Path $sessionManagerPath -Name $pendingName -Value ([string[]]$pending)
    } else {
      New-ItemProperty -Path $sessionManagerPath -Name $pendingName -PropertyType MultiString -Value ([string[]]$pending) -Force | Out-Null
    }

    Write-Output "Scheduled font cleanup after reboot via registry fallback: $fontPath (MoveFileEx=$moveFileError)"
  }
`;

export const buildInstallSystemFontScript = (
  ttfFilePath: string,
  targetFontName: string,
  ttfFileName: string,
): string => {
  const apiClassName = `Win32FontAPIInstall${randomUUID().replace(/-/g, "")}`;

  return `
try {
  $sourcePath = ${quotePowerShellString(ttfFilePath)}
  $targetFontName = ${quotePowerShellString(targetFontName)}
  $requestedFileName = ${quotePowerShellString(ttfFileName)}
  $fontDir = Join-Path $env:windir "Fonts"
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($requestedFileName)
  $extension = [System.IO.Path]::GetExtension($requestedFileName)
  $sourceHash = (Get-FileHash -Algorithm SHA256 -Path $sourcePath).Hash.Substring(0, 12).ToLowerInvariant()
  $destFileName = "$baseName-$sourceHash$extension"
  $destPath = Join-Path $fontDir $destFileName
  $legacyPath = Join-Path $fontDir $requestedFileName

  $Signature = @'
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern int AddFontResource(string lpszFilename);

    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern bool RemoveFontResource(string lpFileName);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
'@
  $Win32API = Add-Type -MemberDefinition $Signature -Name ${quotePowerShellString(apiClassName)} -Namespace "Win32Functions" -PassThru

  function Resolve-FontPath([string]$fontValue) {
    if ([string]::IsNullOrWhiteSpace($fontValue)) { return $null }
    if ($fontValue -match '[\\\\/:]') { return $fontValue }
    return Join-Path $fontDir $fontValue
  }

  function Unregister-FontPath([string]$fontPath) {
    if ([string]::IsNullOrWhiteSpace($fontPath) -or -not (Test-Path $fontPath)) { return }
    for ($i = 0; $i -lt 10; $i++) {
      if (-not $Win32API::RemoveFontResource($fontPath)) { break }
    }
  }

${buildDeferredFontCleanupFunctions()}

  $regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
  $regName = "$targetFontName (TrueType)"
  $oldPaths = New-Object System.Collections.Generic.List[string]

  $prop = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
  if ($prop) {
    $oldPath = Resolve-FontPath $prop."$regName"
    if ($oldPath) { [void]$oldPaths.Add($oldPath) }
  }
  if (Test-Path $legacyPath) { [void]$oldPaths.Add($legacyPath) }

  Get-ChildItem -LiteralPath $fontDir -Filter "$baseName-*$extension" -ErrorAction SilentlyContinue |
    ForEach-Object { [void]$oldPaths.Add($_.FullName) }

  $uniqueOldPaths = $oldPaths |
    Where-Object { $_ -and ([System.String]::Compare($_, $destPath, $true) -ne 0) } |
    Select-Object -Unique

  foreach ($oldPath in $uniqueOldPaths) {
    Unregister-FontPath $oldPath
  }
  [void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 200

  Unblock-File -Path $sourcePath
  if (-not (Test-Path $destPath)) {
    Copy-Item -Path $sourcePath -Destination $destPath -Force
  }

  Set-ItemProperty -Path $regPath -Name $regName -Value $destFileName

  $added = $Win32API::AddFontResource($destPath)
  if ($added -le 0) {
    throw "AddFontResource failed for $destPath"
  }
  [void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero)

  foreach ($oldPath in $uniqueOldPaths) {
    Remove-Or-DeferFontFile $oldPath
  }

  Write-Output "Successfully installed: $targetFontName ($destFileName)"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;
};

export const buildCleanupManagedFontFilesScript = (
  ttfFileNames: string[],
  targetFontNames: string[],
  dryRun: boolean,
): string => {
  const apiClassName = `Win32FontAPICleanup${randomUUID().replace(/-/g, "")}`;
  const actionScript = dryRun
    ? `
  foreach ($fontPath in $uniqueCandidates) {
    Write-Output "ORPHAN:$fontPath"
  }
`
    : `
  if (@($uniqueCandidates).Count -eq 0) {
    Write-Output "Managed font cleanup candidates: 0"
    return
  }

  $Signature = @'
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern bool RemoveFontResource(string lpFileName);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
'@
  $Win32API = Add-Type -MemberDefinition $Signature -Name ${quotePowerShellString(apiClassName)} -Namespace "Win32Functions" -PassThru

${buildDeferredFontCleanupFunctions()}

  foreach ($fontPath in $uniqueCandidates) {
    [void]$Win32API::RemoveFontResource($fontPath)
    Remove-Or-DeferFontFile $fontPath
  }

  Write-Output "Managed font cleanup candidates: $(@($uniqueCandidates).Count)"
`;

  return `
try {
  $requestedFileNames = ${quotePowerShellArray(ttfFileNames)}
  $targetFontNames = ${quotePowerShellArray(targetFontNames)}
  $dryRun = ${dryRun ? "$true" : "$false"}
  $fontDir = Join-Path $env:windir "Fonts"
  $localFontDir = Join-Path $env:LOCALAPPDATA "Microsoft\\Windows\\Fonts"
  $usedPaths = New-Object 'System.Collections.Generic.HashSet[string]' -ArgumentList ([System.StringComparer]::OrdinalIgnoreCase)

  function Add-UsedFontPath([string]$fontValue, [string]$baseDir) {
    if ([string]::IsNullOrWhiteSpace($fontValue)) { return }
    $resolved = if ($fontValue -match '[\\\\/:]') { $fontValue } else { Join-Path $baseDir $fontValue }
    if (-not [string]::IsNullOrWhiteSpace($resolved)) {
      [void]$usedPaths.Add($resolved)
    }
  }

  foreach ($targetFontName in $targetFontNames) {
    $regName = "$targetFontName (TrueType)"
    $registries = @(
      @{ Path = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"; FontDir = $fontDir },
      @{ Path = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"; FontDir = $localFontDir }
    )
    foreach ($regInfo in $registries) {
      $prop = Get-ItemProperty -Path $regInfo.Path -Name $regName -ErrorAction SilentlyContinue
      if ($prop) {
        Add-UsedFontPath $prop."$regName" $regInfo.FontDir
      }
    }
  }

  $candidates = New-Object System.Collections.Generic.List[string]
  foreach ($requestedFileName in $requestedFileNames) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($requestedFileName)
    $extension = [System.IO.Path]::GetExtension($requestedFileName)
    $pattern = "^" + [regex]::Escape($baseName) + "-[0-9a-fA-F]{12}" + [regex]::Escape($extension) + "$"
    Get-ChildItem -LiteralPath $fontDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match $pattern -and -not $usedPaths.Contains($_.FullName) } |
      ForEach-Object { [void]$candidates.Add($_.FullName) }
  }

  $uniqueCandidates = $candidates | Select-Object -Unique
${actionScript}
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;
};

export const buildRemoveSystemFontScript = (
  targetFontName: string,
  ttfFileName: string,
  hive: "HKLM" | "HKCU",
): string => {
  const regPath =
    hive === "HKLM"
      ? "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
      : "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
  const fontDirExpression =
    hive === "HKLM"
      ? 'Join-Path $env:windir "Fonts"'
      : 'Join-Path $env:LOCALAPPDATA "Microsoft\\Windows\\Fonts"';
  const className = `Win32FontAPIRemove${hive}${randomUUID().replace(/-/g, "")}`;

  return `
try {
  $regPath = ${quotePowerShellString(regPath)}
  $regName = ${quotePowerShellString(`${targetFontName} (TrueType)`)}
  $fontDir = ${fontDirExpression}
  $fallbackPath = Join-Path $fontDir ${quotePowerShellString(ttfFileName)}

  $Signature = @'
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern bool RemoveFontResource(string lpFileName);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
'@
  $Win32API = Add-Type -MemberDefinition $Signature -Name ${quotePowerShellString(className)} -Namespace "Win32Functions" -PassThru

${buildDeferredFontCleanupFunctions()}

  # --- 1차: 레지스트리 이름 기반 (임의 파일명 잔재) ---
  $prop = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
  if ($prop) {
    $regVal = $prop."$regName"
    # 값이 절대경로면 그대로, 파일명만이면 폰트 디렉터리와 결합
    if ($regVal -match '[\\\\/:]') { $target = $regVal } else { $target = Join-Path $fontDir $regVal }
    if (Test-Path $target) {
      [void]$Win32API::RemoveFontResource($target)
      Remove-Or-DeferFontFile $target
    }
    Remove-ItemProperty -Path $regPath -Name $regName -Force -ErrorAction SilentlyContinue
  }

  # --- 2차: 런처 규칙 파일명 폴백 (레지스트리 깨진 런처 잔재) ---
  if (Test-Path $fallbackPath) {
    [void]$Win32API::RemoveFontResource($fallbackPath)
    Remove-Or-DeferFontFile $fallbackPath
  }

  # 변경 전파
  [void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero) # HWND_BROADCAST, WM_FONTCHANGE

  Write-Output "Removed (${hive}): ${targetFontName}"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;
};

// Local script scope must not overwrite the persistent pipe worker's $id/$res/$results.
export const buildGetFontForceApplyScript = (): string => `& {
  $state = @{}; $errors = @{}
  foreach ($target in ${quotePowerShellArray([...FONT_FORCE_APPLY_TARGETS])}) {
    $state[$target] = $null
    try {
      $policies = @(Get-ProcessMitigation -Name $target -ErrorAction Stop)
      if ($policies.Count -gt 1) { throw 'Multiple path-specific policies require Windows Security inspection.' }
      $value = 'NOTSET'
      if ($policies.Count -eq 1) {
        $value = $policies[0].FontDisable.DisableNonSystemFonts.ToString()
      }
      if ($value -eq 'NOTSET') {
        $system = Get-ProcessMitigation -System -ErrorAction Stop
        $value = $system.FontDisable.DisableNonSystemFonts.ToString()
      }
      switch ($value) {
        'ON' { $state[$target] = $true }
        'OFF' { $state[$target] = $false }
        'NOTSET' { $state[$target] = $false }
        default { throw "Unknown font policy: $value" }
      }
    } catch { $errors[$target] = $_.Exception.Message }
  }
  @{ state = $state; errors = $errors } | ConvertTo-Json -Compress -Depth 4
}`;

export const buildSetFontForceApplyScript = (enabled: boolean): string => {
  if (typeof enabled !== "boolean")
    throw new Error("폰트 정책 값은 boolean이어야 합니다.");
  return `& {
    $errors = @{}
    $targets = ${quotePowerShellArray([...FONT_FORCE_APPLY_TARGETS])}
    # Runs after UAC, immediately before writing; also catches games started outside the launcher.
    $blockingNames = @('PathOfExile_KG', 'PathOfExile', 'PathOfExile_x64_KG', 'PathOfExile_x64', 'POE2_Launcher', 'POE_Launcher')
    $running = @(Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -in $blockingNames })
    if ($running.Count -gt 0) { throw '게임을 먼저 종료해 주세요.' }
    foreach ($target in $targets) {
      try {
        Set-ProcessMitigation -Name $target ${enabled ? "-Enable" : "-Remove -Disable"} DisableNonSystemFonts -ErrorAction Stop | Out-Null
      } catch { $errors[$target] = $_.Exception.Message }
    }
    @{ errors = $errors } | ConvertTo-Json -Compress -Depth 3
  }`;
};

const parseFontPolicyErrors = (
  value: unknown,
): FontForceApplyPolicy["errors"] => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("폰트 정책 응답 형식이 올바르지 않습니다.");
  const errors: FontForceApplyPolicy["errors"] = {};
  for (const [key, error] of Object.entries(value)) {
    if (
      !FONT_FORCE_APPLY_TARGETS.includes(
        key as (typeof FONT_FORCE_APPLY_TARGETS)[number],
      ) ||
      typeof error !== "string" ||
      !error
    ) {
      throw new Error("폰트 정책 오류 응답 형식이 올바르지 않습니다.");
    }
    errors[key as (typeof FONT_FORCE_APPLY_TARGETS)[number]] = error;
  }
  return errors;
};

export class PowerShellManager {
  private static instance: PowerShellManager;
  private context: AppContext | null = null;

  private adminLogger = new Logger({
    type: "process_admin",
    typeColor: "#c586c0",
    priority: 3,
  });
  private normalLogger = new Logger({
    type: "process_normal",
    typeColor: "#4ec9b0",
    priority: 2,
  });

  // Separate states for Admin and Normal sessions
  private adminSession: SessionState = this.createEmptySession();
  private normalSession: SessionState = this.createEmptySession();
  private isDestroyed: boolean = false;
  private uncertainFontPolicy: { socket: net.Socket | null } | null = null;

  private constructor() {}

  public static getInstance(): PowerShellManager {
    if (!PowerShellManager.instance) {
      PowerShellManager.instance = new PowerShellManager();
    }
    return PowerShellManager.instance;
  }

  public setContext(context: AppContext) {
    this.context = context;
  }

  private createEmptySession(): SessionState {
    return {
      server: null,
      socket: null,
      process: null,
      pendingRequests: new Map(),
      pipePath: null,
      initializing: null,
      rejectInit: undefined,
    };
  }

  public async execute(
    command: string,
    useAdmin: boolean = false,
    silent: boolean = false,
  ): Promise<PSResult> {
    const session = useAdmin ? this.adminSession : this.normalSession;
    return this.executeCommand(command, session, useAdmin, silent);
  }

  public isAdminSessionActive(): boolean {
    // For Admin session, the spawner process (Start-Process) exits immediately (Code 0).
    // So we primarily check if the socket is established and active.
    if (this.adminSession.socket && !this.adminSession.socket.destroyed) {
      return true;
    }

    // Fallback: Check process if socket isn't ready (though for Admin it likely won't help much once spawner dies)
    return !!this.adminSession.process && !this.adminSession.process.killed;
  }

  public async executeCommand(
    command: string,
    session: SessionState,
    isAdmin: boolean,
    silent: boolean = false,
  ): Promise<PSResult> {
    const logger = isAdmin ? this.adminLogger : this.normalLogger;

    // Log Command Start
    if (silent) {
      logger.silent().log(`> ${command}`);
    } else {
      logger.log(`> ${command}`);
    }

    // 1. Ensure Session
    try {
      await this.ensureSession(session, isAdmin);
    } catch (err) {
      if (err instanceof UACDeniedException) {
        // 이미 child exit handler에서 warn을 남겼지만 호출부에서도 명확히 에러로 처리
        throw err;
      }
      if (err instanceof PowerShellBlockedException) {
        logger.error(err.message);
        throw err;
      }
      const msg = `Failed to establish connection to PowerShell session: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(msg);
      return { stdout: "", stderr: msg, code: 1, notSubmitted: true };
    }

    if (!session.socket) {
      const msg = "Failed to establish connection to PowerShell session";
      logger.error(msg);
      return {
        stdout: "",
        stderr: msg,
        code: 1,
        notSubmitted: true,
      };
    }

    // 2. Send Request
    const id = randomUUID();
    const request: IPCRequest = { id, command };

    return new Promise<PSResult>((resolve, reject) => {
      const timeoutMs = isAdmin ? 30000 : 10000;
      const timeout = setTimeout(() => {
        if (session.pendingRequests.has(id)) {
          session.pendingRequests.delete(id);
          const msg = `Request execution timed out (${timeoutMs / 1000}s)`;
          logger.error(msg);
          resolve({
            stdout: "",
            stderr: msg,
            code: 1,
          });
        }
      }, timeoutMs);

      session.pendingRequests.set(id, (res) => {
        clearTimeout(timeout);
        if (isPowerShellBlockedReason(res.stderr || res.stdout, "command")) {
          const blockedError = createPowerShellBlockedException(
            res.stderr || res.stdout,
          );
          blockedError.commandSubmitted = true;
          logger.error(blockedError.message);
          reject(blockedError);
          return;
        }
        // Log Result
        if (silent) {
          if (res.stdout) logger.silent().log(res.stdout.trim());
          if (res.stderr) logger.silent().error(res.stderr.trim());
        } else {
          if (res.stdout) logger.log(res.stdout.trim());
          if (res.stderr) logger.error(res.stderr.trim());
        }
        resolve(res);
      });

      if (session.socket && !session.socket.destroyed) {
        // Send as single line JSON
        const payload = JSON.stringify(request) + "\n";
        session.socket.write(payload, (err) => {
          if (err) {
            clearTimeout(timeout);
            if (session.pendingRequests.has(id)) {
              session.pendingRequests.delete(id);
              logger.error("Socket Write Error:", err);
              resolve({
                stdout: "",
                stderr: `Socket Write Error: ${err instanceof Error ? err.message : String(err)}`,
                code: 1,
              });
            }
          }
        });
      } else {
        clearTimeout(timeout);
        session.pendingRequests.delete(id);
        const msg = "Socket disconnected or process died before request";
        logger.error(msg);
        resolve({ stdout: "", stderr: msg, code: 1, notSubmitted: true });
      }
    });
  }

  private ensureSession(
    session: SessionState,
    isAdmin: boolean,
  ): Promise<void> {
    // 0. If manager is destroyed, block all new sessions
    if (this.isDestroyed) {
      return Promise.reject(
        new Error(
          "PowerShellManager is destroyed. Blocking new session creation.",
        ),
      );
    }

    // 1. If session is fully active, return immediately
    if (session.socket && !session.socket.destroyed && session.server) {
      return Promise.resolve();
    }

    // 2. If initialization is already in progress, wait for it (Concurrency Fix)
    if (session.initializing) {
      return session.initializing;
    }

    this.cleanupSession(session);

    // 3. Start new initialization
    session.initializing = new Promise((resolve, reject) => {
      session.rejectInit = reject;
      try {
        const pipeId = randomUUID();
        const pipeName = `poe2-launcher-${isAdmin ? "admin" : "normal"}-${pipeId}`;
        session.pipePath = `\\\\.\\pipe\\${pipeName}`;

        session.server = net.createServer((socket) => {
          const logger = isAdmin ? this.adminLogger : this.normalLogger;
          logger.log(`${isAdmin ? "Admin" : "Normal"} Client Connected!`);
          session.socket = socket;

          let buffer = "";
          socket.on("data", (data) => {
            buffer += data.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const response: IPCResponse = JSON.parse(line);
                const callback = session.pendingRequests.get(response.id);
                if (callback) {
                  session.pendingRequests.delete(response.id);
                  if (response.error) {
                    callback({ stdout: "", stderr: response.error, code: 1 });
                  } else {
                    callback({
                      stdout: response.stdout,
                      stderr: response.stderr,
                      code: response.code ?? 0,
                    });
                  }
                }
              } catch (err) {
                logger.error(`JSON Parse Error:`, err);
              }
            }
          });

          socket.on("end", () => {
            session.socket = null;
          });

          socket.on("error", (err) => {
            logger.error(`Socket Error:`, err);
            session.socket = null;
          });

          // Initialization Complete
          session.initializing = null;
          session.rejectInit = undefined;
          resolve();
        });

        session.server.listen(session.pipePath, () => {
          this.spawnProcess(session, isAdmin, pipeName).catch((err) => {
            this.cleanupSession(session);
            this.rejectSessionInitialization(session, err);
          });
        });

        session.server.on("error", (err) => {
          this.rejectSessionInitialization(session, err);
        });
      } catch (e) {
        this.rejectSessionInitialization(session, e);
      }
    });

    return session.initializing;
  }

  private rejectSessionInitialization(session: SessionState, reason: unknown) {
    const rejectInit = session.rejectInit;
    session.initializing = null;
    session.rejectInit = undefined;
    if (rejectInit) {
      rejectInit(reason);
    }
  }

  private async spawnProcess(
    session: SessionState,
    isAdmin: boolean,
    pipeName: string,
  ) {
    if (!session.pipePath) throw new Error("Pipe path not initialized");

    const psScript = `
$ErrorActionPreference = "Stop"
$pipeName = "${pipeName}"

try {
    $npipeClient = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::None)
    $npipeClient.Connect(10000)
    
    $reader = New-Object System.IO.StreamReader($npipeClient)
    $writer = New-Object System.IO.StreamWriter($npipeClient)
    $writer.AutoFlush = $true

    while ($npipeClient.IsConnected) {
        $line = $reader.ReadLine()
        if ($line -eq $null) { break }
        
        try {
            $req = $line | ConvertFrom-Json
            $id = $req.id
            $cmd = $req.command
            
            # [Debug] Echo command to console host
            Write-Host "[IPC] Executing: $cmd" -ForegroundColor Cyan

            $outData = @()
            $errData = @()
            $exitCode = 0
            
            try {
                $results = Invoke-Expression $cmd 2>&1 | ForEach-Object {
                    if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        $errData += $_.ToString()
                    } else {
                        $outData += $_.ToString()
                    }
                }
                if ($errData.Count -gt 0) {
                    $exitCode = 1
                }
            } catch {
                $errData += $_.Exception.Message
                $exitCode = 1
            }
            
            $res = @{
                id = $id
                stdout = ($outData -join "\`n")
                stderr = ($errData -join "\`n")
                code = $exitCode
            }
            
            $jsonRes = $res | ConvertTo-Json -Compress
            $writer.WriteLine($jsonRes)
            
        } catch {
             $errRes = @{ id = "unknown"; error = $_.Exception.Message } | ConvertTo-Json -Compress
             $writer.WriteLine($errRes)
        }
    }
} catch {
   exit 1
} finally {
    if ($npipeClient) { $npipeClient.Close() }
    exit 0
}
    `;

    const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");
    const windowStyle = "Hidden";

    let commandToSpawn: string;
    let spawnArgs: string[];

    if (isAdmin) {
      commandToSpawn = "powershell";
      const args = [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedCommand,
      ];

      const formattedArgs = args.map((arg) => `"${arg}"`).join(", ");
      const startProcessArgs = `-Verb RunAs -WindowStyle ${windowStyle} -ArgumentList ${formattedArgs}`;

      spawnArgs = [
        "-NoProfile",
        "-Command",
        `try { Start-Process powershell ${startProcessArgs} -ErrorAction Stop } catch { exit 1223 }`,
      ];
    } else {
      commandToSpawn = "powershell";
      spawnArgs = [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        windowStyle,
        "-EncodedCommand",
        encodedCommand,
      ];
    }

    const logger = isAdmin ? this.adminLogger : this.normalLogger;
    logger.log(`Spawning ${isAdmin ? "Admin" : "Normal"} Session...`);

    const child = spawn(commandToSpawn, spawnArgs, {
      windowsHide: windowStyle === "Hidden",
      stdio: "ignore",
    });

    session.process = child;

    child.on("error", (err) => {
      const reason = `Failed to spawn ${isAdmin ? "Admin" : "Normal"} PowerShell process: ${formatUnknownError(err)}`;
      const error = isPowerShellBlockedReason(err)
        ? createPowerShellBlockedException(reason, err)
        : new Error(reason);
      const wasInitializing = !!session.initializing;

      if (session.server) {
        session.server.close();
        session.server = null;
      }
      session.process = null;
      this.rejectSessionInitialization(session, error);
      if (!wasInitializing) {
        logger.error(error.message);
      }
      this.failAllPendingRequests(session, isAdmin, formatUnknownError(error));
    });

    child.on("exit", (code) => {
      logger.log(
        `${isAdmin ? "Admin" : "Normal"} process exited with code ${code}`,
      );

      if (isAdmin && code === 0) {
        logger.log(
          "Admin spawner finished successfully. Waiting for elevated worker...",
        );
        return;
      }

      if (isAdmin && code === 1223) {
        logger.warn("UAC prompt was canceled by the user.");
        const uacErr = new UACDeniedException();
        this.rejectSessionInitialization(session, uacErr);
        this.failAllPendingRequests(session, isAdmin, uacErr.message);
        return;
      }

      const errMsg = `Process exited with code ${code}`;
      this.rejectSessionInitialization(session, new Error(errMsg));
      this.failAllPendingRequests(session, isAdmin, errMsg);
    });
  }

  public async getFontForceApplyPolicy(): Promise<FontForceApplyPolicy> {
    const result = await this.execute(
      buildGetFontForceApplyScript(),
      false,
      true,
    );
    if (result.code !== 0)
      throw new Error(result.stderr || "폰트 정책 조회 실패");
    const parsed = JSON.parse(result.stdout) as FontForceApplyPolicy;
    const errors = parseFontPolicyErrors(parsed.errors);
    for (const target of FONT_FORCE_APPLY_TARGETS) {
      const value = parsed.state?.[target];
      if (
        (value !== null && typeof value !== "boolean") ||
        (value === null && !errors[target]) ||
        (errors[target] && value !== null)
      ) {
        throw new Error("폰트 정책 상태 응답 형식이 올바르지 않습니다.");
      }
    }
    return { state: normalizeFontForceApplyState(parsed.state), errors };
  }

  public async setFontForceApplyPolicy(
    enabled: boolean,
  ): Promise<FontForceApplyPolicy["errors"]> {
    const script = buildSetFontForceApplyScript(enabled);
    await this.confirmFontForceApplyIdle();
    let result: PSResult;
    try {
      result = await this.execute(script, true, true);
    } catch (error) {
      if (
        !(error instanceof UACDeniedException) &&
        !(
          error instanceof PowerShellBlockedException && !error.commandSubmitted
        )
      )
        this.uncertainFontPolicy = { socket: this.adminSession.socket };
      throw error;
    }
    if (result.code !== 0) {
      if (!result.notSubmitted)
        this.uncertainFontPolicy = { socket: this.adminSession.socket };
      throw new Error(result.stderr || "폰트 정책 변경 실패");
    }
    return parseFontPolicyErrors(
      (JSON.parse(result.stdout) as { errors: unknown }).errors,
    );
  }

  /** A normal-session read cannot fence a timed-out admin write. Never start a replacement session as proof. */
  public async confirmFontForceApplyIdle(): Promise<void> {
    const pending = this.uncertainFontPolicy;
    if (!pending) return;
    const message =
      "이전 폰트 정책 명령의 종료를 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.";
    if (
      !pending.socket ||
      pending.socket.destroyed ||
      this.adminSession.socket !== pending.socket
    )
      throw new Error(
        "이전 폰트 정책 명령의 종료를 확인할 연결이 끊겼습니다. Windows를 다시 시작한 뒤 확인해 주세요.",
      );
    const fence = await this.executeCommand(
      "& { Write-Output 'FONT_POLICY_IDLE' }",
      this.adminSession,
      true,
      true,
    );
    if (
      fence.code !== 0 ||
      fence.stdout.trim() !== "FONT_POLICY_IDLE" ||
      this.adminSession.socket !== pending.socket
    )
      throw new Error(message);
    this.uncertainFontPolicy = null;
  }

  public async installSystemFont(
    ttfFilePath: string,
    targetFontName: string,
    ttfFileName: string,
  ): Promise<boolean> {
    const script = buildInstallSystemFontScript(
      ttfFilePath,
      targetFontName,
      ttfFileName,
    );
    const result = await this.execute(script, true);
    if (result.code !== 0) {
      const reason =
        result.stderr || result.stdout || `PowerShell exit code ${result.code}`;
      throw new Error(
        `Failed to install system font '${targetFontName}': ${reason}`,
      );
    }
    return true;
  }

  public async cleanupOrphanedManagedFontFiles(
    ttfFileNames: string[],
    targetFontNames: string[],
  ): Promise<boolean> {
    const scanScript = buildCleanupManagedFontFilesScript(
      ttfFileNames,
      targetFontNames,
      true,
    );
    const scanResult = await this.execute(scanScript, false, true);
    if (scanResult.code !== 0) {
      const reason =
        scanResult.stderr ||
        scanResult.stdout ||
        `PowerShell exit code ${scanResult.code}`;
      throw new Error(`Failed to scan managed font cleanup targets: ${reason}`);
    }

    const hasOrphan = scanResult.stdout
      .split(/\r?\n/)
      .some((line) => line.trim().startsWith("ORPHAN:"));
    if (!hasOrphan) return true;

    const cleanupScript = buildCleanupManagedFontFilesScript(
      ttfFileNames,
      targetFontNames,
      false,
    );
    const cleanupResult = await this.execute(cleanupScript, true, true);
    if (cleanupResult.code !== 0) {
      const reason =
        cleanupResult.stderr ||
        cleanupResult.stdout ||
        `PowerShell exit code ${cleanupResult.code}`;
      throw new Error(`Failed to cleanup managed font files: ${reason}`);
    }

    return true;
  }

  /**
   * 시스템에 설치된 커스텀 폰트를 제거한다.
   *
   * HKLM/HKCU 양쪽을 훑는다 (감지는 양쪽을 보는데 제거가 HKLM만 보던
   * 비대칭 버그 수정). 권한 컨텍스트가 다르므로 세션을 분리한다:
   *  - HKLM + %windir%\Fonts  → admin 세션
   *  - HKCU + %LOCALAPPDATA%  → 일반 세션 (실행 사용자의 프로파일)
   *
   * 각 하이브에서 2단계 폴백:
   *  1) 레지스트리 이름(`<name> (TrueType)`)으로 값을 읽어 그 경로 제거
   *     — 임의 파일명으로 깐 수동/외부 잔재(예: 디아블로 Kodia)를 잡음
   *  2) 런처 규칙 파일명을 폰트 디렉터리에서 직접 찾아 제거
   *     — 레지스트리 키가 깨진 런처 설치 잔재를 잡음 (런처만 만드는
   *       규칙명이라 타 폰트 오삭제 위험 없음)
   */
  public async removeSystemFont(
    targetFontName: string,
    ttfFileName: string,
  ): Promise<boolean> {
    const hkcuOk = await this.runFontRemovalScript(
      targetFontName,
      ttfFileName,
      "HKCU",
      false,
    );
    const hklmOk = await this.runFontRemovalScript(
      targetFontName,
      ttfFileName,
      "HKLM",
      true,
    );
    // 한쪽이라도 정상 종료면 성공으로 본다 (해당 하이브에 없으면 no-op도 0).
    return hkcuOk || hklmOk;
  }

  /** removeSystemFont 내부: 단일 하이브(HKLM|HKCU) 제거 스크립트 실행. */
  private async runFontRemovalScript(
    targetFontName: string,
    ttfFileName: string,
    hive: "HKLM" | "HKCU",
    useAdmin: boolean,
  ): Promise<boolean> {
    const script = buildRemoveSystemFontScript(
      targetFontName,
      ttfFileName,
      hive,
    );
    const result = await this.execute(script, useAdmin, true);
    return result.code === 0;
  }

  public cleanup() {
    this.isDestroyed = true;
    this.cleanupSession(this.adminSession);
    this.cleanupSession(this.normalSession);
  }

  private cleanupSession(session: SessionState) {
    if (session.socket) {
      session.socket.destroy();
      session.socket = null;
    }
    if (session.server) {
      session.server.close();
      session.server = null;
    }
    if (session.process) {
      session.process.kill();
      session.process = null;
    }
    this.failAllPendingRequests(session, false, "Session cleanup");
  }

  private failAllPendingRequests(
    session: SessionState,
    isAdmin: boolean,
    reason: string,
  ) {
    if (session.pendingRequests.size > 0) {
      const logger = isAdmin ? this.adminLogger : this.normalLogger;
      logger.warn(
        `Failing ${session.pendingRequests.size} requests: ${reason}`,
      );
      session.pendingRequests.forEach((callback) => {
        callback({
          stdout: "",
          stderr: `Command cancelled: ${reason}`,
          code: 1,
        });
      });
      session.pendingRequests.clear();
    }
  }
}

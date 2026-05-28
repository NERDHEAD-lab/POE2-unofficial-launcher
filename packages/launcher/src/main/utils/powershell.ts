import { spawn, ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";

import { Logger } from "./logger";
import { AppContext } from "../events/types";

export class UACDeniedException extends Error {
  constructor(message = "관리자 권한 요청이 사용자에 의해 취소되었습니다.") {
    super(message);
    this.name = "UACDeniedException";
  }
}

interface PSResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

interface IPCRequest {
  id: string;
  command: string;
}

interface IPCResponse {
  id: string;
  stdout: string;
  stderr: string;
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
      const msg = `Failed to establish connection to PowerShell session: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(msg);
      return { stdout: "", stderr: msg, code: 1 };
    }

    if (!session.socket) {
      const msg = "Failed to establish connection to PowerShell session";
      logger.error(msg);
      return {
        stdout: "",
        stderr: msg,
        code: 1,
      };
    }

    // 2. Send Request
    const id = randomUUID();
    const request: IPCRequest = { id, command };

    return new Promise<PSResult>((resolve) => {
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
        resolve({ stdout: "", stderr: msg, code: 1 });
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
                      code: 0,
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
          resolve();
        });

        session.server.listen(session.pipePath, () => {
          this.spawnProcess(session, isAdmin, pipeName).catch((err) => {
            this.cleanupSession(session);
            // Ensure promise rejects and clears initializing
            session.initializing = null;
            if (session.rejectInit) session.rejectInit(err);
            else reject(err);
          });
        });

        session.server.on("error", (err) => {
          session.initializing = null;
          if (session.rejectInit) session.rejectInit(err);
          else reject(err);
        });
      } catch (e) {
        session.initializing = null;
        if (session.rejectInit) session.rejectInit(e);
        else reject(e);
      }
    });

    return session.initializing;
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
            
            try {
                $results = Invoke-Expression $cmd 2>&1 | ForEach-Object {
                    if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        $errData += $_.ToString()
                    } else {
                        $outData += $_.ToString()
                    }
                }
            } catch {
                $errData += $_.Exception.Message
            }
            
            $res = @{
                id = $id
                stdout = ($outData -join "\`n")
                stderr = ($errData -join "\`n")
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
      logger.error(
        `Failed to spawn ${isAdmin ? "Admin" : "Normal"} process:`,
        err,
      );
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
        if (session.rejectInit) {
          session.rejectInit(uacErr);
        }
        this.failAllPendingRequests(session, isAdmin, uacErr.message);
        return;
      }

      const errMsg = `Process exited with code ${code}`;
      if (session.rejectInit) {
        session.rejectInit(new Error(errMsg));
      }
      this.failAllPendingRequests(session, isAdmin, errMsg);
    });
  }

  public async installSystemFont(
    ttfFilePath: string,
    targetFontName: string,
    ttfFileName: string,
  ): Promise<boolean> {
    const script = `
try {
  $sourcePath = "${ttfFilePath}"
  $destPath = "$env:windir\\Fonts\\${ttfFileName}"

  $Signature = @'
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern int AddFontResource(string lpszFilename);

    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern bool RemoveFontResource(string lpFileName);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
'@
  $Win32API = Add-Type -MemberDefinition $Signature -Name "Win32FontAPI_Install" -Namespace "Win32Functions" -PassThru

  # 1. 같은 경로 폰트가 이미 GDI에 매핑돼 있으면 ref count 0까지 unregister.
  #    같은 파일명 in-place 갱신 시 AddFontResource가 새 데이터를 reload하지
  #    않는 문제(재부팅 전까지 stale metrics 사용) 회피. 최대 10회 반복.
  if (Test-Path $destPath) {
    for ($i = 0; $i -lt 10; $i++) {
      if (-not $Win32API::RemoveFontResource($destPath)) { break }
    }
    [void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 200
    Remove-Item $destPath -Force
  }

  # 2. 보안 차단 해제 및 Fonts 경로로 복사
  Unblock-File -Path $sourcePath
  Copy-Item -Path $sourcePath -Destination $destPath -Force

  # 3. 레지스트리 등록
  $regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
  $regName = "${targetFontName} (TrueType)"
  Set-ItemProperty -Path $regPath -Name $regName -Value "${ttfFileName}"

  # 4. GDI 등록 + 변경 전파
  [void]$Win32API::AddFontResource($destPath)
  [void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero) # HWND_BROADCAST, WM_FONTCHANGE

  Write-Output "Successfully installed: ${targetFontName}"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;
    const result = await this.execute(script, true);
    return result.code === 0;
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
    const regPath =
      hive === "HKLM"
        ? "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
        : "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
    // 하이브별 기본 폰트 디렉터리 (레지스트리 값이 파일명만일 때 결합 + 폴백)
    const fontDir =
      hive === "HKLM"
        ? "$env:windir\\Fonts"
        : "$env:LOCALAPPDATA\\Microsoft\\Windows\\Fonts";
    const className = `Win32FontAPI_Remove_${hive}`;

    const script = `
try {
  $regPath = "${regPath}"
  $regName = "${targetFontName} (TrueType)"
  $fontDir = "${fontDir}"
  $fallbackPath = Join-Path $fontDir "${ttfFileName}"

  $Signature = @'
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern bool RemoveFontResource(string lpFileName);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
'@
  $Win32API = Add-Type -MemberDefinition $Signature -Name "${className}" -Namespace "Win32Functions" -PassThru

  # --- 1차: 레지스트리 이름 기반 (임의 파일명 잔재) ---
  $prop = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
  if ($prop) {
    $regVal = $prop."$regName"
    # 값이 절대경로면 그대로, 파일명만이면 폰트 디렉터리와 결합
    if ($regVal -match '[\\\\/:]') { $target = $regVal } else { $target = Join-Path $fontDir $regVal }
    if (Test-Path $target) {
      [void]$Win32API::RemoveFontResource($target)
      Remove-Item -Path $target -Force -ErrorAction SilentlyContinue
    }
    Remove-ItemProperty -Path $regPath -Name $regName -Force -ErrorAction SilentlyContinue
  }

  # --- 2차: 런처 규칙 파일명 폴백 (레지스트리 깨진 런처 잔재) ---
  if (Test-Path $fallbackPath) {
    [void]$Win32API::RemoveFontResource($fallbackPath)
    Remove-Item -Path $fallbackPath -Force -ErrorAction SilentlyContinue
  }

  # 변경 전파
  [void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero) # HWND_BROADCAST, WM_FONTCHANGE

  Write-Output "Removed (${hive}): ${targetFontName}"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `;
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

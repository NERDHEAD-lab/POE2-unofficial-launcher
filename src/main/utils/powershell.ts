import { spawn, ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";

import { eventBus } from "../events/EventBus";
import { AppContext, DebugLogEvent, EventType } from "../events/types";

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
}

// ...

export class PowerShellManager {
  private static instance: PowerShellManager;
  private context: AppContext | null = null;

  // Separate states for Admin and Normal sessions
  private adminSession: SessionState = this.createEmptySession();
  private normalSession: SessionState = this.createEmptySession();

  private readonly isDebug: boolean;

  private constructor() {
    this.isDebug = (process.env.VITE_SHOW_GAME_WINDOW || "").trim() === "true";
    console.log(
      `[PowerShellManager] Initialized. isDebug=${this.isDebug}, Env=${process.env.VITE_SHOW_GAME_WINDOW}`,
    );
  }

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
    };
  }

  public async execute(
    command: string,
    useAdmin: boolean = false,
  ): Promise<PSResult> {
    const session = useAdmin ? this.adminSession : this.normalSession;
    return this.executeCommand(command, session, useAdmin);
  }

  private emitLog(
    type: string,
    content: string,
    isError: boolean = false,
    options: { typeColor?: string; textColor?: string } = {},
  ) {
    // Only emit if debug mode is active to save resources
    // Also require context to be set to avoid crashes
    if (this.isDebug && this.context) {
      if (typeof eventBus !== "undefined") {
        eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, this.context, {
          type,
          content,
          isError,
          timestamp: Date.now(),
          typeColor: options.typeColor,
          textColor: options.textColor,
        });
      }
    }
  }

  /**
   * Helper to determine colors based on session type
   */
  private getLogColors(
    isAdmin: boolean,
    isError: boolean,
  ): { typeColor: string; textColor: string } {
    if (isError) {
      return {
        typeColor: isAdmin ? "#c586c0" : "#4ec9b0",
        textColor: "#f48771", // Red
      };
    }
    return isAdmin
      ? { typeColor: "#c586c0", textColor: "#569cd6" } // Admin: Purple / Blue
      : { typeColor: "#4ec9b0", textColor: "#d4d4d4" }; // Normal: Teal / Grey
  }

  public async executeCommand(
    command: string,
    session: SessionState,
    isAdmin: boolean,
  ): Promise<PSResult> {
    // Log Command Start
    this.emitLog(
      isAdmin ? "process_admin" : "process_normal",
      `> ${command}`,
      false,
      this.getLogColors(isAdmin, false),
    );

    // 1. Ensure Session
    await this.ensureSession(session, isAdmin);

    if (!session.socket) {
      const msg = "Failed to establish connection to PowerShell session";
      this.emitLog(
        isAdmin ? "process_admin" : "process_normal",
        msg,
        true,
        this.getLogColors(isAdmin, true),
      );
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
      const timeout = setTimeout(
        () => {
          if (session.pendingRequests.has(id)) {
            session.pendingRequests.delete(id);
            const msg = "Request execution timed out (30s)";
            this.emitLog(
              isAdmin ? "process_admin" : "process_normal",
              msg,
              true,
              this.getLogColors(isAdmin, true),
            );
            resolve({
              stdout: "",
              stderr: msg,
              code: 1,
            });
          }
        },
        isAdmin ? 30000 : 10000,
      ); // Admin setup might take longer, normal usually fast

      session.pendingRequests.set(id, (res) => {
        clearTimeout(timeout);
        // Log Result
        if (res.stdout)
          this.emitLog(
            isAdmin ? "process_admin" : "process_normal",
            res.stdout.trim(),
            false,
            this.getLogColors(isAdmin, false),
          );
        if (res.stderr)
          this.emitLog(
            isAdmin ? "process_admin" : "process_normal",
            res.stderr.trim(),
            true,
            this.getLogColors(isAdmin, true),
          );
        resolve(res);
      });

      if (session.socket) {
        // Send as single line JSON
        const payload = JSON.stringify(request) + "\n";
        session.socket.write(payload, (err) => {
          if (err) {
            clearTimeout(timeout);
            session.pendingRequests.delete(id);
            const msg = `Socket Write Error: ${err.message}`;
            this.emitLog(
              isAdmin ? "process_admin" : "process_normal",
              msg,
              true,
              this.getLogColors(isAdmin, true),
            );
            resolve({
              stdout: "",
              stderr: msg,
              code: 1,
            });
          }
        });
      } else {
        clearTimeout(timeout);
        const msg = "Socket disconnected";
        this.emitLog(
          isAdmin ? "process_admin" : "process_normal",
          msg,
          true,
          this.getLogColors(isAdmin, true),
        );
        resolve({ stdout: "", stderr: msg, code: 1 });
      }
    });
  }

  private ensureSession(
    session: SessionState,
    isAdmin: boolean,
  ): Promise<void> {
    if (session.socket && session.server) {
      if (session.process && session.process.exitCode === null) {
        return Promise.resolve();
      }
      this.cleanupSession(session);
    }

    return new Promise((resolve, reject) => {
      try {
        const pipeId = randomUUID();
        const pipeName = `poe2-launcher-${isAdmin ? "admin" : "normal"}-${pipeId}`;
        session.pipePath = `\\\\.\\pipe\\${pipeName}`;

        session.server = net.createServer((socket) => {
          console.log(
            `[PowerShellManager] ${isAdmin ? "Admin" : "Normal"} Client Connected!`,
          );
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
                console.error(
                  `[PowerShellManager:${isAdmin ? "Admin" : "Normal"}] JSON Parse Error:`,
                  err,
                );
              }
            }
          });

          socket.on("end", () => {
            session.socket = null;
          });

          socket.on("error", (err) => {
            console.error(
              `[PowerShellManager:${isAdmin ? "Admin" : "Normal"}] Socket Error:`,
              err,
            );
            session.socket = null;
          });

          resolve();
        });

        session.server.listen(session.pipePath, () => {
          this.spawnProcess(session, isAdmin, pipeName).catch((err) => {
            this.cleanupSession(session);
            reject(err);
          });
        });

        session.server.on("error", (err) => {
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  private async spawnProcess(
    session: SessionState,
    isAdmin: boolean,
    pipeName: string,
  ) {
    if (!session.pipePath) throw new Error("Pipe path not initialized");

    // Pure Pype Name for PowerShell (No \\.\pipe\ prefix needed if we handle it carefully,
    // but .NET NamedPipeClientStream usually takes just the name part).
    // Node pipe path: \\.\pipe\NAME
    // PowerShell NamedPipeClientStream: NAME

    // The previous bug was replace logic. Here we pass simple NAME.

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
}
    `;

    const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");

    const windowStyle = "Hidden";
    const noExitFlag = this.isDebug ? "-NoExit" : "";

    let spawnArgs: string[];
    let commandToSpawn: string;

    if (isAdmin) {
      // Admin: Use Start-Process with Verb RunAs
      commandToSpawn = "powershell";
      // Construct the full argument list for Start-Process
      const startProcessArgs = `-Verb RunAs -WindowStyle ${windowStyle} -ArgumentList "${noExitFlag}", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", "${encodedCommand}"`;
      spawnArgs = [
        "-NoProfile",
        "-Command",
        `Start-Process powershell ${startProcessArgs}`,
      ];
    } else {
      // Normal: Spawn PowerShell directly with encoded command
      // We want to control visibility directly here if possible?
      // Node spawn options.windowsHide works for the direct process.
      // But if we want "-WindowStyle Normal", passing it to powershell.exe works best.
      commandToSpawn = "powershell";
      spawnArgs = [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        windowStyle,
        noExitFlag,
        "-EncodedCommand",
        encodedCommand,
      ].filter((arg) => arg !== "");
    }

    console.log(
      `[PowerShellManager] Spawning ${isAdmin ? "Admin" : "Normal"} Session...`,
    );

    const child = spawn(commandToSpawn, spawnArgs, {
      windowsHide: !this.isDebug, // Hide if not debug
      stdio: "ignore",
    });

    session.process = child;

    child.on("error", (err) => {
      console.error(
        `[PowerShellManager] Failed to spawn ${isAdmin ? "Admin" : "Normal"} process:`,
        err,
      );
    });

    if (this.isDebug) {
      child.on("exit", (code) => {
        console.log(
          `[PowerShellManager] ${isAdmin ? "Admin" : "Normal"} process exited with code ${code}`,
        );
      });
    }
  }

  public cleanup() {
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
    session.pendingRequests.clear();
    // Process is usually detached or managed by helper.
    // If it's a persistent shell, closing the socket (pipe logic) usually terminates the script loop.
  }
}

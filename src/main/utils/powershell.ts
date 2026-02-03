import { spawn, ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";

import { Logger } from "./logger";
import { AppContext } from "../events/types";

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
    await this.ensureSession(session, isAdmin);

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
              const msg = `Socket Write Error: ${err.message}`;
              logger.error(msg);
              resolve({
                stdout: "",
                stderr: msg,
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
    if (session.socket && !session.socket.destroyed && session.server) {
      return Promise.resolve();
    }

    this.cleanupSession(session);

    return new Promise((resolve, reject) => {
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
    const isDev = this.context?.getConfig("dev_mode") === true;
    const windowStyle = "Hidden";
    const noExitFlag = isDev ? "-NoExit" : "";

    let spawnArgs: string[];
    let commandToSpawn: string;

    if (isAdmin) {
      commandToSpawn = "powershell";
      const args = [
        noExitFlag,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedCommand,
      ].filter((arg) => arg !== "");

      const formattedArgs = args.map((arg) => `"${arg}"`).join(", ");
      const startProcessArgs = `-Verb RunAs -WindowStyle ${windowStyle} -ArgumentList ${formattedArgs}`;

      spawnArgs = [
        "-NoProfile",
        "-Command",
        `Start-Process powershell ${startProcessArgs}`,
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
        noExitFlag,
        "-EncodedCommand",
        encodedCommand,
      ].filter((arg) => arg !== "");
    }

    const logger = isAdmin ? this.adminLogger : this.normalLogger;
    logger.log(`Spawning ${isAdmin ? "Admin" : "Normal"} Session...`);

    const child = spawn(commandToSpawn, spawnArgs, {
      windowsHide: true,
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

      this.failAllPendingRequests(
        session,
        isAdmin,
        `Process exited with code ${code}`,
      );
    });
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

import { spawn, execFile, ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  error?: string; // Internal script error
}

export class PowerShellManager {
  private static instance: PowerShellManager;

  // Admin Session State
  private adminServer: net.Server | null = null;
  private adminSocket: net.Socket | null = null;
  private adminProcess: ChildProcess | null = null;
  private pendingAdminRequests: Map<string, (res: PSResult) => void> =
    new Map();
  private pipePath: string | null = null;

  // Normal Session State (To be implemented if persistent normal session is desired,
  // but for now we stick to execFile/spawn for normal to keep it simple unless optimized)
  // The user request emphasized "singleton" and "admin session persistence".
  // Adding consistent method signature for both.

  private readonly isDebug: boolean;

  private constructor() {
    // Check if we are in dev:test mode (VITE_SHOW_GAME_WINDOW=true)
    this.isDebug = process.env.VITE_SHOW_GAME_WINDOW === "true";
  }

  public static getInstance(): PowerShellManager {
    if (!PowerShellManager.instance) {
      PowerShellManager.instance = new PowerShellManager();
    }
    return PowerShellManager.instance;
  }

  /**
   * Executes a PowerShell command.
   * @param command The PowerShell command to execute
   * @param useAdmin Whether to run with Administrator privileges
   */
  public async execute(
    command: string,
    useAdmin: boolean = false,
  ): Promise<PSResult> {
    if (useAdmin) {
      return this.executeAdmin(command);
    } else {
      return this.executeNormal(command);
    }
  }

  /**
   * Execute using normal privileges (Non-persistent spawn for safety/simplicity,
   * or we could optimize later)
   */
  private async executeNormal(command: string): Promise<PSResult> {
    try {
      // Using execFile for simple commands.
      // Note: If large output is expected, maxBuffer might need adjustment.
      const { stdout, stderr } = await execFileAsync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", command],
        { windowsHide: !this.isDebug, encoding: "utf8" },
      );
      return { stdout, stderr, code: 0 };
    } catch (e: unknown) {
      const err = e as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        code: err.code ?? 1,
      };
    }
  }

  /**
   * Execute using Elevated Privileges (Persistent Session)
   */
  private async executeAdmin(command: string): Promise<PSResult> {
    // 1. Ensure Admin Session is Ready
    await this.ensureAdminSession();

    if (!this.adminSocket) {
      return {
        stdout: "",
        stderr: "Failed to establish admin connection",
        code: 1,
      };
    }

    // 2. Send Request
    const id = randomUUID();
    const request: IPCRequest = { id, command };

    // Wrapping promise to handle response
    return new Promise<PSResult>((resolve) => {
      // Set timeout in case the admin process hangs
      const timeout = setTimeout(() => {
        if (this.pendingAdminRequests.has(id)) {
          this.pendingAdminRequests.delete(id);
          resolve({
            stdout: "",
            stderr: "Admin request execution timed out",
            code: 1,
          });
        }
      }, 30000); // 30s timeout

      this.pendingAdminRequests.set(id, (res) => {
        clearTimeout(timeout);
        resolve(res);
      });

      // Send JSON + Newline
      if (this.adminSocket) {
        const payload = JSON.stringify(request) + "\n";
        this.adminSocket.write(payload);
      } else {
        clearTimeout(timeout);
        resolve({ stdout: "", stderr: "Admin socket disconnected", code: 1 });
      }
    });
  }

  /**
   * Initializes the Named Pipe Server and launches the Elevated PowerShell Client
   */
  private ensureAdminSession(): Promise<void> {
    if (this.adminSocket && this.adminServer) {
      // Double check process
      if (this.adminProcess && this.adminProcess.exitCode === null) {
        return Promise.resolve();
      }
      // If process died, cleanup and restart
      this.cleanupAdmin();
    }

    return new Promise((resolve, reject) => {
      try {
        const pipeId = randomUUID();
        this.pipePath = `\\\\.\\pipe\\poe2-launcher-svc-${pipeId}`;

        // Create Server
        this.adminServer = net.createServer((socket) => {
          this.adminSocket = socket;

          let buffer = "";
          socket.on("data", (data) => {
            buffer += data.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete chunk

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const response: IPCResponse = JSON.parse(line);
                const callback = this.pendingAdminRequests.get(response.id);
                if (callback) {
                  this.pendingAdminRequests.delete(response.id);
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
                  "[PowerShellManager] JSON Parse Error from Admin:",
                  err,
                );
              }
            }
          });

          socket.on("end", () => {
            // Admin process disconnected
            this.adminSocket = null;
          });

          socket.on("error", (err) => {
            console.error("[PowerShellManager] Socket Error:", err);
            this.adminSocket = null;
          });

          // Connection established!
          resolve();
        });

        this.adminServer.listen(this.pipePath, () => {
          // Server listening, now spawn the admin client
          this.spawnAdminProcess().catch((err) => {
            this.cleanupAdmin();
            reject(err);
          });
        });

        this.adminServer.on("error", (err) => {
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  private async spawnAdminProcess() {
    if (!this.pipePath) throw new Error("Pipe path not initialized");

    // PowerShell Worker Script
    // Continously reads JSON {id, command} from Pipe, Executes, Writes JSON {id, stdout, stderr}
    const psScript = `
$ErrorActionPreference = "Stop"
$pipeName = "${this.pipePath.replace(/\\\\/g, "\\")}"
$pipeName = $pipeName -replace '^\\\\\\\\.\\\\pipe\\\\', '' 

try {
    $npipeClient = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::None)
    $npipeClient.Connect(10000) # Wait up to 10s for connection
    
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
            
            # Execute Command
            # Capture Output. We use Invoke-Command or simple script block
            # Note: We want to capture both stdout and stderr
            
            $outData = @()
            $errData = @()
            
            try {
                # Execute inside a scriptblock to capture output
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
            # JSON Parse Error or generic loop error, send error if possible
             $errRes = @{ id = "unknown"; error = $_.Exception.Message } | ConvertTo-Json -Compress
             $writer.WriteLine($errRes)
        }
    }
} catch {
   # Crash
   exit 1
}
    `;

    // Encode script to avoid escaping issues
    const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");

    // Command to launch PowerShell as Admin with this script
    const windowStyle = this.isDebug ? "Normal" : "Hidden";
    const wrapper = `Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", "${encodedCommand}" -WindowStyle ${windowStyle}`;

    // We don't wait for it because it runs in background and connects back to us
    const child = spawn("powershell", ["-NoProfile", "-Command", wrapper], {
      windowsHide: !this.isDebug,
      stdio: "ignore",
    });

    this.adminProcess = child;

    child.on("error", (err) => {
      console.error("Failed to spawn admin launcher", err);
    });
  }

  public cleanup() {
    this.cleanupAdmin();
  }

  private cleanupAdmin() {
    if (this.adminSocket) {
      this.adminSocket.destroy();
      this.adminSocket = null;
    }
    if (this.adminServer) {
      this.adminServer.close();
      this.adminServer = null;
    }
    this.pendingAdminRequests.clear();
    // The ChildProcess object here is just the launcher, the actual Admin PS is detached.
    // But passing SIGTERM via Socket closure should kill the script loop if implemented correctly (ReadLine returns null).
    // Ideally we send a "exit" command.
  }
}

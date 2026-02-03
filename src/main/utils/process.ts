import { logger } from "./logger";
import { PowerShellManager } from "./powershell";

/**
 * Get executable paths for a running process by name (Windows)
 * Uses PowerShell and WMI/CIM
 */
export const getProcessPaths = async (
  processName: string,
): Promise<string[]> => {
  try {
    // Check if PowerShell is available and use it robustly via execFile
    // Arg 1: Command string. We don't need outer quotes for valid execFile args usually.
    // Use JSON output for robust parsing of ProcessId and ExecutablePath
    // This ensures we detect the process even if ExecutablePath is null (permission issues)
    const psCommand = `Get-CimInstance Win32_Process -Filter "Name = '${processName}'" | Select-Object ProcessId, ExecutablePath | ConvertTo-Json -Compress`;

    const { stdout, stderr } = await PowerShellManager.getInstance().execute(
      psCommand,
      false,
      true,
    );

    if (stderr) {
      logger.warn(`[getProcessPaths] stderr for ${processName}:`, stderr);
    }

    if (!stdout || !stdout.trim()) {
      return [];
    }

    // PowerShell ConvertTo-Json can return a single object or an array
    let result: unknown;
    try {
      result = JSON.parse(stdout);
    } catch (e) {
      logger.error(`[getProcessPaths] JSON Parse Error for ${processName}:`, e);
      return [];
    }

    const processes = Array.isArray(result) ? result : [result];

    // Extract paths.
    const paths: string[] = [];

    for (const p of processes) {
      if (p.ExecutablePath && typeof p.ExecutablePath === "string") {
        paths.push(p.ExecutablePath);
      } else {
        // Fallback: Try Get-Process if WMI failed (Permission issues?)
        // Get-Process uses name without .exe
        const nameInternal = processName.replace(/\.exe$/i, "");
        try {
          const fallbackCmd = `Get-Process -Name "${nameInternal}" | Select-Object -ExpandProperty Path | Select-Object -Unique`;
          const { stdout: fallbackOut } =
            await PowerShellManager.getInstance().execute(
              fallbackCmd,
              false,
              true,
            );

          if (fallbackOut && fallbackOut.trim()) {
            const fallbackPaths = fallbackOut
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l.length > 0);
            paths.push(...fallbackPaths);
          } else {
            paths.push("");
          }
        } catch (_err) {
          // Fallback failed (likely Access Denied)
          paths.push("");
        }
      }
    }

    // Deduplicate
    return [...new Set(paths)];
  } catch (e) {
    logger.error(`[getProcessPaths] Error executing for ${processName}:`, e);
    return [];
  }
};

/**
 * Get info for multiple running processes by names (Windows)
 * Uses a single PowerShell/WMI query for efficiency.
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  path: string;
}

export const getProcessesInfo = async (
  processNames: string[],
): Promise<ProcessInfo[]> => {
  if (processNames.length === 0) return [];

  try {
    // [Optimization] Use Get-Process instead of Get-CimInstance for polling.
    // WMI (CIM) is extremely slow and causes AppHangB1 in some environments.
    // Get-Process is much lighter.
    const names = processNames.map((n) => n.replace(/\.exe$/i, ""));
    const psCommand = `Get-Process -Name ${names.join(",")} -ErrorAction SilentlyContinue | Select-Object Id, Name, Path | ConvertTo-Json -Compress`;

    const { stdout } = await PowerShellManager.getInstance().execute(
      psCommand,
      false,
      true,
    );

    if (!stdout || !stdout.trim()) {
      return [];
    }

    let result: unknown;
    try {
      result = JSON.parse(stdout);
    } catch (_e) {
      return [];
    }

    const rawProcesses = Array.isArray(result) ? result : [result];
    const processes: ProcessInfo[] = [];

    for (const p of rawProcesses) {
      if (!p || typeof p.Id !== "number") continue;

      processes.push({
        pid: p.Id,
        name: p.Name ? `${p.Name}.exe` : "",
        path: p.Path || "",
      });
    }

    return processes;
  } catch (_e) {
    return [];
  }
};

/**
 * Check if a process is running by name
 */
export const isProcessRunning = async (
  processName: string,
): Promise<boolean> => {
  const paths = await getProcessPaths(processName);
  return paths.length > 0;
};

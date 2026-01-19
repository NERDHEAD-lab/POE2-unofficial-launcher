import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

    // console.log(`[getProcessPaths] Executing PS: ${psCommand}`);
    const { stdout, stderr } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-Command", psCommand],
      { windowsHide: true },
    );

    if (stderr) {
      console.warn(`[getProcessPaths] stderr for ${processName}:`, stderr);
    }

    if (!stdout || !stdout.trim()) {
      return [];
    }

    // PowerShell ConvertTo-Json can return a single object or an array
    let result: any;
    try {
      result = JSON.parse(stdout);
    } catch (e) {
      console.error(
        `[getProcessPaths] JSON Parse Error for ${processName}:`,
        e,
      );
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
          const { stdout: fallbackOut } = await execFileAsync(
            "powershell",
            ["-NoProfile", "-Command", fallbackCmd],
            { windowsHide: true },
          );

          if (fallbackOut && fallbackOut.trim()) {
            const fallbackPaths = fallbackOut
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l.length > 0);
            paths.push(...fallbackPaths);
          } else {
            // Still push empty string to acknowledge process exists (for running check)
            paths.push("");
          }
        } catch (err) {
          // Fallback failed (likely Access Denied)
          paths.push("");
        }
      }
    }

    // Deduplicate
    return [...new Set(paths)];
  } catch (e) {
    console.error(`[getProcessPaths] Error executing for ${processName}:`, e);
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

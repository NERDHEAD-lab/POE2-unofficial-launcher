import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Check if a process is running by name (Windows)
 */
export const isProcessRunning = async (
  processName: string,
): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync(
      "tasklist",
      ["/FI", `IMAGENAME eq ${processName}`, "/FO", "CSV", "/NH"],
      { windowsHide: true },
    );
    // If the process is running, stdout will contain the process name.
    return stdout.toLowerCase().includes(`"${processName.toLowerCase()}"`);
  } catch (_) {
    return false;
  }
};

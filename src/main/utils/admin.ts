import { exec } from "child_process";

import { app } from "electron";

import { logger } from "./logger";
import { PowerShellManager } from "./powershell";

const TASK_NAME = "POE2_Launcher_AutoStart";

/**
 * Checks if the current process has Admin privileges.
 */
export async function isAdmin(): Promise<boolean> {
  return new Promise((resolve) => {
    // "net session" requires admin rights. If it succeeds (exit code 0), we are admin.
    exec("net session", (err) => {
      resolve(!err);
    });
  });
}

/**
 * Relaunches the application with Admin privileges.
 */
export function relaunchAsAdmin() {
  logger.log("[Admin] Relaunching as Administrator...");

  const exe = app.getPath("exe");
  const args = process.argv
    .slice(1)
    .map((arg) => `"${arg}"`)
    .join(" ");

  // Use PowerShell Start-Process -Verb RunAs
  const cmd = `Start-Process -FilePath "${exe}" -ArgumentList '${args}' -Verb RunAs`;

  PowerShellManager.getInstance()
    .execute(cmd, false, true)
    .then(() => {
      app.quit();
    });
}

/**
 * Toggles Admin Auto Launch via Windows Task Scheduler.
 * This allows "Run with highest privileges" on startup without UAC prompt.
 *
 * @param enable - True to create task, False to delete task.
 * @param startMinimized - If true, adds --hidden arg.
 */
export async function setupAdminAutoLaunch(
  enable: boolean,
  startMinimized: boolean = false,
): Promise<boolean> {
  try {
    if (enable) {
      const exePath = app.getPath("exe");
      // Use 'ONLOGON' to ensure it runs when user logs in, not just system boot.
      // /rl HIGHEST is the key to bypass UAC.

      const args = startMinimized ? "--hidden" : "";

      // Note: /tr command needs to be properly quoted if path has spaces.
      // PowerShell Invoke-Expression requires backtick escaping (`) for double quotes inside a double-quoted string.
      // We aim for: /tr "`"D:\Path\`" --hidden"
      // This passes `"D:\Path" --hidden` as a single argument to /tr.
      const psQuote = '`"';
      const safeExePath = exePath; // No need to escape backslashes for PS strings usually, as \ is literal.
      const trCommand = `${psQuote}${safeExePath}${psQuote}${args ? " " + args : ""}`;

      logger.log(
        `[Admin] Registering Scheduled Task: ${TASK_NAME} (Minimized: ${startMinimized})`,
      );

      const createCmd = `schtasks /create /tn "${TASK_NAME}" /tr "${trCommand}" /sc ONLOGON /rl HIGHEST /f`;

      const result = await PowerShellManager.getInstance().execute(
        createCmd,
        true,
      ); // Use Admin Session
      if (result.code === 0) {
        logger.log("[Admin] Scheduled Task created successfully.");
        return true;
      } else {
        logger.error(`[Admin] Failed to create task: ${result.stderr}`);
        return false;
      }
    } else {
      logger.log(`[Admin] Deleting Scheduled Task: ${TASK_NAME}`);
      const deleteCmd = `schtasks /delete /tn "${TASK_NAME}" /f`;

      const result = await PowerShellManager.getInstance().execute(
        deleteCmd,
        true,
      ); // Use Admin Session
      // It's okay if it fails because it didn't exist
      if (
        result.code === 0 ||
        result.stderr.includes("The specified task name was not found")
      ) {
        return true;
      }
      logger.error(`[Admin] Failed to delete task: ${result.stderr}`);
      return false;
    }
  } catch (e) {
    logger.error("[Admin] Error in setupAdminAutoLaunch:", e);
    return false;
  }
}

/**
 * Force-starts the Admin PowerShell session.
 * This will trigger the UAC prompt if the session is not yet active.
 */
export async function ensureAdminSession(): Promise<boolean> {
  try {
    logger.log("[Admin] Ensuring persistent PowerShell Admin session...");
    // Just run a simple echo command. This triggers verifySession -> spawnProcess(Admin) -> UAC
    const result = await PowerShellManager.getInstance().execute(
      "Write-Host 'Admin Session Connected'",
      true,
    );
    return result.code === 0;
  } catch (e) {
    logger.error("[Admin] Failed to ensure admin session:", e);
    return false;
  }
}

/**
 * Checks if the PowerShell Admin Session is currently active.
 */
export function isAdminSessionActive(): boolean {
  return PowerShellManager.getInstance().isAdminSessionActive();
}

// [Refactor] Simplified Admin Utils
import { exec } from "child_process";

import { app } from "electron";

import { logger } from "./logger";
import { PowerShellManager } from "./powershell";

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
 * Force-starts the Admin PowerShell session.
 * This will trigger the UAC prompt if the session is not yet active.
 */
export async function ensureAdminSession(): Promise<boolean> {
  try {
    logger.log("[Admin] Ensuring persistent PowerShell Admin session...");
    // Just run a simple echo command. This triggers verifySession -> spawnProcess(Admin) -> UAC
    const result = await PowerShellManager.getInstance().execute(
      "Write-Output 'Admin Session Connected'",
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

import { exec } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

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
 * Uses XML Import specific configuration to bypass default restrictions (Power, Multi-Instance).
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
      const args = startMinimized ? "--hidden" : "";
      const cwd = path.dirname(exePath);

      logger.log(
        `[Admin] Registering Scheduled Task: ${TASK_NAME} (Minimized: ${startMinimized})`,
      );

      // 1. Generate XML Content
      const xmlContent = generateTaskXml(exePath, args, cwd);

      // 2. Save to Temp File
      const tempXmlPath = path.join(
        os.tmpdir(),
        `poe2-launcher-task-${Date.now()}.xml`,
      );
      await fs.writeFile(tempXmlPath, xmlContent, "utf-8");

      // 3. Register Task via XML Import
      // /f forces overwrite if exists
      const createCmd = `schtasks /create /tn "${TASK_NAME}" /xml "${tempXmlPath}" /f`;

      const result = await PowerShellManager.getInstance().execute(
        createCmd,
        true,
      ); // Use Admin Session

      // 4. Cleanup Temp File
      try {
        await fs.unlink(tempXmlPath);
      } catch {
        // Ignore cleanup failure
      }

      if (result.code === 0) {
        logger.log("[Admin] Scheduled Task created successfully.");
        return true;
      } else {
        logger.error(`[Admin] Failed to create task: ${result.stderr}`);
        return false;
      }
    } else {
      // [Optimization] Check if task exists before trying to delete it (Avoids unnecessary Admin Prompt)
      const checkCmd = `schtasks /query /tn "${TASK_NAME}"`;
      const checkResult = await PowerShellManager.getInstance().execute(
        checkCmd,
        false, // Run as Standard User
      );

      if (checkResult.code !== 0 || checkResult.stderr.trim().length > 0) {
        logger.log(
          `[Admin] Scheduled Task "${TASK_NAME}" not found (or query failed). Skipping delete.`,
        );
        return true;
      }

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
  } catch (error) {
    logger.error("[Admin] AutoLaunch setup failed:", error);
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
 * Generates XML content for Windows Task Scheduler.
 * Configures specific settings:
 * - RunLevel: HighestAvailable (Admin)
 * - MultipleInstancesPolicy: Parallel (Allow re-launch)
 * - DisallowStartIfOnBatteries: false (Allow on battery)
 * - StopIfGoingOnBatteries: false (Don't kill on unplug)
 * - ExecutionTimeLimit: PT0S (No timeout/limit)
 */
function generateTaskXml(exePath: string, args: string, cwd: string): string {
  // XML needs to span multiple lines for readability/debugging if inspected manually
  // Note: We use "InteractiveToken" logon type to ensure it runs in the user's interactive session.
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>${new Date().toISOString()}</Date>
    <Author>POE2 Unofficial Launcher</Author>
    <Description>Auto-start task for POE2 Unofficial Launcher with Administrative privileges.</Description>
    <URI>\\${TASK_NAME}</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${exePath}</Command>
      <Arguments>${args}</Arguments>
      <WorkingDirectory>${cwd}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

/**
 * Checks if the PowerShell Admin Session is currently active.
 */
export function isAdminSessionActive(): boolean {
  return PowerShellManager.getInstance().isAdminSessionActive();
}

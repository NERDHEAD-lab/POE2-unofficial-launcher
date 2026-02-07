// [Fix] Imports
import fs from "fs/promises";
import os from "os";
import path from "path";

import { app } from "electron";

import { logger } from "../../logger";
import { PowerShellManager } from "../../powershell";
import { updateUninstallScript } from "../manager";
import { UacFeature } from "../types";

const TASK_NAME = "POE2_Launcher_AutoStart";

export const AutoLaunchFeature: UacFeature & {
  enable(admin: boolean, startMinimized?: boolean): Promise<boolean>;
} = {
  async isEnabled(): Promise<boolean> {
    // Check if either Admin Task or User Registry entry exists
    try {
      const checkCmd = `schtasks /query /tn "${TASK_NAME}"`;
      const result = await PowerShellManager.getInstance().execute(
        checkCmd,
        false,
      );
      if (result.code === 0) return true;

      const loginSettings = app.getLoginItemSettings();
      return loginSettings.openAtLogin;
    } catch {
      return false;
    }
  },

  async enable(
    admin: boolean,
    startMinimized: boolean = false,
  ): Promise<boolean> {
    try {
      if (admin) {
        // 1. Admin Mode: Task Scheduler
        const exePath = app.getPath("exe");
        const args = startMinimized ? "--hidden" : "";
        const cwd = path.dirname(exePath);

        logger.log(
          `[AutoLaunch] Configuring Admin AutoLaunch (Task Scheduler)...`,
        );

        // [Restore AS-IS] Explicitly cleanup existing task first
        try {
          const checkCmd = `schtasks /query /tn "${TASK_NAME}"`;
          const checkResult = await PowerShellManager.getInstance().execute(
            checkCmd,
            false,
          );
          if (checkResult.code === 0) {
            const deleteCmd = `schtasks /delete /tn "${TASK_NAME}" /f`;
            await PowerShellManager.getInstance().execute(deleteCmd, true);
          }
        } catch {
          // ignore
        }

        // Generate XML
        const xmlContent = generateTaskXml(exePath, args, cwd);
        const tempXmlPath = path.join(
          os.tmpdir(),
          `poe2-launcher-task-${Date.now()}.xml`,
        );
        await fs.writeFile(tempXmlPath, xmlContent, "utf-8");

        const createCmd = `schtasks /create /tn "${TASK_NAME}" /xml "${tempXmlPath}" /f`;
        const result = await PowerShellManager.getInstance().execute(
          createCmd,
          true,
        ); // Admin

        try {
          await fs.unlink(tempXmlPath);
        } catch {
          // ignore
        }

        if (result.code === 0) {
          logger.log("[AutoLaunch] Admin Task created successfully.");
          await updateUninstallScript(); // Notify manager
          return true;
        } else {
          logger.error(
            `[AutoLaunch] Failed to create Admin Task: ${result.stderr}`,
          );
          return false;
        }
      } else {
        // 2. User Mode: Registry
        logger.log(`[AutoLaunch] Configuring User AutoLaunch (Registry)...`);

        // Clean up Task Scheduler first
        const checkCmd = `schtasks /query /tn "${TASK_NAME}"`;
        const checkResult = await PowerShellManager.getInstance().execute(
          checkCmd,
          false,
        );
        if (checkResult.code === 0) {
          logger.log(
            "[AutoLaunch] Removing Admin AutoLaunch (Task Scheduler)...",
          );
          const deleteCmd = `schtasks /delete /tn "${TASK_NAME}" /f`;
          await PowerShellManager.getInstance().execute(deleteCmd, true);
        }

        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: false,
          path: app.getPath("exe"),
          args: startMinimized ? ["--hidden"] : [],
        });

        await updateUninstallScript(); // Notify manager
        return true;
      }
    } catch (e) {
      logger.error("[AutoLaunch] Failed to enable auto-launch:", e);
      return false;
    }
  },

  async disable(): Promise<boolean> {
    try {
      logger.log("[AutoLaunch] Disabling all AutoLaunch methods...");

      // Registry
      app.setLoginItemSettings({
        openAtLogin: false,
        path: app.getPath("exe"),
      });

      // Task Scheduler
      const deleteCmd = `schtasks /delete /tn "${TASK_NAME}" /f`;
      await PowerShellManager.getInstance().execute(deleteCmd, true);

      await updateUninstallScript();
      return true;
    } catch (e) {
      logger.error("[AutoLaunch] Failed to disable auto-launch:", e);
      return false;
    }
  },

  async getCleanupCommands(): Promise<string[]> {
    return [
      `schtasks /delete /tn "${TASK_NAME}" /f >nul 2>&1`,
      // Registry key cleanup (User Mode)
      // Check appId from electron-builder if possible, or hardcode current value
      `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "com.nerdhead.poe2-launcher" /f >nul 2>&1`,
    ];
  },
};

/**
 * Helper: Generate XML for Task Scheduler
 */
function generateTaskXml(exePath: string, args: string, cwd: string): string {
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

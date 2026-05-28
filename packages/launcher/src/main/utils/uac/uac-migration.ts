import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

import { app } from "electron";

import { logger } from "../logger";
import { PowerShellManager } from "../powershell";

// --- Constants ---
const REG_PROTOCOL_KEY =
  "HKCU:\\Software\\Classes\\daumgamestarter\\shell\\open\\command";
const REG_LAYERS_KEY =
  "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers";
const TASK_NAME = "SkipDaumGameStarterUAC";

// New Work Dir for Migration (Temporary storage if needed)
/**
 * Directory for legacy UAC bypass files (proxy.vbs, etc.)
 * Note: This function only returns the path and DOES NOT create the directory.
 * This prevents detectLegacy() from triggering false positives.
 */
function getLegacyWorkDirectory(): string {
  return join(app.getPath("userData"), "uac_bypass");
}

/**
 * Directory for the new UAC cleaner/uninstaller scripts.
 * Use a separate name from "uac_bypass" to avoid triggering legacy migration prompts.
 */
function getUacCleanerDirectory(): string {
  const workDir = join(app.getPath("userData"), "daumgamestarter_uac");
  if (!existsSync(workDir)) {
    try {
      mkdirSync(workDir, { recursive: true });
    } catch (e) {
      logger.error("[UAC] Failed to create cleaner directory:", e);
    }
  }
  return workDir;
}

// --- Helper: Extract Exe Path ---
const extractExePath = (cmd: string): string | null => {
  if (!cmd) return null;
  // Match pattern: "C:\Path\To\Exe" "%1" or C:\Path\To\Exe "%1"
  const match = cmd.match(/^"([^"]+)"/);
  if (match && match[1]) return match[1];

  // Fallback: Split by space and take first part if it ends with .exe and exists
  const parts = cmd.split(" ");
  if (parts.length > 0 && parts[0].toLowerCase().endsWith(".exe")) {
    return parts[0];
  }
  return null;
};

// --- Helper: Get Registry Value ---
async function getRegValue(
  path: string,
  name: string = "(default)",
): Promise<string | null> {
  try {
    const cmd = `Get-ItemProperty -Path "${path}" -Name "${name}" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty "${name}"`;
    const result = await PowerShellManager.getInstance().execute(cmd, false);
    if (result.code === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch (_e) {
    // Fixed: _e
    // Ignore error
  }
  return null;
}

// ==========================================
// 1. Legacy Detection & Cleanup
// ==========================================

export const LegacyUacManager = {
  /**
   * Detect if Legacy Bypass (Proxy/Scheduler) is active.
   */
  async detectLegacy(): Promise<boolean> {
    logger.log("[UAC-Migration] Starting Legacy Detection...");

    // 1. Check Registry
    const cmd = await getRegValue(REG_PROTOCOL_KEY);
    if (cmd && cmd.toLowerCase().includes("proxy.vbs")) {
      logger.log("[UAC-Migration] Detected Legacy: proxy.vbs in registry.");
      return true;
    }

    // 2. Check Task
    const taskNames = [TASK_NAME];
    for (const task of taskNames) {
      const taskCheck = await PowerShellManager.getInstance().execute(
        `Get-ScheduledTask -TaskName "${task}" -ErrorAction SilentlyContinue`,
        false,
      );
      if (
        taskCheck.code === 0 &&
        taskCheck.stdout &&
        taskCheck.stdout.trim().length > 0
      ) {
        logger.log(
          `[UAC-Migration] Detected Legacy: Scheduled Task exists (${task}).`,
        );
        return true;
      }
    }

    // 3. Check Legacy Folder (Garbage Collection)
    // Validate existence WITHOUT creating it (getWorkDirectory generates it if missing)
    const workDir = getLegacyWorkDirectory();
    if (existsSync(workDir)) {
      logger.log(
        `[UAC-Migration] Detected Legacy: Folder exists at ${workDir}`,
      );
      return true;
    }

    logger.log("[UAC-Migration] No legacy traces found.");
    return false;
  },

  /**
   * Remove Legacy Bypass (Delete Task, Restore Registry, Delete Files).
   */
  async cleanupLegacy(): Promise<boolean> {
    logger.log("[UAC-Migration] Cleaning up legacy bypass...");

    try {
      // 1. Delete Task (Force) - Check both known names
      const taskNames = [TASK_NAME];

      for (const task of taskNames) {
        logger.log(
          `[UAC-Migration] Attempting to remove scheduled task: ${task}`,
        );
        const deleteResult = await PowerShellManager.getInstance().execute(
          `Unregister-ScheduledTask -TaskName "${task}" -Confirm:$false -ErrorAction Stop`,
          true, // Elevated
        );

        if (deleteResult.code !== 0) {
          // Ignorable error if task doesn't exist, but we should log it
          if (!deleteResult.stderr.includes("MSFT_ScheduledTask")) {
            logger.error(
              `[UAC-Migration] Failed to delete task (${task}): ${deleteResult.stderr}`,
            );
          } else {
            logger.log(
              `[UAC-Migration] Task (${task}) already removed (not found).`,
            );
          }
        } else {
          // Even if code is 0, check stderr for "Task not found" warnings (PowerShell weirdness)
          if (
            deleteResult.stderr &&
            deleteResult.stderr.includes("MSFT_ScheduledTask")
          ) {
            logger.log(
              `[UAC-Migration] Task (${task}) verified missing (not found).`,
            );
          } else {
            logger.log(
              `[UAC-Migration] Scheduled Task (${task}) removed successfully.`,
            );
          }
        }
      }

      // 2. Restore Registry
      const currentCmd = await getRegValue(REG_PROTOCOL_KEY);
      const workDir = getLegacyWorkDirectory();

      if (currentCmd && currentCmd.toLowerCase().includes("proxy.vbs")) {
        // Try to find backup
        const backupPath = join(workDir, "original_command.txt");
        let originalCmd = "";

        if (existsSync(backupPath)) {
          originalCmd = readFileSync(backupPath, "utf8").trim();
        } else {
          // Fallback guess: Try to find DaumGameStarter in standard paths?
          // For now, if no backup, we define a standard guess or rely on user reinstall.
          // Or we can try to find the exe path from the 'runner.vbs' if it exists.
          logger.warn(
            "[UAC-Migration] No backup found. Attempting to restore from common path is risky. Skipping registry restore (Manual fix might be needed if original is lost).",
          );
          // TODO: Improve this if needed. But usually, if we just delete the proxy, it breaks.
          // Wait, if we use RUNASINVOKER, we MUST restore the original command to point to the EXE.
          // Let's try to parse 'launch_args.txt' or 'runner.vbs' implemented in previous version?
          // Actually, let's look for "DaumGameStarter.exe" in standard location if backup fails?
          // Default: "C:\DaumGames\DaumGameStarter\daumgamestarter.exe" "%1"
          const defaultPath =
            "C:\\DaumGames\\DaumGameStarter\\daumgamestarter.exe";
          if (existsSync(defaultPath)) {
            originalCmd = `"${defaultPath}" "%1"`;
          }
        }

        if (originalCmd) {
          // Restore
          const script = `Set-ItemProperty -Path "${REG_PROTOCOL_KEY}" -Name "(default)" -Value '${originalCmd}'`;
          await PowerShellManager.getInstance().execute(script, false);
          logger.log("[UAC-Migration] Registry restored to:", originalCmd);
        }
      }

      // 3. Delete Files (uac_bypass dir)
      if (existsSync(workDir)) {
        rmSync(workDir, { recursive: true, force: true });
        logger.log("[UAC-Migration] Working directory deleted.");
      }

      return true;
    } catch (e) {
      logger.error("[UAC-Migration] Cleanup failed:", e);
      return false;
    }
  },
};

// ==========================================
// 2. New RUNASINVOKER Bypass
// ==========================================

// --- Helper: Get Actual DaumGameStarter Path ---
async function getDaumStarterPath(): Promise<string | null> {
  let exePath: string | null = null;
  const daumStarterCmd = await getRegValue(REG_PROTOCOL_KEY);

  if (daumStarterCmd) {
    exePath = extractExePath(daumStarterCmd);
  }

  // If path found and valid (not proxy), return it
  if (exePath && !exePath.toLowerCase().includes("wscript.exe")) {
    return exePath;
  }

  // Fallback Logic
  logger.warn(
    "[SimpleUac] Registry path detection failed or returned proxy. Checking specific fallback...",
  );

  // User Specification: Only check this specific path if registry fails.
  // [IMPORTANT] DaumGamesStarter is forced to be installed in C:\Users\Default path
  // which is why this bypass is required in the first place.
  const fallbackPath =
    "C:\\Users\\Default\\AppData\\Roaming\\DaumGames\\DaumGameStarter.exe";

  if (existsSync(fallbackPath)) {
    logger.log(
      `[SimpleUac] Found DaumGameStarter at fallback: ${fallbackPath}`,
    );
    return fallbackPath;
  }

  logger.warn(
    "[SimpleUac] Could not find DaumGameStarter.exe in registry or default fallback.",
  );
  return null;
}

export const SimpleUacBypass = {
  /**
   * Apply or Remove RUNASINVOKER layer for DaumGameStarter.
   */
  async setRunAsInvoker(enable: boolean): Promise<boolean> {
    const exePath = await getDaumStarterPath();

    if (!exePath) {
      logger.error(
        "[SimpleUac] Aborting RUNASINVOKER configuration: Executable path not found.",
      );
      return false;
    }

    if (!existsSync(exePath)) {
      logger.error(`[SimpleUac] DaumGameStarter.exe not found at: ${exePath}`);
      return false;
    }

    try {
      const regName = exePath; // Registry Value Name must be the full path
      const regValue = "RUNASINVOKER";
      const cleanerDir = getUacCleanerDirectory();
      const uninstallBatPath = join(cleanerDir, "uninstall_uac.bat");

      if (enable) {
        // Ensure Key Exists
        const ensureKeyCmd = `if (-not (Test-Path "${REG_LAYERS_KEY}")) { New-Item -Path "${REG_LAYERS_KEY}" -Force }`;
        await PowerShellManager.getInstance().execute(ensureKeyCmd, false);

        // Add Value
        const cmd = `Set-ItemProperty -Path "${REG_LAYERS_KEY}" -Name "${regName}" -Value "${regValue}" -Force`;
        await PowerShellManager.getInstance().execute(cmd, false);
        logger.log(`[SimpleUac] Applied RUNASINVOKER to ${exePath}`);

        // Generate uninstall script for NSIS uninstaller
        // We use batch file so NSIS can run it easily without JS environment
        const batKey = REG_LAYERS_KEY.replace("HKCU:\\", "HKCU\\");
        const batContent = `@echo off\r\nreg delete "${batKey}" /v "${exePath}" /f\r\n`;
        writeFileSync(uninstallBatPath, batContent, "utf8");
        logger.log(
          `[SimpleUac] Generated uninstall script: ${uninstallBatPath}`,
        );
      } else {
        // Remove
        const cmd = `Remove-ItemProperty -Path "${REG_LAYERS_KEY}" -Name "${regName}" -ErrorAction SilentlyContinue`;
        await PowerShellManager.getInstance().execute(cmd, false);
        logger.log(`[SimpleUac] Removed RUNASINVOKER from ${exePath}`);

        // Cleanup uninstall script
        if (existsSync(uninstallBatPath)) {
          rmSync(uninstallBatPath, { force: true });
          logger.log("[SimpleUac] Removed uninstall script.");
        }
      }
      return true;
    } catch (e) {
      logger.error("[SimpleUac] Failed to set registry:", e);
      return false;
    }
  },

  async isRunAsInvokerEnabled(): Promise<boolean> {
    // Dynamic Path Detection
    const exePath = await getDaumStarterPath();
    if (!exePath) return false;

    // Check Registry
    const value = await getRegValue(REG_LAYERS_KEY, exePath);
    const isEnabled = value?.includes("RUNASINVOKER") ?? false;

    logger.log(`[SimpleUac] Check Status: ${isEnabled} (Path: ${exePath})`);
    return isEnabled;
  },
};

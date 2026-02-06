import fs from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import { PowerShellManager } from "./powershell";
import { AppConfig } from "../../shared/types";
import { logger } from "../utils/logger";

/**
 * Registry Mapping for Game Installation Paths
 */
const REGISTRY_MAP: Record<
  AppConfig["serviceChannel"],
  Record<AppConfig["activeGame"], { path: string; key: string }>
> = {
  "Kakao Games": {
    POE1: {
      path: "HKCU:\\Software\\DaumGames\\POE",
      key: "InstallPath",
    },
    POE2: {
      path: "HKCU:\\Software\\DaumGames\\POE2",
      key: "InstallPath",
    },
  },
  GGG: {
    POE1: {
      path: "HKCU:\\Software\\GrindingGearGames\\Path of Exile",
      key: "InstallLocation",
    },
    POE2: {
      path: "HKCU:\\Software\\GrindingGearGames\\Path of Exile 2",
      key: "InstallLocation",
    },
  },
};

export const DAUM_STARTER_PROTOCOL_KEY =
  "Registry::HKEY_CLASSES_ROOT\\daumgamestarter\\shell\\open\\command";

// @ts-expect-error - injected by vite
const APP_GUID = __APP_GUID__;

export const LAUNCHER_UNINSTALL_REG_KEY = `Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_GUID}`;

/**
 * Standardize registry paths to PowerShell Registry:: provider format
 */
const standardizeRegPath = (path: string): string => {
  if (path.startsWith("HKCU:\\"))
    return path.replace("HKCU:\\", "Registry::HKEY_CURRENT_USER\\");
  if (path.startsWith("HKLM:\\"))
    return path.replace("HKLM:\\", "Registry::HKEY_LOCAL_MACHINE\\");
  if (path.startsWith("HKCR:\\"))
    return path.replace("HKCR:\\", "Registry::HKEY_CLASSES_ROOT\\");
  return path;
};

/**
 * Normalize installation path by removing trailing slashes and ensuring consistent separators
 */
const normalizePath = (rawPath: string): string => {
  if (!rawPath) return "";
  let normalized = path.normalize(rawPath.trim());
  while (normalized.endsWith("\\") || normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

/**
 * Executes a PowerShell command, optionally with Admin privileges (RunAs).
 */
/**
 * Executes a PowerShell command, optionally with Admin privileges (RunAs).
 * Delegates to the Singleton PowerShellManager.
 */
export const runPowerShell = async (
  psCommand: string,
  useAdmin: boolean = false,
): Promise<{ stdout: string; stderr: string; code: number | null }> => {
  return PowerShellManager.getInstance().execute(psCommand, useAdmin);
};

/**
 * Reads a single registry value
 */
export const readRegistryValue = async (
  regPath: string,
  key: string,
): Promise<string | null> => {
  try {
    const finalPath = standardizeRegPath(regPath);
    // Safer retrieval: Get-ItemProperty directly
    const psCommand = `
      if (Test-Path "${finalPath}") {
        $prop = Get-ItemProperty -Path "${finalPath}" -Name "${key}" -ErrorAction SilentlyContinue
        if ($prop) {
            $prop."${key}"
        }
      }
    `.trim();

    const { stdout, code } = await runPowerShell(psCommand);

    if (code === 0 && stdout && stdout.trim()) {
      return stdout.trim();
    }
    return null;
  } catch (_e) {
    return null;
  }
};

/**
 * Writes a single registry value
 */
export const writeRegistryValue = async (
  regPath: string,
  key: string,
  value: string,
  useAdmin: boolean = false,
): Promise<boolean> => {
  try {
    const finalPath = standardizeRegPath(regPath);
    // Escape single quotes in value for PowerShell single-quoted string
    const safeValue = value.replace(/'/g, "''");

    const psCommand = `
      if (-not (Test-Path "${finalPath}")) {
        New-Item -Path "${finalPath}" -Force | Out-Null
      }
      Set-ItemProperty -Path "${finalPath}" -Name "${key}" -Value '${safeValue}' -Type String -Force
    `.trim();

    const { code } = await runPowerShell(psCommand, useAdmin);
    return code === 0;
  } catch (_e) {
    return false;
  }
};

/**
 * Identify the installation path of the game from Windows Registry
 */
export const getGameInstallPath = async (
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
): Promise<string | null> => {
  const registryInfo = REGISTRY_MAP[serviceId]?.[gameId];
  if (!registryInfo) return null;

  const rawPath = await readRegistryValue(registryInfo.path, registryInfo.key);
  return rawPath ? normalizePath(rawPath) : null;
};

/**
 * Reads the DaumGameStarter protocol command
 * Default key (empty string name) in HKCR
 */
export const getDaumGameStarterCommand = async (): Promise<string | null> => {
  const finalPath = standardizeRegPath(DAUM_STARTER_PROTOCOL_KEY);
  // Most robust way to get (Default) value across all hives
  const psCommand = `
    if (Test-Path "${finalPath}") {
      (Get-Item -Path "${finalPath}").GetValue("")
    }
  `.trim();
  const { stdout, code } = await runPowerShell(psCommand);
  return code === 0 && stdout ? stdout.trim() : null;
};

/**
 * Updates the DaumGameStarter protocol command
 */
export const setDaumGameStarterCommand = async (
  command: string,
): Promise<boolean> => {
  // Try to write to both HKCU and HKLM to ensure override or machine-wide update
  const psCommand = `
    $ErrorActionPreference = "Stop"
    $paths = @(
      "Registry::HKEY_CURRENT_USER\\Software\\Classes\\daumgamestarter\\shell\\open\\command",
      "Registry::HKEY_LOCAL_MACHINE\\Software\\Classes\\daumgamestarter\\shell\\open\\command"
    )
    $success = $false
    foreach ($p in $paths) {
      if (Test-Path $p) {
        try {
          Set-Item -Path $p -Value "${command}" -Force
          $success = $true
        } catch {
          # Might fail due to permissions, continue to next path
        }
      }
    }
    
    if (-not $success) {
      # Fallback: create in HKCU as a user-level override
      $p = "Registry::HKEY_CURRENT_USER\\Software\\Classes\\daumgamestarter\\shell\\open\\command"
      New-Item -Path $p -Force | Out-Null
      Set-Item -Path $p -Value "${command}" -Force
      $success = $true
    }
    
    Write-Host "RESULT:$success"
  `.trim();
  const { stdout, code } = await runPowerShell(psCommand, true);
  return code === 0 && stdout.includes("RESULT:True");
};

/**
 * Checks if the game is actually installed by verifying registry path and folder presence
 */
export const isGameInstalled = async (
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
): Promise<boolean> => {
  try {
    const installPath = await getGameInstallPath(serviceId, gameId);
    if (!installPath) return false;

    // Check if directory exists
    const stats = await fs.stat(installPath);
    return stats.isDirectory();
  } catch (_e) {
    return false;
  }
};

/**
 * Synchronizes the app's installation path in the registry with the actual current execution path.
 * This is crucial for fixing the issue where manual move (copy-paste) causes updates to land in the old directory.
 */
export async function syncInstallLocation() {
  if (!app.isPackaged) return;

  try {
    const currentExePath = app.getPath("exe");
    const currentInstallDir = path.dirname(currentExePath);
    const exeName = path.basename(currentExePath);
    // [Fix] Use explicit Product Name from Build Configuration (Single Source of Truth)
    // @ts-expect-error - injected by vite
    const productName = __PRODUCT_NAME__;
    const uninstallerName = `Uninstall ${productName}.exe`;

    // [Strict] We only update if the key explicitly exists. No arbitrary creation.
    const targetKey = LAUNCHER_UNINSTALL_REG_KEY;

    // Verify key existence before doing anything
    const psCheckCommand = `Test-Path "${targetKey}"`;
    const { stdout: exists } = await runPowerShell(psCheckCommand);

    if (exists.trim().toLowerCase() !== "true") {
      logger.warn(
        `[Main] Registry key not found for ${productName}. Skipping sync to avoid registry pollution.`,
      );
      return;
    }

    const updates = [
      { key: "InstallLocation", value: currentInstallDir },
      {
        key: "UninstallString",
        value: `"${path.join(currentInstallDir, uninstallerName)}" /currentuser`,
      },
      {
        key: "QuietUninstallString",
        value: `"${path.join(currentInstallDir, uninstallerName)}" /currentuser /S`,
      },
      {
        key: "DisplayIcon",
        value: `${path.join(currentInstallDir, exeName)},0`,
      },
    ];

    for (const update of updates) {
      const currentValue = await readRegistryValue(targetKey, update.key);

      if (!currentValue) {
        logger.warn(
          `[Main] Registry Value for ${update.key} is missing. Restoring...`,
        );
        await writeRegistryValue(targetKey, update.key, update.value, false);
      } else if (currentValue !== update.value) {
        logger.log(
          `[Main] Updating ${update.key}: "${currentValue}" -> "${update.value}"`,
        );
        await writeRegistryValue(targetKey, update.key, update.value, false);
      } else {
        // Value matches, do strictly nothing
      }
    }
  } catch (error) {
    logger.error("[Main] Error during InstallLocation synchronization:", error);
  }
}

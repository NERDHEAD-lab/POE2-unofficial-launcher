import fs from "node:fs/promises";
import path from "node:path";

import { PowerShellManager } from "./powershell";
import { AppConfig } from "../../shared/types";

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
    // Safer retrieval: GetValue() for the key object
    const psCommand = `
      if (Test-Path "${finalPath}") {
        (Get-Item -Path "${finalPath}").GetValue("${key}")
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
    const psCommand = `
      if (-not (Test-Path "${finalPath}")) {
        New-Item -Path "${finalPath}" -Force | Out-Null
      }
      Set-ItemProperty -Path "${finalPath}" -Name "${key}" -Value "${value}" -Type String -Force
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
 * Finds the actual registry key for a given product name in the Uninstall section
 */
export const findUninstallKeyByName = async (
  productName: string,
): Promise<string | null> => {
  const uninstallRoot =
    "Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
  const psCommand = `
    Get-ChildItem -Path "${uninstallRoot}" | ForEach-Object {
      $val = Get-ItemProperty $_.PSPath
      if ($val.DisplayName -eq "${productName}") {
        $_.PSPath
      }
    }
  `.trim();

  const { stdout, code } = await runPowerShell(psCommand);
  if (code === 0 && stdout && stdout.trim()) {
    // Return the first match, converting PSPath format to our standardized Registry:: format
    const foundPath = stdout.trim().split("\n")[0].trim();
    if (foundPath.startsWith("Microsoft.PowerShell.Core\\Registry::")) {
      return foundPath.replace(
        "Microsoft.PowerShell.Core\\Registry::",
        "Registry::",
      );
    }
    return foundPath;
  }
  return null;
};

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

const DAUM_STARTER_PROTOCOL_KEY =
  "HKCR:\\daumgamestarter\\shell\\open\\command";

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
    const psCommand = `(Get-ItemProperty -Path "${regPath}" -Name "${key}" -ErrorAction Stop)."${key}"`;
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
    // Ensure parent path exists (for HKCU/HKLM)
    // const parts = regPath.split("\\");
    // const hive = parts[0]; // e.g., HKCU:
    // const subPath = parts.slice(1).join("\\");

    const psCommand = `
      if (-not (Test-Path "${regPath}")) {
        New-Item -Path "${regPath}" -Force | Out-Null
      }
      Set-ItemProperty -Path "${regPath}" -Name "${key}" -Value "${value}" -Type String -Force
    `;

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
  // For the (Default) value, we use PS notation : (Get-Item -Path "...")."(default)"
  // Or Get-ItemPropertyValue
  const psCommand = `(Get-Item -Path "${DAUM_STARTER_PROTOCOL_KEY}" -ErrorAction Stop)."(default)"`;
  const { stdout, code } = await runPowerShell(psCommand);
  return code === 0 && stdout ? stdout.trim() : null;
};

/**
 * Updates the DaumGameStarter protocol command
 */
export const setDaumGameStarterCommand = async (
  command: string,
): Promise<boolean> => {
  // Setting the (Default) value
  const psCommand = `Set-Item -Path "Registry::${DAUM_STARTER_PROTOCOL_KEY}" -Value "${command.replace(
    /"/g,
    '`"',
  )}" -Force`;
  const { code } = await runPowerShell(psCommand, true);
  return code === 0;
};

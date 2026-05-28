import { execFile } from "node:child_process";
import path from "node:path";

import type { PobGame } from "@poe2-launcher/shared/types";

import type {
  PobWrapperInstallLocation,
  PobWrapperInstallLocator,
  PobWrapperRegistrySource,
} from "./installLocation";

interface PobRegistryEntry {
  path: string;
  source: PobWrapperRegistrySource;
}

interface PowerShellResult {
  stdout: string;
  code: number | null;
}

export type PowerShellRunner = (command: string) => Promise<PowerShellResult>;

const POB_REGISTRY_PATHS: Record<PobGame, readonly PobRegistryEntry[]> = {
  POE2: [
    {
      path: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Path of Building Community (PoE2)",
      source: "HKCU",
    },
    {
      path: "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Path of Building Community (PoE2)",
      source: "HKLM",
    },
  ],
  POE1: [],
};

const standardizeRegPath = (value: string): string => {
  if (value.startsWith("HKCU:\\"))
    return value.replace("HKCU:\\", "Registry::HKEY_CURRENT_USER\\");
  if (value.startsWith("HKLM:\\"))
    return value.replace("HKLM:\\", "Registry::HKEY_LOCAL_MACHINE\\");
  return value;
};

const normalizePath = (rawPath: string): string => {
  let normalized = path.normalize(rawPath.trim().replace(/^"|"$/g, ""));
  while (normalized.endsWith("\\") || normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

const runPowerShell: PowerShellRunner = (command) =>
  new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      { windowsHide: true },
      (error, stdout) => {
        const errorCode = (error as NodeJS.ErrnoException | null)?.code;
        resolve({
          stdout,
          code: typeof errorCode === "number" ? errorCode : error ? 1 : 0,
        });
      },
    );
  });

const readRegistryValue = async (
  runner: PowerShellRunner,
  regPath: string,
  key: string,
): Promise<string | null> => {
  const finalPath = standardizeRegPath(regPath);
  const command = `
    if (Test-Path "${finalPath}") {
      $prop = Get-ItemProperty -Path "${finalPath}" -Name "${key}" -ErrorAction SilentlyContinue
      if ($prop) {
          $prop."${key}"
      }
    }
  `.trim();
  const { stdout, code } = await runner(command);
  return code === 0 && stdout.trim() ? stdout.trim() : null;
};

export const createWindowsPobInstallLocator =
  (runner: PowerShellRunner = runPowerShell): PobWrapperInstallLocator =>
  async (game: PobGame): Promise<PobWrapperInstallLocation> => {
    if (process.platform !== "win32") {
      return { installLocation: null, source: null };
    }
    for (const { path: regPath, source } of POB_REGISTRY_PATHS[game]) {
      const raw = await readRegistryValue(runner, regPath, "InstallLocation");
      if (raw) {
        return {
          installLocation: normalizePath(raw),
          source,
        };
      }
    }
    return { installLocation: null, source: null };
  };

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import { app } from "electron";

import { logger } from "../logger";

// [Refactor] Using Registry Pattern to break circular dependency
export const UacManager = {
  features: {} as Record<string, import("./types").UacFeature>,

  register(name: string, feature: import("./types").UacFeature) {
    this.features[name] = feature;
  },

  /**
   * Updates the `uninstall_uac.bat` script by collecting cleanup commands from all features.
   * This is called automatically by features when their state changes.
   */
  async updateUninstallScript(): Promise<void> {
    try {
      const workDir = getWorkDirectory();

      // 1. Collect Valid Cleanup Commands
      const allCmds: string[] = [];
      const featureNames = Object.keys(this.features);

      for (const name of featureNames) {
        try {
          const cmds = await this.features[name].getCleanupCommands();
          if (cmds && cmds.length > 0) {
            allCmds.push(`:: --- ${name} Cleanup ---`);
            allCmds.push(...cmds);
            allCmds.push(""); // Empty line
          }
        } catch (err) {
          logger.warn(
            `[UacManager] Failed to get cleanup commands for ${name}:`,
            err,
          );
        }
      }

      // 2. Build Script Content
      const batContent = `\ufeff
@echo off
chcp 65001 >nul

:: Check for permissions
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run
)

:: Re-launch as admin with Wait
echo Requesting admin privileges...
powershell -Command "Start-Process -FilePath '%comspec%' -ArgumentList '/c', '\\"%~f0\\"' -Verb RunAs -Wait"
exit /b

:run
${allCmds.join("\r\n")}
        `.trim();

      // 3. Write File
      const batPath = join(workDir, "uninstall_uac.bat");
      writeFileSync(batPath, batContent, { encoding: "utf8" });
      logger.log("[UacManager] Updated uninstaller script at:", batPath);
    } catch (e) {
      logger.error("[UacManager] Failed to update uninstaller script:", e);
    }
  },
};

/**
 * Helper: Resolve Work Directory (uac_bypass)
 * (Ideally this should be a shared constant)
 */
function getWorkDirectory(): string {
  const userDataPath = app.getPath("userData");
  const bypassDir = join(userDataPath, "uac_bypass");
  if (!existsSync(bypassDir)) {
    mkdirSync(bypassDir, { recursive: true });
  }
  return bypassDir;
}

// Export specific features for convenience if needed, or consumers can use UacManager.features...
// Creating a facade for backward compatibility or ease of use
export const updateUninstallScript = () => UacManager.updateUninstallScript();

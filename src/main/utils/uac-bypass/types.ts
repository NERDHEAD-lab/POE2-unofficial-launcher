export interface UacFeature {
  enable(...args: unknown[]): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  disable(): Promise<boolean>;

  /**
   * Returns a list of PS/Batch commands needed to cleanup this feature during uninstall.
   * e.g., ["schtasks /delete ...", "reg delete ..."]
   */
  getCleanupCommands(): Promise<string[]>;
}

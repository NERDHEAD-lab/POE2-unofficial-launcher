import { describe, expect, it, vi } from "vitest";

import { getPobVaultStatus } from "./status";

import type { PobVaultDetectedVersion } from "./validator";
import type { PoBVault } from "./vault";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
  BrowserWindow: {
    fromWebContents: () => null,
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

const vaultWithActive = (version: string | null): PoBVault =>
  ({
    getActive: vi.fn(async () =>
      version ? { version, vaultPath: `D:\\vault\\${version}` } : null,
    ),
  }) as unknown as PoBVault;

const detectVersion = (
  version: string,
): ((installLocation: string) => Promise<PobVaultDetectedVersion>) =>
  vi.fn(
    async (_installLocation: string): Promise<PobVaultDetectedVersion> => ({
      version,
      source: "manifest",
    }),
  );

describe("getPobVaultStatus", () => {
  it("reports not-configured when no install location is available", async () => {
    const snapshot = await getPobVaultStatus({
      vault: vaultWithActive(null),
      installLocation: null,
      now: () => "2026-05-28T00:00:00.000Z",
    });

    expect(snapshot).toMatchObject({
      state: "not-configured",
      installLocation: null,
      installVersion: null,
      active: null,
      checkedAt: "2026-05-28T00:00:00.000Z",
    });
  });

  it("reports ok when active vault and install versions match", async () => {
    const snapshot = await getPobVaultStatus({
      vault: vaultWithActive("0.17.0"),
      installLocation: "D:\\PoB",
      detectVersion: detectVersion("0.17.0"),
    });

    expect(snapshot.state).toBe("ok");
    expect(snapshot.active?.version).toBe("0.17.0");
    expect(snapshot.installVersion?.version).toBe("0.17.0");
  });

  it("reports fallback when active vault differs from the install version", async () => {
    const snapshot = await getPobVaultStatus({
      vault: vaultWithActive("0.16.0"),
      installLocation: "D:\\PoB",
      detectVersion: detectVersion("0.17.0"),
    });

    expect(snapshot.state).toBe("fallback");
    expect(snapshot.active?.version).toBe("0.16.0");
    expect(snapshot.installVersion?.version).toBe("0.17.0");
  });

  it("reports uninitialized when an install exists but no active vault is available", async () => {
    const snapshot = await getPobVaultStatus({
      vault: vaultWithActive(null),
      installLocation: "D:\\PoB",
      detectVersion: detectVersion("0.17.0"),
    });

    expect(snapshot.state).toBe("uninitialized");
    expect(snapshot.installVersion?.version).toBe("0.17.0");
  });
});

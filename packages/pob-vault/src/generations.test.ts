import { describe, expect, it, vi } from "vitest";

import { getPobVaultGenerations } from "./generations";

import type { PoBVault } from "./vault";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
}));

describe("getPobVaultGenerations", () => {
  it("maps vault generations to the shared read-only snapshot contract", async () => {
    const vault = {
      getActive: vi.fn(async () => ({
        version: "0.17.0",
        vaultPath: "D:\\vault\\0.17.0",
      })),
      listGenerations: vi.fn(async () => [
        {
          version: "0.17.0",
          vaultPath: "D:\\vault\\0.17.0",
          sizeBytes: 1024,
          metadata: {
            version: "0.17.0",
            sourceInstallLocation: "D:\\PoB",
            copiedAt: "2026-05-28T00:00:00.000Z",
            smokeTestPassedAt: "2026-05-28T00:01:00.000Z",
            hash: null,
          },
        },
        {
          version: "0.16.0",
          vaultPath: "D:\\vault\\0.16.0",
          sizeBytes: 512,
          metadata: null,
        },
      ]),
    } as unknown as PoBVault;

    await expect(getPobVaultGenerations(vault)).resolves.toEqual([
      {
        version: "0.17.0",
        vaultPath: "D:\\vault\\0.17.0",
        sizeBytes: 1024,
        active: true,
        copiedAt: "2026-05-28T00:00:00.000Z",
        smokeTestPassedAt: "2026-05-28T00:01:00.000Z",
      },
      {
        version: "0.16.0",
        vaultPath: "D:\\vault\\0.16.0",
        sizeBytes: 512,
        active: false,
        copiedAt: null,
        smokeTestPassedAt: null,
      },
    ]);
  });
});

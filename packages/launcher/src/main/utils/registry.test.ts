import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPobInstallPath } from "./registry";

const executeMock = vi.fn();

vi.mock("./powershell", () => {
  return {
    PowerShellManager: {
      getInstance: () => ({ execute: executeMock }),
    },
  };
});

// electron app — registry.ts 가 import 하므로 stub 만 제공.
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => "",
  },
}));

const ps = (stdout: string, code = 0) => ({ stdout, stderr: "", code });

describe("getPobInstallPath", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("returns HKCU when HKCU has the key", async () => {
    executeMock.mockResolvedValueOnce(
      ps("G:\\Path of Building Community (PoE2)"),
    );
    const result = await getPobInstallPath("POE2");
    expect(result.source).toBe("HKCU");
    expect(result.installLocation).toBe(
      "G:\\Path of Building Community (PoE2)",
    );
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to HKLM when HKCU is empty", async () => {
    executeMock
      .mockResolvedValueOnce(ps(""))
      .mockResolvedValueOnce(ps("C:\\Program Files\\Path of Building"));
    const result = await getPobInstallPath("POE2");
    expect(result.source).toBe("HKLM");
    expect(result.installLocation).toBe("C:\\Program Files\\Path of Building");
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when neither hive has the key", async () => {
    executeMock.mockResolvedValueOnce(ps("")).mockResolvedValueOnce(ps(""));
    const result = await getPobInstallPath("POE2");
    expect(result.source).toBeNull();
    expect(result.installLocation).toBeNull();
  });

  it("strips surrounding quotes from the registry value (PoC-0.3)", async () => {
    executeMock.mockResolvedValueOnce(
      ps('"G:\\Path of Building Community (PoE2)"'),
    );
    const result = await getPobInstallPath("POE2");
    expect(result.installLocation).toBe(
      "G:\\Path of Building Community (PoE2)",
    );
    expect(result.source).toBe("HKCU");
  });

  it("normalizes trailing separators", async () => {
    executeMock.mockResolvedValueOnce(
      ps("G:\\Path of Building Community (PoE2)\\\\"),
    );
    const result = await getPobInstallPath("POE2");
    expect(result.installLocation).toBe(
      "G:\\Path of Building Community (PoE2)",
    );
  });

  it("returns null for POE1 (registry entries not yet populated)", async () => {
    const result = await getPobInstallPath("POE1");
    expect(result.installLocation).toBeNull();
    expect(result.source).toBeNull();
    expect(executeMock).not.toHaveBeenCalled();
  });
});

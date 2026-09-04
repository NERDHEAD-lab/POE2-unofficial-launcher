import { afterEach, describe, expect, it, vi } from "vitest";

import { CONFIG_METADATA, DEFAULT_CONFIG } from "../../shared/config";
import * as powershell from "../utils/powershell";

const targets = ["PathOfExile_KG.exe", "PathOfExile.exe"] as const;
const pm = powershell.PowerShellManager.getInstance();
const payload = (kg: boolean | null, ggg: boolean | null) => ({
  state: { [targets[0]]: kg, [targets[1]]: ggg },
  errors: {},
});

afterEach(() => vi.restoreAllMocks());

describe("font force apply config", () => {
  it("registers a nullable per-executable display cache and metadata", () => {
    expect(DEFAULT_CONFIG.fontForceApplyState).toEqual(
      payload(null, null).state,
    );
    expect(Object.values(CONFIG_METADATA)).toContainEqual(
      expect.objectContaining({ key: "fontForceApplyState" }),
    );
  });
});

describe("font force apply PowerShell boundary", () => {
  it("reads only the two fixed executable policies with enum names and system fallback", () => {
    const script = powershell.buildGetFontForceApplyScript();
    for (const target of targets) expect(script).toContain(`'${target}'`);
    expect(script).toContain("Get-ProcessMitigation -Name");
    expect(script).toContain("Get-ProcessMitigation -System");
    expect(script).toContain("DisableNonSystemFonts.ToString()");
    expect(script).toContain("ConvertTo-Json -Compress");
    expect(script).not.toContain("Set-ProcessMitigation");
  });

  it.each([true, false])(
    "builds a narrowly scoped change for enabled=%s",
    (enabled) => {
      const script = powershell.buildSetFontForceApplyScript(enabled);
      for (const target of targets) expect(script).toContain(`'${target}'`);
      expect(script).toContain(
        enabled
          ? "-Enable DisableNonSystemFonts"
          : "-Remove -Disable DisableNonSystemFonts",
      );
      expect(script).toContain("Get-Process -ErrorAction Stop");
      expect(script).not.toContain("-Reset");
      expect(script).not.toContain("-PolicyFilePath");
      expect(script).not.toContain("Set-ProcessMitigation -System");
    },
  );

  it("rejects nonboolean command input instead of interpolating it", () => {
    expect(() =>
      powershell.buildSetFontForceApplyScript(
        "true; Remove-Item" as unknown as boolean,
      ),
    ).toThrow();
  });

  it("queries through the existing normal session without escalation", async () => {
    const execute = vi.spyOn(pm, "execute").mockResolvedValue({
      stdout: JSON.stringify(payload(true, false)),
      stderr: "",
      code: 0,
    });
    await expect(pm.getFontForceApplyPolicy()).resolves.toEqual(
      payload(true, false),
    );
    expect(execute).toHaveBeenCalledWith(expect.any(String), false, true);
  });

  it("keeps a target read error distinct from an OFF policy", async () => {
    const result = {
      ...payload(true, null),
      errors: { "PathOfExile.exe": "query denied" },
    };
    vi.spyOn(pm, "execute").mockResolvedValue({
      stdout: JSON.stringify(result),
      stderr: "",
      code: 0,
    });
    await expect(pm.getFontForceApplyPolicy()).resolves.toEqual(result);
  });

  it.each([
    "",
    "bad json",
    "{}",
    JSON.stringify(payload("ON" as unknown as boolean, false)),
  ])("fails closed for malformed query output %s", async (stdout) => {
    vi.spyOn(pm, "execute").mockResolvedValue({ stdout, stderr: "", code: 0 });
    await expect(pm.getFontForceApplyPolicy()).rejects.toThrow();
  });

  it("does not accept a command exit failure as an empty policy", async () => {
    vi.spyOn(pm, "execute").mockResolvedValue({
      stdout: "",
      stderr: "denied",
      code: 1,
    });
    await expect(pm.getFontForceApplyPolicy()).rejects.toThrow("denied");
  });

  it("changes both targets using a single existing admin session request", async () => {
    const execute = vi
      .spyOn(pm, "execute")
      .mockResolvedValue({ stdout: '{"errors":{}}', stderr: "", code: 0 });
    await expect(pm.setFontForceApplyPolicy(true)).resolves.toEqual({});
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.any(String), true, true);
  });

  it("preserves per-target write failures", async () => {
    vi.spyOn(pm, "execute").mockResolvedValue({
      stdout: '{"errors":{"PathOfExile.exe":"denied"}}',
      stderr: "",
      code: 0,
    });
    await expect(pm.setFontForceApplyPolicy(false)).resolves.toEqual({
      "PathOfExile.exe": "denied",
    });
  });

  it("preserves the existing UAC cancellation exception", async () => {
    vi.spyOn(pm, "execute").mockRejectedValue(
      new powershell.UACDeniedException(),
    );
    await expect(pm.setFontForceApplyPolicy(true)).rejects.toBeInstanceOf(
      powershell.UACDeniedException,
    );
  });

  it("does not turn a timed-out mutation into a completed operation", async () => {
    vi.spyOn(pm, "execute").mockResolvedValue({
      stdout: "",
      stderr: "Request execution timed out (30s)",
      code: 1,
    });
    await expect(pm.setFontForceApplyPolicy(true)).rejects.toThrow("timed out");
    // No original admin socket in this isolated test: a replacement session must not be used as proof.
    await expect(pm.confirmFontForceApplyIdle()).rejects.toThrow("종료");
  });
});

describe("font policy admin completion fence", () => {
  it.each(["startup rejection", "no socket", "destroyed socket"])(
    "marks %s as a proven pre-submission failure",
    async (failure) => {
      const logger = { log: vi.fn(), error: vi.fn() };
      const session = {
        socket: failure === "destroyed socket" ? { destroyed: true } : null,
        pendingRequests: new Map(),
      } as unknown as Parameters<
        powershell.PowerShellManager["executeCommand"]
      >[1];
      const manager = Object.assign(
        Object.create(powershell.PowerShellManager.prototype),
        {
          adminLogger: logger,
          ensureSession:
            failure === "startup rejection"
              ? vi.fn().mockRejectedValue(new Error("startup failed"))
              : vi.fn().mockResolvedValue(undefined),
        },
      ) as powershell.PowerShellManager;
      await expect(
        manager.executeCommand("never submitted", session, true),
      ).resolves.toMatchObject({
        code: 1,
        notSubmitted: true,
      });
      expect(session.pendingRequests.size).toBe(0);
    },
  );

  const interruptedManager = async () => {
    const socket = { destroyed: false };
    const session = { socket };
    const manager = Object.assign(
      Object.create(powershell.PowerShellManager.prototype),
      { adminSession: session, uncertainFontPolicy: null },
    ) as powershell.PowerShellManager;
    vi.spyOn(manager, "execute").mockResolvedValue({
      stdout: "",
      stderr: "timed out",
      code: 1,
    });
    await expect(manager.setFontForceApplyPolicy(true)).rejects.toThrow(
      "timed out",
    );
    return { manager, session };
  };

  it("clears uncertainty only after the original worker completes its fence", async () => {
    const { manager, session } = await interruptedManager();
    const execute = vi
      .spyOn(manager, "executeCommand")
      .mockResolvedValue({ stdout: "FONT_POLICY_IDLE", stderr: "", code: 0 });
    await expect(manager.confirmFontForceApplyIdle()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("FONT_POLICY_IDLE"),
      session,
      true,
      true,
    );
    await manager.confirmFontForceApplyIdle();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps mutation blocked when the original fence itself times out", async () => {
    const { manager } = await interruptedManager();
    const execute = vi
      .spyOn(manager, "executeCommand")
      .mockResolvedValue({ stdout: "", stderr: "timed out", code: 1 });
    await expect(manager.confirmFontForceApplyIdle()).rejects.toThrow("종료");
    await expect(manager.confirmFontForceApplyIdle()).rejects.toThrow("종료");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("never accepts a replacement admin connection as evidence of original completion", async () => {
    const { manager, session } = await interruptedManager();
    session.socket = { destroyed: false };
    const execute = vi.spyOn(manager, "executeCommand");
    await expect(manager.confirmFontForceApplyIdle()).rejects.toThrow("종료");
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows retry after a proven pre-submission connection failure", async () => {
    const manager = Object.assign(
      Object.create(powershell.PowerShellManager.prototype),
      { adminSession: { socket: null }, uncertainFontPolicy: null },
    ) as powershell.PowerShellManager;
    vi.spyOn(manager, "execute").mockResolvedValue({
      stdout: "",
      stderr: "connection failed",
      code: 1,
      notSubmitted: true,
    });
    await expect(manager.setFontForceApplyPolicy(true)).rejects.toThrow(
      "connection failed",
    );
    await expect(manager.confirmFontForceApplyIdle()).resolves.toBeUndefined();
  });

  it("allows retry after OS policy blocks session startup before submission", async () => {
    const manager = Object.assign(
      Object.create(powershell.PowerShellManager.prototype),
      { adminSession: { socket: null }, uncertainFontPolicy: null },
    ) as powershell.PowerShellManager;
    vi.spyOn(manager, "execute").mockRejectedValue(
      new powershell.PowerShellBlockedException("spawn EPERM"),
    );
    await expect(manager.setFontForceApplyPolicy(true)).rejects.toThrow(
      "spawn EPERM",
    );
    await expect(manager.confirmFontForceApplyIdle()).resolves.toBeUndefined();
  });
});

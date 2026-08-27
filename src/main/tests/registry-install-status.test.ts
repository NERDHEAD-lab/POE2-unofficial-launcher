import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../../shared/config";
import {
  ACTIVE_GAMES,
  SERVICE_CHANNELS,
  type ActiveGame,
  type GameInstallPathDiagnostics,
  type GameInstallPathRegistryTargetDeleteRequest,
  type GameInstallPathRegistryTargetDeleteResult,
  type GameInstallPathTargetApplyResult,
  type GameInstallPathTargetSnapshot,
  type ServiceChannel,
} from "../../shared/types";
import * as registryModule from "../utils/registry";
import {
  clearGameInstallPath,
  GAME_INSTALL_REGISTRY_MAP,
  getGameInstallPath,
  getGameInstallPathDiagnostics,
  getGameInstallPathHealth,
  getGameInstallationStatus,
  isGameInstalled,
  registerGameInstallPath,
  resolveGameInstallPathConflict,
  setGameInstallPath,
} from "../utils/registry";

import type { ChildProcess } from "node:child_process";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  stat: vi.fn(),
  powershellExecute: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
  contextProviderGet: vi.fn(),
  setConfigWithEvent: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: {
    execFile: mocks.execFile,
  },
  execFile: mocks.execFile,
}));

vi.mock("node:fs/promises", () => ({
  default: {
    stat: mocks.stat,
  },
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:\\test\\app.exe"),
    isPackaged: false,
  },
}));

vi.mock("../utils/logger", () => ({
  logger: {
    log: mocks.loggerLog,
    warn: mocks.loggerWarn,
    error: vi.fn(),
  },
}));

vi.mock("../context-provider", () => ({
  ContextProvider: {
    get: mocks.contextProviderGet,
  },
}));

vi.mock("../utils/powershell", () => ({
  PowerShellManager: {
    getInstance: () => ({
      execute: mocks.powershellExecute,
    }),
  },
}));

vi.mock("../utils/config-utils", () => ({
  setConfigWithEvent: mocks.setConfigWithEvent,
}));

type RegQueryCallback = (
  error: (Error & { code?: number | string }) | null,
  stdout: string,
  stderr: string,
) => void;

type RegQueryImplementation = (
  command: string,
  args: string[],
  options: { windowsHide?: boolean; timeout?: number },
  callback: RegQueryCallback,
) => ChildProcess;

const mockRegQuery = (implementation: RegQueryImplementation) => {
  mocks.execFile.mockImplementation(implementation);
};

const registryRead = (stdout: string) => ({ stdout, stderr: "", code: 0 });

type GameInstallPathTargetApi = {
  resolveGameInstallPathTarget: (
    serviceId: ServiceChannel,
    gameId: ActiveGame,
    targetId: string,
  ) =>
    | {
        ok: true;
        target: {
          targetId: string;
          kind: "config" | "registry";
          registryPath?: string;
          registryValueName?: string;
        };
      }
    | { ok: false; code: string; retryable: boolean };
  collectGameInstallPathTargetSnapshots: (
    serviceId: ServiceChannel,
    gameId: ActiveGame,
  ) => Promise<readonly GameInstallPathTargetSnapshot[]>;
  deriveGameInstallPathTargetSnapshots: (
    diagnostics: GameInstallPathDiagnostics,
  ) => readonly GameInstallPathTargetSnapshot[];
  applyGameInstallPathTarget: (
    serviceId: ServiceChannel,
    gameId: ActiveGame,
    snapshot: GameInstallPathTargetSnapshot,
    installPath: string,
  ) => Promise<GameInstallPathTargetApplyResult>;
  deleteGameInstallPathRegistryTarget: (
    serviceId: ServiceChannel,
    gameId: ActiveGame,
    request: GameInstallPathRegistryTargetDeleteRequest,
  ) => Promise<GameInstallPathRegistryTargetDeleteResult>;
};

const requireGameInstallPathTargetFunction = <
  Name extends keyof GameInstallPathTargetApi,
>(
  name: Name,
): GameInstallPathTargetApi[Name] => {
  const candidate = (registryModule as Partial<GameInstallPathTargetApi>)[name];
  expect(candidate, `${name} must be implemented`).toBeTypeOf("function");
  return candidate as GameInstallPathTargetApi[Name];
};

const commandReadsRegistryPath = (command: string, registryPath: string) =>
  command.includes(
    registryPath.replace("HKCU:\\", "Registry::HKEY_CURRENT_USER\\"),
  );

const kakaoPoe2RegistryTarget = (
  expectedPath: string,
  candidateIndex: 0 | 1 = 0,
) => {
  const candidate =
    GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[candidateIndex];
  return {
    registryPath: candidate.path,
    registryValueName: candidate.key,
    expectedPath,
  };
};

const kakaoPoe2ConflictTarget = (
  expectedConfigPath: string,
  expectedRegistryPath: string,
  candidateIndex: 0 | 1 = 0,
) => ({
  targetId:
    candidateIndex === 0
      ? ("registry-primary" as const)
      : ("registry-compatibility" as const),
  expectedPath: expectedRegistryPath,
  expectedConfigPath,
});

describe("registry install status", () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
    mocks.stat.mockReset();
    mocks.powershellExecute.mockReset();
    mocks.loggerLog.mockClear();
    mocks.loggerWarn.mockClear();
    mocks.contextProviderGet.mockReset();
    mocks.setConfigWithEvent.mockReset();
    mocks.contextProviderGet.mockReturnValue(null);
    mocks.powershellExecute.mockResolvedValue({
      stdout: "",
      stderr: "",
      code: 0,
    });
  });

  describe("MS6.1 game install path targets", () => {
    it("maps Kakao and GGG registry diagnostics to stable target IDs", async () => {
      const kakaoPrimaryPath = String.raw`C:\Games\Kakao POE2`;
      const kakaoCompatibilityPath = String.raw`D:\Games\Kakao POE2`;
      mocks.powershellExecute.mockImplementation(async (command: string) => {
        if (
          commandReadsRegistryPath(
            command,
            GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
          )
        ) {
          return registryRead(kakaoPrimaryPath);
        }
        if (
          commandReadsRegistryPath(
            command,
            GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path,
          )
        ) {
          return registryRead(kakaoCompatibilityPath);
        }
        return registryRead(String.raw`E:\Games\GGG POE2`);
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const kakaoDiagnostics = await getGameInstallPathDiagnostics(
        "Kakao Games",
        "POE2",
      );
      const gggDiagnostics = await getGameInstallPathDiagnostics("GGG", "POE2");

      expect(
        kakaoDiagnostics.registry.candidates.map(({ targetId }) => targetId),
      ).toEqual(["registry-primary", "registry-compatibility"]);
      expect(
        gggDiagnostics.registry.candidates.map(({ targetId }) => targetId),
      ).toEqual(["registry-primary"]);
    });

    it("collects registry read state and config path in target snapshots", async () => {
      const collectGameInstallPathTargetSnapshots =
        requireGameInstallPathTargetFunction(
          "collectGameInstallPathTargetSnapshots",
        );
      const primaryPath = String.raw`C:\Games\Kakao POE2`;
      const configPath = String.raw`D:\Games\Configured POE2`;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: configPath },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.powershellExecute.mockImplementation(async (command: string) =>
        commandReadsRegistryPath(
          command,
          GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
        )
          ? registryRead(primaryPath)
          : registryRead("__REG_VALUE_MISSING__"),
      );
      mocks.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        collectGameInstallPathTargetSnapshots("Kakao Games", "POE2"),
      ).resolves.toEqual([
        {
          targetId: "registry-primary",
          currentPath: primaryPath,
          registryState: "found",
        },
        {
          targetId: "registry-compatibility",
          currentPath: null,
          registryState: "value-missing",
        },
        { targetId: "config", currentPath: configPath },
      ]);
    });

    it("purely derives target snapshots from one diagnostics value", () => {
      const deriveGameInstallPathTargetSnapshots =
        requireGameInstallPathTargetFunction(
          "deriveGameInstallPathTargetSnapshots",
        );
      const diagnostics = {
        serviceId: "Kakao Games",
        gameId: "POE2",
        executableName: "PathOfExile_KG.exe",
        config: {
          source: "config",
          path: String.raw`E:\Games\Config`,
          state: "found",
          verification: "valid",
        },
        registry: {
          source: "registry",
          path: String.raw`C:\Games\Primary`,
          state: "found",
          verification: "valid",
          registryPath: String.raw`HKCU:\Software\Kakaogames\POE2`,
          registryValueName: "InstallPath",
          aggregateState: "valid",
          candidates: [
            {
              targetId: "registry-primary",
              path: String.raw`C:\Games\Primary`,
              state: "found",
              verification: "valid",
              registryPath: String.raw`HKCU:\Software\Kakaogames\POE2`,
              registryValueName: "InstallPath",
              isActive: true,
            },
            {
              targetId: "registry-compatibility",
              path: null,
              state: "value-missing",
              verification: "not-checked",
              registryPath: String.raw`HKCU:\Software\DaumGames\POE2`,
              registryValueName: "InstallPath",
              isActive: false,
            },
          ],
        },
        hasPathConflict: true,
        isPathConflictAcknowledged: false,
        recommendedSource: "registry",
      } as const satisfies GameInstallPathDiagnostics;

      expect(deriveGameInstallPathTargetSnapshots(diagnostics)).toEqual([
        {
          targetId: "registry-primary",
          currentPath: String.raw`C:\Games\Primary`,
          registryState: "found",
        },
        {
          targetId: "registry-compatibility",
          currentPath: null,
          registryState: "value-missing",
        },
        { targetId: "config", currentPath: String.raw`E:\Games\Config` },
      ]);
      expect(mocks.powershellExecute).not.toHaveBeenCalled();
      expect(mocks.contextProviderGet).not.toHaveBeenCalled();
      expect(mocks.stat).not.toHaveBeenCalled();
    });

    it.each([
      {
        label: "Kakao primary",
        serviceId: "Kakao Games",
        targetId: "registry-primary",
        registryPath: GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
      },
      {
        label: "Kakao compatibility",
        serviceId: "Kakao Games",
        targetId: "registry-compatibility",
        registryPath: GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path,
      },
      {
        label: "GGG primary",
        serviceId: "GGG",
        targetId: "registry-primary",
        registryPath: GAME_INSTALL_REGISTRY_MAP.GGG.POE2[0].path,
      },
    ] as const)(
      "deletes the allowlisted $label value through one atomic command",
      async ({ serviceId, targetId, registryPath }) => {
        const deleteGameInstallPathRegistryTarget =
          requireGameInstallPathTargetFunction(
            "deleteGameInstallPathRegistryTarget",
          );
        const expectedPath = String.raw`C:\Games\Installed POE2`;
        const request = { targetId, expectedPath };
        mocks.powershellExecute.mockResolvedValue(
          registryRead("__GAME_INSTALL_TARGET_DELETE_DELETED__"),
        );

        const result = await deleteGameInstallPathRegistryTarget(
          serviceId,
          "POE2",
          request,
        );

        expect(Object.keys(request).sort()).toEqual([
          "expectedPath",
          "targetId",
        ]);
        expect(result).toEqual({ targetId, status: "deleted" });
        expect(mocks.powershellExecute).toHaveBeenCalledTimes(1);
        const command = String(mocks.powershellExecute.mock.calls[0][0]);
        expect(command).toContain(
          registryPath.replace("HKCU:\\", "Registry::HKEY_CURRENT_USER\\"),
        );
        expect(command).toContain(`$expectedPath = '${expectedPath}'`);
        expect(command).toContain(
          "Remove-ItemProperty -LiteralPath $path -Name $name",
        );
        expect(command).toContain(
          "$readBackItem.GetValueNames() -contains $name",
        );
        expect(command).toContain("__GAME_INSTALL_TARGET_DELETE_DELETED__");
        expect(
          command.indexOf("$currentPath -ine $expectedNormalized"),
        ).toBeLessThan(command.indexOf("Remove-ItemProperty"));
        expect(command.indexOf("Remove-ItemProperty")).toBeLessThan(
          command.indexOf("$readBackItem.GetValueNames() -contains $name"),
        );
        expect(command).not.toMatch(/(^|[\r\n;])\s*Remove-Item(?:\s|$)/);
      },
    );

    it.each([
      ["GGG compatibility", "GGG", "registry-compatibility"],
      ["arbitrary target ID", "Kakao Games", "registry-admin"],
    ] as const)(
      "rejects deletion of %s before registry access",
      async (_label, serviceId, targetId) => {
        const deleteGameInstallPathRegistryTarget =
          requireGameInstallPathTargetFunction(
            "deleteGameInstallPathRegistryTarget",
          );

        await expect(
          deleteGameInstallPathRegistryTarget(serviceId, "POE2", {
            targetId,
            expectedPath: String.raw`C:\Games\Installed POE2`,
          } as GameInstallPathRegistryTargetDeleteRequest),
        ).resolves.toEqual({
          targetId,
          status: "failed",
          code: "target-not-allowed",
          retryable: false,
        });
        expect(mocks.powershellExecute).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "stale expected path",
        "__GAME_INSTALL_TARGET_DELETE_CHANGED__",
        "target-changed",
      ],
      [
        "missing key container",
        "__GAME_INSTALL_TARGET_DELETE_MISSING__",
        "target-missing",
      ],
      [
        "registry read failure",
        "__GAME_INSTALL_TARGET_DELETE_READ_FAILED__\naccess denied",
        "target-read-failed",
      ],
      [
        "mutation failure",
        "__GAME_INSTALL_TARGET_DELETE_MUTATION_FAILED__\naccess denied",
        "mutation-failed",
      ],
      [
        "read-back failure",
        "__GAME_INSTALL_TARGET_DELETE_READBACK_FAILED__",
        "readback-failed",
      ],
    ] as const)(
      "returns a stable deletion failure for %s",
      async (_label, marker, code) => {
        const deleteGameInstallPathRegistryTarget =
          requireGameInstallPathTargetFunction(
            "deleteGameInstallPathRegistryTarget",
          );
        const expectedPath = String.raw`C:\Games\Expected POE2`;
        mocks.powershellExecute.mockResolvedValue(registryRead(marker));

        const result = await deleteGameInstallPathRegistryTarget(
          "Kakao Games",
          "POE2",
          { targetId: "registry-primary", expectedPath },
        );

        expect(result).toEqual({
          targetId: "registry-primary",
          status: "failed",
          code,
          retryable: true,
        });
        expect(mocks.powershellExecute).toHaveBeenCalledTimes(1);
        const command = String(mocks.powershellExecute.mock.calls[0][0]);
        expect(command).toContain(`$expectedPath = '${expectedPath}'`);
        expect(command).toContain(marker.split("\n")[0]);
        expect(command).not.toMatch(/(^|[\r\n;])\s*Remove-Item(?:\s|$)/);
      },
    );

    it("returns unchanged when the allowlisted target value is already absent", async () => {
      const deleteGameInstallPathRegistryTarget =
        requireGameInstallPathTargetFunction(
          "deleteGameInstallPathRegistryTarget",
        );
      mocks.powershellExecute.mockResolvedValue(
        registryRead("__GAME_INSTALL_TARGET_DELETE_UNCHANGED__"),
      );

      const result = await deleteGameInstallPathRegistryTarget(
        "Kakao Games",
        "POE2",
        {
          targetId: "registry-compatibility",
          expectedPath: String.raw`C:\Games\Expected POE2`,
        },
      );

      expect(result).toEqual({
        targetId: "registry-compatibility",
        status: "unchanged",
      });
      const command = String(mocks.powershellExecute.mock.calls[0][0]);
      expect(command).toContain("$item.GetValueNames() -notcontains $name");
      expect(
        command.indexOf("__GAME_INSTALL_TARGET_DELETE_UNCHANGED__"),
      ).toBeLessThan(command.indexOf("Remove-ItemProperty"));
      expect(command).not.toMatch(/(^|[\r\n;])\s*Remove-Item(?:\s|$)/);
    });

    it("preserves a drive-root expected path in atomic registry deletion", async () => {
      const deleteGameInstallPathRegistryTarget =
        requireGameInstallPathTargetFunction(
          "deleteGameInstallPathRegistryTarget",
        );
      const expectedPath = "E:\\";
      mocks.powershellExecute.mockResolvedValue(
        registryRead("__GAME_INSTALL_TARGET_DELETE_DELETED__"),
      );

      await expect(
        deleteGameInstallPathRegistryTarget("Kakao Games", "POE2", {
          targetId: "registry-primary",
          expectedPath,
        }),
      ).resolves.toEqual({
        targetId: "registry-primary",
        status: "deleted",
      });

      const command = String(mocks.powershellExecute.mock.calls[0][0]);
      expect(command).toContain(`$expectedPath = '${expectedPath}'`);
      expect(command).toContain(
        "$root = [System.IO.Path]::GetPathRoot($normalized)",
      );
      expect(command).toContain("$normalized.Length -gt $root.Length");
    });

    it.each([
      {
        label: "primary create",
        targetId: "registry-primary",
        registryState: "key-missing",
        currentPath: null,
        registryPath: GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
      },
      {
        label: "primary overwrite",
        targetId: "registry-primary",
        registryState: "found",
        currentPath: String.raw`C:\Games\Old Primary POE2`,
        registryPath: GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
      },
      {
        label: "compatibility create",
        targetId: "registry-compatibility",
        registryState: "value-missing",
        currentPath: null,
        registryPath: GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path,
      },
      {
        label: "compatibility overwrite",
        targetId: "registry-compatibility",
        registryState: "found",
        currentPath: String.raw`D:\Games\Old Compatibility POE2`,
        registryPath: GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path,
      },
    ] as const)(
      "applies $label through one atomic allowlisted PowerShell command",
      async ({ targetId, registryState, currentPath, registryPath }) => {
        const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
          "applyGameInstallPathTarget",
        );
        const selectedPath = String.raw`E:\Games\Selected POE2`;
        mocks.stat.mockResolvedValue({ isFile: () => true });
        mocks.powershellExecute.mockResolvedValue(
          registryRead("__GAME_INSTALL_TARGET_APPLIED__"),
        );

        const result = await applyGameInstallPathTarget(
          "Kakao Games",
          "POE2",
          { targetId, currentPath, registryState },
          selectedPath,
        );

        expect(result).toEqual({
          targetId,
          status: "applied",
          path: selectedPath,
        });
        expect(mocks.powershellExecute).toHaveBeenCalledTimes(1);
        const command = String(mocks.powershellExecute.mock.calls[0][0]);
        expect(command).toContain(
          registryPath.replace("HKCU:\\", "Registry::HKEY_CURRENT_USER\\"),
        );
        expect(command).toContain(`$expectedState = '${registryState}'`);
        if (currentPath) {
          expect(command).toContain(`$expectedPath = '${currentPath}'`);
        }
        expect(command).toContain("New-Item -Path $path");
        expect(command).toContain("New-ItemProperty -LiteralPath $path");
        expect(command).toContain("-PropertyType String -Force");
        expect(command).toContain("$readBackItem.GetValue");
        expect(command).not.toContain("Remove-Item");
      },
    );

    it("preserves drive-root expected and selected paths in atomic registry apply", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      const expectedPath = "E:\\";
      const selectedPath = "F:\\";
      mocks.stat.mockResolvedValue({ isFile: () => true });
      mocks.powershellExecute.mockResolvedValue(
        registryRead("__GAME_INSTALL_TARGET_APPLIED__"),
      );

      await expect(
        applyGameInstallPathTarget(
          "Kakao Games",
          "POE2",
          {
            targetId: "registry-primary",
            currentPath: expectedPath,
            registryState: "found",
          },
          selectedPath,
        ),
      ).resolves.toEqual({
        targetId: "registry-primary",
        status: "applied",
        path: selectedPath,
      });

      const command = String(mocks.powershellExecute.mock.calls[0][0]);
      expect(command).toContain(`$expectedPath = '${expectedPath}'`);
      expect(command).toContain(`$selectedPath = '${selectedPath}'`);
      expect(command).toContain(
        "$root = [System.IO.Path]::GetPathRoot($normalized)",
      );
      expect(command).toContain("$normalized.Length -gt $root.Length");
    });

    it.each([
      {
        label: "stale expected state",
        snapshot: {
          targetId: "registry-primary",
          currentPath: null,
          registryState: "value-missing",
        },
      },
      {
        label: "stale expected path",
        snapshot: {
          targetId: "registry-primary",
          currentPath: String.raw`C:\Games\Previous POE2`,
          registryState: "found",
        },
      },
    ] as const)(
      "rejects $label reported by the atomic command",
      async ({ snapshot }) => {
        const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
          "applyGameInstallPathTarget",
        );
        mocks.stat.mockResolvedValue({ isFile: () => true });
        mocks.powershellExecute.mockResolvedValue(
          registryRead("__GAME_INSTALL_TARGET_CHANGED__"),
        );

        const result = await applyGameInstallPathTarget(
          "Kakao Games",
          "POE2",
          snapshot,
          String.raw`E:\Games\Selected POE2`,
        );

        expect(result).toEqual({
          targetId: "registry-primary",
          status: "failed",
          code: "target-changed",
          retryable: true,
        });
        expect(mocks.powershellExecute).toHaveBeenCalledTimes(1);
        const command = String(mocks.powershellExecute.mock.calls[0][0]);
        expect(command).toContain(
          `$expectedState = '${snapshot.registryState}'`,
        );
        if (snapshot.currentPath) {
          expect(command).toContain(
            `$expectedPath = '${snapshot.currentPath}'`,
          );
        }
      },
    );

    it("rejects a registry snapshot captured from a read failure", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await applyGameInstallPathTarget(
        "Kakao Games",
        "POE2",
        {
          targetId: "registry-primary",
          currentPath: null,
          registryState: "read-failed",
        },
        String.raw`E:\Games\Selected POE2`,
      );

      expect(result).toEqual({
        targetId: "registry-primary",
        status: "failed",
        code: "target-read-failed",
        retryable: true,
      });
      expect(mocks.powershellExecute).not.toHaveBeenCalled();
    });

    it.each([
      [
        "write failure",
        "__GAME_INSTALL_TARGET_MUTATION_FAILED__\naccess denied",
        "mutation-failed",
      ],
      [
        "read-back failure",
        "__GAME_INSTALL_TARGET_READBACK_FAILED__",
        "readback-failed",
      ],
    ] as const)(
      "returns a stable failure result for registry $label",
      async (_label, marker, code) => {
        const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
          "applyGameInstallPathTarget",
        );
        mocks.stat.mockResolvedValue({ isFile: () => true });
        mocks.powershellExecute.mockResolvedValue(registryRead(marker));

        const result = await applyGameInstallPathTarget(
          "Kakao Games",
          "POE2",
          {
            targetId: "registry-primary",
            currentPath: String.raw`C:\Games\Old POE2`,
            registryState: "found",
          },
          String.raw`E:\Games\Selected POE2`,
        );

        expect(result).toEqual({
          targetId: "registry-primary",
          status: "failed",
          code,
          retryable: true,
        });
        expect(mocks.powershellExecute).toHaveBeenCalledTimes(1);
        expect(String(mocks.powershellExecute.mock.calls[0][0])).toContain(
          marker.split("\n")[0],
        );
      },
    );

    it("returns unchanged only after the atomic command rechecks the same registry path", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      const selectedPath = String.raw`E:\Games\Selected POE2`;
      mocks.stat.mockResolvedValue({ isFile: () => true });
      mocks.powershellExecute.mockResolvedValue(
        registryRead("__GAME_INSTALL_TARGET_UNCHANGED__"),
      );

      const result = await applyGameInstallPathTarget(
        "Kakao Games",
        "POE2",
        {
          targetId: "registry-primary",
          currentPath: selectedPath,
          registryState: "found",
        },
        `${selectedPath}\\`,
      );

      expect(result).toEqual({
        targetId: "registry-primary",
        status: "unchanged",
        path: selectedPath,
      });
      const command = String(mocks.powershellExecute.mock.calls[0][0]);
      expect(command).toContain("__GAME_INSTALL_TARGET_UNCHANGED__");
      expect(command.indexOf("__GAME_INSTALL_TARGET_UNCHANGED__")).toBeLessThan(
        command.indexOf("New-ItemProperty"),
      );
    });

    it("compares the config snapshot and immutably updates only the selected nested path", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      const currentPath = String.raw`C:\Games\Old POE2`;
      const selectedPath = String.raw`E:\Games\Selected POE2`;
      const originalPaths = {
        "Kakao Games": { POE1: "C:\\Games\\Kakao POE1\\", POE2: currentPath },
        GGG: {
          POE1: "D:\\Games\\GGG POE1\\",
          POE2: "D:\\Games\\GGG POE2\\",
        },
      };
      const originalKakaoPaths = originalPaths["Kakao Games"];
      mocks.contextProviderGet.mockReturnValue(createContext(originalPaths));
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await applyGameInstallPathTarget(
        "Kakao Games",
        "POE2",
        { targetId: "config", currentPath },
        `${selectedPath}\\`,
      );

      expect(result).toEqual({
        targetId: "config",
        status: "applied",
        path: selectedPath,
      });
      expect(originalPaths["Kakao Games"]).toBe(originalKakaoPaths);
      expect(originalPaths["Kakao Games"].POE2).toBe(currentPath);
      expect(mocks.setConfigWithEvent).toHaveBeenCalledWith(
        "gameInstallPaths",
        {
          "Kakao Games": {
            POE1: "C:\\Games\\Kakao POE1\\",
            POE2: selectedPath,
          },
          GGG: {
            POE1: "D:\\Games\\GGG POE1\\",
            POE2: "D:\\Games\\GGG POE2\\",
          },
        },
      );
      const writtenPaths = mocks.setConfigWithEvent.mock.calls[0][1];
      expect(writtenPaths).not.toBe(originalPaths);
      expect(writtenPaths["Kakao Games"]).not.toBe(originalKakaoPaths);
    });

    it("applies a config target from a partial persisted shape while preserving unrelated default slots", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      const currentPath = String.raw`C:\Games\Current POE2`;
      const selectedPath = String.raw`E:\Games\Selected POE2`;
      const partialPaths = {
        "Kakao Games": { POE2: currentPath },
      };
      mocks.contextProviderGet.mockReturnValue({
        getConfig: () => ({ gameInstallPaths: partialPaths }),
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        applyGameInstallPathTarget(
          "Kakao Games",
          "POE2",
          { targetId: "config", currentPath },
          selectedPath,
        ),
      ).resolves.toEqual({
        targetId: "config",
        status: "applied",
        path: selectedPath,
      });
      expect(mocks.setConfigWithEvent).toHaveBeenCalledWith(
        "gameInstallPaths",
        {
          "Kakao Games": {
            POE1: DEFAULT_CONFIG.gameInstallPaths["Kakao Games"].POE1,
            POE2: selectedPath,
          },
          GGG: { ...DEFAULT_CONFIG.gameInstallPaths.GGG },
        },
      );
      expect(partialPaths).toEqual({
        "Kakao Games": { POE2: currentPath },
      });
    });

    it("returns a stable stale-snapshot failure for a missing service in a partial persisted shape", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      mocks.contextProviderGet.mockReturnValue({
        getConfig: () => ({
          gameInstallPaths: {
            "Kakao Games": { POE2: String.raw`C:\Games\Kakao POE2` },
          },
        }),
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        applyGameInstallPathTarget(
          "GGG",
          "POE2",
          {
            targetId: "config",
            currentPath: String.raw`C:\Games\Expected GGG POE2`,
          },
          String.raw`E:\Games\Selected GGG POE2`,
        ),
      ).resolves.toEqual({
        targetId: "config",
        status: "failed",
        code: "target-changed",
        retryable: true,
      });
      expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
    });

    it("rejects a stale config snapshot without writing", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": {
            POE1: "",
            POE2: String.raw`C:\Games\Current POE2`,
          },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.stat.mockResolvedValue({ isFile: () => true });

      const result = await applyGameInstallPathTarget(
        "Kakao Games",
        "POE2",
        {
          targetId: "config",
          currentPath: String.raw`C:\Games\Expected POE2`,
        },
        String.raw`E:\Games\Selected POE2`,
      );

      expect(result).toEqual({
        targetId: "config",
        status: "failed",
        code: "target-changed",
        retryable: true,
      });
      expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
      expect(mocks.powershellExecute).not.toHaveBeenCalled();
    });

    it("returns unchanged for the same config path without writing", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      const selectedPath = String.raw`E:\Games\Selected POE2`;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: selectedPath },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        applyGameInstallPathTarget(
          "Kakao Games",
          "POE2",
          { targetId: "config", currentPath: selectedPath },
          `${selectedPath}\\`,
        ),
      ).resolves.toEqual({
        targetId: "config",
        status: "unchanged",
        path: selectedPath,
      });
      expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
    });

    it("freshly verifies the selected executable before applying any target", async () => {
      const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
        "applyGameInstallPathTarget",
      );
      const selectedPath = String.raw`E:\Games\Missing POE2`;
      mocks.stat.mockRejectedValue(
        Object.assign(new Error("missing"), { code: "ENOENT" }),
      );

      const result = await applyGameInstallPathTarget(
        "Kakao Games",
        "POE2",
        {
          targetId: "registry-primary",
          currentPath: null,
          registryState: "key-missing",
        },
        selectedPath,
      );

      expect(mocks.stat).toHaveBeenCalledWith(
        `${selectedPath}\\PathOfExile_KG.exe`,
      );
      expect(result).toEqual({
        targetId: "registry-primary",
        status: "failed",
        code: "install-path-invalid",
        retryable: false,
      });
      expect(mocks.powershellExecute).not.toHaveBeenCalled();
      expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
    });

    it.each([
      ["GGG compatibility", "GGG", "registry-compatibility"],
      ["arbitrary target ID", "Kakao Games", "registry-admin"],
    ] as const)(
      "rejects $label before mutation",
      async (_label, serviceId, targetId) => {
        const resolveGameInstallPathTarget =
          requireGameInstallPathTargetFunction("resolveGameInstallPathTarget");
        const applyGameInstallPathTarget = requireGameInstallPathTargetFunction(
          "applyGameInstallPathTarget",
        );

        expect(
          resolveGameInstallPathTarget(serviceId, "POE2", targetId),
        ).toEqual({
          ok: false,
          code: "target-not-allowed",
          retryable: false,
        });
        await expect(
          applyGameInstallPathTarget(
            serviceId,
            "POE2",
            {
              targetId,
              currentPath: null,
              registryState: "key-missing",
            } as GameInstallPathTargetSnapshot,
            String.raw`E:\Games\Selected POE2`,
          ),
        ).resolves.toEqual({
          targetId,
          status: "failed",
          code: "target-not-allowed",
          retryable: false,
        });
        expect(mocks.stat).not.toHaveBeenCalled();
        expect(mocks.powershellExecute).not.toHaveBeenCalled();
        expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
      },
    );
  });

  it("falls back to reg.exe when the PowerShell session cannot start", async () => {
    const installPath = String.raw`C:\Games\Path of Exile 2`;
    mocks.powershellExecute.mockRejectedValue(new Error("spawn EPERM"));
    mockRegQuery((_command, args, _options, callback) => {
      const registryPath = args[1];

      if (registryPath === "HKCU\\Software\\Kakaogames\\POE2") {
        callback(Object.assign(new Error("missing"), { code: 1 }), "", "");
        return {} as ChildProcess;
      }

      expect(args).toEqual([
        "query",
        "HKCU\\Software\\DaumGames\\POE2",
        "/v",
        "InstallPath",
      ]);
      callback(
        null,
        `
HKEY_CURRENT_USER\\Software\\DaumGames\\POE2
    InstallPath    REG_SZ    ${installPath}
`,
        "",
      );
      return {} as ChildProcess;
    });
    mocks.stat.mockResolvedValue({ isFile: () => true });

    await expect(
      getGameInstallationStatus("Kakao Games", "POE2"),
    ).resolves.toBe("installed");
    await expect(isGameInstalled("Kakao Games", "POE2")).resolves.toBe(true);

    expect(mocks.stat).toHaveBeenCalledWith(
      `${installPath}\\PathOfExile_KG.exe`,
    );
  });

  it("keeps GGG install verification on PathOfExile.exe", async () => {
    const installPath = String.raw`C:\Games\Path of Exile 2`;
    mocks.powershellExecute.mockResolvedValue({
      stdout: installPath,
      stderr: "",
      code: 0,
    });
    mocks.stat.mockResolvedValue({ isFile: () => true });

    await expect(getGameInstallationStatus("GGG", "POE2")).resolves.toBe(
      "installed",
    );

    expect(mocks.stat).toHaveBeenCalledWith(`${installPath}\\PathOfExile.exe`);
    expect(GAME_INSTALL_REGISTRY_MAP.GGG.POE2).toHaveLength(1);
  });

  it.each(["absent", "invalid", "unknown"] as const)(
    "keeps a valid Kakao config installed with a %s registry advisory",
    async (registryState) => {
      const configPath = String.raw`C:\Games\Path of Exile 2`;
      const invalidRegistryPath = String.raw`D:\Old\Path of Exile 2`;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: configPath },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.stat.mockImplementation(async (filePath: string) => {
        if (filePath.startsWith(configPath)) return { isFile: () => true };
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      });

      if (registryState === "unknown") {
        mocks.powershellExecute.mockRejectedValue(new Error("spawn EPERM"));
        mockRegQuery((_command, _args, _options, callback) => {
          callback(
            Object.assign(new Error("access denied"), { code: "EPERM" }),
            "",
            "access denied",
          );
          return {} as ChildProcess;
        });
      } else {
        mocks.powershellExecute.mockResolvedValue(
          registryRead(
            registryState === "absent"
              ? "__REG_VALUE_MISSING__"
              : invalidRegistryPath,
          ),
        );
      }

      await expect(
        getGameInstallPathHealth("Kakao Games", "POE2", 1234),
      ).resolves.toEqual({
        installationStatus: "installed",
        checkedAt: 1234,
        registryAdvisory: { state: registryState },
      });
    },
  );

  it.each([0, 1] as const)(
    "clears the advisory when Kakao registry candidate %i is valid",
    async (activeCandidateIndex) => {
      const configPath = String.raw`C:\Games\Path of Exile 2`;
      const registryPath = String.raw`D:\Games\Path of Exile 2`;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: configPath },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.powershellExecute.mockImplementation(async (command: string) => {
        const activeCandidate =
          GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[activeCandidateIndex];
        return commandReadsRegistryPath(command, activeCandidate.path)
          ? registryRead(registryPath)
          : registryRead("__REG_VALUE_MISSING__");
      });
      mocks.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        getGameInstallPathHealth("Kakao Games", "POE2", 5678),
      ).resolves.toEqual({
        installationStatus: "installed",
        checkedAt: 5678,
      });
    },
  );

  it("does not read registry advisory health for a valid GGG config path", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: "" },
        GGG: { POE1: "", POE2: configPath },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });

    await expect(
      getGameInstallPathHealth("GGG", "POE2", 9012),
    ).resolves.toEqual({
      installationStatus: "installed",
      checkedAt: 9012,
    });
    expect(mocks.powershellExecute).not.toHaveBeenCalled();
  });

  it.each([
    ["ENOENT", "uninstalled"],
    ["EACCES", "unknown"],
  ] as const)(
    "keeps an invalid config and absent registry install result honest (%s)",
    async (errorCode, installationStatus) => {
      const stalePath = String.raw`C:\Old\Path of Exile 2`;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: stalePath },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.stat.mockRejectedValue(
        Object.assign(new Error("path check failed"), { code: errorCode }),
      );
      mocks.powershellExecute.mockResolvedValue(
        registryRead("__REG_VALUE_MISSING__"),
      );

      await expect(
        getGameInstallPathHealth("Kakao Games", "POE2", 3456),
      ).resolves.toEqual({
        installationStatus,
        checkedAt: 3456,
      });
    },
  );

  it("selects the primary Kakaogames candidate when both candidates are valid", async () => {
    const primaryPath = String.raw`C:\Games\Path of Exile 2`;
    const legacyPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (
        commandReadsRegistryPath(
          command,
          GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
        )
      ) {
        return registryRead(primaryPath);
      }

      return registryRead(legacyPath);
    });
    mocks.stat.mockResolvedValue({ isFile: () => true });

    const diagnostics = await getGameInstallPathDiagnostics(
      "Kakao Games",
      "POE2",
    );

    expect(diagnostics.registry.path).toBe(primaryPath);
    expect(diagnostics.registry.registryPath).toBe(
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
    );
    expect(diagnostics.registry.aggregateState).toBe("valid");
    expect(diagnostics.registry.candidates).toEqual([
      expect.objectContaining({ path: primaryPath, isActive: true }),
      expect.objectContaining({ path: legacyPath, isActive: false }),
    ]);
  });

  it.each([
    "missing",
    "empty",
    "invalid",
    "read-failed",
    "verify-unknown",
  ] as const)(
    "continues to the legacy candidate when the primary candidate is %s",
    async (primaryState) => {
      const primaryPath = String.raw`C:\Broken\Path of Exile 2`;
      const legacyPath = String.raw`D:\Games\Path of Exile 2`;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: "" },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      const primaryRegistryPath =
        GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path;
      const legacyRegistryPath =
        GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path;

      mocks.powershellExecute.mockImplementation(async (command: string) => {
        if (commandReadsRegistryPath(command, primaryRegistryPath)) {
          if (primaryState === "missing") {
            return registryRead("__REG_KEY_MISSING__");
          }
          if (primaryState === "empty") {
            return registryRead("__REG_VALUE_EMPTY__");
          }
          if (primaryState === "read-failed") {
            return { stdout: "", stderr: "access denied", code: 5 };
          }
          return registryRead(primaryPath);
        }

        if (commandReadsRegistryPath(command, legacyRegistryPath)) {
          return registryRead(legacyPath);
        }

        throw new Error(`Unexpected PowerShell command: ${command}`);
      });
      mockRegQuery((_command, _args, _options, callback) => {
        callback(
          Object.assign(new Error("access denied"), { code: "EPERM" }),
          "",
          "access denied",
        );
        return {} as ChildProcess;
      });
      mocks.stat.mockImplementation(async (targetPath: string) => {
        if (targetPath === `${primaryPath}\\PathOfExile_KG.exe`) {
          if (primaryState === "invalid") {
            throw Object.assign(new Error("missing"), { code: "ENOENT" });
          }
          if (primaryState === "verify-unknown") {
            throw Object.assign(new Error("access denied"), {
              code: "EACCES",
            });
          }
        }

        return { isFile: () => true };
      });

      const diagnostics = await getGameInstallPathDiagnostics(
        "Kakao Games",
        "POE2",
      );

      expect(diagnostics.registry.path).toBe(legacyPath);
      expect(diagnostics.registry.registryPath).toBe(legacyRegistryPath);
      expect(diagnostics.registry.aggregateState).toBe("valid");
      expect(diagnostics.registry.candidates[1]).toEqual(
        expect.objectContaining({ path: legacyPath, isActive: true }),
      );
      await expect(getGameInstallPath("Kakao Games", "POE2")).resolves.toBe(
        legacyPath,
      );
      await expect(
        getGameInstallationStatus("Kakao Games", "POE2"),
      ).resolves.toBe("installed");
      expect(mocks.setConfigWithEvent).toHaveBeenCalledWith(
        "gameInstallPaths",
        expect.objectContaining({
          "Kakao Games": expect.objectContaining({ POE2: legacyPath }),
        }),
      );
    },
  );

  it("resolves and caches the POE1 legacy candidate when the primary key is missing", async () => {
    const legacyPath = String.raw`D:\Games\Path of Exile`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: "" },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (
        commandReadsRegistryPath(
          command,
          GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE1[0].path,
        )
      ) {
        return registryRead("__REG_KEY_MISSING__");
      }
      return registryRead(legacyPath);
    });
    mocks.stat.mockResolvedValue({ isFile: () => true });

    await expect(getGameInstallPath("Kakao Games", "POE1")).resolves.toBe(
      legacyPath,
    );
    await expect(
      getGameInstallationStatus("Kakao Games", "POE1"),
    ).resolves.toBe("installed");
    expect(mocks.setConfigWithEvent).toHaveBeenCalledWith(
      "gameInstallPaths",
      expect.objectContaining({
        "Kakao Games": expect.objectContaining({ POE1: legacyPath }),
      }),
    );
  });

  it.each(["absent", "invalid"] as const)(
    "returns unknown when the primary read fails and the legacy candidate is %s",
    async (legacyState) => {
      const legacyPath = String.raw`D:\Broken\Path of Exile 2`;
      mocks.powershellExecute.mockImplementation(async (command: string) => {
        if (
          commandReadsRegistryPath(
            command,
            GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path,
          )
        ) {
          return { stdout: "", stderr: "access denied", code: 5 };
        }
        return registryRead(
          legacyState === "absent" ? "__REG_VALUE_MISSING__" : legacyPath,
        );
      });
      mockRegQuery((_command, _args, _options, callback) => {
        callback(
          Object.assign(new Error("access denied"), { code: "EPERM" }),
          "",
          "access denied",
        );
        return {} as ChildProcess;
      });
      mocks.stat.mockRejectedValue(
        Object.assign(new Error("missing"), { code: "ENOENT" }),
      );

      await expect(
        getGameInstallationStatus("Kakao Games", "POE2"),
      ).resolves.toBe("unknown");
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("registry=read-failed"),
      );
    },
  );

  it("returns unknown instead of uninstalled when registry access fails", async () => {
    mocks.powershellExecute.mockRejectedValue(new Error("spawn EPERM"));
    mockRegQuery((_command, _args, _options, callback) => {
      callback(
        Object.assign(new Error("spawn EPERM"), { code: "EPERM" }),
        "",
        "spawn EPERM",
      );
      return {} as ChildProcess;
    });

    await expect(
      getGameInstallationStatus("Kakao Games", "POE2"),
    ).resolves.toBe("unknown");
    await expect(isGameInstalled("Kakao Games", "POE2")).resolves.toBe(false);
    const diagnostics = await getGameInstallPathDiagnostics(
      "Kakao Games",
      "POE2",
    );

    expect(mocks.stat).not.toHaveBeenCalled();
    expect(diagnostics.registry.aggregateState).toBe("unknown");
    expect(
      diagnostics.registry.candidates.every(
        (candidate) => candidate.state === "read-failed",
      ),
    ).toBe(true);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("registry=read-failed"),
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("error=PowerShell threw"),
    );
  });

  it("returns uninstalled when the registry value is absent", async () => {
    mocks.powershellExecute.mockResolvedValue({
      stdout: "__REG_VALUE_MISSING__",
      stderr: "",
      code: 0,
    });

    await expect(
      getGameInstallationStatus("Kakao Games", "POE2"),
    ).resolves.toBe("uninstalled");

    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.loggerLog).toHaveBeenCalledWith(
      expect.stringContaining("registry=value-missing"),
    );
  });

  it("logs a key-missing diagnostic when the install registry key is absent", async () => {
    mocks.powershellExecute.mockResolvedValue({
      stdout: "__REG_KEY_MISSING__",
      stderr: "",
      code: 0,
    });

    await expect(
      getGameInstallationStatus("Kakao Games", "POE2"),
    ).resolves.toBe("uninstalled");

    expect(mocks.loggerLog).toHaveBeenCalledWith(
      expect.stringContaining("registry=key-missing"),
    );
  });

  it("keeps a valid configured path installed without reading missing registry candidates", async () => {
    const installPath = String.raw`C:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: installPath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });

    await expect(getGameInstallPath("Kakao Games", "POE2")).resolves.toBe(
      installPath,
    );
    await expect(
      getGameInstallationStatus("Kakao Games", "POE2"),
    ).resolves.toBe("installed");

    expect(mocks.powershellExecute).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
  });

  it("falls back to registry and caches the path when the configured path is empty", async () => {
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: "",
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue({
      stdout: registryPath,
      stderr: "",
      code: 0,
    });

    await expect(getGameInstallPath("Kakao Games", "POE2")).resolves.toBe(
      registryPath,
    );

    expect(mocks.setConfigWithEvent).toHaveBeenCalledWith("gameInstallPaths", {
      "Kakao Games": {
        POE1: "",
        POE2: registryPath,
      },
      GGG: {
        POE1: "",
        POE2: "",
      },
    });
  });

  it("falls back to registry without overwriting when a configured path conflicts", async () => {
    const stalePath = String.raw`C:\Old\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: stalePath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === `${stalePath}\\PathOfExile_KG.exe`) {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }

      return { isFile: () => true };
    });
    mocks.powershellExecute.mockResolvedValue({
      stdout: registryPath,
      stderr: "",
      code: 0,
    });

    await expect(getGameInstallPath("Kakao Games", "POE2")).resolves.toBe(
      registryPath,
    );

    expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
  });

  it("returns diagnostics for conflicting configured and registry paths", async () => {
    const stalePath = String.raw`C:\Old\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: stalePath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === `${stalePath}\\PathOfExile_KG.exe`) {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }

      return { isFile: () => true };
    });
    mocks.powershellExecute.mockResolvedValue({
      stdout: registryPath,
      stderr: "",
      code: 0,
    });

    const diagnostics = await getGameInstallPathDiagnostics(
      "Kakao Games",
      "POE2",
    );

    expect(diagnostics.hasPathConflict).toBe(true);
    expect(diagnostics.recommendedSource).toBe("registry");
    expect(diagnostics.executableName).toBe("PathOfExile_KG.exe");
    expect(diagnostics.config.path).toBe(stalePath);
    expect(diagnostics.config.verification).toBe("missing");
    expect(diagnostics.registry.path).toBe(registryPath);
    expect(diagnostics.registry.verification).toBe("valid");
    expect(diagnostics.registry.registryValueName).toBe("InstallPath");
    expect(diagnostics.isPathConflictAcknowledged).toBe(false);
  });

  it("acknowledges a launcher-config-only conflict for the current path pair", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: configPath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue({
      stdout: registryPath,
      stderr: "",
      code: 0,
    });

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "launcher-config-only",
      kakaoPoe2ConflictTarget(configPath, registryPath),
    );

    expect(result.ok).toBe(true);
    expect(mocks.setConfigWithEvent).toHaveBeenCalledWith(
      "gameInstallPathConflictResolutions",
      {
        "Kakao Games": {
          POE1: null,
          POE2: {
            configPath,
            registryPath,
            resolvedAt: expect.any(Number),
          },
        },
        GGG: {
          POE1: null,
          POE2: null,
        },
      },
    );
  });

  it("marks diagnostics as acknowledged when the saved conflict pair matches", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext(
        {
          "Kakao Games": {
            POE1: "",
            POE2: configPath,
          },
          GGG: {
            POE1: "",
            POE2: "",
          },
        },
        {
          "Kakao Games": {
            POE1: null,
            POE2: {
              configPath,
              registryPath,
              resolvedAt: 123,
            },
          },
          GGG: {
            POE1: null,
            POE2: null,
          },
        },
      ),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue({
      stdout: registryPath,
      stderr: "",
      code: 0,
    });

    const diagnostics = await getGameInstallPathDiagnostics(
      "Kakao Games",
      "POE2",
    );

    expect(diagnostics.hasPathConflict).toBe(true);
    expect(diagnostics.isPathConflictAcknowledged).toBe(true);
  });

  it("updates the registry install path from the launcher config path", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: configPath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute
      .mockResolvedValueOnce({
        stdout: registryPath,
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: "__REG_VALUE_MISSING__",
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: "__REG_CONDITIONAL_MUTATED__",
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: configPath,
        stderr: "",
        code: 0,
      })
      .mockResolvedValueOnce({
        stdout: "__REG_VALUE_MISSING__",
        stderr: "",
        code: 0,
      });

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      kakaoPoe2ConflictTarget(configPath, registryPath),
    );

    expect(result.ok).toBe(true);
    const conditionalCommand = mocks.powershellExecute.mock.calls[2][0];
    expect(conditionalCommand).toContain(`$expectedPath = '${registryPath}'`);
    expect(conditionalCommand).toContain(
      "$currentNormalized -ine $expectedNormalized",
    );
    expect(conditionalCommand).toContain("Set-ItemProperty");
    expect(conditionalCommand).toContain(configPath);
    expect(mocks.setConfigWithEvent).toHaveBeenCalledWith(
      "gameInstallPathConflictResolutions",
      {
        "Kakao Games": {
          POE1: null,
          POE2: null,
        },
        GGG: {
          POE1: null,
          POE2: null,
        },
      },
    );
  });

  it.each([
    ["launcher-config-only", "mismatch"],
    ["launcher-config-only", "missing"],
    ["launcher-config-only", "read-failed"],
    ["sync-registry", "mismatch"],
    ["sync-registry", "missing"],
    ["sync-registry", "read-failed"],
  ] as const)(
    "rejects %s when the exact target fresh read is %s",
    async (action, freshState) => {
      const configPath = String.raw`C:\Games\Path of Exile 2`;
      const registryPath = String.raw`D:\Games\Path of Exile 2`;
      const changedPath = String.raw`E:\Moved\Path of Exile 2`;
      const primaryRegistryPath =
        GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path;
      let primaryReadCount = 0;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: configPath },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.stat.mockResolvedValue({ isFile: () => true });
      mocks.powershellExecute.mockImplementation(async (command: string) => {
        if (command.includes("Set-ItemProperty")) {
          expect(action).toBe("sync-registry");
          if (freshState === "missing") {
            return registryRead("__REG_CONDITIONAL_MISSING__");
          }
          if (freshState === "read-failed") {
            return registryRead(
              "__REG_CONDITIONAL_READ_FAILED__\naccess denied",
            );
          }
          return registryRead("__REG_CONDITIONAL_CHANGED__");
        }
        if (commandReadsRegistryPath(command, primaryRegistryPath)) {
          primaryReadCount += 1;
          if (primaryReadCount === 2) {
            if (freshState === "missing") {
              return registryRead("__REG_VALUE_MISSING__");
            }
            if (freshState === "read-failed") {
              return { stdout: "", stderr: "access denied", code: 5 };
            }
            return registryRead(changedPath);
          }
          return registryRead(registryPath);
        }
        return registryRead("__REG_VALUE_MISSING__");
      });
      mockRegQuery((_command, _args, _options, callback) => {
        callback(
          Object.assign(new Error("access denied"), { code: "EPERM" }),
          "",
          "access denied",
        );
        return {} as ChildProcess;
      });

      const result = await resolveGameInstallPathConflict(
        "Kakao Games",
        "POE2",
        action,
        kakaoPoe2ConflictTarget(configPath, registryPath),
      );

      expect(result.ok).toBe(false);
      const conditionalCommands = mocks.powershellExecute.mock.calls.filter(
        ([command]) => String(command).includes("Set-ItemProperty"),
      );
      expect(conditionalCommands).toHaveLength(
        action === "sync-registry" ? 1 : 0,
      );
      expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
      if (result.ok) throw new Error("Expected target validation to fail");
      expect(result.diagnostics).toBeDefined();
      expect(result.error).toMatch(/changed|missing|could not be read/i);
    },
  );

  it("derives the conflict mutation registry identity from targetId and ignores raw spoof fields", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    const primaryRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path;
    const legacyRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path;
    let mutationCommand = "";
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (command.includes("Set-ItemProperty")) {
        mutationCommand = command;
        return registryRead("__REG_CONDITIONAL_MUTATED__");
      }
      if (commandReadsRegistryPath(command, primaryRegistryPath)) {
        return registryRead(mutationCommand ? configPath : registryPath);
      }
      if (commandReadsRegistryPath(command, legacyRegistryPath)) {
        return registryRead("__REG_VALUE_MISSING__");
      }
      throw new Error(`Unexpected PowerShell command: ${command}`);
    });

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      {
        targetId: "registry-primary",
        expectedPath: registryPath,
        expectedConfigPath: configPath,
        registryPath: legacyRegistryPath,
        registryValueName: "InstallPath",
      } as never,
    );

    expect(result.ok).toBe(true);
    expect(mutationCommand).toContain("Kakaogames\\POE2");
    expect(mutationCommand).not.toContain("DaumGames\\POE2");
  });

  it("rejects a registry target outside the service/game allowlist", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue(registryRead(registryPath));

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      {
        targetId: "untrusted-target",
        expectedPath: registryPath,
        expectedConfigPath: configPath,
      } as never,
    );

    expect(result.ok).toBe(false);
    expect(
      mocks.powershellExecute.mock.calls.some(([command]) =>
        String(command).includes("Set-ItemProperty"),
      ),
    ).toBe(false);
    if (result.ok) throw new Error("Expected allowlist validation to fail");
    expect(result.error).toContain("not allowed");
  });

  it("rejects a non-registry target ID for conflict mutation", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue(registryRead(registryPath));

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      {
        targetId: "config",
        expectedPath: registryPath,
        expectedConfigPath: configPath,
      } as never,
    );

    expect(result.ok).toBe(false);
    expect(
      mocks.powershellExecute.mock.calls.some(([command]) =>
        String(command).includes("Set-ItemProperty"),
      ),
    ).toBe(false);
    if (result.ok) throw new Error("Expected value-name allowlist failure");
    expect(result.error).toContain("not allowed");
  });

  it("rejects conflict actions when the launcher config changed after confirmation", async () => {
    const currentConfigPath = String.raw`C:\Current\Path of Exile 2`;
    const expectedConfigPath = String.raw`C:\Previous\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: currentConfigPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue(registryRead(registryPath));

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      kakaoPoe2ConflictTarget(expectedConfigPath, registryPath),
    );

    expect(result.ok).toBe(false);
    expect(
      mocks.powershellExecute.mock.calls.some(([command]) =>
        String(command).includes("Set-ItemProperty"),
      ),
    ).toBe(false);
    expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
    if (result.ok) throw new Error("Expected config snapshot mismatch");
    expect(result.error).toContain("config path changed");
  });

  it("returns fresh diagnostics when conditional registry sync mutation fails", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    const changedPath = String.raw`E:\Moved\Path of Exile 2`;
    const primaryRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path;
    let mutationAttempted = false;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (command.includes("Set-ItemProperty")) {
        mutationAttempted = true;
        return registryRead(
          "__REG_CONDITIONAL_MUTATION_FAILED__\naccess denied",
        );
      }
      if (commandReadsRegistryPath(command, primaryRegistryPath)) {
        return registryRead(mutationAttempted ? changedPath : registryPath);
      }
      return registryRead("__REG_VALUE_MISSING__");
    });

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      kakaoPoe2ConflictTarget(configPath, registryPath),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected conditional mutation failure");
    expect(result.error).toContain("mutation failed");
    expect(result.diagnostics?.registry.path).toBe(changedPath);
    expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
  });

  it("rejects a mutated marker when PowerShell exits nonzero", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const registryPath = String.raw`D:\Games\Path of Exile 2`;
    const primaryRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (command.includes("Set-ItemProperty")) {
        return {
          stdout: "__REG_CONDITIONAL_MUTATED__",
          stderr: "process failed",
          code: 1,
        };
      }
      if (commandReadsRegistryPath(command, primaryRegistryPath)) {
        return registryRead(registryPath);
      }
      return registryRead("__REG_VALUE_MISSING__");
    });

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      kakaoPoe2ConflictTarget(configPath, registryPath),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected nonzero mutation marker failure");
    expect(result.error).toContain("mutation failed");
    expect(result.error).toContain("code 1");
    expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
  });

  it("syncs the exact legacy target when the primary candidate cannot be read", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const legacyPath = String.raw`D:\Games\Path of Exile 2`;
    const primaryRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path;
    const legacyRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path;
    let writeCompleted = false;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (command.includes("Set-ItemProperty")) {
        expect(command).toContain("DaumGames\\POE2");
        expect(command).toContain(`$expectedPath = '${legacyPath}'`);
        writeCompleted = true;
        return registryRead("__REG_CONDITIONAL_MUTATED__");
      }
      if (commandReadsRegistryPath(command, primaryRegistryPath)) {
        return { stdout: "", stderr: "access denied", code: 5 };
      }
      if (commandReadsRegistryPath(command, legacyRegistryPath)) {
        return registryRead(writeCompleted ? configPath : legacyPath);
      }
      throw new Error(`Unexpected PowerShell command: ${command}`);
    });
    mockRegQuery((_command, _args, _options, callback) => {
      callback(
        Object.assign(new Error("access denied"), { code: "EPERM" }),
        "",
        "access denied",
      );
      return {} as ChildProcess;
    });

    const result = await resolveGameInstallPathConflict(
      "Kakao Games",
      "POE2",
      "sync-registry",
      kakaoPoe2ConflictTarget(configPath, legacyPath, 1),
    );

    expect(result.ok).toBe(true);
    expect(writeCompleted).toBe(true);
  });

  it("registers only the canonical Kakaogames value after checking both candidates in one command", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    const primaryRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[0].path;
    const legacyRegistryPath =
      GAME_INSTALL_REGISTRY_MAP["Kakao Games"].POE2[1].path;
    let registered = false;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (command.includes("__REG_REGISTERED__")) {
        registered = true;
        return registryRead("__REG_REGISTERED__");
      }
      if (commandReadsRegistryPath(command, primaryRegistryPath)) {
        return registryRead(registered ? configPath : "__REG_VALUE_MISSING__");
      }
      if (commandReadsRegistryPath(command, legacyRegistryPath)) {
        return registryRead("__REG_VALUE_MISSING__");
      }
      throw new Error(`Unexpected PowerShell command: ${command}`);
    });

    const result = await registerGameInstallPath("Kakao Games", "POE2", {
      expectedConfigPath: configPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok)
      throw new Error("Expected registry registration to succeed");
    expect(result.registryPath).toBe(primaryRegistryPath);
    expect(result.registryValueName).toBe("InstallPath");
    expect(result.diagnostics.registry.path).toBe(configPath);

    const registrationCommands = mocks.powershellExecute.mock.calls.filter(
      ([command]) => String(command).includes("__REG_REGISTERED__"),
    );
    expect(registrationCommands).toHaveLength(1);
    const registrationCommand = String(registrationCommands[0][0]);
    expect(registrationCommand).toContain("Kakaogames\\POE2");
    expect(registrationCommand).toContain("DaumGames\\POE2");
    expect(registrationCommand).toContain(
      "Assert-RegistryValueAbsent $canonicalPath $canonicalName",
    );
    expect(registrationCommand).toContain(
      "Assert-RegistryValueAbsent $legacyPath $legacyName",
    );
    expect(registrationCommand).toContain(
      "New-ItemProperty -LiteralPath $canonicalPath",
    );
    expect(registrationCommand).not.toContain(
      "New-ItemProperty -LiteralPath $legacyPath",
    );
    expect(registrationCommand).not.toContain("Remove-Item");
    expect(registrationCommand).toContain("-PropertyType String");
    expect(registrationCommand).toContain("$createdItem.GetValue");
  });

  it.each([
    ["a nonempty candidate", "__REG_REGISTER_CHANGED__", /changed/i],
    [
      "a candidate read failure",
      "__REG_REGISTER_READ_FAILED__\naccess denied",
      /could not be read/i,
    ],
    [
      "a mutation failure",
      "__REG_REGISTER_MUTATION_FAILED__\naccess denied",
      /registration failed/i,
    ],
    [
      "a read-back failure",
      "__REG_REGISTER_READBACK_FAILED__",
      /could not be verified/i,
    ],
  ] as const)(
    "does not report registry registration success for %s",
    async (_failureCase, marker, expectedError) => {
      const configPath = String.raw`C:\Games\Path of Exile 2`;
      mocks.contextProviderGet.mockReturnValue(
        createContext({
          "Kakao Games": { POE1: "", POE2: configPath },
          GGG: { POE1: "", POE2: "" },
        }),
      );
      mocks.stat.mockResolvedValue({ isFile: () => true });
      mocks.powershellExecute.mockImplementation(async (command: string) => {
        if (command.includes("__REG_REGISTERED__")) {
          return registryRead(marker);
        }
        return registryRead("__REG_VALUE_MISSING__");
      });

      const result = await registerGameInstallPath("Kakao Games", "POE2", {
        expectedConfigPath: configPath,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected registry registration to fail");
      expect(result.error).toMatch(expectedError);
      expect(result.diagnostics).toBeDefined();
      const registrationCommands = mocks.powershellExecute.mock.calls.filter(
        ([command]) => String(command).includes("__REG_REGISTERED__"),
      );
      expect(registrationCommands).toHaveLength(1);
      const registrationCommand = String(registrationCommands[0][0]);
      expect(registrationCommand.indexOf("$canonicalAbsent")).toBeLessThan(
        registrationCommand.indexOf("New-ItemProperty"),
      );
      expect(registrationCommand.indexOf("$legacyAbsent")).toBeLessThan(
        registrationCommand.indexOf("New-ItemProperty"),
      );
    },
  );

  it("rejects a registered marker when PowerShell exits nonzero", async () => {
    const configPath = String.raw`C:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockImplementation(async (command: string) => {
      if (command.includes("__REG_REGISTERED__")) {
        return {
          stdout: "__REG_REGISTERED__",
          stderr: "process failed",
          code: 1,
        };
      }
      return registryRead("__REG_VALUE_MISSING__");
    });

    const result = await registerGameInstallPath("Kakao Games", "POE2", {
      expectedConfigPath: configPath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected nonzero registration failure");
    expect(result.error).toContain("registration failed");
    expect(result.error).toContain("code 1");
  });

  it("does not start registry registration when the config snapshot changed", async () => {
    const configPath = String.raw`C:\Games\Current Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": { POE1: "", POE2: configPath },
        GGG: { POE1: "", POE2: "" },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue(
      registryRead("__REG_VALUE_MISSING__"),
    );

    const result = await registerGameInstallPath("Kakao Games", "POE2", {
      expectedConfigPath: String.raw`C:\Games\Previous Path of Exile 2`,
    });

    expect(result.ok).toBe(false);
    expect(
      mocks.powershellExecute.mock.calls.some(([command]) =>
        String(command).includes("__REG_REGISTERED__"),
      ),
    ).toBe(false);
    if (result.ok) throw new Error("Expected config snapshot mismatch");
    expect(result.error).toContain("config path changed");
  });

  it("rejects registry registration for GGG without creating a value", async () => {
    mocks.powershellExecute.mockResolvedValue(
      registryRead("__REG_VALUE_MISSING__"),
    );

    const result = await registerGameInstallPath("GGG", "POE2", {
      expectedConfigPath: String.raw`C:\Games\Path of Exile 2`,
    });

    expect(result.ok).toBe(false);
    expect(
      mocks.powershellExecute.mock.calls.some(([command]) =>
        String(command).includes("__REG_REGISTERED__"),
      ),
    ).toBe(false);
    if (result.ok) throw new Error("Expected GGG registration rejection");
    expect(result.error).toContain("only supported for Kakao Games");
  });

  it("saves a manually selected install path only after executable verification", async () => {
    const installPath = String.raw`E:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: "",
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });
    mocks.powershellExecute.mockResolvedValue({
      stdout: "__REG_VALUE_MISSING__",
      stderr: "",
      code: 0,
    });

    const result = await setGameInstallPath("Kakao Games", "POE2", installPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected install path save to succeed");
    }

    expect(result.path).toBe(installPath);
    expect(mocks.setConfigWithEvent).toHaveBeenCalledWith("gameInstallPaths", {
      "Kakao Games": {
        POE1: "",
        POE2: installPath,
      },
      GGG: {
        POE1: "",
        POE2: "",
      },
    });
  });

  it("rejects a manually selected Kakao folder without PathOfExile_KG.exe", async () => {
    const installPath = String.raw`E:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: "",
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );

    const result = await setGameInstallPath("Kakao Games", "POE2", installPath);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected install path save to fail");
    }

    expect(result.verification).toBe("missing");
    expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
  });

  it("clears a saved launcher install path for a service/game pair", async () => {
    const installPath = String.raw`E:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: installPath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.powershellExecute.mockResolvedValue({
      stdout: "__REG_VALUE_MISSING__",
      stderr: "",
      code: 0,
    });

    const result = await clearGameInstallPath("Kakao Games", "POE2", "config");

    expect(result.ok).toBe(true);
    expect(mocks.setConfigWithEvent).toHaveBeenCalledWith("gameInstallPaths", {
      "Kakao Games": {
        POE1: "",
        POE2: "",
      },
      GGG: {
        POE1: "",
        POE2: "",
      },
    });
  });

  it("deletes a registry install path value", async () => {
    const installPath = String.raw`E:\Games\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: installPath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.powershellExecute
      .mockResolvedValueOnce({
        stdout: "__REG_CONDITIONAL_MUTATED__",
        stderr: "",
        code: 0,
      })
      .mockResolvedValue({
        stdout: "__REG_VALUE_MISSING__",
        stderr: "",
        code: 0,
      });

    const result = await clearGameInstallPath(
      "Kakao Games",
      "POE2",
      "registry",
      kakaoPoe2RegistryTarget(installPath),
    );

    expect(result.ok).toBe(true);
    expect(mocks.powershellExecute).toHaveBeenCalledWith(
      expect.stringContaining("Remove-ItemProperty"),
      false,
    );
    const conditionalCommand = mocks.powershellExecute.mock.calls[0][0];
    expect(conditionalCommand).toContain(`$expectedPath = '${installPath}'`);
    expect(conditionalCommand).toContain(
      "$currentNormalized -ine $expectedNormalized",
    );
  });

  it("does not delete when the exact registry target changed after diagnostics", async () => {
    const expectedPath = String.raw`D:\Games\Path of Exile 2`;
    const changedPath = String.raw`E:\Moved\Path of Exile 2`;
    mocks.powershellExecute.mockImplementation(async (command: string) =>
      command.includes("Remove-ItemProperty")
        ? registryRead("__REG_CONDITIONAL_CHANGED__")
        : registryRead(changedPath),
    );
    mocks.stat.mockResolvedValue({ isFile: () => true });

    const result = await clearGameInstallPath(
      "Kakao Games",
      "POE2",
      "registry",
      kakaoPoe2RegistryTarget(expectedPath),
    );

    expect(result.ok).toBe(false);
    expect(
      mocks.powershellExecute.mock.calls.filter(([command]) =>
        String(command).includes("Remove-ItemProperty"),
      ),
    ).toHaveLength(1);
    if (result.ok) throw new Error("Expected exact target validation to fail");
    expect(result.error).toContain("changed since diagnostics");
    expect(result.diagnostics).toBeDefined();
  });

  it.each(["missing", "read-failed"] as const)(
    "does not clear the registry when the conditional target is %s",
    async (targetState) => {
      const expectedPath = String.raw`D:\Games\Path of Exile 2`;
      mocks.powershellExecute.mockImplementation(async (command: string) => {
        if (command.includes("Remove-ItemProperty")) {
          return registryRead(
            targetState === "missing"
              ? "__REG_CONDITIONAL_MISSING__"
              : "__REG_CONDITIONAL_READ_FAILED__\naccess denied",
          );
        }
        return registryRead("__REG_VALUE_MISSING__");
      });

      const result = await clearGameInstallPath(
        "Kakao Games",
        "POE2",
        "registry",
        kakaoPoe2RegistryTarget(expectedPath),
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected conditional clear to fail");
      expect(result.error).toMatch(/missing|could not be read/i);
      expect(result.diagnostics).toBeDefined();
      expect(
        mocks.powershellExecute.mock.calls.filter(([command]) =>
          String(command).includes("Remove-ItemProperty"),
        ),
      ).toHaveLength(1);
    },
  );

  it("logs both configured path and registry diagnostics when both fail", async () => {
    const stalePath = String.raw`C:\Old\Path of Exile 2`;
    mocks.contextProviderGet.mockReturnValue(
      createContext({
        "Kakao Games": {
          POE1: "",
          POE2: stalePath,
        },
        GGG: {
          POE1: "",
          POE2: "",
        },
      }),
    );
    mocks.stat.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    mocks.powershellExecute.mockResolvedValue({
      stdout: "__REG_VALUE_MISSING__",
      stderr: "",
      code: 0,
    });

    await expect(
      getGameInstallationStatus("Kakao Games", "POE2"),
    ).resolves.toBe("uninstalled");

    expect(mocks.loggerLog).toHaveBeenCalledWith(
      expect.stringContaining("config=path-invalid"),
    );
    expect(mocks.loggerLog).toHaveBeenCalledWith(
      expect.stringContaining("registry=value-missing"),
    );
  });

  it("returns uninstalled when a Kakao registry path does not contain PathOfExile_KG.exe", async () => {
    const installPath = String.raw`C:\Games\Path of Exile 2`;
    mocks.powershellExecute.mockResolvedValue({
      stdout: installPath,
      stderr: "",
      code: 0,
    });
    mocks.stat.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );

    await expect(
      getGameInstallationStatus("Kakao Games", "POE2"),
    ).resolves.toBe("uninstalled");

    expect(mocks.setConfigWithEvent).not.toHaveBeenCalled();
    expect(mocks.loggerLog).toHaveBeenCalledWith(
      expect.stringContaining("registry=path-invalid"),
    );
    expect(mocks.loggerLog).toHaveBeenCalledWith(
      expect.stringContaining("PathOfExile_KG.exe missing"),
    );
  });

  it("defines registry and cached config slots for every supported service/game", () => {
    expect(GAME_INSTALL_REGISTRY_MAP["Kakao Games"]).toEqual({
      POE1: [
        {
          path: String.raw`HKCU:\Software\Kakaogames\POE`,
          key: "InstallPath",
        },
        {
          path: String.raw`HKCU:\Software\DaumGames\POE`,
          key: "InstallPath",
        },
      ],
      POE2: [
        {
          path: String.raw`HKCU:\Software\Kakaogames\POE2`,
          key: "InstallPath",
        },
        {
          path: String.raw`HKCU:\Software\DaumGames\POE2`,
          key: "InstallPath",
        },
      ],
    });
    expect(Object.keys(GAME_INSTALL_REGISTRY_MAP).sort()).toEqual(
      [...SERVICE_CHANNELS].sort(),
    );
    expect(Object.keys(DEFAULT_CONFIG.gameInstallPaths).sort()).toEqual(
      [...SERVICE_CHANNELS].sort(),
    );
    expect(
      Object.keys(DEFAULT_CONFIG.gameInstallPathConflictResolutions).sort(),
    ).toEqual([...SERVICE_CHANNELS].sort());

    for (const serviceId of SERVICE_CHANNELS) {
      expect(Object.keys(GAME_INSTALL_REGISTRY_MAP[serviceId]).sort()).toEqual(
        [...ACTIVE_GAMES].sort(),
      );
      expect(
        Object.keys(DEFAULT_CONFIG.gameInstallPaths[serviceId]).sort(),
      ).toEqual([...ACTIVE_GAMES].sort());
      expect(
        Object.keys(
          DEFAULT_CONFIG.gameInstallPathConflictResolutions[serviceId],
        ).sort(),
      ).toEqual([...ACTIVE_GAMES].sort());

      for (const gameId of ACTIVE_GAMES) {
        const registryCandidates = GAME_INSTALL_REGISTRY_MAP[serviceId][gameId];

        expect(registryCandidates.length).toBeGreaterThan(0);
        for (const registryInfo of registryCandidates) {
          expect(
            registryInfo.path,
            `${serviceId}/${gameId} registry path is required`,
          ).not.toBe("");
          expect(
            registryInfo.key,
            `${serviceId}/${gameId} registry value name is required`,
          ).not.toBe("");
        }
        expect(DEFAULT_CONFIG.gameInstallPaths[serviceId][gameId]).toBe("");
        expect(
          DEFAULT_CONFIG.gameInstallPathConflictResolutions[serviceId][gameId],
        ).toBeNull();
      }
    }
  });
});

function createContext(
  gameInstallPaths: {
    "Kakao Games": { POE1: string; POE2: string };
    GGG: { POE1: string; POE2: string };
  },
  gameInstallPathConflictResolutions = DEFAULT_CONFIG.gameInstallPathConflictResolutions,
) {
  return {
    getConfig: () => ({
      gameInstallPaths,
      gameInstallPathConflictResolutions,
    }),
  };
}

import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GAME_INSTALL_PATH_SELECTION_TTL_MS,
  GameInstallPathSelectionService,
  type GameInstallPathSelectionServiceDependencies,
} from "../game/GameInstallPathSelectionService";

import type {
  AppConfig,
  GameInstallPathDiagnostics,
  GameInstallPathTargetApplyResult,
  GameInstallPathTargetId,
  GameInstallPathTargetSnapshot,
} from "../../shared/types";

type ServiceId = AppConfig["serviceChannel"];
type GameId = AppConfig["activeGame"];

const primaryPath = String.raw`C:\Games\Primary`;
const compatibilityPath = String.raw`D:\Games\Compatibility`;
const configPath = String.raw`E:\Games\Config`;
const selectedPath = String.raw`F:\Games\Selected POE2`;

const createDiagnostics = (
  serviceId: ServiceId = "Kakao Games",
  gameId: GameId = "POE2",
  options: {
    primaryPath?: string | null;
    primaryState?: "found" | "key-missing" | "read-failed";
    compatibilityPath?: string | null;
    compatibilityState?: "found" | "key-missing" | "read-failed";
    configPath?: string | null;
    includeCompatibility?: boolean;
  } = {},
): GameInstallPathDiagnostics => {
  const resolvedPrimaryPath = options.primaryPath ?? primaryPath;
  const primaryState = options.primaryState ?? "found";
  const resolvedCompatibilityPath =
    options.compatibilityPath ?? compatibilityPath;
  const compatibilityState = options.compatibilityState ?? "found";
  const resolvedConfigPath = options.configPath ?? configPath;
  const primaryCandidate = {
    targetId: "registry-primary" as const,
    path: primaryState === "found" ? resolvedPrimaryPath : null,
    state: primaryState,
    verification:
      primaryState === "found" ? ("valid" as const) : ("not-checked" as const),
    registryPath: ["HKCU:", "Software", "Primary", gameId].join("\\"),
    registryValueName: "InstallPath",
    isActive: primaryState === "found",
  };
  const compatibilityCandidate = {
    targetId: "registry-compatibility" as const,
    path: compatibilityState === "found" ? resolvedCompatibilityPath : null,
    state: compatibilityState,
    verification:
      compatibilityState === "found"
        ? ("valid" as const)
        : ("not-checked" as const),
    registryPath: ["HKCU:", "Software", "Compatibility", gameId].join("\\"),
    registryValueName: "InstallPath",
    isActive: false,
  };
  const candidates = [
    primaryCandidate,
    ...((options.includeCompatibility ?? serviceId === "Kakao Games")
      ? [compatibilityCandidate]
      : []),
  ];

  return {
    serviceId,
    gameId,
    executableName:
      serviceId === "Kakao Games" ? "PathOfExile_KG.exe" : "PathOfExile.exe",
    config: {
      source: "config",
      path: resolvedConfigPath,
      state: resolvedConfigPath ? "found" : "empty",
      verification: resolvedConfigPath ? "valid" : "not-checked",
    },
    registry: {
      source: "registry",
      path: primaryCandidate.path,
      state: primaryCandidate.state,
      verification: primaryCandidate.verification,
      registryPath: primaryCandidate.registryPath,
      registryValueName: primaryCandidate.registryValueName,
      aggregateState: primaryCandidate.path ? "valid" : "absent",
      candidates,
    },
    hasPathConflict: false,
    isPathConflictAcknowledged: false,
    recommendedSource: null,
  };
};

const snapshotsFromDiagnostics = (
  diagnostics: GameInstallPathDiagnostics,
): readonly GameInstallPathTargetSnapshot[] => [
  ...diagnostics.registry.candidates.map((candidate) => ({
    targetId: candidate.targetId,
    currentPath: candidate.path,
    registryState: candidate.state,
  })),
  { targetId: "config", currentPath: diagnostics.config.path },
];

const createDeferred = <Value>() => {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const fileStats = { isDirectory: () => false, isFile: () => true };

describe("GameInstallPathSelectionService", () => {
  let now: number;
  let uuidSequence: number;
  let diagnostics: GameInstallPathDiagnostics;
  let directories: Set<string>;
  let files: Set<string>;
  let dependencies: GameInstallPathSelectionServiceDependencies;
  let service: GameInstallPathSelectionService;

  const normalize = (value: string) =>
    path.win32.normalize(value).toLowerCase();
  const executablePath = (serviceId: ServiceId, installPath: string) =>
    path.win32.join(
      installPath,
      serviceId === "Kakao Games" ? "PathOfExile_KG.exe" : "PathOfExile.exe",
    );
  const markDirectory = (...paths: string[]) => {
    for (const candidatePath of paths)
      directories.add(normalize(candidatePath));
  };
  const markValidInstall = (
    installPath: string,
    serviceId: ServiceId = "Kakao Games",
  ) => {
    files.add(normalize(executablePath(serviceId, installPath)));
  };
  const createValidSelection = async (
    ownerWebContentsId = 1,
    serviceId: ServiceId = "Kakao Games",
    gameId: GameId = "POE2",
    installPath = selectedPath,
  ) => {
    markValidInstall(installPath, serviceId);
    const result = await service.createSelection(
      ownerWebContentsId,
      serviceId,
      gameId,
      `${installPath}\\`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid selection fixture");
    return result.selection;
  };

  beforeEach(() => {
    now = 1_000;
    uuidSequence = 0;
    diagnostics = createDiagnostics();
    directories = new Set();
    files = new Set();

    dependencies = {
      now: () => now,
      randomUUID: () => `selection-${++uuidSequence}`,
      fsStat: vi.fn(async (targetPath: string) => {
        const normalized = normalize(targetPath);
        if (directories.has(normalized)) {
          return { isDirectory: () => true, isFile: () => false };
        }
        if (files.has(normalized)) {
          return { isDirectory: () => false, isFile: () => true };
        }
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }),
      getDiagnostics: vi.fn(async () => diagnostics),
      collectSnapshots: vi.fn((value) => snapshotsFromDiagnostics(value)),
      applyTarget: vi.fn(
        async (
          _serviceId: ServiceId,
          _gameId: GameId,
          snapshot: GameInstallPathTargetSnapshot,
          installPath: string,
        ): Promise<GameInstallPathTargetApplyResult> => ({
          targetId: snapshot.targetId,
          status: "applied",
          path: installPath,
        }),
      ),
    };
    service = new GameInstallPathSelectionService(dependencies);
  });

  it("uses the first existing registry candidate as the picker default path", async () => {
    markDirectory(compatibilityPath, configPath);

    await expect(service.getDefaultPath("Kakao Games", "POE2")).resolves.toBe(
      compatibilityPath,
    );
    expect(dependencies.fsStat).toHaveBeenCalledWith(primaryPath);
    expect(dependencies.fsStat).toHaveBeenCalledWith(compatibilityPath);
    expect(dependencies.fsStat).not.toHaveBeenCalledWith(configPath);
  });

  it("falls back to an existing config directory after registry candidates", async () => {
    markDirectory(configPath);

    await expect(service.getDefaultPath("Kakao Games", "POE2")).resolves.toBe(
      configPath,
    );
  });

  it("omits the picker default path when no diagnostic path is a directory", async () => {
    await expect(
      service.getDefaultPath("Kakao Games", "POE2"),
    ).resolves.toBeUndefined();
  });

  it("creates a normalized verified selection without applying a target", async () => {
    const selection = await createValidSelection();

    expect(selection).toMatchObject({
      selectionId: "selection-1",
      serviceId: "Kakao Games",
      gameId: "POE2",
      path: selectedPath,
    });
    expect(selection.targets).toEqual([
      expect.objectContaining({
        targetId: "registry-primary",
        selectedByDefault: true,
        disabled: false,
        registryPath: String.raw`HKCU:\Software\Primary\POE2`,
        registryValueName: "InstallPath",
      }),
      expect.objectContaining({
        targetId: "registry-compatibility",
        selectedByDefault: false,
        disabled: false,
      }),
      expect.objectContaining({
        targetId: "config",
        selectedByDefault: true,
        disabled: false,
      }),
    ]);
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("returns a typed invalid result when the selected executable is missing", async () => {
    const result = await service.createSelection(
      1,
      "Kakao Games",
      "POE2",
      selectedPath,
    );

    expect(result).toEqual({
      ok: false,
      status: "invalid",
      code: "install-path-invalid",
      verification: "missing",
    });
    expect(dependencies.getDiagnostics).not.toHaveBeenCalled();
    expect(dependencies.collectSnapshots).not.toHaveBeenCalled();
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("isolates selections by owner without leaking their context", async () => {
    const selection = await createValidSelection(11);

    const result = await service.applySelection(12, {
      selectionId: selection.selectionId,
      targetIds: ["config"],
    });

    expect(result).toEqual({
      ok: false,
      overall: "failed",
      failureCode: "selection-owner-mismatch",
      results: [],
      retryableTargetIds: [],
    });
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("discards the previous selection when the same owner creates a new one", async () => {
    const first = await createValidSelection(11);
    const secondPath = String.raw`F:\Games\Second POE2`;
    const second = await createValidSelection(
      11,
      "Kakao Games",
      "POE2",
      secondPath,
    );

    await expect(
      service.applySelection(11, {
        selectionId: first.selectionId,
        targetIds: ["config"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      failureCode: "selection-not-found",
    });
    await expect(
      service.applySelection(11, {
        selectionId: second.selectionId,
        targetIds: ["config"],
      }),
    ).resolves.toMatchObject({ ok: true, overall: "success" });
  });

  it("never reissues a replaced selection ID to the same live owner", async () => {
    dependencies.randomUUID = vi
      .fn()
      .mockReturnValueOnce("selection-x")
      .mockReturnValueOnce("selection-x")
      .mockReturnValueOnce("selection-y");
    const first = await createValidSelection(11);
    const replacement = await createValidSelection(
      11,
      "Kakao Games",
      "POE2",
      String.raw`F:\Games\Replacement POE2`,
    );

    const staleResult = await service.applySelection(11, {
      selectionId: first.selectionId,
      targetIds: ["config"],
    });

    expect(first.selectionId).toBe("selection-x");
    expect(replacement.selectionId).toBe("selection-y");
    expect(staleResult).toEqual({
      ok: false,
      overall: "failed",
      failureCode: "selection-not-found",
      results: [],
      retryableTargetIds: [],
    });
    expect(dependencies.randomUUID).toHaveBeenCalledTimes(3);
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("regenerates a colliding active selection ID without crossing owners", async () => {
    dependencies.randomUUID = vi
      .fn()
      .mockReturnValueOnce("shared-selection")
      .mockReturnValueOnce("shared-selection")
      .mockReturnValueOnce("owner-b-selection");
    const ownerA = await createValidSelection(11);
    const ownerB = await createValidSelection(12);

    expect(ownerA.selectionId).toBe("shared-selection");
    expect(ownerB.selectionId).toBe("owner-b-selection");

    service.disposeOwner(11);
    await expect(
      service.applySelection(12, {
        selectionId: ownerB.selectionId,
        targetIds: ["config"],
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("fails closed after bounded active selection ID collisions", async () => {
    dependencies.randomUUID = vi.fn(() => "shared-selection");
    await createValidSelection(11);

    const result = await service.createSelection(
      12,
      "Kakao Games",
      "POE2",
      selectedPath,
    );

    expect(result).toEqual({
      ok: false,
      status: "unavailable",
      code: "selection-id-unavailable",
    });
    expect(dependencies.randomUUID).toHaveBeenCalledTimes(9);
  });

  it("does not insert a delayed selection after owner disposal during fsStat", async () => {
    const deferredStat = createDeferred<typeof fileStats>();
    vi.mocked(dependencies.fsStat).mockReturnValueOnce(deferredStat.promise);

    const creation = service.createSelection(
      41,
      "Kakao Games",
      "POE2",
      selectedPath,
    );
    service.disposeOwner(41);
    deferredStat.resolve(fileStats);

    await expect(creation).resolves.toEqual({
      ok: false,
      status: "canceled",
    });
    expect(dependencies.collectSnapshots).not.toHaveBeenCalled();
  });

  it("does not insert a delayed selection after owner disposal during diagnostics", async () => {
    markValidInstall(selectedPath);
    const deferredDiagnostics = createDeferred<GameInstallPathDiagnostics>();
    vi.mocked(dependencies.getDiagnostics).mockReturnValueOnce(
      deferredDiagnostics.promise,
    );

    const creation = service.createSelection(
      42,
      "Kakao Games",
      "POE2",
      selectedPath,
    );
    await vi.waitFor(() =>
      expect(dependencies.getDiagnostics).toHaveBeenCalledTimes(1),
    );
    service.disposeOwner(42);
    deferredDiagnostics.resolve(diagnostics);

    await expect(creation).resolves.toEqual({
      ok: false,
      status: "canceled",
    });
    expect(dependencies.collectSnapshots).not.toHaveBeenCalled();
  });

  it("disposes every selection owned by a destroyed renderer", async () => {
    const selection = await createValidSelection(11);

    service.disposeOwner(11);

    await expect(
      service.applySelection(11, {
        selectionId: selection.selectionId,
        targetIds: ["config"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      failureCode: "selection-not-found",
    });
  });

  it("expires selections lazily without a timer", async () => {
    const selection = await createValidSelection(11);
    now += GAME_INSTALL_PATH_SELECTION_TTL_MS;

    await expect(
      service.applySelection(11, {
        selectionId: selection.selectionId,
        targetIds: ["config"],
      }),
    ).resolves.toEqual({
      ok: false,
      overall: "failed",
      failureCode: "selection-expired",
      results: [],
      retryableTargetIds: [],
    });
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("does not reissue an expired selection ID while its owner remains live", async () => {
    dependencies.randomUUID = vi
      .fn()
      .mockReturnValueOnce("selection-x")
      .mockReturnValueOnce("selection-x")
      .mockReturnValueOnce("selection-y");
    const expired = await createValidSelection(11);
    now += GAME_INSTALL_PATH_SELECTION_TTL_MS;
    await service.applySelection(11, {
      selectionId: expired.selectionId,
      targetIds: ["config"],
    });

    const replacement = await createValidSelection(
      11,
      "Kakao Games",
      "POE2",
      String.raw`F:\Games\After Expiry POE2`,
    );

    expect(replacement.selectionId).toBe("selection-y");
    expect(dependencies.randomUUID).toHaveBeenCalledTimes(3);
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("marks read-failed targets disabled and never creates GGG compatibility", async () => {
    diagnostics = createDiagnostics("GGG", "POE2", {
      primaryState: "read-failed",
      includeCompatibility: true,
    });

    const selection = await createValidSelection(7, "GGG");

    expect(selection.targets).toEqual([
      expect.objectContaining({
        targetId: "registry-primary",
        selectedByDefault: true,
        disabled: true,
        disabledReason: "target-read-failed",
      }),
      expect.objectContaining({
        targetId: "config",
        selectedByDefault: true,
        disabled: false,
      }),
    ]);
  });

  it("keeps a persistently read-failed target disabled and non-retryable", async () => {
    diagnostics = createDiagnostics("Kakao Games", "POE2", {
      primaryState: "read-failed",
    });
    const selection = await createValidSelection(56);

    const result = await service.applySelection(56, {
      selectionId: selection.selectionId,
      targetIds: ["registry-primary"],
    });

    expect(result).toMatchObject({
      ok: false,
      overall: "failed",
      results: [
        {
          targetId: "registry-primary",
          status: "failed",
          code: "target-read-failed",
          retryable: false,
        },
      ],
      retryableTargetIds: [],
      selection: {
        targets: expect.arrayContaining([
          expect.objectContaining({
            targetId: "registry-primary",
            disabled: true,
            disabledReason: "target-read-failed",
          }),
        ]),
      },
    });
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("reenables retry when a preflight read failure recovers in the final observation", async () => {
    const readFailedDiagnostics = createDiagnostics("Kakao Games", "POE2", {
      primaryState: "read-failed",
    });
    diagnostics = readFailedDiagnostics;
    const selection = await createValidSelection(59);
    const recoveredDiagnostics = createDiagnostics();
    vi.mocked(dependencies.getDiagnostics)
      .mockResolvedValueOnce(readFailedDiagnostics)
      .mockResolvedValueOnce(recoveredDiagnostics);

    const result = await service.applySelection(59, {
      selectionId: selection.selectionId,
      targetIds: ["registry-primary"],
    });

    expect(result).toMatchObject({
      ok: false,
      overall: "failed",
      results: [
        {
          targetId: "registry-primary",
          status: "failed",
          code: "target-read-failed",
          retryable: true,
        },
      ],
      retryableTargetIds: ["registry-primary"],
      selection: {
        targets: expect.arrayContaining([
          expect.objectContaining({
            targetId: "registry-primary",
            currentPath: primaryPath,
            disabled: false,
          }),
        ]),
      },
    });
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", [], "invalid-target-ids"],
    ["duplicate", ["config", "config"], "duplicate-target-ids"],
    ["blank", [""], "invalid-target-ids"],
    ["arbitrary", ["registry-admin"], "target-not-allowed"],
  ] as const)(
    "rejects %s target IDs before mutation",
    async (_label, targetIds, code) => {
      const selection = await createValidSelection();

      const result = await service.applySelection(1, {
        selectionId: selection.selectionId,
        targetIds: [...targetIds] as GameInstallPathTargetId[],
      });

      expect(result).toMatchObject({
        ok: false,
        overall: "failed",
        failureCode: code,
        results: [],
        retryableTargetIds: [],
      });
      expect(dependencies.applyTarget).not.toHaveBeenCalled();
    },
  );

  it("rejects a completed target before mutating any other requested target", async () => {
    const selection = await createValidSelection();
    await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["config"],
    });
    expect(dependencies.applyTarget).toHaveBeenCalledTimes(1);

    const result = await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["config", "registry-primary"],
    });

    expect(result).toMatchObject({
      ok: false,
      failureCode: "target-completed",
    });
    expect(dependencies.applyTarget).toHaveBeenCalledTimes(1);
  });

  it("applies targets serially in primary, compatibility, config order", async () => {
    const selection = await createValidSelection();

    await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["config", "registry-compatibility", "registry-primary"],
    });

    expect(dependencies.applyTarget).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(dependencies.applyTarget)
        .mock.calls.map((call) => call[2].targetId),
    ).toEqual(["registry-primary", "registry-compatibility", "config"]);
  });

  it("rejects a same-selection replay while the first target mutation is in flight", async () => {
    const selection = await createValidSelection(57);
    const deferredApply = createDeferred<GameInstallPathTargetApplyResult>();
    vi.mocked(dependencies.applyTarget).mockReturnValueOnce(
      deferredApply.promise,
    );

    const firstApply = service.applySelection(57, {
      selectionId: selection.selectionId,
      targetIds: ["config"],
    });
    await vi.waitFor(() =>
      expect(dependencies.applyTarget).toHaveBeenCalledTimes(1),
    );

    const replayResult = await service.applySelection(57, {
      selectionId: selection.selectionId,
      targetIds: ["config"],
    });
    deferredApply.resolve({
      targetId: "config",
      status: "applied",
      path: selectedPath,
    });
    const firstResult = await firstApply;

    expect(replayResult).toEqual({
      ok: false,
      overall: "failed",
      failureCode: "selection-busy",
      results: [],
      retryableTargetIds: [],
    });
    expect(firstResult).toMatchObject({ ok: true, overall: "success" });
    expect(dependencies.applyTarget).toHaveBeenCalledTimes(1);
  });

  it("holds the same-selection apply lock through the final refresh", async () => {
    const selection = await createValidSelection(58);
    const deferredRefresh = createDeferred<GameInstallPathDiagnostics>();
    vi.mocked(dependencies.getDiagnostics)
      .mockResolvedValueOnce(diagnostics)
      .mockReturnValueOnce(deferredRefresh.promise);

    const firstApply = service.applySelection(58, {
      selectionId: selection.selectionId,
      targetIds: ["config"],
    });
    await vi.waitFor(() =>
      expect(dependencies.getDiagnostics).toHaveBeenCalledTimes(3),
    );

    const replayResult = await service.applySelection(58, {
      selectionId: selection.selectionId,
      targetIds: ["config"],
    });
    deferredRefresh.resolve(diagnostics);
    await firstApply;

    expect(replayResult).toEqual({
      ok: false,
      overall: "failed",
      failureCode: "selection-busy",
      results: [],
      retryableTargetIds: [],
    });
    expect(dependencies.applyTarget).toHaveBeenCalledTimes(1);
  });

  it("rechecks liveness after deferred apply path verification", async () => {
    const selection = await createValidSelection(51);
    const deferredStat = createDeferred<typeof fileStats>();
    vi.mocked(dependencies.fsStat).mockReturnValueOnce(deferredStat.promise);

    const applying = service.applySelection(51, {
      selectionId: selection.selectionId,
      targetIds: ["config"],
    });
    service.disposeOwner(51);
    deferredStat.resolve(fileStats);

    await expect(applying).resolves.toMatchObject({
      ok: false,
      failureCode: "selection-invalidated",
    });
    expect(dependencies.getDiagnostics).toHaveBeenCalledTimes(1);
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("classifies a deferred fresh diagnostics preflight before any mutation", async () => {
    const selection = await createValidSelection(52);
    const deferredDiagnostics = createDeferred<GameInstallPathDiagnostics>();
    vi.mocked(dependencies.getDiagnostics).mockReturnValueOnce(
      deferredDiagnostics.promise,
    );

    const applying = service.applySelection(52, {
      selectionId: selection.selectionId,
      targetIds: ["registry-primary", "config"],
    });
    await vi.waitFor(() =>
      expect(dependencies.getDiagnostics).toHaveBeenCalledTimes(2),
    );
    service.disposeOwner(52);
    deferredDiagnostics.resolve(diagnostics);

    await expect(applying).resolves.toMatchObject({
      ok: false,
      failureCode: "selection-invalidated",
    });
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });

  it("stops later target mutations when a replacement invalidates an in-flight apply", async () => {
    const oldSelection = await createValidSelection(53);
    const deferredApply = createDeferred<GameInstallPathTargetApplyResult>();
    vi.mocked(dependencies.applyTarget).mockReturnValueOnce(
      deferredApply.promise,
    );

    const applying = service.applySelection(53, {
      selectionId: oldSelection.selectionId,
      targetIds: ["registry-primary", "config"],
    });
    await vi.waitFor(() =>
      expect(dependencies.applyTarget).toHaveBeenCalledTimes(1),
    );
    await createValidSelection(
      53,
      "Kakao Games",
      "POE2",
      String.raw`F:\Games\Replacement POE2`,
    );
    deferredApply.resolve({
      targetId: "registry-primary",
      status: "applied",
      path: selectedPath,
    });

    const result = await applying;
    expect(dependencies.applyTarget).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      overall: "partial",
      failureCode: "selection-invalidated",
      results: [
        expect.objectContaining({
          targetId: "registry-primary",
          status: "applied",
        }),
        expect.objectContaining({
          targetId: "config",
          status: "failed",
          code: "selection-invalidated",
        }),
      ],
    });
  });

  it("preflights every requested fresh snapshot before mutating valid targets", async () => {
    const selection = await createValidSelection(54);
    diagnostics = createDiagnostics("Kakao Games", "POE2", {
      primaryPath: String.raw`C:\Games\Changed Primary`,
    });

    const result = await service.applySelection(54, {
      selectionId: selection.selectionId,
      targetIds: ["registry-primary", "config"],
    });

    expect(dependencies.applyTarget).toHaveBeenCalledTimes(1);
    expect(dependencies.applyTarget).toHaveBeenCalledWith(
      "Kakao Games",
      "POE2",
      { targetId: "config", currentPath: configPath },
      selectedPath,
    );
    expect(result.results).toEqual([
      {
        targetId: "registry-primary",
        status: "failed",
        code: "target-changed",
        retryable: true,
      },
      {
        targetId: "config",
        status: "applied",
        path: selectedPath,
      },
    ]);
  });

  it("derives mutation authority and response display from coherent B then C diagnostics", async () => {
    const stateB = createDiagnostics("Kakao Games", "POE2", {
      compatibilityPath: String.raw`D:\Games\State B`,
    });
    diagnostics = stateB;
    const selection = await createValidSelection(55);
    const stateC = createDiagnostics("Kakao Games", "POE2", {
      compatibilityPath: String.raw`D:\Games\State C`,
    });
    vi.mocked(dependencies.getDiagnostics)
      .mockResolvedValueOnce(stateB)
      .mockResolvedValueOnce(stateC);
    vi.mocked(dependencies.applyTarget).mockResolvedValueOnce({
      targetId: "registry-compatibility",
      status: "failed",
      code: "target-changed",
      retryable: true,
    });

    const result = await service.applySelection(55, {
      selectionId: selection.selectionId,
      targetIds: ["registry-compatibility"],
    });

    expect(dependencies.getDiagnostics).toHaveBeenCalledTimes(3);
    expect(dependencies.applyTarget).toHaveBeenCalledWith(
      "Kakao Games",
      "POE2",
      {
        targetId: "registry-compatibility",
        currentPath: String.raw`D:\Games\State B`,
        registryState: "found",
      },
      selectedPath,
    );
    expect(result).toMatchObject({
      diagnostics: stateC,
      selection: {
        targets: expect.arrayContaining([
          expect.objectContaining({
            targetId: "registry-compatibility",
            currentPath: String.raw`D:\Games\State C`,
          }),
        ]),
      },
    });
  });

  it("preserves partial success without rollback and exposes retryable failures only", async () => {
    vi.mocked(dependencies.applyTarget).mockImplementation(
      async (_serviceId, _gameId, snapshot, installPath) => {
        if (snapshot.targetId === "registry-primary") {
          return {
            targetId: snapshot.targetId,
            status: "applied",
            path: installPath,
          };
        }
        if (snapshot.targetId === "registry-compatibility") {
          return {
            targetId: snapshot.targetId,
            status: "failed",
            code: "target-changed",
            retryable: true,
          };
        }
        return {
          targetId: snapshot.targetId,
          status: "unchanged",
          path: installPath,
        };
      },
    );
    const selection = await createValidSelection();

    const result = await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["config", "registry-compatibility", "registry-primary"],
    });

    expect(result).toMatchObject({
      ok: true,
      overall: "partial",
      retryableTargetIds: ["registry-compatibility"],
    });
    expect(
      result.results.map(({ targetId, status }) => ({ targetId, status })),
    ).toEqual([
      { targetId: "registry-primary", status: "applied" },
      { targetId: "registry-compatibility", status: "failed" },
      { targetId: "config", status: "unchanged" },
    ]);
    expect(dependencies.applyTarget).toHaveBeenCalledTimes(3);
    if ("selection" in result) {
      expect(
        result.selection.targets
          .filter((target) => target.completed)
          .map((target) => target.targetId),
      ).toEqual(["registry-primary", "config"]);
    }
  });

  it("refreshes only failed expected snapshots before an explicit retry", async () => {
    const selection = await createValidSelection();
    const preflightDiagnostics = diagnostics;
    const refreshedCompatibilityPath = String.raw`D:\Games\Changed Compatibility`;
    diagnostics = createDiagnostics("Kakao Games", "POE2", {
      compatibilityPath: refreshedCompatibilityPath,
    });
    vi.mocked(dependencies.getDiagnostics)
      .mockResolvedValueOnce(preflightDiagnostics)
      .mockResolvedValueOnce(diagnostics);
    vi.mocked(dependencies.applyTarget)
      .mockResolvedValueOnce({
        targetId: "registry-compatibility",
        status: "failed",
        code: "target-changed",
        retryable: true,
      })
      .mockResolvedValueOnce({
        targetId: "registry-compatibility",
        status: "applied",
        path: selectedPath,
      });

    const firstResult = await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["registry-compatibility"],
    });
    expect(firstResult).toMatchObject({
      ok: false,
      overall: "failed",
      retryableTargetIds: ["registry-compatibility"],
    });
    if ("selection" in firstResult) {
      expect(
        firstResult.selection.targets.find(
          (target) => target.targetId === "registry-compatibility",
        )?.currentPath,
      ).toBe(refreshedCompatibilityPath);
    }

    await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["registry-compatibility"],
    });

    expect(dependencies.applyTarget).toHaveBeenNthCalledWith(
      2,
      "Kakao Games",
      "POE2",
      {
        targetId: "registry-compatibility",
        currentPath: refreshedCompatibilityPath,
        registryState: "found",
      },
      selectedPath,
    );
  });

  it("excludes non-retryable failures from retryable target IDs", async () => {
    vi.mocked(dependencies.applyTarget).mockImplementation(
      async (_serviceId, _gameId, snapshot) => ({
        targetId: snapshot.targetId,
        status: "failed",
        code:
          snapshot.targetId === "registry-primary"
            ? "target-changed"
            : "invalid-snapshot",
        retryable: snapshot.targetId === "registry-primary",
      }),
    );
    const selection = await createValidSelection();

    const result = await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["registry-primary", "config"],
    });

    expect(result).toMatchObject({
      ok: false,
      overall: "failed",
      retryableTargetIds: ["registry-primary"],
    });
  });

  it("binds apply calls to the stored selection context and normalized path", async () => {
    const selection = await createValidSelection();
    const tamperedRequest = {
      selectionId: selection.selectionId,
      targetIds: ["config"],
      serviceId: "GGG",
      gameId: "POE1",
      path: String.raw`Z:\Attacker Controlled`,
    } as const;

    await service.applySelection(1, tamperedRequest);

    expect(dependencies.applyTarget).toHaveBeenCalledWith(
      "Kakao Games",
      "POE2",
      { targetId: "config", currentPath: configPath },
      selectedPath,
    );
  });

  it("freshly verifies the stored selected path before applying the batch", async () => {
    const selection = await createValidSelection();
    files.clear();

    const result = await service.applySelection(1, {
      selectionId: selection.selectionId,
      targetIds: ["registry-primary", "config"],
    });

    expect(result).toMatchObject({
      ok: false,
      overall: "failed",
      retryableTargetIds: [],
      results: [
        expect.objectContaining({
          targetId: "registry-primary",
          status: "failed",
          code: "install-path-invalid",
        }),
        expect.objectContaining({
          targetId: "config",
          status: "failed",
          code: "install-path-invalid",
        }),
      ],
    });
    expect(dependencies.applyTarget).not.toHaveBeenCalled();
  });
});

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mocked,
  type MockedFunction,
} from "vitest";

import {
  createGameInstallPathIpcHandlers,
  createGameInstallPathRegistryDeleteHandler,
  type GameInstallPathIpcHandlerDependencies,
  type GameInstallPathRegistryDeleteHandlerDependencies,
} from "../game/GameInstallPathIpcHandlers";
import {
  GameInstallPathSelectionService,
  type GameInstallPathSelectionServiceDependencies,
} from "../game/GameInstallPathSelectionService";

import type {
  GameInstallPathDiagnostics,
  GameInstallPathRegistryTargetDeleteActionResult,
  GameInstallPathSelectionBatchResult,
  GameInstallPathSelectionResult,
  GameInstallPathTargetApplyResult,
} from "../../shared/types";

const selectedResult: GameInstallPathSelectionResult = {
  ok: true,
  status: "selected",
  selection: {
    selectionId: "selection-1",
    serviceId: "Kakao Games",
    gameId: "POE2",
    path: String.raw`F:\Games\Selected`,
    targets: [],
  },
};

const partialResult: GameInstallPathSelectionBatchResult = {
  ok: true,
  overall: "partial",
  results: [
    {
      targetId: "registry-primary",
      status: "applied",
      path: String.raw`F:\Games\Selected`,
    },
    {
      targetId: "config",
      status: "failed",
      code: "target-changed",
      retryable: true,
    },
  ],
  retryableTargetIds: ["config"],
  diagnostics: {} as never,
  selection: selectedResult.selection,
};

const failedResult: GameInstallPathSelectionBatchResult = {
  ok: false,
  overall: "failed",
  results: [
    {
      targetId: "config",
      status: "failed",
      code: "target-changed",
      retryable: true,
    },
  ],
  retryableTargetIds: ["config"],
  diagnostics: {} as never,
  selection: selectedResult.selection,
};

const handlerDiagnostics: GameInstallPathDiagnostics = {
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
    registryPath: String.raw`HKCU:\Software\Primary\POE2`,
    registryValueName: "InstallPath",
    aggregateState: "valid",
    candidates: [
      {
        targetId: "registry-primary",
        path: String.raw`C:\Games\Primary`,
        state: "found",
        verification: "valid",
        registryPath: String.raw`HKCU:\Software\Primary\POE2`,
        registryValueName: "InstallPath",
        isActive: true,
      },
    ],
  },
  hasPathConflict: false,
  isPathConflictAcknowledged: false,
  recommendedSource: null,
};

const createSender = (id = 71) => {
  let destroyed = false;
  const destroyedListeners: Array<() => void> = [];
  return {
    id,
    once: vi.fn((event: "destroyed", listener: () => void) => {
      if (event === "destroyed") destroyedListeners.push(listener);
    }),
    isDestroyed: vi.fn(() => destroyed),
    destroy: () => {
      destroyed = true;
      for (const listener of destroyedListeners.splice(0)) listener();
    },
  };
};

const createDeferred = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("GameInstallPathIpcHandlers", () => {
  type SelectionService =
    GameInstallPathIpcHandlerDependencies["selectionService"];
  let reconcile: MockedFunction<() => void>;
  let selectionService: Mocked<SelectionService>;
  let showOpenDialog: MockedFunction<
    GameInstallPathIpcHandlerDependencies["showOpenDialog"]
  >;
  let runManualAction: MockedFunction<
    GameInstallPathIpcHandlerDependencies["runManualAction"]
  >;
  let handlers: ReturnType<typeof createGameInstallPathIpcHandlers>;

  beforeEach(() => {
    reconcile = vi.fn();
    selectionService = {
      getDefaultPath: vi.fn<SelectionService["getDefaultPath"]>(
        async () => undefined,
      ),
      createSelection: vi.fn<SelectionService["createSelection"]>(
        async () => selectedResult,
      ),
      disposeOwner: vi.fn<SelectionService["disposeOwner"]>(),
      resolveSelectionContext: vi.fn<
        SelectionService["resolveSelectionContext"]
      >(() => ({
        ok: true,
        context: { serviceId: "Kakao Games", gameId: "POE2" },
      })),
      applySelection: vi.fn<SelectionService["applySelection"]>(
        async () => partialResult,
      ),
    };
    showOpenDialog = vi.fn<
      GameInstallPathIpcHandlerDependencies["showOpenDialog"]
    >(async () => ({
      canceled: false,
      filePaths: [String.raw`F:\Games\Selected`],
    }));
    runManualAction = vi.fn<
      GameInstallPathIpcHandlerDependencies["runManualAction"]
    >(async (_context, action) => {
      const result = await action();
      if (result.ok) reconcile();
      return result;
    });
    handlers = createGameInstallPathIpcHandlers({
      isSupportedContext: () => true,
      selectionService,
      showOpenDialog,
      runManualAction,
    });
  });

  it("picks a selection without applying a mutation and includes an existing defaultPath", async () => {
    selectionService.getDefaultPath.mockResolvedValue(
      String.raw`D:\Games\Default`,
    );
    const sender = createSender();

    await expect(
      handlers.pickGameInstallPathTargets({ sender }, "Kakao Games", "POE2"),
    ).resolves.toEqual(selectedResult);

    expect(showOpenDialog).toHaveBeenCalledWith(
      sender,
      expect.objectContaining({ defaultPath: String.raw`D:\Games\Default` }),
    );
    expect(selectionService.createSelection).toHaveBeenCalledWith(
      sender.id,
      "Kakao Games",
      "POE2",
      String.raw`F:\Games\Selected`,
    );
    expect(selectionService.applySelection).not.toHaveBeenCalled();
    expect(runManualAction).not.toHaveBeenCalled();
  });

  it("omits defaultPath when no existing directory is available", async () => {
    const sender = createSender();

    await handlers.pickGameInstallPathTargets(
      { sender },
      "Kakao Games",
      "POE2",
    );

    expect(showOpenDialog.mock.calls[0][1]).not.toHaveProperty("defaultPath");
  });

  it("registers owner destroyed cleanup exactly once", async () => {
    const sender = createSender();

    await handlers.pickGameInstallPathTargets(
      { sender },
      "Kakao Games",
      "POE2",
    );
    await handlers.pickGameInstallPathTargets(
      { sender },
      "Kakao Games",
      "POE2",
    );

    expect(sender.once).toHaveBeenCalledTimes(1);
    sender.destroy();
    expect(selectionService.disposeOwner).toHaveBeenCalledTimes(1);
    expect(selectionService.disposeOwner).toHaveBeenCalledWith(sender.id);
  });

  it("cancels a delayed picker result after owner destruction", async () => {
    let resolveDialog!: (value: {
      canceled: false;
      filePaths: string[];
    }) => void;
    showOpenDialog.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDialog = resolve;
      }),
    );
    const sender = createSender();
    const picking = handlers.pickGameInstallPathTargets(
      { sender },
      "Kakao Games",
      "POE2",
    );
    await vi.waitFor(() => expect(showOpenDialog).toHaveBeenCalledTimes(1));

    sender.destroy();
    resolveDialog({
      canceled: false,
      filePaths: [String.raw`F:\Games\Selected`],
    });

    await expect(picking).resolves.toEqual({ ok: false, status: "canceled" });
    expect(selectionService.createSelection).not.toHaveBeenCalled();
  });

  it("cancels a delayed selection creation after owner destruction", async () => {
    const deferredSelection = createDeferred<GameInstallPathSelectionResult>();
    selectionService.createSelection.mockReturnValueOnce(
      deferredSelection.promise,
    );
    const sender = createSender();
    const picking = handlers.pickGameInstallPathTargets(
      { sender },
      "Kakao Games",
      "POE2",
    );
    await vi.waitFor(() =>
      expect(selectionService.createSelection).toHaveBeenCalledTimes(1),
    );

    sender.destroy();
    deferredSelection.resolve(selectedResult);

    await expect(picking).resolves.toEqual({ ok: false, status: "canceled" });
    expect(selectionService.disposeOwner).toHaveBeenCalledWith(sender.id);
  });

  it("canonicalizes apply authority and reconciles one partial ok batch once", async () => {
    const sender = createSender();
    const request = {
      selectionId: "selection-1",
      targetIds: ["config"],
      serviceId: "GGG",
      gameId: "POE1",
      path: String.raw`Z:\Untrusted`,
      registryPath: "untrusted",
    } as const;

    await expect(
      handlers.applyGameInstallPathTargets({ sender }, request),
    ).resolves.toEqual(partialResult);

    expect(selectionService.resolveSelectionContext).toHaveBeenCalledWith(
      sender.id,
      "selection-1",
    );
    expect(selectionService.applySelection).toHaveBeenCalledWith(sender.id, {
      selectionId: "selection-1",
      targetIds: ["config"],
    });
    expect(runManualAction).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("does not reconcile an all-failed batch", async () => {
    selectionService.applySelection.mockResolvedValueOnce(failedResult);
    const sender = createSender();

    await expect(
      handlers.applyGameInstallPathTargets(
        { sender },
        { selectionId: "selection-1", targetIds: ["config"] },
      ),
    ).resolves.toEqual(failedResult);

    expect(runManualAction).toHaveBeenCalledTimes(1);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("reconciles only the first of two concurrent same-selection applies", async () => {
    const deferredApply = createDeferred<GameInstallPathTargetApplyResult>();
    const applyTarget =
      vi.fn<GameInstallPathSelectionServiceDependencies["applyTarget"]>();
    applyTarget.mockReturnValueOnce(deferredApply.promise).mockResolvedValue({
      targetId: "config",
      status: "applied",
      path: String.raw`F:\Games\Selected`,
    });
    const actualService = new GameInstallPathSelectionService({
      now: () => 1_000,
      randomUUID: () => "selection-1",
      fsStat: async () => ({
        isDirectory: () => false,
        isFile: () => true,
      }),
      getDiagnostics: async () => handlerDiagnostics,
      collectSnapshots: (diagnostics) => [
        ...diagnostics.registry.candidates.map((candidate) => ({
          targetId: candidate.targetId,
          currentPath: candidate.path,
          registryState: candidate.state,
        })),
        { targetId: "config", currentPath: diagnostics.config.path },
      ],
      applyTarget,
    });
    const selection = await actualService.createSelection(
      71,
      "Kakao Games",
      "POE2",
      String.raw`F:\Games\Selected`,
    );
    expect(selection.ok).toBe(true);
    if (!selection.ok) throw new Error("Expected handler selection fixture");
    const actualHandlers = createGameInstallPathIpcHandlers({
      isSupportedContext: () => true,
      selectionService: actualService,
      showOpenDialog,
      runManualAction,
    });
    const sender = createSender();
    const request = {
      selectionId: selection.selection.selectionId,
      targetIds: ["config" as const],
    };

    const firstApply = actualHandlers.applyGameInstallPathTargets(
      { sender },
      request,
    );
    await vi.waitFor(() => expect(applyTarget).toHaveBeenCalledTimes(1));
    const replayResult = await actualHandlers.applyGameInstallPathTargets(
      { sender },
      request,
    );
    deferredApply.resolve({
      targetId: "config",
      status: "applied",
      path: String.raw`F:\Games\Selected`,
    });
    const firstResult = await firstApply;

    expect(firstResult).toMatchObject({ ok: true, overall: "success" });
    expect(replayResult).toMatchObject({
      ok: false,
      overall: "failed",
      failureCode: "selection-busy",
    });
    expect(applyTarget).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});

describe("GameInstallPathRegistryDeleteHandler", () => {
  const deletedResult: GameInstallPathRegistryTargetDeleteActionResult = {
    ok: true,
    source: "registry",
    result: { targetId: "registry-primary", status: "deleted" },
    diagnostics: handlerDiagnostics,
  };

  const createDependencies = () => {
    const deleteRegistryTarget = vi.fn(async () => deletedResult.result);
    const getDiagnostics = vi.fn(async () => handlerDiagnostics);
    const runManualAction = vi.fn(async (_context, action) => action());
    const dependencies: GameInstallPathRegistryDeleteHandlerDependencies = {
      isSupportedContext: () => true,
      deleteRegistryTarget,
      getDiagnostics,
      runManualAction,
    };
    return {
      dependencies,
      deleteRegistryTarget,
      getDiagnostics,
      runManualAction,
    };
  };

  it("canonicalizes deletion to targetId and expectedPath and wraps it once", async () => {
    const { dependencies, deleteRegistryTarget, runManualAction } =
      createDependencies();
    const handler = createGameInstallPathRegistryDeleteHandler(dependencies);
    const request = {
      targetId: "registry-primary",
      expectedPath: String.raw`F:\\Games\\Selected`,
      registryPath: "untrusted",
      registryValueName: "untrusted",
    } as const;

    await expect(
      handler({ sender: createSender() }, "Kakao Games", "POE2", request),
    ).resolves.toEqual(deletedResult);
    expect(deleteRegistryTarget).toHaveBeenCalledWith("Kakao Games", "POE2", {
      targetId: "registry-primary",
      expectedPath: String.raw`F:\\Games\\Selected`,
    });
    expect(runManualAction).toHaveBeenCalledTimes(1);
  });

  it("returns fresh diagnostics for a failed candidate deletion", async () => {
    const { dependencies, getDiagnostics, runManualAction } =
      createDependencies();
    dependencies.deleteRegistryTarget = vi.fn<
      GameInstallPathRegistryDeleteHandlerDependencies["deleteRegistryTarget"]
    >(async () => ({
      targetId: "registry-compatibility",
      status: "failed",
      code: "target-changed",
      retryable: true,
    }));
    const handler = createGameInstallPathRegistryDeleteHandler(dependencies);

    const result = await handler(
      { sender: createSender() },
      "Kakao Games",
      "POE2",
      {
        targetId: "registry-compatibility",
        expectedPath: String.raw`D:\\Games\\Old`,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      source: "registry",
      result: { status: "failed", code: "target-changed" },
      diagnostics: handlerDiagnostics,
    });
    expect(runManualAction).toHaveBeenCalledTimes(1);
    expect(getDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent same-owner context and target deletion through one reconciliation and refresh", async () => {
    const {
      dependencies,
      deleteRegistryTarget,
      getDiagnostics,
      runManualAction,
    } = createDependencies();
    const deferredDelete =
      createDeferred<
        GameInstallPathRegistryTargetDeleteActionResult["result"]
      >();
    deleteRegistryTarget.mockReturnValueOnce(deferredDelete.promise);
    const handler = createGameInstallPathRegistryDeleteHandler(dependencies);
    const sender = createSender();
    const request = {
      targetId: "registry-primary" as const,
      expectedPath: String.raw`F:\\Games\\Selected`,
    };

    const first = handler({ sender }, "Kakao Games", "POE2", request);
    await vi.waitFor(() =>
      expect(deleteRegistryTarget).toHaveBeenCalledTimes(1),
    );
    const duplicate = handler({ sender }, "Kakao Games", "POE2", request);

    expect(runManualAction).toHaveBeenCalledTimes(1);
    expect(deleteRegistryTarget).toHaveBeenCalledTimes(1);
    expect(getDiagnostics).not.toHaveBeenCalled();

    deferredDelete.resolve(deletedResult.result);
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      deletedResult,
      deletedResult,
    ]);
    expect(runManualAction).toHaveBeenCalledTimes(1);
    expect(deleteRegistryTarget).toHaveBeenCalledTimes(1);
    expect(getDiagnostics).toHaveBeenCalledTimes(1);

    await expect(
      handler({ sender }, "Kakao Games", "POE2", request),
    ).resolves.toEqual(deletedResult);
    expect(runManualAction).toHaveBeenCalledTimes(2);
    expect(deleteRegistryTarget).toHaveBeenCalledTimes(2);
    expect(getDiagnostics).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-allowlisted runtime target before mutation", async () => {
    const { dependencies, deleteRegistryTarget, runManualAction } =
      createDependencies();
    const handler = createGameInstallPathRegistryDeleteHandler(dependencies);

    await expect(
      handler({ sender: createSender() }, "Kakao Games", "POE2", {
        targetId: "config",
        expectedPath: String.raw`F:\\Games\\Selected`,
      } as never),
    ).rejects.toThrow("Unsupported registry target ID");
    expect(deleteRegistryTarget).not.toHaveBeenCalled();
    expect(runManualAction).not.toHaveBeenCalled();
  });
});

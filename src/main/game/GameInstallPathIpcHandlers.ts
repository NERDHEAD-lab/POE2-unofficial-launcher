import type {
  AppConfig,
  GameInstallPathDiagnostics,
  GameInstallPathRegistryTargetDeleteActionResult,
  GameInstallPathRegistryTargetDeleteRequest,
  GameInstallPathRegistryTargetDeleteResult,
  GameInstallPathSelectionApplyRequest,
  GameInstallPathSelectionBatchResult,
  GameInstallPathSelectionResult,
  GameInstallPathTargetId,
} from "../../shared/types";

type ServiceId = AppConfig["serviceChannel"];
type GameId = AppConfig["activeGame"];

export interface GameInstallPathIpcSender {
  readonly id: number;
  once(event: "destroyed", listener: () => void): unknown;
  isDestroyed(): boolean;
}

export interface GameInstallPathIpcEvent {
  readonly sender: GameInstallPathIpcSender;
}

export interface GameInstallPathOpenDialogOptions {
  readonly title: string;
  readonly buttonLabel: string;
  readonly properties: "openDirectory"[];
  readonly defaultPath?: string;
}

type SelectionService = {
  getDefaultPath(
    serviceId: ServiceId,
    gameId: GameId,
  ): Promise<string | undefined>;
  createSelection(
    ownerWebContentsId: number,
    serviceId: ServiceId,
    gameId: GameId,
    rawPath: string,
  ): Promise<GameInstallPathSelectionResult>;
  disposeOwner(ownerWebContentsId: number): void;
  resolveSelectionContext(
    ownerWebContentsId: number,
    selectionId: string,
  ):
    | { ok: true; context: { serviceId: ServiceId; gameId: GameId } }
    | { ok: false; result: GameInstallPathSelectionBatchResult };
  applySelection(
    ownerWebContentsId: number,
    request: GameInstallPathSelectionApplyRequest,
  ): Promise<GameInstallPathSelectionBatchResult>;
};

export interface GameInstallPathIpcHandlerDependencies {
  isSupportedContext(serviceId: unknown, gameId: unknown): boolean;
  selectionService: SelectionService;
  showOpenDialog(
    sender: GameInstallPathIpcSender,
    options: GameInstallPathOpenDialogOptions,
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
  runManualAction(
    context: { serviceId: ServiceId; gameId: GameId },
    action: () => Promise<GameInstallPathSelectionBatchResult>,
  ): Promise<GameInstallPathSelectionBatchResult>;
}

type RegistryDeleteOutcome = {
  readonly ok: boolean;
  readonly result: GameInstallPathRegistryTargetDeleteResult;
};

export interface GameInstallPathRegistryDeleteHandlerDependencies {
  isSupportedContext(serviceId: unknown, gameId: unknown): boolean;
  deleteRegistryTarget(
    serviceId: ServiceId,
    gameId: GameId,
    request: GameInstallPathRegistryTargetDeleteRequest,
  ): Promise<GameInstallPathRegistryTargetDeleteResult>;
  getDiagnostics(
    serviceId: ServiceId,
    gameId: GameId,
  ): Promise<GameInstallPathDiagnostics>;
  runManualAction(
    context: { serviceId: ServiceId; gameId: GameId },
    action: () => Promise<RegistryDeleteOutcome>,
  ): Promise<RegistryDeleteOutcome>;
}

const canceledSelection = (): GameInstallPathSelectionResult => ({
  ok: false,
  status: "canceled",
});

export const createGameInstallPathIpcHandlers = (
  dependencies: GameInstallPathIpcHandlerDependencies,
) => {
  const cleanupOwners = new Set<number>();

  const bindOwnerCleanup = (sender: GameInstallPathIpcSender): void => {
    if (cleanupOwners.has(sender.id)) return;

    cleanupOwners.add(sender.id);
    sender.once("destroyed", () => {
      cleanupOwners.delete(sender.id);
      dependencies.selectionService.disposeOwner(sender.id);
    });
  };

  const pickGameInstallPathTargets = async (
    event: GameInstallPathIpcEvent,
    serviceId: ServiceId,
    gameId: GameId,
  ): Promise<GameInstallPathSelectionResult> => {
    if (!dependencies.isSupportedContext(serviceId, gameId)) {
      throw new Error(
        `Unsupported game install context: ${serviceId}/${gameId}`,
      );
    }

    const { sender } = event;
    bindOwnerCleanup(sender);
    const defaultPath = await dependencies.selectionService.getDefaultPath(
      serviceId,
      gameId,
    );
    if (sender.isDestroyed()) return canceledSelection();

    const result = await dependencies.showOpenDialog(sender, {
      title: "게임 설치 폴더 선택",
      buttonLabel: "이 폴더 사용",
      properties: ["openDirectory"],
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (
      result.canceled ||
      result.filePaths.length === 0 ||
      sender.isDestroyed()
    ) {
      return canceledSelection();
    }

    const selection = await dependencies.selectionService.createSelection(
      sender.id,
      serviceId,
      gameId,
      result.filePaths[0],
    );
    return sender.isDestroyed() ? canceledSelection() : selection;
  };

  const applyGameInstallPathTargets = async (
    event: GameInstallPathIpcEvent,
    request: GameInstallPathSelectionApplyRequest,
  ): Promise<GameInstallPathSelectionBatchResult> => {
    const ownerWebContentsId = event.sender.id;
    const canonicalRequest: GameInstallPathSelectionApplyRequest = {
      selectionId:
        typeof request?.selectionId === "string" ? request.selectionId : "",
      targetIds: Array.isArray(request?.targetIds)
        ? ([...request.targetIds] as GameInstallPathTargetId[])
        : [],
    };
    const resolved = dependencies.selectionService.resolveSelectionContext(
      ownerWebContentsId,
      canonicalRequest.selectionId,
    );
    if (!resolved.ok) return resolved.result;

    return dependencies.runManualAction(resolved.context, () =>
      dependencies.selectionService.applySelection(
        ownerWebContentsId,
        canonicalRequest,
      ),
    );
  };

  return { pickGameInstallPathTargets, applyGameInstallPathTargets };
};

export const createGameInstallPathRegistryDeleteHandler = (
  dependencies: GameInstallPathRegistryDeleteHandlerDependencies,
) => {
  const inFlightByOwnerTarget = new Map<
    string,
    Promise<GameInstallPathRegistryTargetDeleteActionResult>
  >();

  return async (
    event: GameInstallPathIpcEvent,
    serviceId: ServiceId,
    gameId: GameId,
    request: GameInstallPathRegistryTargetDeleteRequest,
  ): Promise<GameInstallPathRegistryTargetDeleteActionResult> => {
    if (!dependencies.isSupportedContext(serviceId, gameId)) {
      throw new Error(
        `Unsupported game install context: ${serviceId}/${gameId}`,
      );
    }

    if (
      request?.targetId !== "registry-primary" &&
      request?.targetId !== "registry-compatibility"
    ) {
      throw new Error(`Unsupported registry target ID: ${request?.targetId}`);
    }
    if (typeof request.expectedPath !== "string") {
      throw new Error("Expected registry path must be a string.");
    }

    const canonicalRequest: GameInstallPathRegistryTargetDeleteRequest = {
      targetId: request.targetId,
      expectedPath: request.expectedPath,
    };
    const context = { serviceId, gameId };
    const ownerTargetKey = JSON.stringify([
      event.sender.id,
      serviceId,
      gameId,
      canonicalRequest.targetId,
    ]);
    const existing = inFlightByOwnerTarget.get(ownerTargetKey);
    if (existing) return existing;

    const operation = (async () => {
      const outcome = await dependencies.runManualAction(context, async () => {
        const result = await dependencies.deleteRegistryTarget(
          serviceId,
          gameId,
          canonicalRequest,
        );
        return { ok: result.status !== "failed", result };
      });

      return {
        ok: outcome.ok,
        source: "registry" as const,
        result: outcome.result,
        diagnostics: await dependencies.getDiagnostics(serviceId, gameId),
      };
    })();
    inFlightByOwnerTarget.set(ownerTargetKey, operation);

    try {
      return await operation;
    } finally {
      if (inFlightByOwnerTarget.get(ownerTargetKey) === operation) {
        inFlightByOwnerTarget.delete(ownerTargetKey);
      }
    }
  };
};

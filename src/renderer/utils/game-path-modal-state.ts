import type {
  AppConfig,
  GameInstallPathDiagnostics,
  GameInstallPathSelectionBatchFailureCode,
  GameInstallPathSelectionBatchResult,
  GameInstallPathSelectionDescriptor,
  GameInstallPathTargetApplyResult,
  GameInstallPathTargetId,
} from "../../shared/types";

type GamePathModalIdentity = {
  generation?: number;
  serviceId: AppConfig["serviceChannel"];
  gameId: AppConfig["activeGame"];
  selection?: Pick<GameInstallPathSelectionDescriptor, "selectionId"> | null;
};

export type GamePathModalRequestIdentity = {
  readonly generation: number;
  readonly serviceId: AppConfig["serviceChannel"];
  readonly gameId: AppConfig["activeGame"];
  readonly selectionId?: string;
};

export type GamePathModalOperation =
  | "diagnostics"
  | "picker"
  | "apply"
  | "delete"
  | "config-clear"
  | "conflict"
  | "register";

export type GamePathModalOperationRequest = GamePathModalRequestIdentity & {
  readonly operation: GamePathModalOperation;
  readonly token: number;
};

export const createGamePathModalOperationTracker = () => {
  let activeGeneration: number | null = null;
  let nextToken = 0;
  const activeByOperation = new Map<
    GamePathModalOperation,
    GamePathModalOperationRequest
  >();

  const activateGeneration = (generation: number): void => {
    activeGeneration = generation;
    activeByOperation.clear();
  };

  const invalidate = (): void => {
    activeGeneration = null;
    activeByOperation.clear();
  };

  const begin = (
    operation: GamePathModalOperation,
    identity: GamePathModalRequestIdentity,
  ): GamePathModalOperationRequest | null => {
    if (
      activeGeneration !== identity.generation ||
      activeByOperation.size > 0
    ) {
      return null;
    }

    const request = {
      ...identity,
      operation,
      token: ++nextToken,
    };
    activeByOperation.set(operation, request);
    return request;
  };

  const finish = (request: GamePathModalOperationRequest): boolean => {
    const active = activeByOperation.get(request.operation);
    if (
      activeGeneration !== request.generation ||
      !active ||
      active.token !== request.token
    ) {
      return false;
    }

    activeByOperation.delete(request.operation);
    return true;
  };

  const hasActive = (generation: number): boolean =>
    activeGeneration === generation && activeByOperation.size > 0;

  return { activateGeneration, invalidate, begin, finish, hasActive };
};

export const updateGamePathModalForContext = <
  State extends GamePathModalIdentity,
>(
  current: State | null,
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
  update: (matched: State) => State,
  expected?: Pick<GamePathModalRequestIdentity, "generation" | "selectionId">,
): State | null => {
  if (
    !current ||
    current.serviceId !== serviceId ||
    current.gameId !== gameId ||
    (expected && current.generation !== expected.generation) ||
    (expected?.selectionId !== undefined &&
      current.selection?.selectionId !== expected.selectionId)
  ) {
    return current;
  }

  return update(current);
};

export interface GamePathSelectionPresentationResult {
  readonly ok: boolean;
  readonly overall: "success" | "partial" | "failed";
  readonly results: readonly GameInstallPathTargetApplyResult[];
  readonly retryableTargetIds: readonly GameInstallPathTargetId[];
  readonly failureCode?: GameInstallPathSelectionBatchFailureCode;
}

type GamePathSelectionBatchState = GamePathModalIdentity & {
  diagnostics: GameInstallPathDiagnostics | null;
  selection?: GameInstallPathSelectionDescriptor;
  selectionApplyResult?: GamePathSelectionPresentationResult;
  busy: boolean;
};

const TARGET_RESULT_ORDER = [
  "registry-primary",
  "registry-compatibility",
  "config",
] as const;

const mergeGamePathSelectionBatchResults = (
  previous: GamePathSelectionPresentationResult | undefined,
  next: GameInstallPathSelectionBatchResult,
): GamePathSelectionPresentationResult => {
  const resultsByTarget = new Map(
    previous?.results.map((result) => [result.targetId, result]) ?? [],
  );
  for (const result of next.results) {
    resultsByTarget.set(result.targetId, result);
  }
  const results = TARGET_RESULT_ORDER.flatMap((targetId) => {
    const result = resultsByTarget.get(targetId);
    return result ? [result] : [];
  });
  const succeededCount = results.filter(
    (result) => result.status === "applied" || result.status === "unchanged",
  ).length;
  const failedCount = results.length - succeededCount;
  const overall =
    results.length === 0
      ? next.overall
      : failedCount === 0
        ? "success"
        : succeededCount > 0
          ? "partial"
          : "failed";

  return {
    ok: succeededCount > 0,
    overall,
    results,
    retryableTargetIds: next.retryableTargetIds,
    ...("failureCode" in next ? { failureCode: next.failureCode } : {}),
  };
};

export const applyGamePathSelectionBatchForContext = <
  State extends GamePathSelectionBatchState,
>(
  current: State | null,
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
  result: GameInstallPathSelectionBatchResult,
  expected?: Pick<GamePathModalRequestIdentity, "generation" | "selectionId">,
): State | null => {
  if (
    expected?.selectionId !== undefined &&
    "selection" in result &&
    result.selection.selectionId !== expected.selectionId
  ) {
    return current;
  }

  return updateGamePathModalForContext(
    current,
    serviceId,
    gameId,
    (matched) => ({
      ...matched,
      ...("diagnostics" in result ? { diagnostics: result.diagnostics } : {}),
      ...("selection" in result ? { selection: result.selection } : {}),
      selectionApplyResult: mergeGamePathSelectionBatchResults(
        matched.selectionApplyResult,
        result,
      ),
      busy: false,
    }),
    expected,
  );
};

import path from "node:path";

import type {
  AppConfig,
  GameInstallPathDiagnostics,
  GameInstallPathRegistryCandidateDiagnostic,
  GameInstallPathSelectionApplyRequest,
  GameInstallPathSelectionBatchFailureCode,
  GameInstallPathSelectionBatchResult,
  GameInstallPathSelectionDescriptor,
  GameInstallPathSelectionResult,
  GameInstallPathSelectionTargetDisabledReason,
  GameInstallPathSelectionTargetDescriptor,
  GameInstallPathTargetApplyFailureCode,
  GameInstallPathTargetApplyResult,
  GameInstallPathTargetId,
  GameInstallPathTargetSnapshot,
} from "../../shared/types";

type ServiceId = AppConfig["serviceChannel"];
type GameId = AppConfig["activeGame"];

type StatResult = {
  isDirectory: () => boolean;
  isFile: () => boolean;
};

export interface GameInstallPathSelectionServiceDependencies {
  now: () => number;
  randomUUID: () => string;
  fsStat: (targetPath: string) => Promise<StatResult>;
  getDiagnostics: (
    serviceId: ServiceId,
    gameId: GameId,
  ) => Promise<GameInstallPathDiagnostics>;
  collectSnapshots: (
    diagnostics: GameInstallPathDiagnostics,
  ) => readonly GameInstallPathTargetSnapshot[];
  applyTarget: (
    serviceId: ServiceId,
    gameId: GameId,
    snapshot: GameInstallPathTargetSnapshot,
    installPath: string,
  ) => Promise<GameInstallPathTargetApplyResult>;
}

type SelectionSession = {
  selectionId: string;
  ownerWebContentsId: number;
  ownerGeneration: number;
  serviceId: ServiceId;
  gameId: GameId;
  path: string;
  expiresAt: number;
  diagnostics: GameInstallPathDiagnostics;
  expectedSnapshots: Map<
    GameInstallPathTargetId,
    GameInstallPathTargetSnapshot
  >;
  displaySnapshots: Map<GameInstallPathTargetId, GameInstallPathTargetSnapshot>;
  completedTargetIds: Set<GameInstallPathTargetId>;
  applyInFlight: boolean;
};

type ResolvedSelectionContext =
  | {
      ok: true;
      context: {
        serviceId: ServiceId;
        gameId: GameId;
      };
    }
  | {
      ok: false;
      result: GameInstallPathSelectionBatchResult;
    };

type VerificationResult =
  { status: "valid" } | { status: "missing" | "unknown" };

type ClassifiedTarget = {
  targetId: GameInstallPathTargetId;
  snapshot: GameInstallPathTargetSnapshot;
  preflightFailure: GameInstallPathTargetApplyResult | null;
};

type TargetEligibility = {
  disabled: boolean;
  disabledReason?: GameInstallPathSelectionTargetDisabledReason;
  retryable: boolean;
};

export const GAME_INSTALL_PATH_SELECTION_TTL_MS = 5 * 60 * 1000;

const MAX_SELECTION_ID_ATTEMPTS = 8;
const TARGET_ORDER: readonly GameInstallPathTargetId[] = [
  "registry-primary",
  "registry-compatibility",
  "config",
];

const EXECUTABLE_NAMES = {
  "Kakao Games": "PathOfExile_KG.exe",
  GGG: "PathOfExile.exe",
} as const satisfies Record<ServiceId, string>;

const normalizeInstallPath = (rawPath: string): string => {
  if (!rawPath.trim()) return "";

  let normalized = path.win32.normalize(rawPath.trim());
  const root = path.win32.parse(normalized).root;
  while (
    normalized.length > root.length &&
    (normalized.endsWith("\\") || normalized.endsWith("/"))
  ) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

const isMissingPathError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR"),
  );

const createRejectedBatchResult = (
  failureCode: GameInstallPathSelectionBatchFailureCode,
): GameInstallPathSelectionBatchResult => ({
  ok: false,
  overall: "failed",
  failureCode,
  results: [],
  retryableTargetIds: [],
});

const createTargetFailure = (
  targetId: GameInstallPathTargetId,
  code: GameInstallPathTargetApplyFailureCode,
  retryable: boolean,
): GameInstallPathTargetApplyResult => ({
  targetId,
  status: "failed",
  code,
  retryable,
});

const snapshotsMatch = (
  expected: GameInstallPathTargetSnapshot,
  fresh: GameInstallPathTargetSnapshot,
): boolean => {
  if (
    expected.targetId !== fresh.targetId ||
    expected.currentPath !== fresh.currentPath
  ) {
    return false;
  }

  if ("registryState" in expected || "registryState" in fresh) {
    return (
      "registryState" in expected &&
      "registryState" in fresh &&
      expected.registryState === fresh.registryState
    );
  }

  return true;
};

export class GameInstallPathSelectionService {
  private readonly sessions = new Map<string, SelectionSession>();
  private readonly ownerSelections = new Map<number, string>();
  private readonly ownerIssuedSelectionIds = new Map<number, Set<string>>();
  private readonly ownerGenerations = new Map<number, number>();
  private readonly disposedOwners = new Set<number>();

  constructor(
    private readonly dependencies: GameInstallPathSelectionServiceDependencies,
  ) {}

  async getDefaultPath(
    serviceId: ServiceId,
    gameId: GameId,
  ): Promise<string | undefined> {
    const diagnostics = await this.dependencies.getDiagnostics(
      serviceId,
      gameId,
    );
    const candidatePaths = [
      ...diagnostics.registry.candidates.map((candidate) => candidate.path),
      diagnostics.config.path,
    ];

    for (const candidatePath of candidatePaths) {
      if (!candidatePath) continue;
      try {
        const stats = await this.dependencies.fsStat(candidatePath);
        if (stats.isDirectory()) return candidatePath;
      } catch {
        // Missing or unreadable paths cannot be native dialog defaults.
      }
    }

    return undefined;
  }

  async createSelection(
    ownerWebContentsId: number,
    serviceId: ServiceId,
    gameId: GameId,
    rawPath: string,
  ): Promise<GameInstallPathSelectionResult> {
    const ownerGeneration = this.beginSelectionCreation(ownerWebContentsId);
    if (ownerGeneration === null) return { ok: false, status: "canceled" };

    const selectedPath = normalizeInstallPath(rawPath);
    if (!selectedPath) {
      return {
        ok: false,
        status: "invalid",
        code: "install-path-empty",
        verification: "missing",
      };
    }

    const verification = await this.verifySelectedPath(serviceId, selectedPath);
    if (!this.isOwnerOperationCurrent(ownerWebContentsId, ownerGeneration)) {
      return { ok: false, status: "canceled" };
    }
    if (verification.status !== "valid") {
      return {
        ok: false,
        status: "invalid",
        code:
          verification.status === "missing"
            ? "install-path-invalid"
            : "install-path-check-failed",
        verification: verification.status,
      };
    }

    const diagnostics = await this.dependencies.getDiagnostics(
      serviceId,
      gameId,
    );
    if (!this.isOwnerOperationCurrent(ownerWebContentsId, ownerGeneration)) {
      return { ok: false, status: "canceled" };
    }

    const snapshots = this.dependencies.collectSnapshots(diagnostics);
    const snapshotMap = this.createSnapshotMap(
      serviceId,
      diagnostics,
      snapshots,
    );
    const selectionId = this.allocateSelectionId(ownerWebContentsId);
    if (!selectionId) {
      return {
        ok: false,
        status: "unavailable",
        code: "selection-id-unavailable",
      };
    }
    if (!this.isOwnerOperationCurrent(ownerWebContentsId, ownerGeneration)) {
      return { ok: false, status: "canceled" };
    }

    const session: SelectionSession = {
      selectionId,
      ownerWebContentsId,
      ownerGeneration,
      serviceId,
      gameId,
      path: selectedPath,
      expiresAt: this.dependencies.now() + GAME_INSTALL_PATH_SELECTION_TTL_MS,
      diagnostics,
      expectedSnapshots: new Map(snapshotMap),
      displaySnapshots: new Map(snapshotMap),
      completedTargetIds: new Set(),
      applyInFlight: false,
    };

    if (!this.isOwnerOperationCurrent(ownerWebContentsId, ownerGeneration)) {
      return { ok: false, status: "canceled" };
    }
    this.sessions.set(selectionId, session);
    this.ownerSelections.set(ownerWebContentsId, selectionId);

    return {
      ok: true,
      status: "selected",
      selection: this.createDescriptor(session),
    };
  }

  resolveSelectionContext(
    ownerWebContentsId: number,
    selectionId: string,
  ): ResolvedSelectionContext {
    const resolved = this.resolveSession(ownerWebContentsId, selectionId);
    if (!resolved.ok) {
      return { ok: false, result: createRejectedBatchResult(resolved.code) };
    }

    return {
      ok: true,
      context: {
        serviceId: resolved.session.serviceId,
        gameId: resolved.session.gameId,
      },
    };
  }

  async applySelection(
    ownerWebContentsId: number,
    request: GameInstallPathSelectionApplyRequest,
  ): Promise<GameInstallPathSelectionBatchResult> {
    const resolved = this.resolveSession(
      ownerWebContentsId,
      request?.selectionId,
    );
    if (!resolved.ok) return createRejectedBatchResult(resolved.code);

    const session = resolved.session;
    if (session.applyInFlight) {
      return createRejectedBatchResult("selection-busy");
    }
    session.applyInFlight = true;
    try {
      const targetIds = request?.targetIds;
      if (
        !Array.isArray(targetIds) ||
        targetIds.length === 0 ||
        targetIds.some((targetId) => typeof targetId !== "string" || !targetId)
      ) {
        return createRejectedBatchResult("invalid-target-ids");
      }
      if (new Set(targetIds).size !== targetIds.length) {
        return createRejectedBatchResult("duplicate-target-ids");
      }
      if (
        targetIds.some((targetId) => !session.expectedSnapshots.has(targetId))
      ) {
        return createRejectedBatchResult("target-not-allowed");
      }
      if (
        targetIds.some((targetId) => session.completedTargetIds.has(targetId))
      ) {
        return createRejectedBatchResult("target-completed");
      }

      const orderedTargetIds = TARGET_ORDER.filter((targetId) =>
        targetIds.includes(targetId),
      );
      const verification = await this.verifySelectedPath(
        session.serviceId,
        session.path,
      );
      if (!this.isSessionCurrent(session)) {
        return this.createInvalidatedBatchResult([], orderedTargetIds);
      }

      if (verification.status !== "valid") {
        const code =
          verification.status === "missing"
            ? "install-path-invalid"
            : "install-path-check-failed";
        const results = orderedTargetIds.map((targetId) =>
          createTargetFailure(
            targetId,
            code,
            verification.status === "unknown",
          ),
        );
        return await this.refreshSessionAndCreateResult(session, results);
      }

      const preflightDiagnostics = await this.dependencies.getDiagnostics(
        session.serviceId,
        session.gameId,
      );
      if (!this.isSessionCurrent(session)) {
        return this.createInvalidatedBatchResult([], orderedTargetIds);
      }
      const preflightSnapshotMap = this.createSnapshotMap(
        session.serviceId,
        preflightDiagnostics,
        this.dependencies.collectSnapshots(preflightDiagnostics),
      );
      const classifiedTargets = orderedTargetIds.map((targetId) =>
        this.classifyTarget(session, preflightSnapshotMap, targetId),
      );

      const results: GameInstallPathTargetApplyResult[] = [];
      for (let index = 0; index < classifiedTargets.length; index += 1) {
        const classified = classifiedTargets[index];
        if (classified.preflightFailure) {
          results.push(classified.preflightFailure);
          continue;
        }

        if (!this.isSessionCurrent(session)) {
          return this.createInvalidatedBatchResult(
            results,
            classifiedTargets.slice(index).map(({ targetId }) => targetId),
          );
        }
        const result = await this.dependencies.applyTarget(
          session.serviceId,
          session.gameId,
          classified.snapshot,
          session.path,
        );
        results.push(result);
        if (!this.isSessionCurrent(session)) {
          return this.createInvalidatedBatchResult(
            results,
            classifiedTargets.slice(index + 1).map(({ targetId }) => targetId),
          );
        }
        if (result.status === "applied" || result.status === "unchanged") {
          session.completedTargetIds.add(result.targetId);
        }
      }

      return await this.refreshSessionAndCreateResult(session, results);
    } finally {
      if (this.isSessionIdentityCurrent(session)) {
        session.applyInFlight = false;
      }
    }
  }

  disposeOwner(ownerWebContentsId: number): void {
    this.disposedOwners.add(ownerWebContentsId);
    this.bumpOwnerGeneration(ownerWebContentsId);
    this.ownerIssuedSelectionIds.delete(ownerWebContentsId);

    const selectionId = this.ownerSelections.get(ownerWebContentsId);
    this.ownerSelections.delete(ownerWebContentsId);
    if (!selectionId) return;

    const session = this.sessions.get(selectionId);
    if (session?.ownerWebContentsId === ownerWebContentsId) {
      this.sessions.delete(selectionId);
    }
  }

  private beginSelectionCreation(ownerWebContentsId: number): number | null {
    if (this.disposedOwners.has(ownerWebContentsId)) return null;

    const ownerGeneration = this.bumpOwnerGeneration(ownerWebContentsId);
    const previousSelectionId = this.ownerSelections.get(ownerWebContentsId);
    this.ownerSelections.delete(ownerWebContentsId);
    if (previousSelectionId) {
      const previousSession = this.sessions.get(previousSelectionId);
      if (previousSession?.ownerWebContentsId === ownerWebContentsId) {
        this.sessions.delete(previousSelectionId);
      }
    }
    return ownerGeneration;
  }

  private bumpOwnerGeneration(ownerWebContentsId: number): number {
    const generation = (this.ownerGenerations.get(ownerWebContentsId) ?? 0) + 1;
    this.ownerGenerations.set(ownerWebContentsId, generation);
    return generation;
  }

  private isOwnerOperationCurrent(
    ownerWebContentsId: number,
    ownerGeneration: number,
  ): boolean {
    return (
      !this.disposedOwners.has(ownerWebContentsId) &&
      this.ownerGenerations.get(ownerWebContentsId) === ownerGeneration
    );
  }

  private allocateSelectionId(ownerWebContentsId: number): string | null {
    const issuedSelectionIds =
      this.ownerIssuedSelectionIds.get(ownerWebContentsId) ?? new Set<string>();
    for (let attempt = 0; attempt < MAX_SELECTION_ID_ATTEMPTS; attempt += 1) {
      const selectionId = this.dependencies.randomUUID();
      if (
        selectionId &&
        !this.sessions.has(selectionId) &&
        !issuedSelectionIds.has(selectionId)
      ) {
        issuedSelectionIds.add(selectionId);
        this.ownerIssuedSelectionIds.set(
          ownerWebContentsId,
          issuedSelectionIds,
        );
        return selectionId;
      }
    }
    return null;
  }

  private resolveSession(
    ownerWebContentsId: number,
    selectionId: string,
  ):
    | { ok: true; session: SelectionSession }
    | { ok: false; code: GameInstallPathSelectionBatchFailureCode } {
    const session = this.sessions.get(selectionId);
    if (!session) return { ok: false, code: "selection-not-found" };

    if (this.dependencies.now() >= session.expiresAt) {
      this.expireSession(session);
      return { ok: false, code: "selection-expired" };
    }
    if (session.ownerWebContentsId !== ownerWebContentsId) {
      return { ok: false, code: "selection-owner-mismatch" };
    }
    if (!this.isSessionIdentityCurrent(session)) {
      return { ok: false, code: "selection-not-found" };
    }

    return { ok: true, session };
  }

  private isSessionCurrent(session: SelectionSession): boolean {
    if (this.dependencies.now() >= session.expiresAt) {
      this.expireSession(session);
      return false;
    }
    return this.isSessionIdentityCurrent(session);
  }

  private isSessionIdentityCurrent(session: SelectionSession): boolean {
    return (
      !this.disposedOwners.has(session.ownerWebContentsId) &&
      this.ownerGenerations.get(session.ownerWebContentsId) ===
        session.ownerGeneration &&
      this.sessions.get(session.selectionId) === session &&
      this.ownerSelections.get(session.ownerWebContentsId) ===
        session.selectionId
    );
  }

  private expireSession(session: SelectionSession): void {
    if (this.sessions.get(session.selectionId) === session) {
      this.sessions.delete(session.selectionId);
    }
    if (
      this.ownerSelections.get(session.ownerWebContentsId) ===
      session.selectionId
    ) {
      this.ownerSelections.delete(session.ownerWebContentsId);
    }
    if (
      this.ownerGenerations.get(session.ownerWebContentsId) ===
      session.ownerGeneration
    ) {
      this.bumpOwnerGeneration(session.ownerWebContentsId);
    }
  }

  private classifyTarget(
    session: SelectionSession,
    freshSnapshots: ReadonlyMap<
      GameInstallPathTargetId,
      GameInstallPathTargetSnapshot
    >,
    targetId: GameInstallPathTargetId,
  ): ClassifiedTarget {
    const expected = session.expectedSnapshots.get(targetId)!;
    const fresh = freshSnapshots.get(targetId);
    if (!fresh) {
      return {
        targetId,
        snapshot: expected,
        preflightFailure: createTargetFailure(
          targetId,
          "target-not-allowed",
          false,
        ),
      };
    }
    if ("registryState" in fresh && fresh.registryState === "read-failed") {
      return {
        targetId,
        snapshot: fresh,
        preflightFailure: createTargetFailure(
          targetId,
          "target-read-failed",
          false,
        ),
      };
    }
    if (!snapshotsMatch(expected, fresh)) {
      return {
        targetId,
        snapshot: fresh,
        preflightFailure: createTargetFailure(targetId, "target-changed", true),
      };
    }

    return { targetId, snapshot: fresh, preflightFailure: null };
  }

  private async refreshSessionAndCreateResult(
    session: SelectionSession,
    results: readonly GameInstallPathTargetApplyResult[],
  ): Promise<GameInstallPathSelectionBatchResult> {
    const freshDiagnostics = await this.dependencies.getDiagnostics(
      session.serviceId,
      session.gameId,
    );
    if (!this.isSessionCurrent(session)) {
      return this.createInvalidatedBatchResult([...results], []);
    }
    const freshSnapshotMap = this.createSnapshotMap(
      session.serviceId,
      freshDiagnostics,
      this.dependencies.collectSnapshots(freshDiagnostics),
    );

    if (!this.isSessionCurrent(session)) {
      return this.createInvalidatedBatchResult([...results], []);
    }
    session.diagnostics = freshDiagnostics;
    session.displaySnapshots = freshSnapshotMap;
    for (const result of results) {
      if (result.status !== "failed") continue;
      const freshSnapshot = freshSnapshotMap.get(result.targetId);
      if (freshSnapshot) {
        session.expectedSnapshots.set(result.targetId, freshSnapshot);
      }
    }

    const normalizedResults = results.map((result) => {
      if (result.status !== "failed") return result;

      const eligibility = this.getTargetEligibility(
        session,
        result.targetId,
        freshSnapshotMap.get(result.targetId),
      );
      return {
        ...result,
        retryable:
          eligibility.retryable &&
          (result.code === "target-read-failed" || result.retryable),
      };
    });

    const succeededCount = normalizedResults.filter(
      (result) => result.status === "applied" || result.status === "unchanged",
    ).length;
    const failedCount = normalizedResults.length - succeededCount;
    const overall =
      failedCount === 0 ? "success" : succeededCount > 0 ? "partial" : "failed";

    return {
      ok: succeededCount > 0,
      overall,
      results: normalizedResults,
      retryableTargetIds: normalizedResults
        .filter(
          (
            result,
          ): result is Extract<
            GameInstallPathTargetApplyResult,
            { status: "failed" }
          > => result.status === "failed" && result.retryable,
        )
        .map((result) => result.targetId),
      diagnostics: freshDiagnostics,
      selection: this.createDescriptor(session),
    };
  }

  private createInvalidatedBatchResult(
    completedResults: GameInstallPathTargetApplyResult[],
    remainingTargetIds: readonly GameInstallPathTargetId[],
  ): GameInstallPathSelectionBatchResult {
    const results = [
      ...completedResults,
      ...remainingTargetIds.map((targetId) =>
        createTargetFailure(targetId, "selection-invalidated", false),
      ),
    ];
    const succeededCount = results.filter(
      (result) => result.status === "applied" || result.status === "unchanged",
    ).length;

    return {
      ok: succeededCount > 0,
      overall: succeededCount > 0 ? "partial" : "failed",
      failureCode: "selection-invalidated",
      results,
      retryableTargetIds: [],
    };
  }

  private async verifySelectedPath(
    serviceId: ServiceId,
    installPath: string,
  ): Promise<VerificationResult> {
    try {
      const stats = await this.dependencies.fsStat(
        path.win32.join(installPath, EXECUTABLE_NAMES[serviceId]),
      );
      return stats.isFile() ? { status: "valid" } : { status: "missing" };
    } catch (error) {
      return isMissingPathError(error)
        ? { status: "missing" }
        : { status: "unknown" };
    }
  }

  private createSnapshotMap(
    serviceId: ServiceId,
    diagnostics: GameInstallPathDiagnostics,
    snapshots: readonly GameInstallPathTargetSnapshot[],
  ): Map<GameInstallPathTargetId, GameInstallPathTargetSnapshot> {
    const diagnosticTargetIds = new Set<GameInstallPathTargetId>([
      ...diagnostics.registry.candidates.map((candidate) => candidate.targetId),
      "config",
    ]);
    const allowedTargetIds = new Set<GameInstallPathTargetId>([
      "registry-primary",
      ...(serviceId === "Kakao Games"
        ? (["registry-compatibility"] as const)
        : []),
      "config",
    ]);
    const result = new Map<
      GameInstallPathTargetId,
      GameInstallPathTargetSnapshot
    >();

    for (const snapshot of snapshots) {
      if (
        !allowedTargetIds.has(snapshot.targetId) ||
        !diagnosticTargetIds.has(snapshot.targetId) ||
        result.has(snapshot.targetId)
      ) {
        continue;
      }
      result.set(snapshot.targetId, snapshot);
    }

    return result;
  }

  private getTargetEligibility(
    session: SelectionSession,
    targetId: GameInstallPathTargetId,
    snapshot: GameInstallPathTargetSnapshot | undefined,
  ): TargetEligibility {
    if (session.completedTargetIds.has(targetId)) {
      return {
        disabled: true,
        disabledReason: "target-completed",
        retryable: false,
      };
    }
    if (
      !snapshot ||
      ("registryState" in snapshot && snapshot.registryState === "read-failed")
    ) {
      return {
        disabled: true,
        disabledReason: snapshot ? "target-read-failed" : undefined,
        retryable: false,
      };
    }

    return { disabled: false, retryable: true };
  }

  private createDescriptor(
    session: SelectionSession,
  ): GameInstallPathSelectionDescriptor {
    const candidatesById = new Map<
      GameInstallPathTargetId,
      GameInstallPathRegistryCandidateDiagnostic
    >(
      session.diagnostics.registry.candidates.map((candidate) => [
        candidate.targetId,
        candidate,
      ]),
    );
    const targets: GameInstallPathSelectionTargetDescriptor[] = [];

    for (const targetId of TARGET_ORDER) {
      const snapshot = session.displaySnapshots.get(targetId);
      if (!snapshot) continue;

      const completed = session.completedTargetIds.has(targetId);
      const eligibility = this.getTargetEligibility(
        session,
        targetId,
        snapshot,
      );
      const candidate = candidatesById.get(targetId);
      targets.push({
        targetId,
        currentPath: snapshot.currentPath,
        selectedByDefault:
          targetId === "registry-primary" || targetId === "config",
        completed,
        disabled: eligibility.disabled,
        ...(eligibility.disabledReason
          ? { disabledReason: eligibility.disabledReason }
          : {}),
        ...(candidate
          ? {
              registryPath: candidate.registryPath,
              registryValueName: candidate.registryValueName,
            }
          : {}),
      });
    }

    return {
      selectionId: session.selectionId,
      serviceId: session.serviceId,
      gameId: session.gameId,
      path: session.path,
      targets,
    };
  }
}

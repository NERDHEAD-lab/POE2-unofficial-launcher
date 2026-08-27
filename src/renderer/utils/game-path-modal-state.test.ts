import { describe, expect, it } from "vitest";

import {
  applyGamePathSelectionBatchForContext,
  updateGamePathModalForContext,
} from "./game-path-modal-state";
import * as gamePathModalStateModule from "./game-path-modal-state";

import type {
  GameInstallPathDiagnostics,
  GameInstallPathSelectionBatchResult,
  GameInstallPathSelectionDescriptor,
} from "../../shared/types";

type FixtureState = {
  generation: number;
  serviceId: "Kakao Games" | "GGG";
  gameId: "POE1" | "POE2";
  busy: boolean;
  diagnostics: string;
  errorMessage?: string;
};

describe("updateGamePathModalForContext", () => {
  const pendingIdentity = {
    generation: 1,
    serviceId: "Kakao Games" as const,
    gameId: "POE2" as const,
  };

  it.each([
    ["late success", { diagnostics: "late-success", busy: false }],
    [
      "late failure",
      { diagnostics: "late-failure", busy: false, errorMessage: "failed" },
    ],
  ] as const)(
    "leaves a new modal untouched after %s from the previous identity",
    (_label, latePatch) => {
      const newModal: FixtureState = {
        generation: 2,
        serviceId: "Kakao Games",
        gameId: "POE1",
        busy: false,
        diagnostics: "new-modal",
      };

      const result = updateGamePathModalForContext(
        newModal,
        pendingIdentity.serviceId,
        pendingIdentity.gameId,
        (matched) => ({ ...matched, ...latePatch }),
      );

      expect(result).toBe(newModal);
      expect(result).toEqual(newModal);
    },
  );

  it("keeps a closed modal closed after a late result", () => {
    expect(
      updateGamePathModalForContext(
        null,
        pendingIdentity.serviceId,
        pendingIdentity.gameId,
        (matched) => ({ ...matched, busy: false }),
      ),
    ).toBeNull();
  });

  it("rejects a delayed same-context result from a previous modal generation", () => {
    const newModal: FixtureState = {
      generation: 2,
      serviceId: "Kakao Games",
      gameId: "POE2",
      busy: true,
      diagnostics: "new-modal",
    };

    const updated = updateGamePathModalForContext(
      newModal,
      "Kakao Games",
      "POE2",
      (matched) => ({ ...matched, diagnostics: "stale", busy: false }),
      { generation: 1 },
    );

    expect(updated).toBe(newModal);
    expect(updated).toEqual(newModal);
  });
});

describe("game path modal operation tracker", () => {
  it("rejects synchronous duplicate re-entry and invalidates prior-generation tokens", () => {
    const createTracker = (gamePathModalStateModule as Record<string, unknown>)
      .createGamePathModalOperationTracker;
    expect(createTracker).toBeTypeOf("function");
    if (typeof createTracker !== "function") return;

    const tracker = createTracker() as {
      activateGeneration(generation: number): void;
      begin(
        operation: string,
        identity: {
          generation: number;
          serviceId: "Kakao Games";
          gameId: "POE2";
          selectionId?: string;
        },
      ): { token: number } | null;
      finish(request: { token: number }): boolean;
      hasActive(generation: number): boolean;
    };
    tracker.activateGeneration(1);
    const original = tracker.begin("apply", {
      generation: 1,
      serviceId: "Kakao Games",
      gameId: "POE2",
      selectionId: "selection-1",
    });

    expect(original).not.toBeNull();
    expect(
      tracker.begin("apply", {
        generation: 1,
        serviceId: "Kakao Games",
        gameId: "POE2",
        selectionId: "selection-1",
      }),
    ).toBeNull();
    expect(tracker.hasActive(1)).toBe(true);

    tracker.activateGeneration(2);
    expect(tracker.finish(original!)).toBe(false);
    expect(tracker.hasActive(2)).toBe(false);
    expect(
      tracker.begin("picker", {
        generation: 2,
        serviceId: "Kakao Games",
        gameId: "POE2",
      }),
    ).not.toBeNull();
  });
});

describe("applyGamePathSelectionBatchForContext", () => {
  const diagnostics = {
    serviceId: "Kakao Games",
    gameId: "POE2",
    config: { path: String.raw`F:\\Fresh Config` },
    registry: { path: String.raw`F:\\Fresh Registry` },
  } as GameInstallPathDiagnostics;
  const selection = {
    selectionId: "selection-1",
    serviceId: "Kakao Games",
    gameId: "POE2",
    path: String.raw`F:\\Selected`,
    targets: [],
  } as GameInstallPathSelectionDescriptor;
  const result: GameInstallPathSelectionBatchResult = {
    ok: true,
    overall: "partial",
    results: [
      {
        targetId: "registry-primary",
        status: "applied",
        path: selection.path,
      },
      {
        targetId: "config",
        status: "failed",
        code: "target-changed",
        retryable: true,
      },
    ],
    retryableTargetIds: ["config"],
    diagnostics,
    selection,
  };

  it("keeps both coherent diagnostic columns and the exact retry set", () => {
    const current: {
      generation: number;
      serviceId: "Kakao Games";
      gameId: "POE2";
      diagnostics: GameInstallPathDiagnostics | null;
      selection?: GameInstallPathSelectionDescriptor;
      selectionApplyResult?: GameInstallPathSelectionBatchResult;
      busy: boolean;
    } = {
      generation: 1,
      serviceId: "Kakao Games" as const,
      gameId: "POE2" as const,
      diagnostics: null,
      selection,
      selectionApplyResult: undefined,
      busy: true,
    };

    const updated = applyGamePathSelectionBatchForContext(
      current,
      "Kakao Games",
      "POE2",
      result,
    );

    expect(updated?.diagnostics).toBe(diagnostics);
    expect(updated?.diagnostics?.registry.path).toBe(
      String.raw`F:\\Fresh Registry`,
    );
    expect(updated?.diagnostics?.config.path).toBe(
      String.raw`F:\\Fresh Config`,
    );
    expect(updated?.selectionApplyResult?.retryableTargetIds).toEqual([
      "config",
    ]);
    expect(updated?.busy).toBe(false);
  });

  it("does not overwrite a newly selected context with a late batch", () => {
    const newContext = {
      generation: 2,
      serviceId: "GGG" as const,
      gameId: "POE1" as const,
      diagnostics: null,
      selection: undefined,
      selectionApplyResult: undefined,
      busy: false,
    };

    expect(
      applyGamePathSelectionBatchForContext(
        newContext,
        "Kakao Games",
        "POE2",
        result,
      ),
    ).toBe(newContext);
  });

  it("keeps earlier successful target results when a failed-only retry completes", () => {
    const current = {
      generation: 1,
      serviceId: "Kakao Games" as const,
      gameId: "POE2" as const,
      diagnostics,
      selection,
      selectionApplyResult: result,
      busy: true,
    };
    const retryResult: GameInstallPathSelectionBatchResult = {
      ok: true,
      overall: "success",
      results: [
        {
          targetId: "config",
          status: "applied",
          path: selection.path,
        },
      ],
      retryableTargetIds: [],
      diagnostics,
      selection,
    };

    const updated = applyGamePathSelectionBatchForContext(
      current,
      "Kakao Games",
      "POE2",
      retryResult,
    );

    expect(updated?.selectionApplyResult?.results).toEqual([
      {
        targetId: "registry-primary",
        status: "applied",
        path: selection.path,
      },
      {
        targetId: "config",
        status: "applied",
        path: selection.path,
      },
    ]);
  });

  it.each([
    "selection-busy",
    "selection-not-found",
    "selection-expired",
    "selection-invalidated",
  ] as const)(
    "keeps cumulative success visible when a retry returns %s without diagnostics",
    (failureCode) => {
      const current = {
        generation: 1,
        serviceId: "Kakao Games" as const,
        gameId: "POE2" as const,
        diagnostics,
        selection,
        selectionApplyResult: result,
        busy: true,
      };
      const retryFailure: GameInstallPathSelectionBatchResult =
        failureCode === "selection-invalidated"
          ? {
              ok: false,
              overall: "failed",
              failureCode,
              results: [],
              retryableTargetIds: [],
            }
          : {
              ok: false,
              overall: "failed",
              failureCode,
              results: [],
              retryableTargetIds: [],
            };

      const updated = applyGamePathSelectionBatchForContext(
        current,
        "Kakao Games",
        "POE2",
        retryFailure,
        { generation: 1, selectionId: selection.selectionId },
      );

      expect(updated?.selectionApplyResult?.results).toEqual(result.results);
      expect(updated?.selectionApplyResult?.retryableTargetIds).toEqual([]);
      expect(updated?.diagnostics).toBe(diagnostics);
      expect(updated?.selection).toBe(selection);
      expect(updated?.busy).toBe(false);
    },
  );

  it("ignores an apply completion when generation or requested selection changed", () => {
    const current = {
      generation: 2,
      serviceId: "Kakao Games" as const,
      gameId: "POE2" as const,
      diagnostics,
      selection: { ...selection, selectionId: "selection-2" },
      selectionApplyResult: undefined,
      busy: true,
    };

    const updated = applyGamePathSelectionBatchForContext(
      current,
      "Kakao Games",
      "POE2",
      result,
      { generation: 1, selectionId: "selection-1" },
    );

    expect(updated).toBe(current);
  });
});

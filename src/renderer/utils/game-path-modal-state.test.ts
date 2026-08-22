import { describe, expect, it } from "vitest";

import { updateGamePathModalForContext } from "./game-path-modal-state";

type FixtureState = {
  serviceId: "Kakao Games" | "GGG";
  gameId: "POE1" | "POE2";
  busy: boolean;
  diagnostics: string;
  errorMessage?: string;
};

describe("updateGamePathModalForContext", () => {
  const pendingIdentity = {
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
});

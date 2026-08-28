import { describe, expect, it } from "vitest";

import {
  createGamePathRegistryWarning,
  dedupeOperationalNotifications,
} from "./game-path-registry-warning";

import type {
  GameInstallPathRegistryAdvisory,
  GameStatusState,
} from "../../shared/types";

const activeContext = {
  serviceId: "Kakao Games" as const,
  gameId: "POE2" as const,
};

const createStatus = (
  advisoryState?: GameInstallPathRegistryAdvisory["state"],
  overrides: Partial<GameStatusState> = {},
): GameStatusState => ({
  serviceId: "Kakao Games",
  gameId: "POE2",
  status: "idle",
  installPathHealth: {
    installationStatus: "installed",
    checkedAt: 1234,
    ...(advisoryState ? { registryAdvisory: { state: advisoryState } } : {}),
  },
  ...overrides,
});

describe("game path registry warning", () => {
  it.each([
    ["absent", "경로가 없습니다"],
    ["invalid", "올바르지 않습니다"],
    ["unknown", "확인하지 못했습니다"],
  ] as const)(
    "creates a nonblocking %s warning from active install-path health",
    (state, message) => {
      const warning = createGamePathRegistryWarning(
        createStatus(state),
        activeContext,
      );

      expect(warning).toEqual(
        expect.objectContaining({
          id: "game-path-registry:Kakao Games:POE2",
          contextKey: "Kakao Games:POE2",
          tone: "amber",
          serviceId: "Kakao Games",
          gameId: "POE2",
          message: expect.stringContaining(message),
        }),
      );
    },
  );

  it("does not warn for healthy, GGG, or another active context state", () => {
    expect(
      createGamePathRegistryWarning(createStatus(), activeContext),
    ).toBeNull();
    expect(
      createGamePathRegistryWarning(
        createStatus("absent", { serviceId: "GGG" }),
        { serviceId: "GGG", gameId: "POE2" },
      ),
    ).toBeNull();
    expect(
      createGamePathRegistryWarning(createStatus("absent"), {
        serviceId: "Kakao Games",
        gameId: "POE1",
      }),
    ).toBeNull();
  });

  it("keeps warning identity exact when the selected context changes", () => {
    const oldStatus = createStatus("absent", { gameId: "POE1" });

    expect(createGamePathRegistryWarning(oldStatus, activeContext)).toBeNull();
    expect(
      createGamePathRegistryWarning(oldStatus, {
        serviceId: "Kakao Games",
        gameId: "POE1",
      }),
    ).toEqual(
      expect.objectContaining({
        serviceId: "Kakao Games",
        gameId: "POE1",
      }),
    );
  });

  it("deduplicates operational notifications by stable context id", () => {
    const warning = createGamePathRegistryWarning(
      createStatus("absent"),
      activeContext,
    );
    if (!warning) throw new Error("Expected warning fixture");

    expect(dedupeOperationalNotifications([warning, warning])).toEqual([
      warning,
    ]);
  });
});

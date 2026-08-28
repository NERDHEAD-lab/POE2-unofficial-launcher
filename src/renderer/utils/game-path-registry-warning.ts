import type {
  AppConfig,
  GameStatusState,
  OperationalNotification,
} from "../../shared/types";

const getWarningMessage = (statusState: GameStatusState) => {
  const advisoryState = statusState.installPathHealth?.registryAdvisory?.state;
  if (advisoryState === "absent") {
    return "게임은 설치되어 있지만 카카오게임즈 레지스트리 경로가 없습니다. 경로 진단에서 확인해 주세요.";
  }

  if (advisoryState === "unknown") {
    return "게임은 설치되어 있지만 카카오게임즈 레지스트리 경로를 확인하지 못했습니다. 경로 진단에서 확인해 주세요.";
  }

  return "게임은 설치되어 있지만 카카오게임즈 레지스트리 경로가 올바르지 않습니다. 경로 진단에서 확인해 주세요.";
};

export const createGamePathRegistryWarning = (
  statusState: GameStatusState,
  activeContext: {
    serviceId: AppConfig["serviceChannel"];
    gameId: AppConfig["activeGame"];
  },
): OperationalNotification | null => {
  const advisory = statusState.installPathHealth?.registryAdvisory;
  if (
    statusState.serviceId !== activeContext.serviceId ||
    statusState.gameId !== activeContext.gameId ||
    statusState.serviceId !== "Kakao Games" ||
    !advisory
  ) {
    return null;
  }

  const contextKey = `${statusState.serviceId}:${statusState.gameId}`;
  return {
    id: `game-path-registry:${contextKey}`,
    contextKey,
    level: "warn",
    tone: "amber",
    title: `${statusState.gameId} 게임 경로 확인 필요`,
    message: getWarningMessage(statusState),
    serviceId: statusState.serviceId,
    gameId: statusState.gameId,
    action: "open-game-path-diagnostic",
  };
};

export const dedupeOperationalNotifications = (
  notifications: readonly OperationalNotification[],
) => [...new Map(notifications.map((item) => [item.id, item])).values()];

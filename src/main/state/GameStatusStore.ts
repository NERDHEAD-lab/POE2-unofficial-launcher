import { AppConfig, GameStatusState, RunStatus } from "../../shared/types";

const gameStatusCache: Record<string, GameStatusState> = {};

export const getGameStatusKey = (gameId: string, serviceId: string) =>
  `${gameId}_${serviceId}`;

export const updateGameStatusCache = (
  statusState: GameStatusState,
): GameStatusState => {
  const key = getGameStatusKey(statusState.gameId, statusState.serviceId);
  const previous = gameStatusCache[key];
  const incomingHealth = statusState.installPathHealth;
  const installPathHealth =
    incomingHealth &&
    (!previous?.installPathHealth ||
      incomingHealth.checkedAt >= previous.installPathHealth.checkedAt)
      ? incomingHealth
      : previous?.installPathHealth;
  const payload: GameStatusState = {
    ...statusState,
    ...(installPathHealth ? { installPathHealth } : {}),
    timestamp: statusState.timestamp ?? Date.now(),
  };

  gameStatusCache[key] = payload;

  return payload;
};

export const getGameStatus = (
  gameId: string,
  serviceId: string,
): GameStatusState => {
  return (
    gameStatusCache[getGameStatusKey(gameId, serviceId)] || {
      gameId: gameId as AppConfig["activeGame"],
      serviceId: serviceId as AppConfig["serviceChannel"],
      status: "idle",
      timestamp: Date.now(),
    }
  );
};

export const getAllGameStatuses = (): GameStatusState[] =>
  Object.values(gameStatusCache);

export const isLaunchBlockingStatus = (status: RunStatus): boolean =>
  status === "preparing" ||
  status === "processing" ||
  status === "authenticating" ||
  status === "ready" ||
  status === "running";

export const shouldPreserveRuntimeGameStatus = (
  statusState: GameStatusState,
): boolean => isLaunchBlockingStatus(statusState.status);

export const isProcessExpectedStatus = (status: RunStatus): boolean =>
  status === "ready" || status === "running";

export const isAutomationWindowDependentStatus = (status: RunStatus): boolean =>
  status === "preparing" ||
  status === "processing" ||
  status === "authenticating";

export const shouldResetStatusOnAutomationWindowClosed = (
  status: RunStatus,
  hasMatchingProcess: boolean,
): boolean => {
  if (isAutomationWindowDependentStatus(status)) {
    return true;
  }

  return status === "ready" && !hasMatchingProcess;
};

export const resetGameStatusCacheForTests = () => {
  for (const key of Object.keys(gameStatusCache)) {
    delete gameStatusCache[key];
  }
};

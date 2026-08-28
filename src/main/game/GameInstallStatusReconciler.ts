import { CONFIG_KEYS } from "../../shared/config";
import {
  ACTIVE_GAMES,
  AppConfig,
  GameInstallPaths,
  SERVICE_CHANNELS,
} from "../../shared/types";
import { eventBus } from "../events/EventBus";
import {
  AppContext,
  ConfigChangeEvent,
  EventType,
  GameStatusChangeEvent,
} from "../events/types";
import {
  getGameStatus,
  getGameStatusKey,
  shouldPreserveRuntimeGameStatus,
} from "../state/GameStatusStore";
import { logger } from "../utils/logger";
import { getGameInstallPathHealth } from "../utils/registry";

import type { GameInstallationStatus } from "../../shared/types";

export interface GameInstallStatusContext {
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
}

type ProcessCriteria = NonNullable<
  AppContext["processWatcher"]
>["isProcessRunning"] extends (
  name: string,
  criteria?: infer Criteria,
) => boolean
  ? Criteria
  : never;

export const GAME_INSTALL_STATUS_CONTEXTS: readonly GameInstallStatusContext[] =
  SERVICE_CHANNELS.flatMap((serviceId) =>
    ACTIVE_GAMES.map((gameId) => ({ gameId, serviceId })),
  );

const reconciliationGenerations = new Map<string, number>();
const completedReconciliations = new Map<string, number>();
const passiveReconciliations = new Map<string, Promise<boolean>>();
const manualReconciliationCounts = new Map<string, number>();
let now = () => Date.now();

export const GAME_INSTALL_STATUS_REFRESH_TTL_MS = 30 * 60 * 1000;

const beginReconciliation = (
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
) => {
  const key = getGameStatusKey(gameId, serviceId);
  const generation = (reconciliationGenerations.get(key) ?? 0) + 1;
  reconciliationGenerations.set(key, generation);
  return { generation, key };
};

const isCurrentReconciliation = (key: string, generation: number) =>
  reconciliationGenerations.get(key) === generation;

export const resetGameInstallStatusReconcilerForTests = () => {
  reconciliationGenerations.clear();
  completedReconciliations.clear();
  passiveReconciliations.clear();
  manualReconciliationCounts.clear();
  now = () => Date.now();
};

export const setGameInstallStatusClockForTests = (clock: () => number) => {
  now = clock;
};

export const shouldReconcileGameInstallStatusOnConfigChange = (
  event: ConfigChangeEvent,
) =>
  event.payload.key === CONFIG_KEYS.ACTIVE_GAME ||
  event.payload.key === CONFIG_KEYS.SERVICE_CHANNEL ||
  event.payload.key === CONFIG_KEYS.GAME_INSTALL_PATHS;

const getPathValue = (
  value: unknown,
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
) => {
  if (!value || typeof value !== "object") return "";

  const servicePaths = (value as Partial<GameInstallPaths>)[serviceId];
  if (!servicePaths || typeof servicePaths !== "object") return "";

  const installPath = servicePaths[gameId];
  return typeof installPath === "string" ? installPath : "";
};

const getChangedGameInstallPathContexts = (
  oldValue: unknown,
  newValue: unknown,
): GameInstallStatusContext[] =>
  GAME_INSTALL_STATUS_CONTEXTS.filter(
    ({ serviceId, gameId }) =>
      getPathValue(oldValue, serviceId, gameId) !==
      getPathValue(newValue, serviceId, gameId),
  );

export const getGameInstallStatusContextsForConfigChange = (
  event: ConfigChangeEvent,
  context: AppContext,
): GameInstallStatusContext[] => {
  if (event.payload.key === CONFIG_KEYS.GAME_INSTALL_PATHS) {
    return getChangedGameInstallPathContexts(
      event.payload.oldValue,
      event.payload.newValue,
    );
  }

  if (
    event.payload.key === CONFIG_KEYS.ACTIVE_GAME ||
    event.payload.key === CONFIG_KEYS.SERVICE_CHANNEL
  ) {
    const config = context.getConfig() as AppConfig;
    return [{ gameId: config.activeGame, serviceId: config.serviceChannel }];
  }

  return [];
};

const mapInstallationStatusToRunStatus = (
  installationStatus: GameInstallationStatus,
) =>
  installationStatus === "uninstalled"
    ? "uninstalled"
    : installationStatus === "unknown"
      ? "install_check_blocked"
      : "idle";

const getInstallCheckErrorPayload = (
  installationStatus: GameInstallationStatus,
) =>
  installationStatus === "unknown"
    ? { errorCode: "INSTALL_CHECK_UNKNOWN" }
    : {};

const getProcessCheck = (
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
): { name: string; criteria?: ProcessCriteria } => {
  if (serviceId === "Kakao Games") {
    return {
      name: gameId === "POE2" ? "POE2_Launcher.exe" : "POE_Launcher.exe",
    };
  }

  return {
    name: "PathOfExile.exe",
    criteria: (info) => {
      const lowerPath = info.path.toLowerCase();
      if (gameId === "POE2") {
        return lowerPath.includes("path of exile 2");
      }

      return (
        lowerPath.includes("path of exile") &&
        !lowerPath.includes("path of exile 2")
      );
    },
  };
};

const isGameProcessRunning = (
  context: AppContext,
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
) => {
  const processCheck = getProcessCheck(serviceId, gameId);
  return context.processWatcher?.isProcessRunning(
    processCheck.name,
    processCheck.criteria,
  );
};

const emitGameStatus = async (
  context: AppContext,
  payload: GameStatusChangeEvent["payload"],
) => {
  await eventBus.emit<GameStatusChangeEvent>(
    EventType.GAME_STATUS_CHANGE,
    context,
    payload,
  );
};

export const reconcileGameInstallStatus = async (
  context: AppContext,
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
  options: { reason?: string } = {},
) => {
  const { generation, key } = beginReconciliation(serviceId, gameId);
  const label = `${gameId} (${serviceId})`;
  const reason = options.reason ? `; reason=${options.reason}` : "";

  const processIsRunning =
    isGameProcessRunning(context, serviceId, gameId) === true;

  logger.log(
    `[GameInstallStatus] Checking installation for ${label}${reason}.`,
  );
  const installPathHealth = await getGameInstallPathHealth(
    serviceId,
    gameId,
    now(),
  );
  const installationStatus = installPathHealth.installationStatus;

  if (!isCurrentReconciliation(key, generation)) {
    logger.log(
      `[GameInstallStatus] Discarding stale install check for ${label}${reason}.`,
    );
    return false;
  }

  const latestStatus = getGameStatus(gameId, serviceId);
  if (shouldPreserveRuntimeGameStatus(latestStatus)) {
    logger.log(
      `[GameInstallStatus] Preserving active runtime status after install check for ${label}: ${latestStatus.status}${reason}`,
    );
    await emitGameStatus(context, {
      gameId,
      serviceId,
      status: latestStatus.status,
      ...(latestStatus.errorCode ? { errorCode: latestStatus.errorCode } : {}),
      installPathHealth,
    });
  } else if (processIsRunning) {
    logger.log(
      `[GameInstallStatus] Game ${label} is currently running. Preserving process status with refreshed install-path health${reason}.`,
    );
    await emitGameStatus(context, {
      gameId,
      serviceId,
      status: "running",
      installPathHealth,
    });
  } else {
    await emitGameStatus(context, {
      gameId,
      serviceId,
      status: mapInstallationStatusToRunStatus(installationStatus),
      ...getInstallCheckErrorPayload(installationStatus),
      installPathHealth,
    });
  }

  if (!isCurrentReconciliation(key, generation)) return false;
  completedReconciliations.set(key, installPathHealth.checkedAt);
  return true;
};

export const reconcileAllGameInstallStatuses = async (
  context: AppContext,
  options: { reason?: string } = {},
) => {
  for (const { serviceId, gameId } of GAME_INSTALL_STATUS_CONTEXTS) {
    await reconcileGameInstallStatus(context, serviceId, gameId, options);
  }
};

export const reconcileCurrentGameInstallStatusIfStale = async (
  context: AppContext,
  options: { reason?: string } = {},
) => {
  const config = context.getConfig() as AppConfig;
  const { activeGame: gameId, serviceChannel: serviceId } = config;
  const key = getGameStatusKey(gameId, serviceId);
  const lastCompletedAt = completedReconciliations.get(key);

  if ((manualReconciliationCounts.get(key) ?? 0) > 0) return false;

  if (
    lastCompletedAt !== undefined &&
    now() - lastCompletedAt < GAME_INSTALL_STATUS_REFRESH_TTL_MS
  ) {
    return false;
  }

  const existing = passiveReconciliations.get(key);
  if (existing) {
    await existing;
    return false;
  }

  const task = reconcileGameInstallStatus(context, serviceId, gameId, options);
  passiveReconciliations.set(key, task);
  try {
    return await task;
  } finally {
    if (passiveReconciliations.get(key) === task) {
      passiveReconciliations.delete(key);
    }
  }
};

export const runManualGameInstallPathAction = async <
  Result extends { ok: boolean },
>(
  context: AppContext,
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
  reason: string,
  action: () => Promise<Result>,
): Promise<Result> => {
  const key = getGameStatusKey(gameId, serviceId);
  manualReconciliationCounts.set(
    key,
    (manualReconciliationCounts.get(key) ?? 0) + 1,
  );
  try {
    const result = await action();

    if (result.ok) {
      try {
        await reconcileGameInstallStatus(context, serviceId, gameId, {
          reason,
        });
      } catch (error) {
        logger.warn(
          `[GameInstallStatus] Manual path action succeeded but reconciliation failed for ${gameId} (${serviceId}); reason=${reason}; error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  } finally {
    const remaining = (manualReconciliationCounts.get(key) ?? 1) - 1;
    if (remaining > 0) manualReconciliationCounts.set(key, remaining);
    else manualReconciliationCounts.delete(key);
  }
};

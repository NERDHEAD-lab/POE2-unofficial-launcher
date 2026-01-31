import { AppConfig, RunStatus } from "../../../shared/types";
import { logger } from "../../utils/logger";
import { isGameInstalled } from "../../utils/registry";
import { eventBus } from "../EventBus";
import {
  AppContext,
  EventHandler,
  EventType,
  GameStatusChangeEvent,
  UIGameInstallCheckEvent,
} from "../types";

/**
 * Handler: Check if the game is installed and its current status.
 */
export const GameInstallCheckHandler: EventHandler<UIGameInstallCheckEvent> = {
  id: "GameInstallCheckHandler",
  targetEvent: EventType.UI_GAME_INSTALL_CHECK,

  condition: () => true,

  handle: async (_event, context: AppContext) => {
    const config = context.getConfig() as AppConfig;
    const { activeGame, serviceChannel } = config;

    logger.log(
      `[GameInstallCheckHandler] Checking installation for ${activeGame} (${serviceChannel})...`,
    );

    // 1. Check Registry/Path installation
    const installed = await isGameInstalled(serviceChannel, activeGame);

    // 2. [New] If installed, check if it's currently RUNNING
    let isRunning = false;
    if (installed) {
      const targetProcessName =
        serviceChannel === "Kakao Games"
          ? "PathOfExile_KG.exe"
          : "PathOfExile.exe";

      // We might want to verify the path as well, but for now name is enough
      if (context.processWatcher) {
        isRunning = context.processWatcher.isProcessRunning(targetProcessName);
      }
    }

    if (isRunning) {
      logger.log(
        `[GameInstallCheckHandler] Game ${activeGame} (${serviceChannel}) is currently RUNNING. Emitting 'running' status.`,
      );
      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        context,
        {
          gameId: activeGame,
          serviceId: serviceChannel,
          status: "running",
        },
      );
    } else {
      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        context,
        {
          gameId: activeGame,
          serviceId: serviceChannel,
          status: (installed ? "idle" : "uninstalled") as RunStatus,
        },
      );
    }
  },
};

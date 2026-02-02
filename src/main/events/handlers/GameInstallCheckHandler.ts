import { AppConfig } from "../../../shared/types";
import { logger } from "../../utils/logger";
import { isGameInstalled } from "../../utils/registry";
import { eventBus } from "../EventBus";
import {
  AppContext,
  EventHandler,
  EventType,
  GameStatusChangeEvent,
  ConfigChangeEvent,
} from "../types";

/**
 * Handler to check game installation status when configuration changes
 */
export const GameInstallCheckHandler: EventHandler<ConfigChangeEvent> = {
  id: "GameInstallCheckHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) => {
    return (
      event.payload.key === "activeGame" ||
      event.payload.key === "serviceChannel"
    );
  },

  handle: async (_event, context: AppContext) => {
    const config = context.getConfig() as AppConfig;
    const { activeGame, serviceChannel } = config;

    logger.log(
      `[GameInstallCheckHandler] Checking installation for ${activeGame} (${serviceChannel})...`,
    );

    const installed = await isGameInstalled(serviceChannel, activeGame);

    // [Fix] Check if the game is already RUNNING before resetting to 'idle'
    // This prevents status flickering or resetting when switching tabs while game is open.
    // [Refactor] Use explicit process mapping for accurate status detection
    // This prevents POE1 activity from falsely reporting POE2 as running (and vice versa).
    // Previously, we relied on generic 'GameServiceProfiles' which mapped both to 'PathOfExile_KG.exe', causing cross-talk.

    let targetProcessName = "";
    let criteria:
      | ((info: { pid: number; path: string }) => boolean)
      | undefined;

    if (serviceChannel === "Kakao Games") {
      // Use specific Launcher names for Kakao to distinguish games
      targetProcessName =
        activeGame === "POE2" ? "POE2_Launcher.exe" : "POE_Launcher.exe";
    } else {
      // GGG uses the same process name but different paths
      targetProcessName = "PathOfExile.exe";
      criteria = (info) => {
        const lowerPath = info.path.toLowerCase();
        if (activeGame === "POE2") {
          return lowerPath.includes("path of exile 2");
        } else {
          // POE1: Must include "path of exile" but NOT "path of exile 2"
          return (
            lowerPath.includes("path of exile") &&
            !lowerPath.includes("path of exile 2")
          );
        }
      };
    }

    const isRunning =
      targetProcessName &&
      context.processWatcher?.isProcessRunning(targetProcessName, criteria);

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
      return;
    }

    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId: activeGame,
        serviceId: serviceChannel,
        status: installed ? "idle" : "uninstalled",
      },
    );
  },
};

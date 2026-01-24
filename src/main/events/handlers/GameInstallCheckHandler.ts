import { AppConfig } from "../../../shared/types";
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
    const config = context.store.store as AppConfig;
    const { activeGame, serviceChannel } = config;

    console.log(
      `[GameInstallCheckHandler] Checking installation for ${activeGame} (${serviceChannel})...`,
    );

    const installed = await isGameInstalled(serviceChannel, activeGame);

    // If uninstalled, set status to 'uninstalled'
    // If installed, we usually set to 'idle' but ProcessWatcher might already have it as 'running'
    // For now, let's just emit 'uninstalled' or 'idle'.
    // The ProcessWatcher will eventually overwrite with 'running' if it's actually running.

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

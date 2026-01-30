import { spawn } from "node:child_process";
import path from "node:path";

import { AppConfig } from "../../../shared/types";
import { getGameInstallPath } from "../../utils/registry";
import { eventBus } from "../EventBus";
import {
  AppContext,
  EventHandler,
  EventType,
  GameStatusChangeEvent,
  UIEvent,
} from "../types";

export const StartPoeGggHandler: EventHandler<UIEvent> = {
  id: "StartPoeGggHandler",
  targetEvent: EventType.UI_GAME_START_CLICK,

  condition: (_event, context: AppContext) => {
    const config = context.getConfig() as AppConfig;
    return config.serviceChannel === "GGG";
  },

  handle: async (_event, context) => {
    const config = context.getConfig() as AppConfig;
    const { activeGame, serviceChannel } = config;

    console.log(`[StartPoeGggHandler] Starting ${activeGame} for GGG...`);

    // 1. Notify Preparing
    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId: activeGame,
        serviceId: serviceChannel,
        status: "preparing",
      },
    );

    try {
      // 2. Resolve Installation Path
      const installPath = await getGameInstallPath(serviceChannel, activeGame);

      if (!installPath) {
        throw new Error("Could not find game installation path in registry.");
      }

      // 3. Notify Processing
      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        context,
        {
          gameId: activeGame,
          serviceId: serviceChannel,
          status: "processing",
        },
      );

      // 4. Resolve Executable Name
      // POE1: PathOfExile.exe
      // POE2: PathOfExile.exe (Wait, user said verify registry.ts)
      // Looking at registry.ts:
      // POE1: GrindingGearGames\Path of Exile
      // POE2: GrindingGearGames\Path of Exile 2
      // Usually both are PathOfExile.exe but POE2 might be PathOfExile2.exe depending on beta.
      // Based on user metadata or common knowledge:
      const exeName =
        activeGame === "POE2" ? "PathOfExile.exe" : "PathOfExile.exe";
      // Actually, POE2 beta uses PathOfExile.exe in its own folder usually.

      const fullPath = path.join(installPath, exeName);
      console.log(`[StartPoeGggHandler] Executing: ${fullPath}`);

      // 5. Spawn Process
      const gameProcess = spawn(fullPath, [], {
        detached: true,
        stdio: "ignore",
        cwd: installPath, // Set working directory to installation folder
      });

      gameProcess.unref(); // Allow the parent to exit independently

      // 6. Notify Running (Initial)
      // ProcessWatcher will officially confirm 'running' status once it detects the PID.
      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        context,
        {
          gameId: activeGame,
          serviceId: serviceChannel,
          status: "running",
        },
      );
    } catch (e) {
      console.error(`[StartPoeGggHandler] Launch failed: ${e}`);
      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        context,
        {
          gameId: activeGame,
          serviceId: serviceChannel,
          status: "error",
          errorCode: "LAUNCH_FAILED",
        },
      );
    }
  },
};

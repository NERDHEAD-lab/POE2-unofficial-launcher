import { AppConfig } from "../../../shared/types";
import { BASE_URLS } from "../../../shared/urls";
import { logger } from "../../utils/logger";
import { eventBus } from "../EventBus";
import {
  AppContext,
  EventHandler,
  EventType,
  GameStatusChangeEvent,
  UIEvent,
} from "../types";

// Note: We use EventHandler<UIEvent> to strictly type 'event' argument in handle
export const StartPoe2KakaoHandler: EventHandler<UIEvent> = {
  id: "StartPoe2KakaoHandler",
  targetEvent: EventType.UI_GAME_START_CLICK,

  condition: (_event, context: AppContext) => {
    const config = context.getConfig() as AppConfig;
    // Check if Active Game is POE2 AND Service Channel is Kakao Games
    const isPoe2 = config.activeGame === "POE2";
    const isKakao = config.serviceChannel === "Kakao Games";

    // Debug log to trace condition failures if any
    logger.log(
      `[StartPoe2KakaoHandler] Checking Condition: POE2=${isPoe2}, Kakao=${isKakao}`,
    );

    return isPoe2 && isKakao;
  },

  // 'event' is automatically inferred as UIGameStartEvent
  handle: async (event, context) => {
    // Dynamically ensure game window exists
    // 2. Ensure Game Window (Kakao)
    const gameWindow = context.ensureGameWindow({ service: "Kakao Games" });
    context.gameWindow = gameWindow; // Sync logic
    // 0. Notify User
    logger.log(
      `[StartPoe2KakaoHandler] Condition Met! Starting POE2 Kakao Process...`,
    );

    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "preparing",
      },
    );

    if (!gameWindow) {
      logger.error("[StartPoe2KakaoHandler] Failed to create Game Window!");
      return;
    }

    if (gameWindow.isDestroyed()) {
      logger.error("[StartPoe2KakaoHandler] Game Window is destroyed!");
      return;
    }

    // 1. Show Game Window logic removed in favor of checkAndShow in main.ts
    // This prevents flashing of hidden pages before login.

    // 2. Load Target URL
    const targetUrl = `${BASE_URLS["Kakao Games"].POE2}/main#autoStart`;

    // Mark as Game Start context BEFORE loading URL (to avoid race with preload.ts)
    if (typeof global.setNavigationTrigger === "function") {
      global.setNavigationTrigger(gameWindow.webContents.id, "GAME_START_POE2");
    }

    logger.log(`[StartPoe2KakaoHandler] Loading URL: ${targetUrl}`);

    try {
      await gameWindow.loadURL(targetUrl);
    } catch (err: unknown) {
      const e = err as Error & { code?: number };

      // ERR_ABORTED (-3) is EXPECTED when Electron hands off a custom protocol (daumgamestarter://) to the OS.
      // This means the external app launch was triggered successfully.
      if (e.message && (e.message.includes("ERR_ABORTED") || e.code === -3)) {
        logger.log(
          `[StartPoe2KakaoHandler] Navigation aborted (-3) as expected for custom protocol launch. Success.`,
        );
      } else {
        logger.error(`[StartPoe2KakaoHandler] Failed to load URL: ${e}`);
        eventBus.emit<GameStatusChangeEvent>(
          EventType.GAME_STATUS_CHANGE,
          context,
          {
            gameId: "POE2",
            serviceId: "Kakao Games",
            status: "error",
            errorCode: "URL_LOAD_FAILED",
          },
        );
        return;
      }
    }

    // 3. Send Execute Command to Renderer (Content Script)
    logger.log(
      '[StartPoe2KakaoHandler] URL Loaded. Sending "execute-game-start"...',
    );
    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId: "POE2",
        serviceId: "Kakao Games",
        status: "processing",
      },
    );

    // Using simple explicit wait or just verify not destroyed
    if (!gameWindow.isDestroyed()) {
      gameWindow.webContents.send("execute-game-start", {
        gameId: "POE2",
        serviceId: "Kakao Games",
      });
    }
  },
};

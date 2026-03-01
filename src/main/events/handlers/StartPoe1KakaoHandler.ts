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
export const StartPoe1KakaoHandler: EventHandler<UIEvent> = {
  id: "StartPoe1KakaoHandler",
  targetEvent: EventType.UI_GAME_START_CLICK,

  condition: (_event, context: AppContext) => {
    const config = context.getConfig() as AppConfig;
    // Check if Active Game is POE1 AND Service Channel is Kakao Games
    const isPoe1 = config.activeGame === "POE1";
    const isKakao = config.serviceChannel === "Kakao Games";

    // Debug log to trace condition failures if any
    logger.log(
      `[StartPoe1KakaoHandler] Checking Condition: POE1=${isPoe1}, Kakao=${isKakao}`,
    );

    return isPoe1 && isKakao;
  },

  // 'event' is automatically inferred as UIGameStartEvent
  handle: async (event, context) => {
    // 2. Ensure Game Window (Kakao)
    const gameWindow = context.ensureGameWindow({ service: "Kakao Games" });
    context.gameWindow = gameWindow; // Sync logic
    // 0. Notify User (Preparing) & Interrupt background validation if active
    logger.log(
      `[StartPoe1KakaoHandler] Condition Met! Starting POE1 Kakao Process...`,
    );
    context.disableValidationMode();

    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId: "POE1",
        serviceId: "Kakao Games",
        status: "preparing",
      },
    );

    if (!gameWindow) {
      logger.error("[StartPoe1KakaoHandler] Failed to create Game Window!");
      return;
    }

    if (gameWindow.isDestroyed()) {
      logger.error("[StartPoe1KakaoHandler] Game Window is destroyed!");
      return;
    }

    // 1. Show Game Window logic removed in favor of checkAndShow in main.ts
    // This prevents flashing of hidden pages before login.

    // 2. Load Target URL
    const targetUrl = `${BASE_URLS["Kakao Games"].POE1}#autoStart`;

    // Mark as Game Start context BEFORE loading URL (to avoid race with preload.ts)
    if (typeof global.setNavigationTrigger === "function") {
      global.setNavigationTrigger(gameWindow.webContents.id, "GAME_START_POE1");
    }

    logger.log(`[StartPoe1KakaoHandler] Loading URL: ${targetUrl}`);

    try {
      await gameWindow.loadURL(targetUrl);
    } catch (e) {
      logger.error(`[StartPoe1KakaoHandler] Failed to load URL: ${e}`);
      eventBus.emit<GameStatusChangeEvent>(
        EventType.GAME_STATUS_CHANGE,
        context,
        {
          gameId: "POE1",
          serviceId: "Kakao Games",
          status: "error",
          errorCode: "URL_LOAD_FAILED",
        },
      );
      return;
    }

    // 3. Send Execute Command to Renderer (Content Script)
    logger.log(
      '[StartPoe1KakaoHandler] URL Loaded. Sending "execute-game-start"...',
    );

    // Status: Processing (Page Loaded, triggering script)
    eventBus.emit<GameStatusChangeEvent>(
      EventType.GAME_STATUS_CHANGE,
      context,
      {
        gameId: "POE1",
        serviceId: "Kakao Games",
        status: "processing",
      },
    );

    // Using simple explicit wait or just verify not destroyed
    if (!gameWindow.isDestroyed()) {
      gameWindow.webContents.send("execute-game-start", {
        gameId: "POE1",
        serviceId: "Kakao Games",
      });
    }
    // Note: 'authenticating' and 'ready' usually come from the Preload script -> Main -> EventBus.
    // For now, this handles the main initiator flow.
  },
};

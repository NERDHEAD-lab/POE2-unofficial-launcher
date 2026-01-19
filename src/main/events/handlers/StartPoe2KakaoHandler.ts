import { eventBus } from "../EventBus";
import {
  AppContext,
  EventHandler,
  EventType,
  GameStatusChangeEvent,
  MessageEvent,
  UIEvent,
} from "../types";

// Note: We use EventHandler<UIEvent> to strictly type 'event' argument in handle
export const StartPoe2KakaoHandler: EventHandler<UIEvent> = {
  id: "StartPoe2KakaoHandler",
  targetEvent: EventType.UI_GAME_START_CLICK,

  condition: (_event, context: AppContext) => {
    const config = context.store.store;
    // Check if Active Game is POE2 AND Service Channel is Kakao Games
    const isPoe2 = config.activeGame === "POE2";
    const isKakao = config.serviceChannel === "Kakao Games";

    // Debug log to trace condition failures if any
    console.log(
      `[StartPoe2KakaoHandler] Checking Condition: POE2=${isPoe2}, Kakao=${isKakao}`,
    );

    return isPoe2 && isKakao;
  },

  // 'event' is automatically inferred as UIGameStartEvent
  handle: async (event, context) => {
    // Dynamically ensure game window exists (Lazy Creation)
    const gameWindow = context.ensureGameWindow();

    // 0. Notify User
    console.log(
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
      console.error("[StartPoe2KakaoHandler] Failed to create Game Window!");
      return;
    }

    if (gameWindow.isDestroyed()) {
      console.error("[StartPoe2KakaoHandler] Game Window is destroyed!");
      return;
    }

    // 1. Show Game Window (if configured)
    if (process.env.VITE_SHOW_GAME_WINDOW === "true") {
      gameWindow.show();
    }

    // 2. Load Target URL
    const targetUrl = "https://pathofexile2.game.daum.net/main";
    console.log(`[StartPoe2KakaoHandler] Loading URL: ${targetUrl}`);

    try {
      await gameWindow.loadURL(targetUrl);
    } catch (e) {
      console.error(`[StartPoe2KakaoHandler] Failed to load URL: ${e}`);
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

    // 3. Send Execute Command to Renderer (Content Script)
    console.log(
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
      gameWindow.webContents.send("execute-game-start");
    }
  },
};

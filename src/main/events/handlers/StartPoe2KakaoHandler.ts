import { AppContext, AppEvent, EventHandler, EventType } from "../types";

export const StartPoe2KakaoHandler: EventHandler = {
  id: "StartPoe2KakaoHandler",
  targetEvent: EventType.UI_GAME_START_CLICK,

  condition: (context: AppContext) => {
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

  handle: async (event: AppEvent, context: AppContext) => {
    const { gameWindow } = context;

    console.log(
      `[StartPoe2KakaoHandler] Condition Met! Starting POE2 Kakao Process...`,
    );

    if (!gameWindow) {
      console.error("[StartPoe2KakaoHandler] Game Window is null!");
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
      return;
    }

    // 3. Send Execute Command to Renderer (Content Script)
    console.log(
      '[StartPoe2KakaoHandler] URL Loaded. Sending "execute-game-start"...',
    );
    // Using simple explicit wait or just verify not destroyed
    if (!gameWindow.isDestroyed()) {
      gameWindow.webContents.send("execute-game-start");
    }
  },
};

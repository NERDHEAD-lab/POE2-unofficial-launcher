import {
  AppContext,
  EventHandler,
  EventType,
  GameStatusChangeEvent,
} from "../types";

export const GameStatusSyncHandler: EventHandler<GameStatusChangeEvent> = {
  id: "GameStatusSyncHandler",
  targetEvent: EventType.GAME_STATUS_CHANGE,

  condition: (_event, context: AppContext) => {
    return !!context.mainWindow && !context.mainWindow.isDestroyed();
  },

  handle: async (event, context) => {
    // Send structured status update to Main Window (Renderer)
    if (context.mainWindow) {
      context.mainWindow.webContents.send("game-status-update", event.payload);
    }
  },
};

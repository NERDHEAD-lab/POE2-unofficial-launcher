import { AppContext, EventHandler, EventType, MessageEvent } from "../types";

export const RendererBridgeHandler: EventHandler<MessageEvent> = {
  id: "RendererBridgeHandler",
  targetEvent: EventType.MESSAGE_GAME_PROGRESS_INFO,

  condition: (context: AppContext) => {
    return !!context.mainWindow && !context.mainWindow.isDestroyed();
  },

  handle: async (event, context) => {
    const { text } = event.payload;

    // Send IPC message to Main Window (Renderer)
    if (context.mainWindow) {
      context.mainWindow.webContents.send("message-progress", text);
    }
  },
};

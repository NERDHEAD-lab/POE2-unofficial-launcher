import { AppContext, DebugLogEvent, EventHandler, EventType } from "../types";

export const DebugLogHandler: EventHandler<DebugLogEvent> = {
  id: "DebugLogHandler",
  targetEvent: EventType.DEBUG_LOG,
  debug: false,

  handle: async (event: DebugLogEvent, context: AppContext) => {
    // Send to Debug Window if it exists
    if (context.debugWindow && !context.debugWindow.isDestroyed()) {
      context.debugWindow.webContents.send("debug-log", event.payload);
    }
    // Fallback: Also send to Main Window for redundancy (optional)
    if (context.mainWindow && !context.mainWindow.isDestroyed()) {
      context.mainWindow.webContents.send("debug-log", event.payload);
    }
  },
};

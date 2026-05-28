import { AppContext, DebugLogEvent, EventHandler, EventType } from "../types";

export const DebugLogHandler: EventHandler<DebugLogEvent> = {
  id: "DebugLogHandler",
  targetEvent: EventType.DEBUG_LOG,
  debug: false,

  handle: async (event: DebugLogEvent, context: AppContext) => {
    // [Check] Master Switch: Dev Mode & Debug Console
    // Although main process controls window creation, checking here ensures we don't spam IPC if disabled dynamically.
    const isDev = context.getConfig("dev_mode");
    const isDebug = context.getConfig("debug_console");

    if (!isDev || !isDebug) return;

    const payloadWithTimestamp = {
      ...event.payload,
      timestamp: event.timestamp || Date.now(),
    };
    // Send to Debug Window if it exists
    if (
      context.debugWindow &&
      !context.debugWindow.isDestroyed() &&
      !context.debugWindow.webContents.isDestroyed()
    ) {
      context.debugWindow.webContents.send("debug-log", payloadWithTimestamp);
    }
    // Fallback: Also send to Main Window for redundancy (optional)
    if (
      context.mainWindow &&
      !context.mainWindow.isDestroyed() &&
      !context.mainWindow.webContents.isDestroyed()
    ) {
      context.mainWindow.webContents.send("debug-log", payloadWithTimestamp);
    }
  },
};

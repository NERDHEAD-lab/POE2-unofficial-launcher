import {
  AppContext,
  EventHandler,
  EventType,
  ShowChangelogEvent,
} from "../types";

/**
 * Handler to synchronize 'SHOW_CHANGELOG' events to the renderer.
 */
export const ChangelogUISyncHandler: EventHandler<ShowChangelogEvent> = {
  id: "ChangelogUISyncHandler",
  targetEvent: EventType.SHOW_CHANGELOG,

  handle: async (event, context: AppContext) => {
    const { changelogs } = event.payload;

    if (context.mainWindow && !context.mainWindow.isDestroyed()) {
      context.mainWindow.webContents.send("UI:SHOW_CHANGELOG", { changelogs });
    }
  },
};

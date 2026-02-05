import { changelogService } from "../../services/ChangelogService";
import { logger } from "../../utils/logger";
import { eventBus } from "../EventBus";
import {
  AppContext,
  ConfigChangeEvent,
  EventHandler,
  EventType,
} from "../types";

/**
 * Handles 'launcherVersion' config changes.
 * Used to detect updates and fetch changelogs.
 */
export const ChangelogCheckHandler: EventHandler<ConfigChangeEvent> = {
  id: "ChangelogCheckHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) => {
    return event.payload.key === "launcherVersion";
  },

  handle: async (event, _context: AppContext) => {
    const { oldValue, newValue } = event.payload;

    if (
      typeof oldValue === "string" &&
      typeof newValue === "string" &&
      oldValue && // Ensure old value existed (not fresh install)
      newValue
    ) {
      // NOTE: We rely on the fact that this event is only emitted manually in main.ts
      // when a version change is actually detected. But double checking doesn't hurt.
      logger.log(
        `[ChangelogCheckHandler] Version changed: ${oldValue} -> ${newValue}. Fetching changelogs...`,
      );

      const changelogs = await changelogService.fetchChangelogs(
        newValue,
        oldValue,
      );

      if (changelogs.length > 0) {
        logger.log(
          `[ChangelogCheckHandler] Broadcasting SHOW_CHANGELOG with ${changelogs.length} items.`,
        );
        eventBus.emit(EventType.SHOW_CHANGELOG, _context, { changelogs });
      } else {
        logger.log("[ChangelogCheckHandler] No relevant changelogs found.");
      }
    }
  },
};

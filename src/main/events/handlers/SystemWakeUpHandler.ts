import { logger } from "../../utils/logger";
import {
  AppContext,
  EventHandler,
  EventType,
  SystemWakeUpEvent,
} from "../types";

export const SystemWakeUpHandler: EventHandler<SystemWakeUpEvent> = {
  id: "SystemWakeUpHandler",
  targetEvent: EventType.SYSTEM_WAKE_UP,
  handle: async (event: SystemWakeUpEvent, context: AppContext) => {
    const reason = event.payload.reason;
    if (context.processWatcher) {
      context.processWatcher.wakeUp(reason);
    } else {
      logger.warn(
        `[SystemWakeUpHandler] ProcessWatcher service not found in context. Wake up for '${reason}' ignored.`,
      );
    }
  },
};

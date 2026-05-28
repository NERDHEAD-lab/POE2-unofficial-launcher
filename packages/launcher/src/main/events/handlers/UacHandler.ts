import { logger } from "../../utils/logger";
import { SimpleUacBypass } from "../../utils/uac/uac-migration";
import {
  AppContext,
  ConfigChangeEvent,
  EventHandler,
  EventType,
} from "../types";

export const UacHandler: EventHandler<ConfigChangeEvent> = {
  id: "UacHandler",
  targetEvent: EventType.CONFIG_CHANGE,

  condition: (event) => {
    const key = event.payload.key;
    return key === "skipDaumGameStarterUac";
  },

  handle: async (event, _context: AppContext) => {
    const key = event.payload.key;
    const value = event.payload.newValue;

    if (key === "skipDaumGameStarterUac") {
      const enable = value === true;
      logger.log(`[UacHandler] Configuring RUNASINVOKER: ${enable}`);
      await SimpleUacBypass.setRunAsInvoker(enable);
    }
  },
};

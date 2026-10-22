import { newsService } from "../../services/NewsService";
import { ConfigChangeEvent, EventHandler, EventType } from "../types";

import type { AppConfig } from "../../../shared/types";

export const NewsSelectionHandler: EventHandler<ConfigChangeEvent> = {
  id: "NewsSelectionHandler",
  targetEvent: EventType.CONFIG_CHANGE,
  handle: async (event, context) => {
    if (
      event.payload.key !== "activeGame" &&
      event.payload.key !== "serviceChannel"
    )
      return;
    const config = context.getConfig() as AppConfig;
    newsService.setSelectedContext({
      game: config.activeGame,
      service: config.serviceChannel,
    });
  },
};

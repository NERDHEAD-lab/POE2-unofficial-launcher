import {
  EventType,
  type EventHandler,
  type ConfigChangeEvent,
  type ConfigDeleteEvent,
  type PromotionsUpdatedEvent,
  type PromotionDismissEvent,
} from "../types";

import type { EventNotificationService } from "../../services/EventNotificationService";

export const EventNotificationDismissHandler: EventHandler<PromotionDismissEvent> =
  {
    id: "EventNotificationDismissHandler",
    targetEvent: EventType.PROMOTION_DISMISS,
    handle: async (event, context) => {
      const service = context.serviceManager.get<EventNotificationService>(
        "EventNotificationService",
      );
      if (!service) return;
      try {
        service.dismiss(event.payload.request);
        event.payload.result.value = { ok: true };
      } catch {
        event.payload.result.value = { ok: false, reason: "save-failed" };
      }
    },
  };

export const EventNotificationSettingsHandler: EventHandler<ConfigChangeEvent> =
  {
    id: "EventNotificationSettingsHandler",
    targetEvent: EventType.CONFIG_CHANGE,
    handle: async (event, context) => {
      if (event.payload.key === "eventNotifications") {
        context.serviceManager
          .get<EventNotificationService>("EventNotificationService")
          ?.settingsChanged();
      }
    },
  };

export const EventNotificationSettingsDeleteHandler: EventHandler<ConfigDeleteEvent> =
  {
    id: "EventNotificationSettingsDeleteHandler",
    targetEvent: EventType.CONFIG_DELETE,
    handle: async (event, context) => {
      if (event.payload.key === "eventNotifications") {
        context.serviceManager
          .get<EventNotificationService>("EventNotificationService")
          ?.settingsChanged();
      }
    },
  };

export const EventNotificationUISyncHandler: EventHandler<PromotionsUpdatedEvent> =
  {
    id: "EventNotificationUISyncHandler",
    targetEvent: EventType.PROMOTIONS_UPDATED,
    handle: async (event, context) => {
      const window = context.mainWindow;
      if (window && !window.isDestroyed())
        window.webContents.send("promotions:updated", event.payload);
    },
  };

import { ipcMain } from "electron";

import { eventBus } from "../events/EventBus";
import {
  EventType,
  type AppContext,
  type PromotionDismissEvent,
} from "../events/types";

import type { PromotionDismissResult } from "../../shared/promotions";
import type { EventNotificationService } from "../services/EventNotificationService";

export async function dismissPromotion(
  context: AppContext,
  input: unknown,
): Promise<PromotionDismissResult> {
  if (
    !input ||
    typeof input !== "object" ||
    !("key" in input) ||
    !("mode" in input) ||
    typeof input.key !== "string" ||
    !/^[a-z0-9:-]{1,160}$/.test(input.key) ||
    (input.mode !== "session" && input.mode !== "schedule")
  ) {
    return { ok: false, reason: "invalid-request" };
  }
  const result: PromotionDismissEvent["payload"]["result"] = {
    value: { ok: false, reason: "service-unavailable" },
  };
  await eventBus.emit<PromotionDismissEvent>(
    EventType.PROMOTION_DISMISS,
    context,
    {
      request: { key: input.key, mode: input.mode },
      result,
    },
  );
  return result.value;
}

export function registerEventNotificationIpc(context: AppContext): void {
  ipcMain.handle("promotions:dismiss", (_event, request: unknown) =>
    dismissPromotion(context, request),
  );
  ipcMain.handle(
    "promotions:get",
    () =>
      context.serviceManager
        .get<EventNotificationService>("EventNotificationService")
        ?.snapshot() ?? {
        revision: 0,
        events: [],
        activeEvents: [],
        upcomingEvents: [],
      },
  );
}

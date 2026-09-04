import { beforeEach, describe, expect, it, vi } from "vitest";

import { eventBus } from "../events/EventBus";
import { EventNotificationDismissHandler } from "../events/handlers/EventNotificationHandler";
import {
  EventType,
  type AppContext,
  type PromotionDismissEvent,
} from "../events/types";
import { dismissPromotion } from "../ipc/event-notifications";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("../events/EventBus", () => ({ eventBus: { emit: vi.fn() } }));

describe("promotion dismissal acknowledgement", () => {
  const dismiss = vi.fn();
  const context = {
    serviceManager: { get: () => ({ dismiss }) },
  } as unknown as AppContext;
  const request = { key: "stash-sale:both:100:200", mode: "schedule" } as const;
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects malformed requests without emitting a command", async () => {
    for (const input of [
      null,
      {},
      { ...request, mode: "all" },
      { ...request, key: "x".repeat(200) },
    ]) {
      expect(await dismissPromotion(context, input)).toEqual({
        ok: false,
        reason: "invalid-request",
      });
    }
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it("returns failure if no handler acknowledges the command", async () => {
    expect(await dismissPromotion(context, request)).toEqual({
      ok: false,
      reason: "service-unavailable",
    });
  });

  it("acknowledges only after the service succeeds and reports storage failure", async () => {
    vi.mocked(eventBus.emit).mockImplementation(async (_type, ctx, payload) => {
      await EventNotificationDismissHandler.handle(
        { type: EventType.PROMOTION_DISMISS, payload } as PromotionDismissEvent,
        ctx,
      );
    });
    expect(await dismissPromotion(context, request)).toEqual({ ok: true });
    expect(dismiss).toHaveBeenCalledWith(request);
    dismiss.mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(await dismissPromotion(context, request)).toEqual({
      ok: false,
      reason: "save-failed",
    });
  });
});

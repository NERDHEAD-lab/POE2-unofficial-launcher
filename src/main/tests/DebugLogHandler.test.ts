import { describe, expect, it, vi } from "vitest";

import { DebugLogHandler } from "../events/handlers/DebugLogHandler";
import {
  EventType,
  type AppContext,
  type DebugLogEvent,
} from "../events/types";

describe("DebugLogHandler", () => {
  it("preserves the payload occurrence timestamp across EventBus handling", async () => {
    const send = vi.fn();
    const context = {
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send,
        },
      },
      debugWindow: null,
      getConfig: vi.fn(() => false),
    } as unknown as AppContext;
    const occurredAt = new Date(2026, 6, 24, 23, 59, 59, 999).getTime();
    const handledAt = new Date(2026, 6, 25, 0, 0, 0, 1).getTime();
    const event: DebugLogEvent = {
      type: EventType.DEBUG_LOG,
      payload: {
        type: "TEST",
        content: "uncaught midnight error",
        isError: true,
        timestamp: occurredAt,
      },
      timestamp: handledAt,
    };

    await DebugLogHandler.handle(event, context);

    expect(send).toHaveBeenCalledWith(
      "app:exception-log",
      expect.objectContaining({ timestamp: occurredAt }),
    );
  });
});

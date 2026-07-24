import { beforeEach, describe, expect, it, vi } from "vitest";

import { Logger } from "./logger";

describe("renderer Logger", () => {
  const sendDebugLog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        sendDebugLog,
      } as unknown as Window["electronAPI"],
    });
  });

  it("preserves an explicit error occurrence timestamp", () => {
    const occurredAt = new Date(2026, 6, 24, 23, 59, 59, 999).getTime();
    const logger = new Logger({ type: "TEST", useConsole: false });

    logger.errorAt(occurredAt, "renderer fatal");

    expect(sendDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "renderer fatal",
        isError: true,
        timestamp: occurredAt,
      }),
    );
  });
});

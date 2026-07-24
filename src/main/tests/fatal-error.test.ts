import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFatalErrorRecord } from "../fatal-error";
import { logger } from "../utils/logger";

vi.mock("../utils/logger", () => ({
  logger: {
    errorAt: vi.fn(),
  },
}));

describe("createFatalErrorRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses one occurrence timestamp for the fatal payload and log entry", () => {
    const occurredAt = new Date(2026, 6, 24, 23, 59, 59, 999).getTime();
    const record = createFatalErrorRecord(
      new Error("fatal at midnight"),
      "uncaughtException",
      occurredAt,
    );

    expect(record.payload.occurredAt).toBe(occurredAt);
    expect(logger.errorAt).toHaveBeenCalledWith(
      occurredAt,
      expect.stringContaining("fatal at midnight"),
    );
  });
});

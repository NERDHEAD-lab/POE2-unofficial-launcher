import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";
import { logger } from "../utils/logger";

import type { ErrorInfo } from "react";

vi.mock("../utils/logger", () => ({
  logger: {
    errorAt: vi.fn(),
  },
}));

describe("ErrorBoundary", () => {
  it("uses one occurrence timestamp for the renderer log and fatal payload", () => {
    const occurredAt = new Date(2026, 6, 24, 23, 59, 59, 999).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(occurredAt);
    const onFatalError = vi.fn();
    const boundary = new ErrorBoundary({
      children: null,
      onFatalError,
    });

    boundary.componentDidCatch(
      new Error("renderer fatal"),
      { componentStack: "\n  at Test" } as ErrorInfo,
    );

    expect(logger.errorAt).toHaveBeenCalledWith(
      occurredAt,
      "[ErrorBoundary] React Rendering Error caught:",
      expect.any(Error),
      expect.any(Object),
    );
    expect(onFatalError).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt }),
    );
    vi.useRealTimers();
  });
});

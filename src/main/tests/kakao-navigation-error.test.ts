import { describe, expect, it } from "vitest";

import { isExpectedNavigationAbort } from "../kakao/navigation-error";

describe("Kakao navigation errors", () => {
  it.each([
    { code: "ERR_ABORTED" },
    { code: -3 },
    { errno: -3 },
  ])("treats $error as an expected navigation abort", (error) => {
    expect(isExpectedNavigationAbort(error)).toBe(true);
  });

  it.each([
    { code: "ERR_FAILED" },
    { code: -2 },
    { errno: -2 },
    new Error("failed"),
    null,
    undefined,
    "ERR_ABORTED",
    -3,
  ])("does not suppress an unexpected error: $error", (error) => {
    expect(isExpectedNavigationAbort(error)).toBe(false);
  });
});

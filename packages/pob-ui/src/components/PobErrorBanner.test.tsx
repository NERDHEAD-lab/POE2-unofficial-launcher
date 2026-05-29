import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PobErrorBanner } from "./PobErrorBanner";
import { buildPobErrorReport } from "./pobErrorReport";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const render = (element: React.ReactNode): HTMLDivElement => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
};

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe("PobErrorBanner", () => {
  it("builds a compact user-reportable error payload", () => {
    expect(
      buildPobErrorReport({
        message: "EEXIST: file already exists",
        source: "Build save",
        context: { build: "Storm Wave", file: "Storm.xml" },
        timestamp: new Date("2026-05-29T01:02:03.000Z"),
      }),
    ).toBe(
      [
        "PoB Wrapper Error Report",
        "Time: 2026-05-29T01:02:03.000Z",
        "Source: Build save",
        "",
        "Context:",
        "build: Storm Wave",
        "file: Storm.xml",
        "",
        "Message:",
        "EEXIST: file already exists",
      ].join("\n"),
    );
  });

  it("copies the report to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const view = render(
      <PobErrorBanner
        message="Failed to save"
        source="Build save"
        timestamp={new Date("2026-05-29T01:02:03.000Z")}
      />,
    );

    await act(async () => {
      view
        .querySelector<HTMLButtonElement>('button[aria-label="pobError.copy"]')
        ?.click();
    });

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Message:\nFailed to save"),
    );
    expect(view.textContent).toContain("pobError.copySucceeded");
  });

  it("hides unavailable actions and calls dismiss on close", () => {
    const onDismiss = vi.fn();
    const view = render(
      <PobErrorBanner
        message="Action failed"
        copyable={false}
        dismissible
        onDismiss={onDismiss}
      />,
    );

    expect(view.querySelector('button[aria-label="pobError.copy"]')).toBeNull();

    act(() => {
      view
        .querySelector<HTMLButtonElement>(
          'button[aria-label="pobError.dismiss"]',
        )
        ?.click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

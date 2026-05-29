import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { PobToast } from "./PobToast";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const render = (element: React.ReactNode) => {
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
});

describe("PobToast", () => {
  it("renders a window-level status toast without inline titlebar placement", () => {
    const view = render(<PobToast message="구현 예정" visible />);
    const toast = view.querySelector(".pob-window-toast");

    expect(toast?.textContent).toBe("구현 예정");
    expect(toast?.getAttribute("role")).toBe("status");
    expect(toast?.className).toContain("is-visible");
  });

  it("does not reserve space when there is no message", () => {
    const view = render(<PobToast message="" visible />);

    expect(view.querySelector(".pob-window-toast")).toBeNull();
  });
});

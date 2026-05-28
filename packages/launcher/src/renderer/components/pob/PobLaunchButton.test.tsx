import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PobLaunchButton } from "./PobLaunchButton";

describe("PobLaunchButton", () => {
  let container: HTMLDivElement;
  let root: Root;
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    open = vi.fn();

    vi.stubGlobal("electronAPI", {
      pob: {
        open,
        onShowDetectedConfirm: vi.fn(() => undefined),
        onShowInstallerModal: vi.fn(() => undefined),
      },
    } as unknown as Window["electronAPI"]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderButton = (activeGame: "POE1" | "POE2") => {
    act(() => {
      root.render(<PobLaunchButton activeGame={activeGame} />);
    });
  };

  it("uses the decided wrapper label in the launcher menu", () => {
    renderButton("POE2");

    expect(
      container.querySelector(".pob-launch-button-label")?.textContent,
    ).toBe("PoB Unofficial Wrapper");
    expect(
      container.querySelector(".pob-launch-button-beta")?.textContent,
    ).toBe("BETA");
  });

  it("opens the PoB wrapper for the active PoE2 game", () => {
    renderButton("POE2");

    act(() => {
      container
        .querySelector<HTMLElement>(".pob-launch-button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(open).toHaveBeenCalledWith("POE2");
  });

  it("stays hidden outside PoE2", () => {
    renderButton("POE1");

    expect(container.querySelector(".pob-launch-button")).toBeNull();
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { removeLauncherSplashForGamePathDiagnosticQaFixture } from "./game-path-diagnostic-qa-dom";
import { GamePathDiagnosticQaFixture } from "./GamePathDiagnosticQaFixture";
import { parseGamePathDiagnosticQaSearch } from "../../shared/qa/game-path-diagnostic";

const runId = "qa-ms64-12345678";

describe("GamePathDiagnostic QA renderer request", () => {
  it.each(["diagnostic", "selection", "partial", "delete"] as const)(
    "accepts the allowlisted %s fixture",
    (fixtureMode) => {
      expect(
        parseGamePathDiagnosticQaSearch(
          `?codexQaRun=${runId}&codexQaFixture=${fixtureMode}`,
        ),
      ).toEqual({ runId, fixtureMode });
    },
  );

  it.each([
    "?codexQaFixture=outer",
    `?codexQaRun=${runId}`,
    `?codexQaRun=${runId}&codexQaFixture=../../x.html`,
    `?codexQaRun=${runId}&codexQaFixture=diagnostic&script=alert(1)`,
    `?codexQaRun=${runId}&codexQaRun=other&codexQaFixture=diagnostic`,
  ])("rejects non-owned or non-allowlisted query %s", (search) => {
    expect(parseGamePathDiagnosticQaSearch(search)).toBeNull();
  });
});

describe("GamePathDiagnostic QA fixture", () => {
  let container: HTMLDivElement;
  let root: Root;
  let electronApiDescriptor: PropertyDescriptor | undefined;
  let innerWidthDescriptor: PropertyDescriptor | undefined;
  let innerHeightDescriptor: PropertyDescriptor | undefined;
  let previousScale: string;
  let previousScalePriority: string;

  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height,
    });
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    innerWidthDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "innerWidth",
    );
    innerHeightDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "innerHeight",
    );
    previousScale =
      document.documentElement.style.getPropertyValue("--app-scale");
    previousScalePriority =
      document.documentElement.style.getPropertyPriority("--app-scale");
    setViewport(1024, 683);
    electronApiDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "electronAPI",
    );
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: new Proxy(
        {},
        {
          get() {
            throw new Error("QA fixture must not call product Electron APIs");
          },
        },
      ),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.getElementById("launcher-splash")?.remove();
    if (electronApiDescriptor) {
      Object.defineProperty(window, "electronAPI", electronApiDescriptor);
    } else {
      Reflect.deleteProperty(window, "electronAPI");
    }
    if (innerWidthDescriptor) {
      Object.defineProperty(window, "innerWidth", innerWidthDescriptor);
    } else {
      Reflect.deleteProperty(window, "innerWidth");
    }
    if (innerHeightDescriptor) {
      Object.defineProperty(window, "innerHeight", innerHeightDescriptor);
    } else {
      Reflect.deleteProperty(window, "innerHeight");
    }
    if (previousScale) {
      document.documentElement.style.setProperty(
        "--app-scale",
        previousScale,
        previousScalePriority,
      );
    } else {
      document.documentElement.style.removeProperty("--app-scale");
    }
  });

  const renderFixture = async (
    fixtureMode: "diagnostic" | "selection" | "partial" | "delete",
  ) => {
    await act(async () => {
      root.render(
        <GamePathDiagnosticQaFixture mode={fixtureMode} runId={runId} />,
      );
    });
  };

  it("renders the product outer modal with registry first and launcher config second", async () => {
    await renderFixture("diagnostic");

    expect(
      container.querySelector('[data-qa-fixture="diagnostic"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const options = Array.from(
      container.querySelectorAll(".game-path-option-title"),
    ).map((node) => node.textContent);
    expect(options).toEqual(["레지스트리", "런처 내 설정"]);
  });

  it("removes the launcher splash before fixture mount but preserves normal startup ownership", async () => {
    const splash = document.createElement("div");
    splash.id = "launcher-splash";
    document.body.append(splash);

    expect(removeLauncherSplashForGamePathDiagnosticQaFixture(null)).toBe(
      false,
    );
    expect(splash.isConnected).toBe(true);

    const fixtureRequest = parseGamePathDiagnosticQaSearch(
      `?codexQaRun=${runId}&codexQaFixture=diagnostic`,
    );
    expect(
      removeLauncherSplashForGamePathDiagnosticQaFixture(fixtureRequest),
    ).toBe(true);
    await renderFixture("diagnostic");
    expect(document.getElementById("launcher-splash")).toBeNull();
  });

  it("tracks the App viewport scale on mount/resize and restores the previous value", async () => {
    document.documentElement.style.setProperty("--app-scale", "0.5");
    await renderFixture("diagnostic");

    expect(
      Number(document.documentElement.style.getPropertyValue("--app-scale")),
    ).toBeCloseTo(1024 / 1440, 6);

    setViewport(1440, 960);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(
      Number(document.documentElement.style.getPropertyValue("--app-scale")),
    ).toBe(1);

    setViewport(1920, 1080);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(
      Number(document.documentElement.style.getPropertyValue("--app-scale")),
    ).toBe(1.125);

    await act(async () => root.render(<div>fixture closed</div>));
    expect(document.documentElement.style.getPropertyValue("--app-scale")).toBe(
      "0.5",
    );
  });

  it("renders readonly selection context with Main defaults and exact CTA", async () => {
    await renderFixture("selection");

    const dialogs = container.querySelectorAll('[role="dialog"]');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0].getAttribute("aria-modal")).toBeNull();
    expect(dialogs[1].getAttribute("aria-modal")).toBe("true");
    expect(dialogs[1].textContent).toContain("Kakao Games");
    expect(dialogs[1].textContent).toContain("POE2");
    expect(dialogs[1].textContent).toContain("Path of Exile 2");

    const checkboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(checkboxes.map((input) => [input.value, input.checked])).toEqual([
      ["registry-primary", true],
      ["registry-compatibility", false],
      ["config", true],
    ]);
    expect(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "선택 (2개)",
      ),
    ).toBeDefined();
  });

  it("renders cumulative partial results with failed-only retry", async () => {
    await renderFixture("partial");

    expect(container.textContent).toContain("기본 레지스트리적용 완료");
    expect(container.textContent).toContain("호환 레지스트리적용 실패");
    expect(container.textContent).toContain("런처 내 설정변경 없음");
    expect(container.textContent).toContain("실패 항목 다시 시도 (1개)");
  });

  it("renders the exact candidate and path in delete confirmation", async () => {
    await renderFixture("delete");

    const dialog = container.querySelector(
      '[aria-labelledby="game-path-registry-delete-title"]',
    );
    expect(dialog?.textContent).toContain("Kakaogames (기본)");
    expect(dialog?.textContent).toContain(
      String.raw`C:\Games\Kakao Games\Path of Exile 2`,
    );
  });
});

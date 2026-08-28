import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WindowControls from "./WindowControls";

import type {
  DebugLogPayload,
  ElectronAPI,
  OperationalNotification,
} from "../../shared/types";

const warning: OperationalNotification = {
  id: "game-path-registry:Kakao Games:POE2",
  contextKey: "Kakao Games:POE2",
  level: "warn",
  tone: "amber",
  title: "POE2 게임 경로 확인 필요",
  message: "게임은 설치되어 있지만 레지스트리 경로가 없습니다.",
  serviceId: "Kakao Games",
  gameId: "POE2",
  action: "open-game-path-diagnostic",
};

describe("WindowControls notifications", () => {
  let container: HTMLDivElement;
  let root: Root;
  let emitException: ((log: DebugLogPayload) => void) | undefined;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    emitException = undefined;
    window.electronAPI = {
      getDebugHistory: vi.fn().mockResolvedValue([]),
      onExceptionLog: vi.fn((callback) => {
        emitException = callback;
        return vi.fn();
      }),
      minimizeWindow: vi.fn(),
      closeWindow: vi.fn(),
      setConfig: vi.fn(),
    } as unknown as ElectronAPI;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("deduplicates an operational warning and sends its exact context without opening the exception report", async () => {
    const onClick = vi.fn();
    const reportListener = vi.fn();
    window.addEventListener("SHOW_REPORT_MODAL", reportListener);

    await act(async () => {
      root.render(
        <WindowControls
          devMode={false}
          debugConsole={false}
          operationalNotifications={[warning, warning]}
          onOperationalNotificationClick={onClick}
        />,
      );
    });
    await act(async () => Promise.resolve());

    const notificationToggle = container.querySelector<HTMLButtonElement>(
      'button[title="알림 1건 확인"]',
    );
    await act(async () => notificationToggle?.click());
    expect(container.textContent).toContain("알림");
    expect(
      container.querySelectorAll(`[data-notification-id="${warning.id}"]`),
    ).toHaveLength(1);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          `[data-notification-id="${warning.id}"]`,
        )
        ?.click();
    });

    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: "Kakao Games",
        gameId: "POE2",
        action: "open-game-path-diagnostic",
      }),
    );
    expect(reportListener).not.toHaveBeenCalled();
    window.removeEventListener("SHOW_REPORT_MODAL", reportListener);
  });

  it("keeps existing exception notifications alongside the operational warning", async () => {
    await act(async () => {
      root.render(
        <WindowControls
          devMode={false}
          debugConsole={false}
          operationalNotifications={[warning]}
        />,
      );
    });
    await act(async () => {
      emitException?.({
        type: "renderer_exception",
        content: "Unhandled exception\n at App",
        isError: true,
        timestamp: 1,
      });
    });

    expect(
      container.querySelector('button[title="알림 2건 확인"]'),
    ).not.toBeNull();
  });
});

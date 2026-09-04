// @vitest-environment-options {"url":"https://accounts.kakao.com/login"}
import { ipcRenderer } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcRenderer: { send: vi.fn(), invoke: vi.fn(), on: vi.fn() },
}));
vi.mock("../utils/preload-logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const observers: MutationObserver[] = [];
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.body.innerHTML = "";
  const NativeObserver = MutationObserver;
  vi.stubGlobal(
    "MutationObserver",
    class extends NativeObserver {
      constructor(callback: MutationCallback) {
        super(callback);
        observers.push(this);
      }
    },
  );
});
afterEach(() => {
  observers.splice(0).forEach((observer) => observer.disconnect());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([
  [
    "/login",
    '<div class="item_choice"><input type="checkbox" name="saveSignedIn"></div>',
  ],
  [
    "/qr_login",
    '<div class="item_choice"><input id="qr" type="checkbox" name="staySignedIn"><label id="label-staySignedIn" for="qr">유지</label></div>',
  ],
])(
  "keeps observing dynamic login UI after the first match: %s",
  async (path, markup) => {
    window.history.replaceState({}, "", path);
    vi.mocked(ipcRenderer.invoke).mockImplementation(async (channel) =>
      channel === "kakao:get-page-state"
        ? { blocked: false, documentId: 7 }
        : "GAME_START_POE1",
    );
    let ready: (() => Promise<void>) | undefined;
    vi.spyOn(window, "addEventListener").mockImplementation(
      (event, listener) => {
        if (event === "DOMContentLoaded")
          ready = listener as () => Promise<void>;
      },
    );
    await import("../kakao/preload");
    await ready?.();
    document.body.innerHTML = markup;
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector(".launcher-warning-msg")).not.toBeNull();
    document.body.innerHTML = markup;
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector(".launcher-warning-msg")).not.toBeNull();
  },
);

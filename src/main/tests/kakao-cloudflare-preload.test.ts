// @vitest-environment-options {"url":"https://poe.kakaogames.com/"}
import { ipcRenderer } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcRenderer: { send: vi.fn(), invoke: vi.fn(), on: vi.fn() },
}));
vi.mock("../utils/preload-logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function loadPage(trigger: string, blocked: boolean) {
  vi.mocked(ipcRenderer.invoke).mockImplementation(async (channel) => {
    if (channel === "kakao:get-page-state") return { blocked, documentId: 7 };
    if (channel === "account:get-trigger-context") return trigger;
  });
  let ready: (() => Promise<void>) | undefined;
  vi.spyOn(window, "addEventListener").mockImplementation((event, listener) => {
    if (event === "DOMContentLoaded") ready = listener as () => Promise<void>;
  });
  await import("../kakao/preload");
  await ready?.();
  await vi.advanceTimersByTimeAsync(0);
}

describe("Cloudflare preload dispatch", () => {
  it("pauses an existing parent's account observer while a child needs verification", async () => {
    window.history.replaceState({}, "", "/#validateLogin");
    await loadPage("ACCOUNT_VALIDATION", false);
    const paused = vi
      .mocked(ipcRenderer.on)
      .mock.calls.find(([channel]) => channel === "kakao:page-paused")?.[1];
    const resumed = vi
      .mocked(ipcRenderer.on)
      .mock.calls.find(([channel]) => channel === "kakao:page-resumed")?.[1];
    paused?.({} as Electron.IpcRendererEvent);
    await vi.advanceTimersByTimeAsync(20000);
    document.body.innerHTML =
      '<div class="kg-ggb__btn--my-info"><em>fixture</em></div><div id="statusBar"><div class="statusItem loggedInStatus"><div class="profile-link"><a>fixture-account</a></div></div></div>';
    await vi.advanceTimersByTimeAsync(0);
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      "kakao:account-id-fetched",
      "fixture-account",
      7,
    );
    resumed?.({} as Electron.IpcRendererEvent);
    await vi.advanceTimersByTimeAsync(0);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      "kakao:account-id-fetched",
      "fixture-account",
      7,
    );
  });

  it("excludes verification time from an already scheduled login-required delay", async () => {
    window.history.replaceState({}, "", "/login");
    await loadPage("ACCOUNT_VALIDATION", false);
    await vi.advanceTimersByTimeAsync(3000);
    vi.mocked(ipcRenderer.on).mock.calls.find(
      ([channel]) => channel === "kakao:page-paused",
    )?.[1]({} as Electron.IpcRendererEvent);
    await vi.advanceTimersByTimeAsync(20000);
    expect(
      vi
        .mocked(ipcRenderer.send)
        .mock.calls.some(([channel]) => channel === "kakao:login-required"),
    ).toBe(false);
    vi.mocked(ipcRenderer.on).mock.calls.find(
      ([channel]) => channel === "kakao:page-resumed",
    )?.[1]({} as Electron.IpcRendererEvent);
    await vi.advanceTimersByTimeAsync(4999);
    expect(
      vi
        .mocked(ipcRenderer.send)
        .mock.calls.some(([channel]) => channel === "kakao:login-required"),
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(
      vi
        .mocked(ipcRenderer.send)
        .mock.calls.some(([channel]) => channel === "kakao:login-required"),
    ).toBe(true);
  });
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });
  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(11000);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ["GAME_START_POE1", "/#autoStart"],
    ["ACCOUNT_VALIDATION", "/login?__cf_chl_rt_tk=fixture"],
    ["ACCOUNT_MANUAL_LOGIN", "/"],
  ])(
    "defers %s handlers and their timers while challenged",
    async (trigger, path) => {
      window.history.replaceState({}, "", path);
      await loadPage(trigger, true);
      await vi.advanceTimersByTimeAsync(20000);
      expect(ipcRenderer.send).not.toHaveBeenCalled();
    },
  );

  it("runs the original game handler on the next normal document", async () => {
    window.history.replaceState({}, "", "/#autoStart");
    document.body.innerHTML = '<button id="signupButton">시작</button>';
    const clicked = vi.fn();
    document.querySelector("button")!.addEventListener("click", clicked);
    await loadPage("GAME_START_POE1", false);
    expect(clicked).toHaveBeenCalledOnce();
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      "automation:update-timeout",
      10000,
      7,
    );
  });

  it("keeps a normal account validation handler's disabled timeout", async () => {
    window.history.replaceState({}, "", "/#validateLogin");
    await loadPage("ACCOUNT_VALIDATION", false);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      "account:update-timeout",
      -1,
      7,
    );
  });

  it("retries a deferred document when a sibling is verified, without executing twice", async () => {
    window.history.replaceState({}, "", "/#autoStart");
    document.body.innerHTML = '<button id="signupButton">시작</button>';
    const clicked = vi.fn();
    document.querySelector("button")!.addEventListener("click", clicked);
    await loadPage("GAME_START_POE1", true);
    vi.mocked(ipcRenderer.invoke).mockImplementation(async (channel) =>
      channel === "kakao:get-page-state"
        ? { blocked: false, documentId: 7 }
        : "GAME_START_POE1",
    );
    const resume = vi
      .mocked(ipcRenderer.on)
      .mock.calls.find(([channel]) => channel === "kakao:page-resumed")?.[1];
    resume?.({} as Electron.IpcRendererEvent);
    resume?.({} as Electron.IpcRendererEvent);
    await vi.advanceTimersByTimeAsync(0);
    expect(clicked).toHaveBeenCalledOnce();
  });
});

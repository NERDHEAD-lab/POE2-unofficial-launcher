// @vitest-environment-options {"url":"https://security-center.kakaogames.com/auth?code=SECRET#SECRET"}
import { ipcRenderer } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseKakaoDiagnostic } from "../../shared/kakao-diagnostics";
import { logger } from "../utils/preload-logger";

vi.mock("electron", () => ({
  ipcRenderer: { send: vi.fn(), invoke: vi.fn(), on: vi.fn() },
}));
vi.mock("../utils/preload-logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function loadSecurity() {
  vi.mocked(ipcRenderer.invoke).mockImplementation(async (channel) =>
    channel === "kakao:get-page-state"
      ? { blocked: false, documentId: 7 }
      : "GAME_START_POE2",
  );
  let ready: (() => Promise<void>) | undefined;
  vi.spyOn(window, "addEventListener").mockImplementation((event, listener) => {
    if (event === "DOMContentLoaded") ready = listener as () => Promise<void>;
  });
  await import("../kakao/preload");
  await ready?.();
  await vi.advanceTimersByTimeAsync(0);
}
function records() {
  return vi.mocked(logger.log).mock.calls.flatMap(([content]) => {
    const d = typeof content === "string" && parseKakaoDiagnostic(content);
    return d ? [d] : [];
  });
}

describe("Security Center diagnostics preserve automation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = "<p>SECRET unknown page</p>";
  });
  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(11000);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it("logs the unknown page, delayed request and observer timeout without exposing content or changing timings", async () => {
    await loadSecurity();
    expect(records()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "security.state",
          state: "unresolved",
          documentId: 7,
        }),
      ]),
    );
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      "automation:update-timeout",
      -1,
      7,
    );
    await vi.advanceTimersByTimeAsync(7999);
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      "window-visibility-request",
      true,
      7,
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      "window-visibility-request",
      true,
      7,
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(records()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "observer.stopped",
          handler: "SecurityCenterHandler",
          reason: "timeout",
          timeoutMs: 10000,
        }),
      ]),
    );
    expect(JSON.stringify(records())).not.toContain("SECRET");
  });
  it("records PC info and user-required state changes with bounded repeated mutation logs", async () => {
    document.body.innerHTML = '<a ganame="PC정보수집안내_확인_버튼">확인</a>';
    await loadSecurity();
    expect(records()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "security.pc-info-click",
          clicked: true,
        }),
      ]),
    );
    document.body.innerHTML =
      '<input class="device-name__input" value="SECRET" />';
    await vi.advanceTimersByTimeAsync(0);
    expect(records()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "security.state",
          state: "user-required",
        }),
      ]),
    );
    for (let i = 0; i < 100; i++) {
      document.body.appendChild(document.createElement("span"));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(records().length).toBeLessThan(35);
    expect(JSON.stringify(records())).not.toContain("SECRET");
  });
});

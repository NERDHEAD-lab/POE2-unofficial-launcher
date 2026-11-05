// @vitest-environment-options {"url":"https://pathofexile2.kakaogames.com/main#autoStart"}
import { ipcRenderer } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcRenderer: { send: vi.fn(), invoke: vi.fn(), on: vi.fn() },
}));
vi.mock("../utils/preload-logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Current official homepage markup, checked by HTTP GET on 2026-11-05.
const startButton =
  '<button type="button" class="btn_start"><span class="ir_pm">GAME START</span></button>';
const introModal = `
  <div id="layerIntro" class="popup_layer popup_intro on">
    <div class="inner_popup_layer">
      <div class="layer_body"></div>
      <div class="layer_foot">
        <button type="button" class="btn_close"><span class="ico_close">팝업 닫기</span></button>
        <button type="button" class="btn_today">오늘 하루<br>그만보기</button>
      </div>
    </div>
  </div>`;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function loadPage() {
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
}

describe("current Kakao POE2 homepage start flow", () => {
  it("clicks the current homepage start button without timing out", async () => {
    document.body.innerHTML = startButton;
    const started = vi.fn();
    document.querySelector(".btn_start")!.addEventListener("click", started);

    await loadPage();
    await vi.advanceTimersByTimeAsync(11000);

    expect(started).toHaveBeenCalledOnce();
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      "kakao:automation-failure",
      expect.anything(),
      expect.anything(),
    );
  });

  it("dismisses an active intro for today before clicking start", async () => {
    document.body.innerHTML = introModal + startButton;
    const clicked: string[] = [];
    for (const button of document.querySelectorAll("button")) {
      button.addEventListener("click", () => clicked.push(button.className));
    }

    await loadPage();

    expect(clicked).toEqual(["btn_today", "btn_start"]);
  });
});

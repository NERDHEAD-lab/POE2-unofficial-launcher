import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FontManagerModal from "./FontManagerModal";
import { GameStateContext } from "../../contexts/GameStateContext";

import type {
  AppConfig,
  ElectronAPI,
  FontForceApplyPolicy,
  FontForceApplyState,
  FontForceApplyUpdateResult,
  UnifiedFontData,
} from "../../../shared/types";

const defaultFont: UnifiedFontData = {
  id: "DEFAULT",
  alias: "기본 폰트",
  fileName: "",
  originalName: "시스템 기본 폰트",
  createdAt: 0,
  updatedAt: 0,
  appliedServices: [],
  isDefault: true,
};

const policy = (
  kg: boolean | null,
  ggg: boolean | null,
): FontForceApplyPolicy => ({
  state: { "PathOfExile_KG.exe": kg, "PathOfExile.exe": ggg },
  errors: {},
});

describe("FontManagerModal force apply", () => {
  let container: HTMLDivElement;
  let root: Root;
  const applyBatch = vi.fn(async () => undefined);
  const getForceApplyPolicy = vi.fn<() => Promise<FontForceApplyPolicy>>();
  const setForceApplyPolicy =
    vi.fn<(enabled: boolean) => Promise<FontForceApplyUpdateResult>>();
  const syncGameState = vi.fn(async () => undefined);
  const checkbox = () =>
    container.querySelector<HTMLInputElement>(
      'input[aria-label="폰트 강제 적용"]',
    )!;

  const renderModal = async (
    kakaoStatus: "idle" | "running" = "idle",
    gggStatus: "idle" | "running" = "idle",
    options: {
      cache?: FontForceApplyState;
      visible?: boolean;
      otherGameRunning?: boolean;
    } = {},
  ) => {
    await act(async () => {
      root.render(
        <GameStateContext.Provider
          value={{
            gameStatusMap: {},
            getActiveGameState: (gameId, serviceId) => ({
              gameId: gameId as AppConfig["activeGame"],
              serviceId: serviceId as AppConfig["serviceChannel"],
              status:
                options.otherGameRunning && gameId === "POE1"
                  ? "running"
                  : serviceId === "Kakao Games"
                    ? kakaoStatus
                    : gggStatus,
            }),
            syncGameState,
          }}
        >
          <FontManagerModal
            isVisible={options.visible ?? true}
            onClose={vi.fn()}
            gameId="POE2"
            onOpenCatalog={vi.fn()}
            fontForceApplyState={options.cache ?? policy(null, null).state}
          />
        </GameStateContext.Provider>,
      );
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    applyBatch.mockClear();
    syncGameState.mockClear();
    getForceApplyPolicy.mockReset().mockResolvedValue(policy(false, false));
    setForceApplyPolicy.mockReset().mockResolvedValue(policy(true, true));

    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        font: {
          getUnifiedFonts: vi.fn(async () => [defaultFont]),
          onFontUpdated: vi.fn(() => vi.fn()),
          onDownloadProgress: vi.fn(() => vi.fn()),
          applyBatch,
          getForceApplyPolicy,
          setForceApplyPolicy,
        },
      } as unknown as ElectronAPI,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it.each([true, false])(
    "uses the checkbox instead of a redundant status label for enabled=%s",
    async (enabled) => {
      getForceApplyPolicy.mockResolvedValue(policy(enabled, enabled));
      await renderModal();
      expect(checkbox().checked).toBe(enabled);
      expect(container.querySelector(".font-force-apply-status")).toBeNull();
      expect(checkbox().getAttribute("aria-describedby")).toBe(
        "font-force-apply-description",
      );
      expect(
        container
          .querySelector(".font-force-apply-card")
          ?.classList.contains("off"),
      ).toBe(!enabled);
    },
  );

  it("keeps cached OFF styling during a live query without suppressing its notice", async () => {
    getForceApplyPolicy.mockImplementation(() => new Promise(() => {}));
    await renderModal("idle", "idle", { cache: policy(false, false).state });
    expect(
      container
        .querySelector(".font-force-apply-card")
        ?.classList.contains("off"),
    ).toBe(true);
    expect(container.textContent).toContain("확인 중");
    expect(checkbox().getAttribute("aria-describedby")).toContain(
      "font-force-apply-status",
    );
  });

  it("changes both policies independently of font assignments", async () => {
    await renderModal();

    const label = [...container.querySelectorAll("label")].find((candidate) =>
      candidate.textContent?.includes("폰트 강제 적용"),
    );
    const checkbox = label?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const applyButton = container.querySelector<HTMLButtonElement>(
      ".font-main-actions .font-btn.primary",
    );

    expect(label).toBeDefined();
    expect(label?.textContent).toContain("모든 클라이언트");
    expect(label?.textContent).not.toContain("카카오 인게임");
    expect(checkbox?.checked).toBe(false);
    expect(applyButton?.disabled).toBe(true);

    await act(async () => checkbox?.click());

    expect(checkbox?.checked).toBe(true);
    expect(applyButton?.disabled).toBe(true);
    expect(applyBatch).not.toHaveBeenCalled();
    expect(setForceApplyPolicy).toHaveBeenCalledWith(true);
  });

  it.each([
    ["Kakao Games", "running", "idle"],
    ["GGG", "idle", "running"],
  ] as const)(
    "disables the force-apply option while %s is running",
    async (_service, kakaoStatus, gggStatus) => {
      await renderModal(kakaoStatus, gggStatus);

      const checkbox = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"][aria-label="폰트 강제 적용"]',
      );
      const label = checkbox?.closest("label");

      expect(checkbox?.disabled).toBe(true);
      expect(label?.getAttribute("title")).toContain("게임");
    },
  );

  it("shows the cached check immediately while the live query is still pending", async () => {
    let finish!: (result: FontForceApplyPolicy) => void;
    getForceApplyPolicy.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderModal("idle", "idle", { cache: policy(true, true).state });
    expect(checkbox().checked).toBe(true);
    expect(checkbox().disabled).toBe(true);
    expect(container.textContent).toContain("확인 중");
    await act(async () => finish(policy(false, false)));
    expect(checkbox().checked).toBe(false);
    expect(checkbox().disabled).toBe(false);
  });

  it("derives a mixed checkbox from the two cached targets", async () => {
    getForceApplyPolicy.mockResolvedValue(policy(true, false));
    await renderModal("idle", "idle", { cache: policy(true, false).state });
    expect(checkbox().indeterminate).toBe(true);
    expect(
      container
        .querySelector(".font-force-apply-card")
        ?.classList.contains("off"),
    ).toBe(false);
    expect(container.textContent).toContain("설정이 다릅니다");
    await act(async () => checkbox().click());
    expect(setForceApplyPolicy).toHaveBeenCalledWith(true);
    expect(checkbox().checked).toBe(true);
  });

  it("keeps first-use unknown disabled until verification", async () => {
    getForceApplyPolicy.mockImplementation(() => new Promise(() => {}));
    await renderModal();
    expect(checkbox().disabled).toBe(true);
    expect(container.textContent).toContain("확인 중");
    expect(
      container
        .querySelector(".font-force-apply-card")
        ?.classList.contains("off"),
    ).toBe(false);
    await act(async () => checkbox().click());
    expect(setForceApplyPolicy).not.toHaveBeenCalled();
  });

  it("preserves cached ON on read failure and offers a working retry", async () => {
    getForceApplyPolicy.mockRejectedValueOnce(new Error("query blocked"));
    await renderModal("idle", "idle", { cache: policy(true, true).state });
    expect(checkbox().checked).toBe(true);
    expect(checkbox().disabled).toBe(true);
    expect(container.textContent).toContain("확인 실패");
    getForceApplyPolicy.mockResolvedValue(policy(true, true));
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="폰트 정책 다시 확인"]')!
        .click(),
    );
    expect(checkbox().disabled).toBe(false);
  });

  it("blocks edits when one target read failed even though both cached values are known", async () => {
    getForceApplyPolicy.mockResolvedValue({
      ...policy(true, true),
      errors: { "PathOfExile.exe": "failed" },
    });
    await renderModal();
    expect(checkbox().checked).toBe(true);
    expect(checkbox().disabled).toBe(true);
  });

  it("does not optimistically flip the check or permit duplicate writes", async () => {
    let finish!: (result: FontForceApplyUpdateResult) => void;
    setForceApplyPolicy.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderModal();
    await act(async () => {
      checkbox().click();
      checkbox().click();
    });
    expect(setForceApplyPolicy).toHaveBeenCalledTimes(1);
    expect(checkbox().checked).toBe(false);
    expect(checkbox().disabled).toBe(true);
    await act(async () =>
      finish({
        ...policy(false, false),
        cancelled: true,
        error: "관리자 권한 요청 취소",
      }),
    );
    expect(checkbox().checked).toBe(false);
    expect(checkbox().disabled).toBe(false);
    expect(container.textContent).toContain("취소");
  });

  it("shows partial write readback rather than treating it as full success", async () => {
    setForceApplyPolicy.mockResolvedValue({
      ...policy(true, false),
      error: "GGG write failed",
    });
    await renderModal();
    await act(async () => checkbox().click());
    expect(checkbox().indeterminate).toBe(true);
    expect(container.textContent).toContain("변경 실패");
  });

  it("blocks changes while the other game is running", async () => {
    await renderModal("idle", "idle", { otherGameRunning: true });
    expect(checkbox().disabled).toBe(true);
    expect(syncGameState).toHaveBeenCalledWith("POE1", "GGG");
  });

  it("refreshes on reopen and ignores a late response from the previous modal", async () => {
    let finishOld!: (result: FontForceApplyPolicy) => void;
    getForceApplyPolicy
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue(policy(true, true));
    await renderModal();
    await renderModal("idle", "idle", { visible: false });
    await renderModal();
    expect(getForceApplyPolicy).toHaveBeenCalledTimes(2);
    await act(async () => finishOld(policy(false, false)));
    expect(checkbox().checked).toBe(true);
  });
});

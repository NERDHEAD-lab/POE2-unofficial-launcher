import fs from "node:fs";
import path from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GamePathDiagnosticModal from "./GamePathDiagnosticModal";
import { getRegistryRegistrationEligibility } from "../../utils/game-path-registry-registration";

import type {
  GameInstallPathDiagnostics,
  GameInstallPathRegistryCandidateDiagnostic,
  GameInstallPathRegistryTargetDeleteRequest,
  GameInstallPathSelectionBatchResult,
  GameInstallPathSelectionDescriptor,
} from "../../../shared/types";

const configPath = String.raw`C:\Games\Path of Exile 2`;
const primaryRegistryPath = String.raw`HKCU:\Software\Kakaogames\POE2`;
const legacyRegistryPath = String.raw`HKCU:\Software\DaumGames\POE2`;

const selectedPath = String.raw`F:\\Games\\Path of Exile 2`;

const createCandidate = (
  overrides: Partial<GameInstallPathRegistryCandidateDiagnostic>,
): GameInstallPathRegistryCandidateDiagnostic => ({
  targetId: "registry-primary",
  path: null,
  state: "value-missing",
  verification: "not-checked",
  registryPath: primaryRegistryPath,
  registryValueName: "InstallPath",
  isActive: false,
  ...overrides,
});

const createDiagnostics = (
  candidates: GameInstallPathRegistryCandidateDiagnostic[],
  aggregateState: GameInstallPathDiagnostics["registry"]["aggregateState"],
): GameInstallPathDiagnostics => {
  const displayed =
    candidates.find((candidate) => candidate.isActive) ?? candidates[0];
  return {
    serviceId: "Kakao Games",
    gameId: "POE2",
    executableName: "PathOfExile_KG.exe",
    config: {
      source: "config",
      path: configPath,
      state: "found",
      verification: "valid",
    },
    registry: {
      source: "registry",
      path: displayed.path,
      state: displayed.state,
      verification: displayed.verification,
      registryPath: displayed.registryPath,
      registryValueName: displayed.registryValueName,
      aggregateState,
      candidates,
    },
    hasPathConflict: false,
    isPathConflictAcknowledged: false,
    recommendedSource: aggregateState === "valid" ? "registry" : "config",
  };
};

const absentDiagnostics = () =>
  createDiagnostics(
    [
      createCandidate({ state: "key-missing" }),
      createCandidate({
        state: "value-empty",
        targetId: "registry-compatibility",
        registryPath: legacyRegistryPath,
      }),
    ],
    "absent",
  );

const createSelection = (
  overrides: Partial<GameInstallPathSelectionDescriptor> = {},
): GameInstallPathSelectionDescriptor => ({
  selectionId: "selection-1",
  serviceId: "Kakao Games",
  gameId: "POE2",
  path: selectedPath,
  targets: [
    {
      targetId: "registry-primary",
      currentPath: null,
      selectedByDefault: true,
      completed: false,
      disabled: false,
      registryPath: primaryRegistryPath,
      registryValueName: "InstallPath",
    },
    {
      targetId: "registry-compatibility",
      currentPath: null,
      selectedByDefault: false,
      completed: false,
      disabled: false,
      registryPath: legacyRegistryPath,
      registryValueName: "InstallPath",
    },
    {
      targetId: "config",
      currentPath: configPath,
      selectedByDefault: true,
      completed: false,
      disabled: false,
    },
  ],
  ...overrides,
});

describe("GamePathDiagnosticModal registry diagnostics", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderModal = async (
    diagnostics: GameInstallPathDiagnostics,
    overrides: Partial<
      React.ComponentProps<typeof GamePathDiagnosticModal>
    > = {},
  ) => {
    const props: React.ComponentProps<typeof GamePathDiagnosticModal> = {
      isOpen: true,
      mode: "diagnostic",
      serviceId: "Kakao Games",
      gameId: "POE2",
      diagnostics,
      onClose: vi.fn(),
      onContextChange: vi.fn(),
      onUsePath: vi.fn(),
      onClearPath: vi.fn(),
      onManualSelect: vi.fn(),
      onRegistrySyncConfirmClose: vi.fn(),
      onRegistryRegisterRequest: vi.fn(),
      onRegistryRegisterConfirmClose: vi.fn(),
      onKeepLauncherConfig: vi.fn(),
      onSyncRegistry: vi.fn(),
      onConfirmRegisterRegistry: vi.fn(),
      ...overrides,
    };
    await act(async () => root.render(<GamePathDiagnosticModal {...props} />));
    return props;
  };

  it("shows registry key and value name separately with primary and fallback status", async () => {
    const legacyPath = String.raw`D:\Games\Path of Exile 2`;
    const diagnostics = createDiagnostics(
      [
        createCandidate({ state: "key-missing" }),
        createCandidate({
          path: legacyPath,
          state: "found",
          verification: "valid",
          targetId: "registry-compatibility",
          registryPath: legacyRegistryPath,
          isActive: true,
        }),
      ],
      "valid",
    );

    await renderModal(diagnostics);

    const summaryMetadata = [
      ...container.querySelectorAll(
        ".game-path-option-head .game-path-option-meta > div",
      ),
    ].map((line) => line.textContent);
    expect(summaryMetadata).toEqual([
      String.raw`키: HKCU:\Software\DaumGames\POE2`,
      "값 이름: InstallPath",
    ]);
    expect(container.textContent).toContain("Kakaogames (기본)");
    expect(container.textContent).toContain("DaumGames (호환)");
    expect(container.textContent).toContain("호환 경로 사용 중 (fallback)");
    expect(container.textContent).not.toContain(" / InstallPath");
  });

  it("allows registration only when both candidates are confirmed absent", async () => {
    const diagnostics = absentDiagnostics();
    const onRequest = vi.fn();
    const props = await renderModal(diagnostics, {
      onRegistryRegisterRequest: onRequest,
    });

    expect(getRegistryRegistrationEligibility(diagnostics)).toBe("eligible");
    const registerButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("레지스트리에 경로 등록"),
    );
    expect(registerButton?.disabled).toBe(false);
    await act(async () => registerButton?.click());
    expect(onRequest).toHaveBeenCalledTimes(1);

    await renderModal(diagnostics, {
      ...props,
      showRegistryRegisterConfirm: true,
    });
    expect(container.textContent).toContain(primaryRegistryPath);
    expect(container.textContent).toContain("값 이름InstallPath");
    expect(container.textContent).toContain(`등록 경로${configPath}`);
    expect(container.textContent).toContain(
      "DaumGames (호환) 키와 값은 변경하지 않습니다.",
    );
  });

  it("disables registration and explains an unknown registry read", async () => {
    const diagnostics = createDiagnostics(
      [
        createCandidate({ state: "read-failed", error: "access denied" }),
        createCandidate({
          state: "value-missing",
          targetId: "registry-compatibility",
          registryPath: legacyRegistryPath,
        }),
      ],
      "unknown",
    );

    await renderModal(diagnostics);

    expect(getRegistryRegistrationEligibility(diagnostics)).toBe("unknown");
    const registerButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("레지스트리에 경로 등록"),
    );
    expect(registerButton?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "레지스트리 상태를 확인할 수 없어 안전하게 등록할 수 없습니다.",
    );
  });

  it("blocks registration when a candidate contains a nonempty invalid path", async () => {
    const diagnostics = createDiagnostics(
      [
        createCandidate({
          path: String.raw`C:\Broken\Path of Exile 2`,
          state: "found",
          verification: "missing",
        }),
        createCandidate({
          targetId: "registry-compatibility",
          state: "value-missing",
          registryPath: legacyRegistryPath,
        }),
      ],
      "invalid",
    );

    await renderModal(diagnostics);

    expect(getRegistryRegistrationEligibility(diagnostics)).toBe("blocked");
    const registerButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("레지스트리에 경로 등록"),
    );
    expect(registerButton?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "기존 레지스트리 경로값이 있어 새 경로를 등록할 수 없습니다.",
    );
  });

  it("does not close from the backdrop while a path action is busy", async () => {
    const onClose = vi.fn();
    await renderModal(absentDiagnostics(), { busy: true, onClose });

    await act(async () => {
      container
        .querySelector<HTMLDivElement>(".game-path-modal-overlay")
        ?.click();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(
      container
        .querySelector(".game-path-modal-overlay")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
  });

  it("renders fresh canonical diagnostics after a successful registration result", async () => {
    const registeredDiagnostics = createDiagnostics(
      [
        createCandidate({
          path: configPath,
          state: "found",
          verification: "valid",
          isActive: true,
        }),
        createCandidate({
          state: "value-missing",
          targetId: "registry-compatibility",
          registryPath: legacyRegistryPath,
        }),
      ],
      "valid",
    );

    await renderModal(registeredDiagnostics, { registrySaveToastId: 1 });

    expect(container.textContent).toContain("기본 경로 사용 중");
    expect(container.textContent).toContain(
      "레지스트리 게임 경로가 등록되었습니다.",
    );
    expect(container.textContent).not.toContain("레지스트리에 경로 등록");
  });

  it("opens an accessible target dialog with Main-owned defaults and disables zero selection", async () => {
    const onApplyTargets = vi.fn();
    await renderModal(absentDiagnostics(), {
      selection: createSelection(),
      onApplyTargets,
    });

    const outerDialog = container.querySelector(
      '[role="dialog"][aria-labelledby="game-path-diagnostic-title"]',
    );
    const targetDialog = container.querySelector<HTMLElement>(
      '[role="dialog"][aria-labelledby="game-path-target-selection-title"]',
    );
    expect(outerDialog?.getAttribute("aria-modal")).toBeNull();
    expect(targetDialog?.getAttribute("aria-modal")).toBe("true");
    const background = container.querySelector<HTMLElement>(
      ".game-path-modal-background",
    );
    expect(background?.hasAttribute("inert")).toBe(true);
    expect(background?.getAttribute("aria-hidden")).toBe("true");
    expect(background?.contains(targetDialog ?? null)).toBe(false);
    expect(targetDialog?.textContent).toContain("Kakao Games");
    expect(targetDialog?.textContent).toContain("POE2");
    expect(targetDialog?.textContent).toContain(selectedPath);

    const primary = targetDialog?.querySelector<HTMLInputElement>(
      'input[value="registry-primary"]',
    );
    const compatibility = targetDialog?.querySelector<HTMLInputElement>(
      'input[value="registry-compatibility"]',
    );
    const config = targetDialog?.querySelector<HTMLInputElement>(
      'input[value="config"]',
    );
    expect(primary?.checked).toBe(true);
    expect(compatibility?.checked).toBe(false);
    expect(config?.checked).toBe(true);

    const selectButton = [
      ...(targetDialog?.querySelectorAll("button") ?? []),
    ].find((button) => button.textContent?.trim() === "선택 (2개)");
    expect(selectButton?.disabled).toBe(false);

    await act(async () => {
      primary?.click();
      config?.click();
    });
    expect(selectButton?.textContent?.trim()).toBe("선택 (0개)");
    expect(selectButton?.disabled).toBe(true);
    await act(async () => selectButton?.click());
    expect(onApplyTargets).not.toHaveBeenCalled();
  });

  it("does not invent a compatibility target for GGG", async () => {
    await renderModal(absentDiagnostics(), {
      serviceId: "GGG",
      selection: createSelection({
        serviceId: "GGG",
        targets: [
          {
            targetId: "registry-primary",
            currentPath: null,
            selectedByDefault: true,
            completed: false,
            disabled: false,
          },
          {
            targetId: "config",
            currentPath: configPath,
            selectedByDefault: true,
            completed: false,
            disabled: false,
          },
        ],
      }),
    });

    const targetDialog = container.querySelector(
      '[aria-labelledby="game-path-target-selection-title"]',
    );
    expect(
      targetDialog?.querySelector('input[value="registry-compatibility"]'),
    ).toBeNull();
  });

  it("submits only candidate targetId and expectedPath and disables an empty candidate", async () => {
    const primaryPath = String.raw`D:\\Games\\Primary`;
    const diagnostics = createDiagnostics(
      [
        createCandidate({
          path: primaryPath,
          state: "found",
          verification: "valid",
          isActive: true,
        }),
        createCandidate({
          targetId: "registry-compatibility",
          registryPath: legacyRegistryPath,
        }),
      ],
      "valid",
    );
    const onRegistryDeleteRequest = vi.fn();
    const onRegistryDeleteConfirmClose = vi.fn();
    const props = await renderModal(diagnostics, {
      onRegistryDeleteRequest,
      onRegistryDeleteConfirmClose,
    });

    const primaryDelete = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Kakaogames (기본) 레지스트리 값 삭제"]',
    );
    const compatibilityDelete = container.querySelector<HTMLButtonElement>(
      'button[aria-label="DaumGames (호환) 레지스트리 값 삭제"]',
    );
    expect(primaryDelete?.disabled).toBe(false);
    expect(compatibilityDelete?.disabled).toBe(true);
    await act(async () => primaryDelete?.click());
    expect(onRegistryDeleteRequest).toHaveBeenCalledWith({
      targetId: "registry-primary",
      expectedPath: primaryPath,
    });

    const deleteTarget: GameInstallPathRegistryTargetDeleteRequest = {
      targetId: "registry-primary",
      expectedPath: primaryPath,
    };
    primaryDelete?.focus();
    await act(async () =>
      root.render(
        <GamePathDiagnosticModal
          {...props}
          registryDeleteTarget={deleteTarget}
        />,
      ),
    );
    const confirmDialog = container.querySelector(
      '[role="dialog"][aria-labelledby="game-path-registry-delete-title"]',
    );
    expect(confirmDialog?.textContent).toContain("Kakaogames (기본)");
    expect(confirmDialog?.textContent).toContain(primaryPath);
    expect(document.activeElement?.textContent).toContain("취소");
    await act(async () =>
      confirmDialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(onRegistryDeleteConfirmClose).toHaveBeenCalledTimes(1);
  });

  it("shows coherent fresh diagnostics and retries only exact failed target IDs", async () => {
    const freshConfigPath = String.raw`F:\\Games\\Fresh Config`;
    const freshPrimaryPath = String.raw`F:\\Games\\Fresh Primary`;
    const freshDiagnostics = createDiagnostics(
      [
        createCandidate({
          path: freshPrimaryPath,
          state: "found",
          verification: "valid",
          isActive: true,
        }),
        createCandidate({
          targetId: "registry-compatibility",
          registryPath: legacyRegistryPath,
        }),
      ],
      "valid",
    );
    freshDiagnostics.config.path = freshConfigPath;
    const selection = createSelection({
      targets: createSelection().targets.map((target) => ({
        ...target,
        completed:
          target.targetId === "registry-primary" ||
          target.targetId === "config",
        disabled:
          target.targetId === "registry-primary" ||
          target.targetId === "config",
        ...(target.targetId === "registry-primary" ||
        target.targetId === "config"
          ? { disabledReason: "target-completed" as const }
          : {}),
      })),
    });
    const applyResult: GameInstallPathSelectionBatchResult = {
      ok: true,
      overall: "partial",
      results: [
        {
          targetId: "registry-primary",
          status: "applied",
          path: selectedPath,
        },
        {
          targetId: "registry-compatibility",
          status: "failed",
          code: "target-changed",
          retryable: true,
        },
        { targetId: "config", status: "unchanged", path: selectedPath },
      ],
      retryableTargetIds: ["registry-compatibility"],
      diagnostics: freshDiagnostics,
      selection,
    };
    const onApplyTargets = vi.fn();
    await renderModal(freshDiagnostics, {
      selection,
      selectionApplyResult: applyResult,
      onApplyTargets,
    });

    expect(container.textContent).toContain(freshPrimaryPath);
    expect(container.textContent).toContain(freshConfigPath);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toContain(
      "일부 대상에 적용하지 못했습니다.",
    );
    expect(liveRegion?.textContent).toContain("적용 완료");
    expect(liveRegion?.textContent).toContain("변경 없음");
    expect(liveRegion?.textContent).toContain("적용 실패");

    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("실패 항목 다시 시도"),
    );
    await act(async () => retryButton?.click());
    expect(onApplyTargets).toHaveBeenCalledWith(["registry-compatibility"]);
  });

  it("moves focus from the unmounted apply control to retry and then close on result transitions", async () => {
    const selection = createSelection();
    const onCloseSelection = vi.fn();
    const props = await renderModal(absentDiagnostics(), {
      selection,
      onCloseSelection,
    });
    const applyButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "선택 (2개)",
    );
    applyButton?.focus();
    expect(document.activeElement).toBe(applyButton);

    const partialResult: GameInstallPathSelectionBatchResult = {
      ok: true,
      overall: "partial",
      results: [
        {
          targetId: "registry-primary",
          status: "applied",
          path: selectedPath,
        },
        {
          targetId: "config",
          status: "failed",
          code: "target-changed",
          retryable: true,
        },
      ],
      retryableTargetIds: ["config"],
      diagnostics: absentDiagnostics(),
      selection,
    };
    await act(async () =>
      root.render(
        <GamePathDiagnosticModal
          {...props}
          selection={selection}
          selectionApplyResult={partialResult}
        />,
      ),
    );
    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("실패 항목 다시 시도"),
    );
    expect(document.activeElement).toBe(retryButton);

    const successResult: GameInstallPathSelectionBatchResult = {
      ok: true,
      overall: "success",
      results: [
        {
          targetId: "config",
          status: "applied",
          path: selectedPath,
        },
      ],
      retryableTargetIds: [],
      diagnostics: absentDiagnostics(),
      selection,
    };
    await act(async () =>
      root.render(
        <GamePathDiagnosticModal
          {...props}
          selection={selection}
          selectionApplyResult={successResult}
        />,
      ),
    );
    const targetDialog = container.querySelector<HTMLElement>(
      '[aria-labelledby="game-path-target-selection-title"]',
    );
    const closeButton = [
      ...(targetDialog?.querySelectorAll("button") ?? []),
    ].find((button) => button.textContent?.trim() === "닫기");
    expect(document.activeElement).toBe(closeButton);

    await act(async () =>
      targetDialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(onCloseSelection).toHaveBeenCalledTimes(1);
  });

  it("announces apply exceptions inside the active target dialog", async () => {
    await renderModal(absentDiagnostics(), {
      selection: createSelection(),
      errorMessage: "게임 경로를 적용하지 못했습니다. IPC failure",
    });

    const targetDialog = container.querySelector(
      '[aria-labelledby="game-path-target-selection-title"]',
    );
    const alert = targetDialog?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("IPC failure");
    expect(
      container.querySelector(".game-path-modal-background [role=alert]"),
    ).toBeNull();
  });

  it("announces delete exceptions inside the active confirmation dialog", async () => {
    const primaryPath = String.raw`D:\\Games\\Primary`;
    const diagnostics = createDiagnostics(
      [
        createCandidate({
          path: primaryPath,
          state: "found",
          verification: "valid",
          isActive: true,
        }),
      ],
      "valid",
    );
    await renderModal(diagnostics, {
      registryDeleteTarget: {
        targetId: "registry-primary",
        expectedPath: primaryPath,
      },
      errorMessage: "레지스트리 경로값을 삭제하지 못했습니다. IPC failure",
    });

    const deleteDialog = container.querySelector(
      '[aria-labelledby="game-path-registry-delete-title"]',
    );
    expect(
      deleteDialog?.querySelector('[role="alert"]')?.textContent,
    ).toContain("IPC failure");
    expect(
      container.querySelector(".game-path-modal-background [role=alert]"),
    ).toBeNull();
  });

  it("restores focus to the candidate heading when deletion disables the opener", async () => {
    const primaryPath = String.raw`D:\\Games\\Primary`;
    const diagnostics = createDiagnostics(
      [
        createCandidate({
          path: primaryPath,
          state: "found",
          verification: "valid",
          isActive: true,
        }),
      ],
      "valid",
    );
    const props = await renderModal(diagnostics);
    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Kakaogames (기본) 레지스트리 값 삭제"]',
    );
    deleteButton?.focus();
    await act(async () =>
      root.render(
        <GamePathDiagnosticModal
          {...props}
          registryDeleteTarget={{
            targetId: "registry-primary",
            expectedPath: primaryPath,
          }}
        />,
      ),
    );

    const deletedDiagnostics = absentDiagnostics();
    await act(async () => {
      root.render(
        <GamePathDiagnosticModal
          {...props}
          diagnostics={deletedDiagnostics}
          registryDeleteTarget={null}
        />,
      );
      await Promise.resolve();
    });

    const fallbackHeading = container.querySelector<HTMLElement>(
      '[data-registry-candidate-heading="registry-primary"]',
    );
    expect(document.activeElement).toBe(fallbackHeading);
    expect(deleteButton?.disabled).toBe(true);
  });

  it("marks decorative glyphs hidden from assistive technology", async () => {
    await renderModal(absentDiagnostics(), { selection: createSelection() });

    const glyphs = [
      ...container.querySelectorAll<HTMLElement>(".material-symbols-outlined"),
    ];
    expect(glyphs.length).toBeGreaterThan(0);
    expect(
      glyphs.every((glyph) => glyph.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
  });

  it("contains nested scrolling and keeps the candidate delete hit target reasonable", () => {
    const css = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/renderer/components/modals/GamePathDiagnosticModal.css",
      ),
      "utf8",
    );

    expect(css).toMatch(
      /\.game-path-modal-body\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(css).toMatch(
      /\.game-path-target-list,\s*\.game-path-target-results\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(css).toMatch(
      /\.game-path-candidate-delete\s*\{[^}]*(?:min-)?width:\s*(?:40|4[1-9]|[5-9]\d)px[^}]*(?:min-)?height:\s*(?:40|4[1-9]|[5-9]\d)px/s,
    );
  });

  it("focuses and traps the target dialog, closes with Escape, and restores the opener", async () => {
    const onCloseSelection = vi.fn();
    const props = await renderModal(absentDiagnostics(), { onCloseSelection });
    const opener = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("폴더 선택"),
    );
    opener?.focus();

    await act(async () =>
      root.render(
        <GamePathDiagnosticModal {...props} selection={createSelection()} />,
      ),
    );
    const targetDialog = container.querySelector<HTMLElement>(
      '[aria-labelledby="game-path-target-selection-title"]',
    );
    const firstCheckbox = targetDialog?.querySelector<HTMLInputElement>(
      'input[value="registry-primary"]',
    );
    expect(document.activeElement).toBe(firstCheckbox);

    firstCheckbox?.focus();
    await act(async () =>
      targetDialog?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        }),
      ),
    );
    const focusable = [
      ...(targetDialog?.querySelectorAll<HTMLElement>("*") ?? []),
    ].filter((element) =>
      element.matches("button:not(:disabled), input:not(:disabled)"),
    );
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);

    await act(async () =>
      targetDialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(onCloseSelection).toHaveBeenCalledTimes(1);
    await act(async () =>
      root.render(<GamePathDiagnosticModal {...props} selection={null} />),
    );
    expect(document.activeElement).toBe(opener);
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GamePathDiagnosticModal from "./GamePathDiagnosticModal";
import { getRegistryRegistrationEligibility } from "../../utils/game-path-registry-registration";

import type {
  GameInstallPathDiagnostics,
  GameInstallPathRegistryCandidateDiagnostic,
} from "../../../shared/types";

const configPath = String.raw`C:\Games\Path of Exile 2`;
const primaryRegistryPath = String.raw`HKCU:\Software\Kakaogames\POE2`;
const legacyRegistryPath = String.raw`HKCU:\Software\DaumGames\POE2`;

const createCandidate = (
  overrides: Partial<GameInstallPathRegistryCandidateDiagnostic>,
): GameInstallPathRegistryCandidateDiagnostic => ({
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
        registryPath: legacyRegistryPath,
      }),
    ],
    "absent",
  );

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
      onRegistryClearConfirmClose: vi.fn(),
      onRegistryRegisterRequest: vi.fn(),
      onRegistryRegisterConfirmClose: vi.fn(),
      onKeepLauncherConfig: vi.fn(),
      onSyncRegistry: vi.fn(),
      onConfirmClearRegistry: vi.fn(),
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
});

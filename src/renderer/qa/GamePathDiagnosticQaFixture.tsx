import React from "react";

import { type GamePathDiagnosticQaFixtureMode } from "../../shared/qa/game-path-diagnostic";
import GamePathDiagnosticModal from "../components/modals/GamePathDiagnosticModal";

import type {
  GameInstallPathDiagnostics,
  GameInstallPathSelectionDescriptor,
} from "../../shared/types";
import type { GamePathSelectionPresentationResult } from "../utils/game-path-modal-state";

import "./GamePathDiagnosticQaFixture.css";

const selectedPath = String.raw`C:\Games\Kakao Games\Path of Exile 2`;
const compatibilityPath = String.raw`D:\DaumGames\Path of Exile 2`;
const configPath = String.raw`E:\Launcher Settings\Path of Exile 2`;
const primaryRegistryPath = String.raw`HKCU:\Software\Kakaogames\POE2`;
const compatibilityRegistryPath = String.raw`HKCU:\Software\DaumGames\POE2`;

const diagnostics: GameInstallPathDiagnostics = {
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
    path: selectedPath,
    state: "found",
    verification: "valid",
    registryPath: primaryRegistryPath,
    registryValueName: "InstallPath",
    aggregateState: "valid",
    candidates: [
      {
        targetId: "registry-primary",
        path: selectedPath,
        state: "found",
        verification: "valid",
        registryPath: primaryRegistryPath,
        registryValueName: "InstallPath",
        isActive: true,
      },
      {
        targetId: "registry-compatibility",
        path: compatibilityPath,
        state: "found",
        verification: "valid",
        registryPath: compatibilityRegistryPath,
        registryValueName: "InstallPath",
        isActive: false,
      },
    ],
  },
  hasPathConflict: true,
  isPathConflictAcknowledged: false,
  recommendedSource: "registry",
};

const selection: GameInstallPathSelectionDescriptor = {
  selectionId: "qa-static-selection",
  serviceId: "Kakao Games",
  gameId: "POE2",
  path: selectedPath,
  targets: [
    {
      targetId: "registry-primary",
      currentPath: selectedPath,
      selectedByDefault: true,
      completed: false,
      disabled: false,
      registryPath: primaryRegistryPath,
      registryValueName: "InstallPath",
    },
    {
      targetId: "registry-compatibility",
      currentPath: compatibilityPath,
      selectedByDefault: false,
      completed: false,
      disabled: false,
      registryPath: compatibilityRegistryPath,
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
};

const partialResult: GamePathSelectionPresentationResult = {
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
      code: "mutation-failed",
      retryable: true,
    },
    {
      targetId: "config",
      status: "unchanged",
      path: selectedPath,
    },
  ],
  retryableTargetIds: ["registry-compatibility"],
};

const NOOP = () => undefined;

export const GamePathDiagnosticQaFixture: React.FC<{
  readonly mode: GamePathDiagnosticQaFixtureMode;
  readonly runId: string;
}> = ({ mode, runId }) => {
  const showSelection = mode === "selection" || mode === "partial";
  const showDelete = mode === "delete";

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const previousScale = root.style.getPropertyValue("--app-scale");
    const previousPriority = root.style.getPropertyPriority("--app-scale");
    const updateScale = () => {
      root.style.setProperty(
        "--app-scale",
        Math.min(window.innerWidth / 1440, window.innerHeight / 960).toString(),
      );
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      if (previousScale) {
        root.style.setProperty("--app-scale", previousScale, previousPriority);
      } else {
        root.style.removeProperty("--app-scale");
      }
    };
  }, []);

  return (
    <main
      className="game-path-diagnostic-qa-fixture"
      data-qa-fixture={mode}
      data-qa-run-id={runId}
    >
      <div className="game-path-diagnostic-qa-surface" aria-hidden="true">
        <span>MS6.4 Game Path Diagnostic Fixture</span>
      </div>
      <GamePathDiagnosticModal
        isOpen
        mode="diagnostic"
        serviceId="Kakao Games"
        gameId="POE2"
        diagnostics={diagnostics}
        selection={showSelection ? selection : null}
        selectionApplyResult={mode === "partial" ? partialResult : null}
        registryDeleteTarget={
          showDelete
            ? { targetId: "registry-primary", expectedPath: selectedPath }
            : null
        }
        onClose={NOOP}
        onContextChange={NOOP}
        onUsePath={NOOP}
        onClearPath={NOOP}
        onManualSelect={NOOP}
        onApplyTargets={NOOP}
        onCloseSelection={NOOP}
        onRegistryDeleteRequest={NOOP}
        onRegistryDeleteConfirmClose={NOOP}
        onConfirmDeleteRegistryTarget={NOOP}
        onRegistrySyncConfirmClose={NOOP}
        onRegistryRegisterRequest={NOOP}
        onRegistryRegisterConfirmClose={NOOP}
        onKeepLauncherConfig={NOOP}
        onSyncRegistry={NOOP}
        onConfirmRegisterRegistry={NOOP}
      />
    </main>
  );
};

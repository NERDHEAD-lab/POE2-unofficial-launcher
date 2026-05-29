import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_POB_SETTINGS } from "@poe2-launcher/shared/pobSettings";
import type {
  PobSettings,
  PobVaultRefreshSnapshot,
  PobVaultStatusSnapshot,
} from "@poe2-launcher/shared/types";

import iconUrl from "./assets/icon.ico";
import {
  VaultSettingsModal,
  type VaultGenerationsState,
} from "./components/VaultSettingsModal";
import {
  getUnsavedBuildGuard,
  type UnsavedBuildGuard,
} from "./unsavedBuildGuard";
import { BuildEditView } from "./views/BuildEditView";
import { getNextUnnamedBuildName, isSameTarget } from "./views/folderTree";
import { Sidebar } from "./views/Sidebar";
import { DEFAULT_POB_UI_MODE, getNextPobUiMode } from "./views/uiMode";
import {
  buildPobUnimplementedClassName,
  getPobUnimplementedControlAttributes,
} from "./views/unimplementedControls";
import {
  createWrapperLastLocation,
  restoreWrapperLocation,
} from "./wrapperState";

import type { BuildEditViewHandle } from "./views/BuildEditView";
import type { BuildMode } from "./views/buildModes";
import type { BuildTarget, SortKey } from "./views/folderTree";
import type { MainSkillSummaryPanelState } from "./views/mainSkillSummaryPanel";
import type { PobUiMode } from "./views/uiMode";

const LANGS = ["ko", "en"] as const;
type Lang = (typeof LANGS)[number];

const LOCKED_POB_UI_MODES: readonly PobUiMode[] = [];

interface PendingAction {
  kind: "navigate" | "close";
  target?: BuildTarget;
  historyIndex?: number;
  replace?: boolean;
  resetDraft?: boolean;
  saveName: string;
  isDraft: boolean;
}

const INITIAL_TARGET: BuildTarget = { subPath: "", fileName: null };
const HOVER_DEBUG_SELECTOR =
  "[data-pob-debug], [aria-label], [title], button, input, select, textarea, a, [role], [class]";

type VaultRefreshState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ready"; result: PobVaultRefreshSnapshot }
  | { status: "error"; reason: string };

const cleanDebugText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const firstDebugText = (...values: Array<string | null | undefined>): string =>
  values.map(cleanDebugText).find(Boolean) ?? "";

const describeHoverElement = (target: EventTarget | null): string => {
  if (!(target instanceof Element)) return "";
  const element = target.closest(HOVER_DEBUG_SELECTOR) ?? target;
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const className =
    typeof element.className === "string"
      ? element.className
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .map((item) => `.${item}`)
          .join("")
      : "";
  const structuralName = role ? `${tag}[role=${role}]` : `${tag}${className}`;
  const displayName = firstDebugText(
    element.getAttribute("data-pob-debug") ?? undefined,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("name"),
    element.id,
    element.textContent,
  ).slice(0, 80);
  return displayName ? `${structuralName} - ${displayName}` : structuralName;
};

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const editRef = useRef<BuildEditViewHandle>(null);
  const autoRefreshKeyRef = useRef<string | null>(null);
  const [target, setTarget] = useState<BuildTarget>(INITIAL_TARGET);
  const [history, setHistory] = useState<BuildTarget[]>([INITIAL_TARGET]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [activeMode, setActiveMode] = useState<BuildMode>("tree");
  const [uiMode, setUiMode] = useState<PobUiMode>(DEFAULT_POB_UI_MODE);
  const [uiModeNotice, setUiModeNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autosave, setAutosave] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pobSettings, setPobSettings] =
    useState<PobSettings>(DEFAULT_POB_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [refreshToken, setRefreshToken] = useState(0);
  const [draftKey, setDraftKey] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [wrapperStateReady, setWrapperStateReady] = useState(
    () => !window.pobWrapper?.state,
  );
  const [error, setError] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<PobVaultStatusSnapshot | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainSkillSummary, setMainSkillSummary] =
    useState<MainSkillSummaryPanelState>({
      status: "idle",
    });
  const [vaultGenerationsState, setVaultGenerationsState] =
    useState<VaultGenerationsState>({ status: "idle", generations: [] });
  const [vaultRefreshState, setVaultRefreshState] = useState<VaultRefreshState>(
    { status: "idle" },
  );
  const [hoverDebugLabel, setHoverDebugLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    void window.pobAPI?.settings.get().then((settings) => {
      if (cancelled) return;
      setPobSettings(settings);
      setAutosave(settings.autosaveDrafts);
      setSidebarCollapsed(settings.sidebarCollapsed);
      setSettingsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const handlePointerOver = (event: PointerEvent) => {
      const label = describeHoverElement(event.target);
      setHoverDebugLabel((prev) => (prev === label ? prev : label));
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) setHoverDebugLabel("");
    };

    window.addEventListener("pointerover", handlePointerOver, true);
    window.addEventListener("pointerout", handlePointerOut, true);
    return () => {
      window.removeEventListener("pointerover", handlePointerOver, true);
      window.removeEventListener("pointerout", handlePointerOut, true);
    };
  }, []);

  useEffect(() => {
    const wrapperState = window.pobWrapper?.state;
    if (!wrapperState) return;

    let cancelled = false;
    const game = window.pobAPI?.getInitialGame() ?? "POE2";
    void wrapperState
      .getLastLocation()
      .then((location) => {
        if (cancelled) return;
        const restored = restoreWrapperLocation(location, game);
        if (restored) {
          setTarget(restored.target);
          setHistory([restored.target]);
          setHistoryIndex(0);
          setActiveMode(restored.activeMode);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setWrapperStateReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const wrapperState = window.pobWrapper?.state;
    if (!wrapperStateReady || !wrapperState) return;
    const game = window.pobAPI?.getInitialGame() ?? "POE2";
    void wrapperState.setLastLocation(
      createWrapperLastLocation(game, target, activeMode),
    );
  }, [activeMode, target, wrapperStateReady]);

  const reloadVaultStatus = useCallback(() => {
    const api = window.pobAPI;
    if (!api) return;
    void api.vault.status().then((result) => {
      if (result.status !== "ok") return;
      setVaultStatus(result.snapshot);
    });
  }, []);

  useEffect(() => {
    reloadVaultStatus();
  }, [reloadVaultStatus]);

  const reloadVaultGenerations = useCallback(() => {
    const api = window.pobAPI;
    if (!api) {
      setVaultGenerationsState({
        status: "error",
        generations: [],
        reason: "pobAPI unavailable",
      });
      return;
    }

    setVaultGenerationsState({ status: "loading", generations: [] });
    void api.vault.generations().then((result) => {
      if (result.status === "ok") {
        setVaultGenerationsState({
          status: "ready",
          generations: result.generations,
        });
        return;
      }
      setVaultGenerationsState({
        status: "error",
        generations: [],
        reason: result.reason,
      });
    });
  }, []);

  const refreshVault = useCallback(
    (force: boolean) => {
      const api = window.pobAPI;
      if (!api) {
        setVaultRefreshState({
          status: "error",
          reason: "pobAPI unavailable",
        });
        return;
      }

      setVaultRefreshState({ status: "running" });
      void api.vault
        .refresh({
          autoUpdate: pobSettings.autoVaultUpdate,
          generationLimit: pobSettings.vaultGenerationLimit,
          force,
        })
        .then((result) => {
          if (result.status === "ok") {
            setVaultRefreshState({ status: "ready", result: result.result });
            reloadVaultStatus();
            reloadVaultGenerations();
            return;
          }
          setVaultRefreshState({ status: "error", reason: result.reason });
          reloadVaultStatus();
        });
    },
    [pobSettings, reloadVaultGenerations, reloadVaultStatus],
  );

  useEffect(() => {
    if (!settingsLoaded || !pobSettings.autoVaultUpdate || !vaultStatus) return;
    if (vaultStatus.state === "ok" || vaultStatus.state === "not-configured") {
      return;
    }

    const key = [
      vaultStatus.state,
      vaultStatus.active?.version ?? "none",
      vaultStatus.installVersion?.version ?? "none",
    ].join(":");
    if (autoRefreshKeyRef.current === key) return;
    autoRefreshKeyRef.current = key;
    refreshVault(false);
  }, [pobSettings.autoVaultUpdate, refreshVault, settingsLoaded, vaultStatus]);

  const setLang = (lng: Lang) => {
    void i18n.changeLanguage(lng);
  };

  const commitNavigation = useCallback(
    (
      nextTarget: BuildTarget,
      options: {
        historyIndex?: number;
        replace?: boolean;
        resetDraft?: boolean;
      } = {},
    ) => {
      setTarget(nextTarget);
      if (nextTarget.fileName === null && options.resetDraft) {
        setDraftKey((value) => value + 1);
      }

      if (options.historyIndex !== undefined) {
        setHistoryIndex(options.historyIndex);
        return;
      }

      if (options.replace) {
        setHistory((prev) => {
          const next = [...prev];
          next[historyIndex] = nextTarget;
          return next;
        });
        return;
      }

      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        if (isSameTarget(trimmed[trimmed.length - 1], nextTarget)) {
          return trimmed;
        }
        const next = [...trimmed, nextTarget];
        setHistoryIndex(next.length - 1);
        return next;
      });
    },
    [historyIndex],
  );

  const getDraftFileName = useCallback(
    async (subPath: string): Promise<string> => {
      const baseName = t("unnamedBuild.base");
      const result = await window.pobAPI?.builds.list(subPath);
      return getNextUnnamedBuildName(result?.entries ?? [], baseName);
    },
    [t],
  );

  const saveCurrentDraft = useCallback(
    async (fileName: string): Promise<boolean> => {
      const result = await editRef.current?.saveDraftAs(fileName);
      if (!result) {
        setError(t("buildList.error.generic", { reason: "save unavailable" }));
        return false;
      }
      if (result.status === "error") {
        setError(t("buildList.error.generic", { reason: result.reason }));
        return false;
      }
      setError(null);
      setDirty(false);
      setRefreshToken((value) => value + 1);
      return true;
    },
    [t],
  );

  const saveCurrentBuild = useCallback(async (): Promise<boolean> => {
    const result = await editRef.current?.saveCurrent();
    if (!result) {
      setError(t("buildList.error.generic", { reason: "save unavailable" }));
      return false;
    }
    if (result.status === "error") {
      setError(t("buildList.error.generic", { reason: result.reason }));
      return false;
    }
    setError(null);
    setDirty(false);
    setRefreshToken((value) => value + 1);
    return true;
  }, [t]);

  const resolveUnsavedGuard =
    useCallback(async (): Promise<UnsavedBuildGuard | null> => {
      const draftName = target.fileName
        ? ""
        : await getDraftFileName(target.subPath);
      return getUnsavedBuildGuard(dirty, target, draftName);
    }, [dirty, getDraftFileName, target]);

  const saveGuardedBuild = useCallback(
    (guard: UnsavedBuildGuard): Promise<boolean> =>
      guard.isDraft ? saveCurrentDraft(guard.saveName) : saveCurrentBuild(),
    [saveCurrentBuild, saveCurrentDraft],
  );

  const saveActiveBuild = useCallback(async () => {
    const guard = await resolveUnsavedGuard();
    if (!guard) return true;
    return saveGuardedBuild(guard);
  }, [resolveUnsavedGuard, saveGuardedBuild]);

  const requestNavigation = useCallback(
    async (
      nextTarget: BuildTarget,
      options: {
        historyIndex?: number;
        replace?: boolean;
        resetDraft?: boolean;
      } = {},
    ) => {
      const guard = await resolveUnsavedGuard();
      if (!guard) {
        commitNavigation(nextTarget, options);
        return;
      }

      if (autosave) {
        if (await saveGuardedBuild(guard)) {
          commitNavigation(nextTarget, options);
        }
        return;
      }

      setPending({
        kind: "navigate",
        target: nextTarget,
        historyIndex: options.historyIndex,
        replace: options.replace,
        resetDraft: options.resetDraft,
        saveName: guard.saveName,
        isDraft: guard.isDraft,
      });
    },
    [autosave, commitNavigation, resolveUnsavedGuard, saveGuardedBuild],
  );

  const requestClose = useCallback(async () => {
    const guard = await resolveUnsavedGuard();
    if (!guard) {
      window.pobAPI?.closeWindow();
      return;
    }

    if (autosave) {
      if (await saveGuardedBuild(guard)) {
        window.pobAPI?.closeWindow();
      }
      return;
    }

    setPending({
      kind: "close",
      saveName: guard.saveName,
      isDraft: guard.isDraft,
    });
  }, [autosave, resolveUnsavedGuard, saveGuardedBuild]);

  const handlePendingSave = useCallback(async () => {
    if (!pending) return;
    const saved = await saveGuardedBuild(pending);
    if (!saved) return;
    if (pending.kind === "close") {
      setPending(null);
      window.pobAPI?.closeWindow();
      return;
    }
    if (pending.target) {
      commitNavigation(pending.target, {
        historyIndex: pending.historyIndex,
        replace: pending.replace,
        resetDraft: pending.resetDraft,
      });
    }
    setPending(null);
  }, [commitNavigation, pending, saveGuardedBuild]);

  const handlePendingDiscard = useCallback(() => {
    if (!pending) return;
    setDirty(false);
    if (pending.kind === "close") {
      setPending(null);
      window.pobAPI?.closeWindow();
      return;
    }
    if (pending.target) {
      commitNavigation(pending.target, {
        historyIndex: pending.historyIndex,
        replace: pending.replace,
        resetDraft: pending.resetDraft || pending.isDraft,
      });
    }
    setPending(null);
  }, [commitNavigation, pending]);

  const updatePobSettings = useCallback((settings: Partial<PobSettings>) => {
    const api = window.pobAPI;
    if (!api) return;
    void api.settings.set(settings).then((next) => {
      setPobSettings(next);
      setAutosave(next.autosaveDrafts);
      setSidebarCollapsed(next.sidebarCollapsed);
    });
  }, []);

  const handleAutosaveChange = useCallback(
    (enabled: boolean) => {
      setAutosave(enabled);
      updatePobSettings({ autosaveDrafts: enabled });
    },
    [updatePobSettings],
  );

  const handleVaultSettingsChange = useCallback(
    (settings: Partial<PobSettings>) => {
      setPobSettings((prev) => ({ ...prev, ...settings }));
      updatePobSettings(settings);
    },
    [updatePobSettings],
  );

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    reloadVaultGenerations();
  }, [reloadVaultGenerations]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      updatePobSettings({ sidebarCollapsed: next });
      return next;
    });
  }, [updatePobSettings]);

  const handleActiveTargetDeleted = useCallback(
    (nextTarget: BuildTarget) => {
      setDirty(false);
      setPending(null);
      commitNavigation(nextTarget, { resetDraft: true });
      setRefreshToken((value) => value + 1);
    },
    [commitNavigation],
  );

  const handleHistory = useCallback(
    (delta: -1 | 1) => {
      const nextIndex = historyIndex + delta;
      const nextTarget = history[nextIndex];
      if (!nextTarget) return;
      void requestNavigation(nextTarget, { historyIndex: nextIndex });
    },
    [history, historyIndex, requestNavigation],
  );

  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        handleHistory(-1);
      } else if (event.button === 4) {
        event.preventDefault();
        handleHistory(1);
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [handleHistory]);

  const handleNewBuild = useCallback(() => {
    void requestNavigation(
      { subPath: target.subPath, fileName: null },
      { resetDraft: true },
    );
  }, [requestNavigation, target.subPath]);

  const handleSavedAs = useCallback(
    (fileName: string) => {
      setTarget((prev) => ({ ...prev, fileName }));
      setHistory((prev) =>
        prev.map((entry, index) =>
          index === historyIndex ? { ...entry, fileName } : entry,
        ),
      );
      setRefreshToken((value) => value + 1);
    },
    [historyIndex],
  );

  const handleBuildRenamed = useCallback(
    (fileName: string) => {
      setTarget((prev) => ({ ...prev, fileName }));
      setHistory((prev) =>
        prev.map((entry, index) =>
          index === historyIndex ? { ...entry, fileName } : entry,
        ),
      );
      setRefreshToken((value) => value + 1);
    },
    [historyIndex],
  );

  const vaultBadge =
    vaultStatus?.state === "fallback"
      ? {
          className: "pob-titlebar-vault is-warning",
          label: t("vault.status.fallback", {
            version: vaultStatus.active?.version ?? "-",
          }),
          title: t("vault.status.fallbackTitle", {
            activeVersion: vaultStatus.active?.version ?? "-",
            installVersion: vaultStatus.installVersion?.version ?? "-",
          }),
        }
      : vaultStatus?.state === "uninitialized"
        ? {
            className: "pob-titlebar-vault is-pending",
            label: t("vault.status.uninitialized"),
            title: t("vault.status.uninitializedTitle", {
              installVersion: vaultStatus.installVersion?.version ?? "-",
            }),
          }
        : null;

  const nextUiMode = getNextPobUiMode(uiMode);
  const nextUiModeLocked = LOCKED_POB_UI_MODES.includes(nextUiMode);
  const uiModeSwitchClassName = nextUiModeLocked
    ? buildPobUnimplementedClassName(
        uiMode === "renewed" ? "is-renewed" : "is-legacy",
      )
    : uiMode === "renewed"
      ? "is-renewed"
      : "is-legacy";
  const uiModeSwitchAttributes = nextUiModeLocked
    ? getPobUnimplementedControlAttributes("ui-mode.switch")
    : {};
  const handleUiModeToggle = () => {
    if (nextUiModeLocked) {
      setUiModeNotice(
        t("buildEdit.unimplemented.notice", { reason: t("uiMode.disabled") }),
      );
      return;
    }
    setUiModeNotice(null);
    setUiMode(nextUiMode);
  };

  return (
    <div className="pob-app">
      <header className="pob-titlebar">
        <div className="pob-titlebar-left">
          <img src={iconUrl} alt="" className="pob-titlebar-icon" />
          <span className="pob-titlebar-title">{t("app.title")}</span>
          <span className="pob-titlebar-beta">{t("app.beta")}</span>
          {vaultBadge && (
            <span className={vaultBadge.className} title={vaultBadge.title}>
              {vaultBadge.label}
            </span>
          )}
        </div>
        {import.meta.env.DEV && (
          <div
            className="pob-titlebar-hover-debug"
            title={hoverDebugLabel}
            aria-hidden="true"
          >
            {hoverDebugLabel}
          </div>
        )}
        <div className="pob-titlebar-right">
          <div className="pob-ui-mode-stack">
            <div className="pob-ui-mode-switch" aria-label={t("uiMode.label")}>
              <span className="pob-ui-mode-label">{t("uiMode.label")} :</span>
              <span className={uiMode === "legacy" ? "is-active" : ""}>
                {t("uiMode.legacy")}
              </span>
              <button
                {...uiModeSwitchAttributes}
                type="button"
                role="switch"
                aria-checked={uiMode === "renewed"}
                aria-label={t("uiMode.switchLabel")}
                title={
                  nextUiModeLocked
                    ? t("uiMode.disabled")
                    : t("uiMode.switchLabel")
                }
                className={uiModeSwitchClassName}
                onClick={handleUiModeToggle}
              >
                <span aria-hidden="true" />
              </button>
              <span className={uiMode === "renewed" ? "is-active" : ""}>
                {t("uiMode.renewed")}
              </span>
            </div>
            {uiModeNotice && (
              <span className="pob-ui-mode-notice" role="status">
                {uiModeNotice}
              </span>
            )}
          </div>
          <div className="pob-lang">
            <label>{t("lang.label")}:</label>
            <select
              value={i18n.resolvedLanguage ?? "ko"}
              onChange={(event) => setLang(event.target.value as Lang)}
            >
              {LANGS.map((lng) => (
                <option key={lng} value={lng}>
                  {t(`lang.${lng}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            className="pob-titlebar-tool"
            onClick={openSettings}
            title={t("settings.open")}
            aria-label={t("settings.open")}
          >
            &#9881;
          </button>
          <div className="pob-window-controls">
            <button
              className="pob-window-btn"
              onClick={() => window.pobAPI?.minimizeWindow()}
              title={t("window.minimize")}
              aria-label={t("window.minimize")}
            >
              &#8211;
            </button>
            <button
              className="pob-window-btn"
              onClick={() => window.pobAPI?.toggleMaximizeWindow()}
              title={t("window.maximize")}
              aria-label={t("window.maximize")}
            >
              &#9633;
            </button>
            <button
              className="pob-window-btn pob-window-btn-close"
              onClick={() => void requestClose()}
              title={t("window.close")}
              aria-label={t("window.close")}
            >
              &#10005;
            </button>
          </div>
        </div>
      </header>

      <main
        className={
          "pob-app-main" + (sidebarCollapsed ? " sidebar-collapsed" : "")
        }
      >
        <Sidebar
          key={settingsLoaded ? "settings-ready" : "settings-loading"}
          currentPath={target.subPath}
          selectedFile={target.fileName}
          autosave={autosave}
          collapsed={sidebarCollapsed}
          mainSkillSummary={mainSkillSummary}
          settings={pobSettings}
          sortKey={sortKey}
          refreshToken={refreshToken}
          onAutosaveChange={handleAutosaveChange}
          onActiveTargetDeleted={handleActiveTargetDeleted}
          onNewBuild={handleNewBuild}
          onSelect={(nextTarget) => void requestNavigation(nextTarget)}
          onSettingsChange={handleVaultSettingsChange}
          onSortChange={setSortKey}
          onToggleCollapse={toggleSidebar}
        />
        <section className="pob-main-panel">
          {error && <div className="pob-error">{error}</div>}
          <BuildEditView
            ref={editRef}
            subPath={target.subPath}
            fileName={target.fileName}
            draftKey={draftKey}
            activeMode={activeMode}
            dirty={dirty}
            uiMode={uiMode}
            onActiveModeChange={setActiveMode}
            onDirtyChange={setDirty}
            onMainSkillSummaryChange={setMainSkillSummary}
            onRenamed={handleBuildRenamed}
            onSaveRequest={() => void saveActiveBuild()}
            onSavedAs={handleSavedAs}
          />
        </section>
      </main>

      {pending && (
        <div className="pob-modal-overlay" onClick={() => setPending(null)}>
          <div
            className="pob-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{t("dialog.unsaved.title")}</h3>
            <p>{t("dialog.unsaved.body", { name: pending.saveName })}</p>
            <div className="pob-dialog-actions">
              <button
                className="pob-btn"
                onClick={() => void handlePendingSave()}
              >
                {t("dialog.unsaved.save")}
              </button>
              <button className="pob-btn" onClick={handlePendingDiscard}>
                {t("dialog.unsaved.discard")}
              </button>
              <button
                className="pob-btn pob-btn-primary"
                onClick={() => setPending(null)}
              >
                {t("dialog.unsaved.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <VaultSettingsModal
          settings={pobSettings}
          generationsState={vaultGenerationsState}
          refreshState={vaultRefreshState}
          onSettingsChange={handleVaultSettingsChange}
          onReloadGenerations={reloadVaultGenerations}
          onForceRefresh={() => refreshVault(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default App;

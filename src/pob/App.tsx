import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BuildEditView } from "./views/BuildEditView";
import { getNextUnnamedBuildName, isSameTarget } from "./views/folderTree";
import { Sidebar } from "./views/Sidebar";
import iconUrl from "../renderer/assets/icon.ico";

import type { BuildEditViewHandle } from "./views/BuildEditView";
import type { BuildTarget, SortKey } from "./views/folderTree";

const LANGS = ["ko", "en"] as const;
type Lang = (typeof LANGS)[number];

interface PendingAction {
  kind: "navigate" | "close";
  target?: BuildTarget;
  historyIndex?: number;
  replace?: boolean;
  resetDraft?: boolean;
  draftName: string;
}

const INITIAL_TARGET: BuildTarget = { subPath: "", fileName: null };

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const editRef = useRef<BuildEditViewHandle>(null);
  const [target, setTarget] = useState<BuildTarget>(INITIAL_TARGET);
  const [history, setHistory] = useState<BuildTarget[]>([INITIAL_TARGET]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [autosave, setAutosave] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [refreshToken, setRefreshToken] = useState(0);
  const [draftKey, setDraftKey] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.pobAPI?.settings.get().then((settings) => {
      if (cancelled) return;
      setAutosave(settings.autosaveDrafts);
      setSidebarCollapsed(settings.sidebarCollapsed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const needsDraftGuard = dirty && target.fileName === null;

  const requestNavigation = useCallback(
    async (
      nextTarget: BuildTarget,
      options: {
        historyIndex?: number;
        replace?: boolean;
        resetDraft?: boolean;
      } = {},
    ) => {
      if (!needsDraftGuard) {
        commitNavigation(nextTarget, options);
        return;
      }

      const draftName = await getDraftFileName(target.subPath);
      if (autosave) {
        if (await saveCurrentDraft(draftName)) {
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
        draftName,
      });
    },
    [
      autosave,
      commitNavigation,
      getDraftFileName,
      needsDraftGuard,
      saveCurrentDraft,
      target.subPath,
    ],
  );

  const requestClose = useCallback(async () => {
    if (!needsDraftGuard) {
      window.pobAPI?.closeWindow();
      return;
    }

    const draftName = await getDraftFileName(target.subPath);
    if (autosave) {
      if (await saveCurrentDraft(draftName)) {
        window.pobAPI?.closeWindow();
      }
      return;
    }

    setPending({ kind: "close", draftName });
  }, [
    autosave,
    getDraftFileName,
    needsDraftGuard,
    saveCurrentDraft,
    target.subPath,
  ]);

  const handlePendingSave = useCallback(async () => {
    if (!pending) return;
    const saved = await saveCurrentDraft(pending.draftName);
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
  }, [commitNavigation, pending, saveCurrentDraft]);

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
        resetDraft: true,
      });
    }
    setPending(null);
  }, [commitNavigation, pending]);

  const handleAutosaveChange = useCallback((enabled: boolean) => {
    setAutosave(enabled);
    void window.pobAPI?.settings.set({ autosaveDrafts: enabled });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      void window.pobAPI?.settings.set({ sidebarCollapsed: next });
      return next;
    });
  }, []);

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

  const handleSavedAs = useCallback((_fileName: string) => {
    setRefreshToken((value) => value + 1);
  }, []);

  return (
    <div className="pob-app">
      <header className="pob-titlebar">
        <div className="pob-titlebar-left">
          <img src={iconUrl} alt="" className="pob-titlebar-icon" />
          <span className="pob-titlebar-title">{t("app.title")}</span>
          <span className="pob-titlebar-beta">{t("app.beta")}</span>
        </div>
        <div className="pob-titlebar-right">
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
          <div className="pob-window-controls">
            <button
              className="pob-window-btn"
              onClick={() => window.pobAPI?.minimizeWindow()}
              title={t("window.minimize")}
            >
              &#8211;
            </button>
            <button
              className="pob-window-btn pob-window-btn-close"
              onClick={() => void requestClose()}
              title={t("window.close")}
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
          currentPath={target.subPath}
          selectedFile={target.fileName}
          autosave={autosave}
          collapsed={sidebarCollapsed}
          sortKey={sortKey}
          refreshToken={refreshToken}
          onAutosaveChange={handleAutosaveChange}
          onNewBuild={handleNewBuild}
          onSelect={(nextTarget) => void requestNavigation(nextTarget)}
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
            onDirtyChange={setDirty}
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
            <p>{t("dialog.unsaved.body", { name: pending.draftName })}</p>
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
    </div>
  );
};

export default App;

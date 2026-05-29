import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  PobConfigAction,
  PobConfigOption,
  PobRepoeTranslationsSnapshot,
  PobConfigScalar,
  PobConfigSnapshot,
  PobConfigSet,
} from "@poe2-launcher/shared/types";

import {
  readFavoriteIds,
  sortSectionsByFavorites,
  toggleFavoriteId,
  writeFavoriteIds,
} from "./cardFavorites";
import {
  filterConfigSections,
  groupConfigSectionsByColumn,
} from "./configViewSections";
import {
  EMPTY_REPOE_TRANSLATIONS,
  translateConfigSnapshot,
} from "./repoeTranslations";
import { PobErrorBanner } from "../components/PobErrorBanner";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobConfigSnapshot }
  | { status: "error"; reason: string };

type ActionState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; reason: string };

interface ConfigViewProps {
  active: boolean;
  onMutated: () => void;
  translations?: PobRepoeTranslationsSnapshot;
}

const CONFIG_FAVORITES_STORAGE_KEY = "pob.config.sectionFavorites";

const scalarText = (value: PobConfigScalar | undefined): string =>
  value === null || value === undefined ? "" : String(value);

const emptyToUndefined = (value: string): string | undefined =>
  value.trim() ? value.trim() : undefined;

function ConfigOptionRow({
  option,
  busy,
  onChange,
}: {
  option: PobConfigOption;
  busy: boolean;
  onChange: (option: PobConfigOption, value: PobConfigScalar) => void;
}) {
  const label = option.label || option.var || option.id;
  const title = option.tooltip ?? undefined;
  const rowClass =
    "pob-config-option" +
    (option.modified && !option.doNotHighlight ? " is-modified" : "") +
    (option.enabled ? "" : " is-disabled");

  if (option.kind === "label") {
    return (
      <div className="pob-config-option-label-only" title={title}>
        {label}
      </div>
    );
  }

  return (
    <label className={rowClass} title={title}>
      <span className="pob-config-option-label">{label}</span>
      <span className="pob-config-option-control">
        <ConfigControl option={option} busy={busy} onChange={onChange} />
      </span>
    </label>
  );
}

function ConfigControl({
  option,
  busy,
  onChange,
}: {
  option: PobConfigOption;
  busy: boolean;
  onChange: (option: PobConfigOption, value: PobConfigScalar) => void;
}) {
  const disabled = busy || !option.enabled;
  if (option.kind === "check") {
    return (
      <input
        type="checkbox"
        checked={option.value === true}
        disabled={disabled}
        onChange={(event) => onChange(option, event.target.checked)}
      />
    );
  }

  if (option.kind === "list") {
    const selected = option.selectedIndex ?? "";
    return (
      <select
        value={selected}
        disabled={disabled}
        onChange={(event) => {
          const selectedIndex = Number(event.target.value);
          const entry = option.options.find(
            (candidate) => candidate.index === selectedIndex,
          );
          if (entry) onChange(option, entry.value);
        }}
      >
        {selected === "" && (
          <option value="">{scalarText(option.value) || "-"}</option>
        )}
        {option.options.map((entry) => (
          <option key={entry.index} value={entry.index}>
            {entry.label}
          </option>
        ))}
      </select>
    );
  }

  const value = scalarText(option.value);
  const placeholder = scalarText(option.placeholder);
  const submitText = (nextValue: string) => {
    if (nextValue !== value) onChange(option, nextValue);
  };
  if (option.kind === "text" && option.resizable) {
    return (
      <textarea
        key={option.id + ":" + value}
        defaultValue={value}
        placeholder={placeholder}
        disabled={disabled}
        onBlur={(event) => submitText(event.target.value)}
      />
    );
  }

  return (
    <input
      type="text"
      key={option.id + ":" + value}
      defaultValue={value}
      placeholder={placeholder}
      disabled={disabled}
      onBlur={(event) => submitText(event.target.value)}
    />
  );
}

interface ConfigSetManagerProps {
  sets: PobConfigSet[];
  activeSetId: number;
  busy: boolean;
  onClose: () => void;
  onAction: (action: PobConfigAction) => void;
}

function ConfigSetManager({
  sets,
  activeSetId,
  busy,
  onClose,
  onAction,
}: ConfigSetManagerProps) {
  const { t } = useTranslation();
  const [selectedSetId, setSelectedSetId] = useState(activeSetId);
  const selectedSet = sets.find((set) => set.id === selectedSetId) ?? sets[0];
  const [title, setTitle] = useState(selectedSet?.title ?? "");
  const titleValue = emptyToUndefined(title);

  return (
    <div className="pob-config-modal" role="dialog" aria-modal="true">
      <div className="pob-config-modal-panel">
        <h3>{t("buildEdit.config.setManageTitle")}</h3>
        <div className="pob-config-set-manager">
          <ul>
            {sets.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  className={
                    "pob-config-set-row" +
                    (set.id === selectedSetId ? " is-selected" : "")
                  }
                  onClick={() => {
                    setSelectedSetId(set.id);
                    setTitle(set.title);
                  }}
                  onDoubleClick={() =>
                    onAction({ type: "setActiveConfigSet", setId: set.id })
                  }
                >
                  <span>{set.title || t("buildEdit.config.defaultSet")}</span>
                  {set.id === activeSetId && (
                    <em>{t("buildEdit.config.setCurrent")}</em>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="pob-config-set-editor">
            <label>
              <span>{t("buildEdit.config.setName")}</span>
              <input
                type="text"
                value={title}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div className="pob-config-set-actions">
              <button
                type="button"
                className="pob-button"
                disabled={busy || !titleValue}
                onClick={() =>
                  onAction({ type: "newConfigSet", title: title.trim() })
                }
              >
                {t("buildEdit.config.setNew")}
              </button>
              <button
                type="button"
                className="pob-button"
                disabled={busy || !selectedSet || !titleValue}
                onClick={() => {
                  if (!selectedSet) return;
                  onAction({
                    type: "copyConfigSet",
                    setId: selectedSet.id,
                    title: title.trim(),
                  });
                }}
              >
                {t("buildEdit.config.setCopy")}
              </button>
              <button
                type="button"
                className="pob-button"
                disabled={busy || !selectedSet || !titleValue}
                onClick={() => {
                  if (!selectedSet) return;
                  onAction({
                    type: "renameConfigSet",
                    setId: selectedSet.id,
                    title: title.trim(),
                  });
                }}
              >
                {t("buildEdit.config.setRename")}
              </button>
              <button
                type="button"
                className="pob-button pob-btn-danger"
                disabled={busy || !selectedSet || sets.length <= 1}
                onClick={() => {
                  if (!selectedSet) return;
                  onAction({
                    type: "deleteConfigSet",
                    setId: selectedSet.id,
                  });
                }}
              >
                {t("buildEdit.config.setDelete")}
              </button>
            </div>
          </div>
        </div>
        <div className="pob-config-modal-actions">
          <button type="button" className="pob-button" onClick={onClose}>
            {t("buildEdit.config.setDone")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfigView({
  active,
  onMutated,
  translations = EMPTY_REPOE_TRANSLATIONS,
}: ConfigViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [search, setSearch] = useState("");
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });
  const [manageOpen, setManageOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() =>
    readFavoriteIds(CONFIG_FAVORITES_STORAGE_KEY),
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const fetchSnapshot = async () => {
      const api = window.pobAPI;
      if (!api) {
        if (!cancelled) {
          setState({ status: "error", reason: "pobAPI unavailable" });
        }
        return;
      }
      setState({ status: "loading" });
      const result = await api.session.configSnapshot();
      if (cancelled) return;
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
        setSearch(result.snapshot.search);
      } else {
        setState({ status: "error", reason: result.reason });
      }
    };

    void fetchSnapshot();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const sourceSnapshot = state.status === "ready" ? state.snapshot : null;
  const snapshot = useMemo(
    () =>
      sourceSnapshot === null
        ? null
        : translateConfigSnapshot(sourceSnapshot, translations),
    [sourceSnapshot, translations],
  );
  const busy = actionState.status === "running";
  const filteredSections = useMemo(
    () =>
      snapshot
        ? sortSectionsByFavorites(
            filterConfigSections(snapshot.sections, search),
            favoriteIds,
          )
        : [],
    [snapshot, search, favoriteIds],
  );
  const columns = useMemo(
    () => groupConfigSectionsByColumn(filteredSections, 3),
    [filteredSections],
  );

  const runAction = async (
    action: PobConfigAction,
    dirty = true,
  ): Promise<void> => {
    const api = window.pobAPI;
    if (!api) {
      setActionState({ status: "error", reason: "pobAPI unavailable" });
      return;
    }

    setActionState({ status: "running" });
    const result = await api.session.configAction(action);
    if (result.status === "ok") {
      setState({ status: "ready", snapshot: result.snapshot });
      setSearch(result.snapshot.search);
      setActionState({ status: "idle" });
      if (dirty) onMutated();
    } else {
      setActionState({ status: "error", reason: result.reason });
    }
  };

  const submitSearch = (): void => {
    if (snapshot && search !== snapshot.search) {
      void runAction({ type: "setSearch", value: search }, false);
    }
  };

  const handleOptionChange = (
    option: PobConfigOption,
    value: PobConfigScalar,
  ): void => {
    if (!option.var) return;
    void runAction({ type: "setOption", var: option.var, value });
  };

  const handleFavoriteToggle = useCallback((sectionId: string) => {
    setFavoriteIds((prev) => {
      const next = toggleFavoriteId(prev, sectionId);
      writeFavoriteIds(CONFIG_FAVORITES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  if (state.status === "error") {
    return (
      <PobErrorBanner
        message={t("buildList.error.generic", { reason: state.reason })}
        source="Configuration"
      />
    );
  }

  if (state.status === "idle" || state.status === "loading" || !snapshot) {
    return (
      <p className="pob-mode-placeholder-body">
        {t("buildEdit.config.loading")}
      </p>
    );
  }

  return (
    <div className="pob-config">
      <div className="pob-config-toolbar">
        <label className="pob-config-set">
          <span>{t("buildEdit.config.setLabel")}</span>
          <select
            value={snapshot.activeConfigSetId}
            disabled={busy || snapshot.configSets.length <= 1}
            onChange={(event) =>
              void runAction({
                type: "setActiveConfigSet",
                setId: Number(event.target.value),
              })
            }
          >
            {snapshot.configSets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="pob-config-manage"
          disabled={busy}
          onClick={() => setManageOpen(true)}
        >
          {t("buildEdit.config.setManage")}
        </button>
        <input
          type="search"
          className="pob-config-search"
          placeholder={t("buildEdit.config.search.placeholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onBlur={submitSearch}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitSearch();
          }}
        />
        <label className="pob-config-show-all">
          <input
            type="checkbox"
            checked={snapshot.showAll}
            disabled={busy}
            onChange={(event) =>
              void runAction(
                { type: "setShowAll", value: event.target.checked },
                false,
              )
            }
          />
          <span>
            {t(
              snapshot.showAll
                ? "buildEdit.config.hideAll"
                : "buildEdit.config.showAll",
            )}
          </span>
        </label>
      </div>

      {actionState.status === "error" && (
        <PobErrorBanner
          className="pob-config-action-error"
          message={t("buildList.error.generic", {
            reason: actionState.reason,
          })}
          source="Configuration action"
          dismissible
          onDismiss={() => setActionState({ status: "idle" })}
        />
      )}

      {filteredSections.length === 0 ? (
        <p className="pob-mode-placeholder-body">
          {t("buildEdit.config.empty")}
        </p>
      ) : (
        <div className="pob-config-columns">
          {columns.map((sections, columnIndex) => (
            <div className="pob-config-column" key={columnIndex}>
              {sections.map((section) => (
                <article className="pob-config-section" key={section.id}>
                  <header className="pob-config-section-header">
                    <h3>{section.label}</h3>
                    <span className="pob-config-section-tools">
                      <button
                        type="button"
                        className={
                          "pob-card-favorite" +
                          (favoriteIds.has(section.id) ? " is-active" : "")
                        }
                        aria-label={
                          favoriteIds.has(section.id)
                            ? t("buildEdit.card.unfavorite")
                            : t("buildEdit.card.favorite")
                        }
                        aria-pressed={favoriteIds.has(section.id)}
                        title={
                          favoriteIds.has(section.id)
                            ? t("buildEdit.card.unfavorite")
                            : t("buildEdit.card.favorite")
                        }
                        onClick={() => handleFavoriteToggle(section.id)}
                      >
                        <span
                          className="material-symbols-outlined"
                          aria-hidden="true"
                        >
                          {favoriteIds.has(section.id)
                            ? "star"
                            : "star_outline"}
                        </span>
                      </button>
                      <span className="pob-config-section-count">
                        {section.options.length}
                      </span>
                    </span>
                  </header>
                  <div className="pob-config-section-body">
                    {section.options.map((option) => (
                      <ConfigOptionRow
                        option={option}
                        busy={busy}
                        onChange={handleOptionChange}
                        key={option.id}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )}

      {manageOpen && (
        <ConfigSetManager
          sets={snapshot.configSets}
          activeSetId={snapshot.activeConfigSetId}
          busy={busy}
          onClose={() => setManageOpen(false)}
          onAction={(action) => void runAction(action)}
        />
      )}
    </div>
  );
}

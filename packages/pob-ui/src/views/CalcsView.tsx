import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  PobCalcsAction,
  PobCalcsBreakdown,
  PobCalcsColour,
  PobCalcsRow,
  PobCalcsSection,
  PobCalcsSkillSelect,
  PobCalcsSnapshot,
  PobCalcsSummary,
} from "@poe2-launcher/shared/types";

import {
  displayCalcsCellText,
  distributeSectionsIntoColumns,
  filterSections,
  type CalcsGroupFilter,
} from "./calcsViewSections";
import {
  readFavoriteIds,
  sortSectionsByFavorites,
  toggleFavoriteId,
  writeFavoriteIds,
} from "./cardFavorites";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobCalcsSnapshot }
  | { status: "error"; reason: string };

type ActionState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; reason: string };

type BreakdownState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; pinned: boolean; data: PobCalcsBreakdown }
  | { status: "error"; key: string; pinned: boolean; reason: string };

interface CalcsViewProps {
  active: boolean;
  onMutated?: () => void;
}

const CALCS_FAVORITES_STORAGE_KEY = "pob.calcs.sectionFavorites";

const GROUP_FILTER_KEYS: CalcsGroupFilter[] = [
  "all",
  "offence",
  "resources",
  "defence",
];

const colourClass = (colour: PobCalcsColour | null): string =>
  colour ? ` is-colour-${colour.toLowerCase()}` : "";

const formatStat = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "-";
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString();
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
};

interface SummaryStripProps {
  summary: PobCalcsSummary;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function SummaryStrip({ summary, t }: SummaryStripProps) {
  return (
    <div className="pob-calcs-summary" role="group">
      <div className="pob-calcs-summary-item">
        <span>{t("buildEdit.calcs.summary.combinedDPS")}</span>
        <strong>{formatStat(summary.combinedDPS)}</strong>
      </div>
      <div className="pob-calcs-summary-item">
        <span>{t("buildEdit.calcs.summary.fullDPS")}</span>
        <strong>{formatStat(summary.fullDPS)}</strong>
      </div>
      <div className="pob-calcs-summary-item">
        <span>{t("buildEdit.calcs.summary.ehp")}</span>
        <strong>{formatStat(summary.totalEHP)}</strong>
      </div>
      <div className="pob-calcs-summary-item">
        <span>{t("buildEdit.calcs.summary.life")}</span>
        <strong>{formatStat(summary.life)}</strong>
      </div>
      <div className="pob-calcs-summary-item">
        <span>{t("buildEdit.calcs.summary.es")}</span>
        <strong>{formatStat(summary.energyShield)}</strong>
      </div>
      <div className="pob-calcs-summary-item">
        <span>{t("buildEdit.calcs.summary.mana")}</span>
        <strong>{formatStat(summary.mana)}</strong>
      </div>
    </div>
  );
}

interface SkillSelectCardProps {
  data: PobCalcsSkillSelect;
  busy: boolean;
  onAction: (action: PobCalcsAction) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function SkillSelectCard({ data, busy, onAction, t }: SkillSelectCardProps) {
  const renderDropdown = (
    field: PobCalcsSkillSelect["socketGroup"],
    labelKey: string,
    onChange: (value: number) => void,
  ) => {
    if (field.shown === false) return null;
    return (
      <label className="pob-calcs-skillselect-row">
        <span>{t(labelKey)}</span>
        <select
          value={field.selected ?? 0}
          disabled={busy || field.enabled === false}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {field.options.map((opt) => (
            <option key={opt.index} value={opt.index}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <article className="pob-calcs-card pob-calcs-skillselect">
      <header className="pob-calcs-card-header is-colour-normal">
        <h3>{t("buildEdit.calcs.skillSelect.title")}</h3>
      </header>
      <div className="pob-calcs-card-body">
        {renderDropdown(
          data.socketGroup,
          "buildEdit.calcs.skillSelect.socketGroup",
          (value) => onAction({ type: "setSkillNumber", value }),
        )}
        {renderDropdown(
          data.mainSkill,
          "buildEdit.calcs.skillSelect.activeSkill",
          (value) => onAction({ type: "setMainActiveSkill", value }),
        )}
        {renderDropdown(
          data.statSet,
          "buildEdit.calcs.skillSelect.statSet",
          (value) => onAction({ type: "setStatSet", value }),
        )}
        {renderDropdown(
          data.skillPart,
          "buildEdit.calcs.skillSelect.skillPart",
          (value) => onAction({ type: "setSkillPart", value }),
        )}
        {data.skillStages.shown && (
          <label className="pob-calcs-skillselect-row">
            <span>{t("buildEdit.calcs.skillSelect.skillStages")}</span>
            <input
              type="text"
              value={data.skillStages.value ?? ""}
              disabled={busy}
              onChange={(e) =>
                onAction({ type: "setSkillStages", value: e.target.value })
              }
            />
          </label>
        )}
        {data.mineCount.shown && (
          <label className="pob-calcs-skillselect-row">
            <span>{t("buildEdit.calcs.skillSelect.mines")}</span>
            <input
              type="text"
              value={data.mineCount.value ?? ""}
              disabled={busy}
              onChange={(e) =>
                onAction({ type: "setMines", value: e.target.value })
              }
            />
          </label>
        )}
        <label className="pob-calcs-skillselect-row">
          <span>{t("buildEdit.calcs.skillSelect.buffMode")}</span>
          <select
            value={data.buffMode}
            disabled={busy}
            onChange={(e) =>
              onAction({
                type: "setBuffMode",
                value: e.target.value as PobCalcsSkillSelect["buffMode"],
              })
            }
          >
            {data.buffModeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(
                  `buildEdit.calcs.skillSelect.buffModeOptions.${opt.value.toLowerCase()}`,
                )}
              </option>
            ))}
          </select>
        </label>
        {data.showMinionShown && (
          <label className="pob-calcs-skillselect-row">
            <span>{t("buildEdit.calcs.skillSelect.showMinion")}</span>
            <input
              type="checkbox"
              checked={data.showMinion}
              disabled={busy}
              onChange={(e) =>
                onAction({ type: "setShowMinion", value: e.target.checked })
              }
            />
          </label>
        )}
        {renderDropdown(
          data.minion,
          "buildEdit.calcs.skillSelect.minion",
          (value) => onAction({ type: "setMinion", value }),
        )}
        {data.spectreLibrary.shown && (
          <label className="pob-calcs-skillselect-row">
            <span>{t("buildEdit.calcs.skillSelect.spectreLibrary")}</span>
            <button type="button" disabled>
              {data.spectreLibrary.label}
            </button>
          </label>
        )}
        {data.beastLibrary.shown && (
          <label className="pob-calcs-skillselect-row">
            <span>{t("buildEdit.calcs.skillSelect.beastLibrary")}</span>
            <button type="button" disabled>
              {data.beastLibrary.label}
            </button>
          </label>
        )}
        {renderDropdown(
          data.minionSkill,
          "buildEdit.calcs.skillSelect.minionSkill",
          (value) => onAction({ type: "setMinionSkill", value }),
        )}
        {data.minionSkillStatSet.shown && (
          <label className="pob-calcs-skillselect-row">
            <span>{t("buildEdit.calcs.skillSelect.minionSkillStatSet")}</span>
            <select
              value={data.minionSkillStatSet.selected ?? 0}
              disabled={busy}
              onChange={(e) =>
                onAction({
                  type: "setMinionSkillStatSet",
                  value: Number(e.target.value),
                })
              }
            >
              {data.minionSkillStatSet.options.map((opt) => (
                <option key={opt.index} value={opt.index}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </article>
  );
}

interface SectionCardProps {
  section: PobCalcsSection;
  favorite: boolean;
  activeBreakdownKey: string | null;
  onFavoriteToggle: (sectionId: string) => void;
  onSubsectionToggle: (sectionId: string, subSectionId: string) => void;
  onCellHover: (key: string | null) => void;
  onCellClick: (key: string) => void;
  cardRef?: (node: HTMLDivElement | null) => void;
}

function SectionCard({
  section,
  favorite,
  activeBreakdownKey,
  onFavoriteToggle,
  onSubsectionToggle,
  onCellHover,
  onCellClick,
  cardRef,
}: SectionCardProps) {
  const { t } = useTranslation();
  const favoriteLabel = favorite
    ? t("buildEdit.card.unfavorite")
    : t("buildEdit.card.favorite");

  return (
    <article
      ref={cardRef as never}
      className={"pob-calcs-card" + colourClass(section.colour)}
    >
      {section.subSections.map((sub, idx) => (
        <div key={sub.id || idx} className="pob-calcs-subsection">
          <header
            className={"pob-calcs-card-header" + colourClass(section.colour)}
          >
            <h3>{sub.label}</h3>
            <span className="pob-calcs-subsection-tools">
              {idx === 0 && (
                <button
                  type="button"
                  className={
                    "pob-card-favorite" + (favorite ? " is-active" : "")
                  }
                  aria-label={favoriteLabel}
                  aria-pressed={favorite}
                  title={favoriteLabel}
                  onClick={() => onFavoriteToggle(section.id)}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    {favorite ? "star" : "star_outline"}
                  </span>
                </button>
              )}
              {sub.extra && (
                <span className="pob-calcs-subsection-extra">{sub.extra}</span>
              )}
              <button
                type="button"
                className="pob-calcs-collapse-toggle"
                aria-expanded={!sub.collapsed}
                onClick={() => onSubsectionToggle(section.id, sub.id)}
              >
                {sub.collapsed ? "+" : "−"}
              </button>
            </span>
          </header>
          {!sub.collapsed && sub.rows.length > 0 && (
            <table className="pob-calcs-table">
              <tbody>
                {sub.rows.map((row, rowIdx) => (
                  <CalcsRowView
                    key={rowIdx}
                    row={row}
                    activeBreakdownKey={activeBreakdownKey}
                    onCellHover={onCellHover}
                    onCellClick={onCellClick}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </article>
  );
}

interface CalcsMasonryProps {
  sections: PobCalcsSection[];
  favoriteIds: ReadonlySet<string>;
  activeBreakdownKey: string | null;
  onFavoriteToggle: (sectionId: string) => void;
  onSubsectionToggle: (sectionId: string, subSectionId: string) => void;
  onCellHover: (key: string | null) => void;
  onCellClick: (key: string) => void;
}

const MIN_COL_WIDTH = 280;
const MAX_COLS = 3;

function CalcsMasonry({
  sections,
  favoriteIds,
  activeBreakdownKey,
  onFavoriteToggle,
  onSubsectionToggle,
  onCellHover,
  onCellClick,
}: CalcsMasonryProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [columnCount, setColumnCount] = useState(MAX_COLS);
  const [layout, setLayout] = useState<string[][]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const next = Math.max(
        1,
        Math.min(MAX_COLS, Math.floor(width / MIN_COL_WIDTH)),
      );
      setColumnCount(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rebalance = useCallback(() => {
    const sectionIds = sections.map((s) => s.id);
    const heights = new Map<string, number>();
    for (const id of sectionIds) {
      const node = cardRefs.current.get(id);
      heights.set(id, node ? node.offsetHeight + 12 : 1);
    }
    const cols = distributeSectionsIntoColumns(sections, heights, columnCount);
    setLayout((prev) => {
      if (
        prev.length === cols.length &&
        prev.every(
          (col, i) =>
            col.length === cols[i].length &&
            col.every((id, j) => id === cols[i][j]),
        )
      ) {
        return prev;
      }
      return cols;
    });
  }, [sections, columnCount]);

  useEffect(() => {
    // Measure-then-layout: rebalance reads DOM heights then writes column
    // assignments. Reading inside effect is required.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    rebalance();
  }, [rebalance]);

  useEffect(() => {
    const ro = new ResizeObserver(() => rebalance());
    for (const node of cardRefs.current.values()) ro.observe(node);
    return () => ro.disconnect();
  }, [rebalance, sections]);

  const registerCard = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (node) {
        cardRefs.current.set(id, node);
      } else {
        cardRefs.current.delete(id);
      }
    },
    [],
  );

  const renderedSections = (
    <>
      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          favorite={favoriteIds.has(section.id)}
          activeBreakdownKey={activeBreakdownKey}
          onFavoriteToggle={onFavoriteToggle}
          onSubsectionToggle={onSubsectionToggle}
          onCellHover={onCellHover}
          onCellClick={onCellClick}
          cardRef={registerCard(section.id)}
        />
      ))}
    </>
  );

  // First paint: render all cards inside a single hidden measurement track so
  // refs populate and we know heights. From the second render onwards we
  // place them into the computed columns.
  const layoutIds = layout.flat();
  const sectionIdSet = new Set(sections.map((section) => section.id));
  const layoutMatchesSections =
    layoutIds.length === sections.length &&
    layoutIds.every((id) => sectionIdSet.has(id));
  if (layout.length === 0 || !layoutMatchesSections) {
    return (
      <div ref={containerRef} className="pob-calcs-masonry is-measuring">
        {renderedSections}
      </div>
    );
  }

  const sectionsById = new Map(sections.map((s) => [s.id, s]));

  return (
    <div ref={containerRef} className="pob-calcs-masonry">
      {layout.map((column, colIdx) => (
        <div key={colIdx} className="pob-calcs-masonry-col">
          {column.map((id) => {
            const section = sectionsById.get(id);
            if (!section) return null;
            return (
              <SectionCard
                key={id}
                section={section}
                favorite={favoriteIds.has(id)}
                activeBreakdownKey={activeBreakdownKey}
                onFavoriteToggle={onFavoriteToggle}
                onSubsectionToggle={onSubsectionToggle}
                onCellHover={onCellHover}
                onCellClick={onCellClick}
                cardRef={registerCard(id)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface CalcsRowViewProps {
  row: PobCalcsRow;
  activeBreakdownKey: string | null;
  onCellHover: (key: string | null) => void;
  onCellClick: (key: string) => void;
}

function CalcsRowView({
  row,
  activeBreakdownKey,
  onCellHover,
  onCellClick,
}: CalcsRowViewProps) {
  return (
    <tr className="pob-calcs-row">
      <th scope="row">{row.label}</th>
      {row.cells.map((cell, idx) => {
        const interactive =
          typeof cell.breakdownKey === "string" && cell.breakdownKey !== "";
        const isActive =
          interactive && cell.breakdownKey === activeBreakdownKey;
        return (
          <td
            key={idx}
            className={
              "pob-calcs-cell" +
              colourClass(cell.colour) +
              (interactive ? " is-interactive" : "") +
              (isActive ? " is-active" : "")
            }
            onMouseEnter={
              interactive ? () => onCellHover(cell.breakdownKey) : undefined
            }
            onMouseLeave={interactive ? () => onCellHover(null) : undefined}
            onClick={
              interactive
                ? () => onCellClick(cell.breakdownKey as string)
                : undefined
            }
          >
            {displayCalcsCellText(cell.text)}
          </td>
        );
      })}
    </tr>
  );
}

interface BreakdownPanelProps {
  state: BreakdownState;
  onClose: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function BreakdownPanel({ state, onClose, t }: BreakdownPanelProps) {
  if (state.status === "idle") return null;
  const canClose =
    state.status === "error" ||
    (state.status === "ready" && state.pinned === true);
  return (
    <aside className="pob-calcs-breakdown" role="complementary">
      <header className="pob-calcs-breakdown-header">
        <h3>{t("buildEdit.calcs.breakdown.title")}</h3>
        {canClose && (
          <button
            type="button"
            className="pob-calcs-breakdown-close"
            onClick={onClose}
            aria-label={t("buildEdit.calcs.breakdown.close")}
          >
            ×
          </button>
        )}
      </header>
      <div className="pob-calcs-breakdown-body">
        {state.status === "loading" && (
          <p className="pob-mode-placeholder-body">
            {t("buildEdit.calcs.breakdown.loading")}
          </p>
        )}
        {state.status === "error" && (
          <p className="pob-error">
            {t("buildList.error.generic", { reason: state.reason })}
          </p>
        )}
        {state.status === "ready" && state.data.sections.length === 0 && (
          <p className="pob-mode-placeholder-body">
            {t("buildEdit.calcs.breakdown.empty")}
          </p>
        )}
        {state.status === "ready" &&
          state.data.sections.map((section, idx) => {
            if (section.type === "BREAKDOWN") {
              return (
                <section
                  key={idx}
                  className="pob-calcs-breakdown-section is-stat"
                >
                  {section.data.label && <h4>{section.data.label}</h4>}
                  {section.data.lines.map((line, i) => (
                    <p key={i} className="pob-calcs-breakdown-line">
                      {line}
                    </p>
                  ))}
                  {section.data.rowList &&
                    section.data.colList &&
                    section.data.rowList.length > 0 && (
                      <table className="pob-calcs-breakdown-table">
                        <thead>
                          <tr>
                            {section.data.colList.map((col) => (
                              <th key={col.key}>{col.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.data.rowList.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {section.data.colList?.map((col) => (
                                <td key={col.key}>{row[col.key] ?? ""}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  {section.data.footer && (
                    <p className="pob-calcs-breakdown-footer">
                      {section.data.footer}
                    </p>
                  )}
                </section>
              );
            }
            return (
              <section
                key={idx}
                className="pob-calcs-breakdown-section is-mods"
              >
                <h4>{section.data.label}</h4>
                {section.data.entries.length === 0 ? (
                  <p className="pob-mode-placeholder-body">
                    {t("buildEdit.calcs.breakdown.noMods")}
                  </p>
                ) : (
                  <table className="pob-calcs-breakdown-table">
                    <thead>
                      <tr>
                        <th>{t("buildEdit.calcs.breakdown.modSource")}</th>
                        <th>{t("buildEdit.calcs.breakdown.modValue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.data.entries.map((entry, eIdx) => (
                        <tr key={eIdx}>
                          <td>
                            {entry.sourceLine ??
                              entry.source ??
                              entry.name ??
                              ""}
                          </td>
                          <td>{entry.value ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
      </div>
    </aside>
  );
}

export function CalcsView({ active, onMutated }: CalcsViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<CalcsGroupFilter>("all");
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });
  const [breakdown, setBreakdown] = useState<BreakdownState>({
    status: "idle",
  });
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() =>
    readFavoriteIds(CALCS_FAVORITES_STORAGE_KEY),
  );
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const result = await api.session.calcsSnapshot();
      if (cancelled) return;
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
      } else {
        setState({ status: "error", reason: result.reason });
      }
    };

    void fetchSnapshot();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const snapshot = state.status === "ready" ? state.snapshot : null;

  const runAction = useCallback(
    async (action: PobCalcsAction): Promise<void> => {
      const api = window.pobAPI;
      if (!api) {
        setActionState({ status: "error", reason: "pobAPI unavailable" });
        return;
      }
      setActionState({ status: "running" });
      const result = await api.session.calcsAction(action);
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
        setActionState({ status: "idle" });
        if (action.type !== "toggleSubsection") onMutated?.();
      } else {
        setActionState({ status: "error", reason: result.reason });
      }
    },
    [onMutated],
  );

  const fetchBreakdown = useCallback(
    async (key: string, pinned: boolean): Promise<void> => {
      const api = window.pobAPI;
      if (!api) {
        setBreakdown({
          status: "error",
          key,
          pinned,
          reason: "pobAPI unavailable",
        });
        return;
      }
      setBreakdown({ status: "loading", key });
      const result = await api.session.calcsBreakdown(key);
      setBreakdown((prev) => {
        if (prev.status !== "loading" || prev.key !== key) return prev;
        if (result.status === "ok") {
          return { status: "ready", key, pinned, data: result.breakdown };
        }
        return { status: "error", key, pinned, reason: result.reason };
      });
    },
    [],
  );

  const handleCellHover = useCallback(
    (key: string | null) => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setBreakdown((prev) => {
        if (prev.status === "ready" && prev.pinned) return prev;
        if (key === null) return { status: "idle" };
        return prev;
      });
      if (key === null) return;
      hoverTimerRef.current = setTimeout(() => {
        setBreakdown((prev) => {
          if (prev.status === "ready" && prev.pinned) return prev;
          return prev;
        });
        void fetchBreakdown(key, false);
      }, 250);
    },
    [fetchBreakdown],
  );

  const handleCellClick = useCallback(
    (key: string) => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setBreakdown((prev) => {
        if (prev.status === "ready" && prev.pinned && prev.key === key) {
          return { status: "idle" };
        }
        return prev;
      });
      void fetchBreakdown(key, true);
    },
    [fetchBreakdown],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBreakdown({ status: "idle" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const activeBreakdownKey =
    breakdown.status === "loading" ||
    breakdown.status === "ready" ||
    breakdown.status === "error"
      ? breakdown.key
      : null;

  const filteredSections = useMemo(() => {
    if (!snapshot) return [];
    const body = snapshot.sections.filter((s) => s.id !== "SkillSelect");
    return sortSectionsByFavorites(
      filterSections(body, groupFilter, search),
      favoriteIds,
    );
  }, [snapshot, groupFilter, search, favoriteIds]);

  const handleFavoriteToggle = useCallback((sectionId: string) => {
    setFavoriteIds((prev) => {
      const next = toggleFavoriteId(prev, sectionId);
      writeFavoriteIds(CALCS_FAVORITES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  if (state.status === "error") {
    return (
      <div className="pob-error">
        {t("buildList.error.generic", { reason: state.reason })}
      </div>
    );
  }

  if (state.status === "idle" || state.status === "loading" || !snapshot) {
    return (
      <p className="pob-mode-placeholder-body">
        {t("buildEdit.calcs.loading")}
      </p>
    );
  }

  return (
    <div className="pob-calcs">
      <div className="pob-calcs-toolbar">
        <input
          type="search"
          className="pob-calcs-search"
          placeholder={t("buildEdit.calcs.search.placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="pob-calcs-filter" role="tablist">
          {GROUP_FILTER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={groupFilter === key}
              className={
                "pob-calcs-filter-chip" +
                (groupFilter === key ? " is-active" : "")
              }
              onClick={() => setGroupFilter(key)}
            >
              {t(`buildEdit.calcs.groupFilter.${key}`)}
            </button>
          ))}
        </div>
        <SummaryStrip summary={snapshot.summary} t={t} />
      </div>

      {actionState.status === "error" && (
        <div className="pob-error pob-calcs-action-error">
          {t("buildList.error.generic", { reason: actionState.reason })}
        </div>
      )}

      <div className="pob-calcs-body">
        <div className="pob-calcs-stack">
          <SkillSelectCard
            data={snapshot.skillSelect}
            busy={actionState.status === "running"}
            onAction={(action) => void runAction(action)}
            t={t}
          />
          <CalcsMasonry
            sections={filteredSections}
            favoriteIds={favoriteIds}
            activeBreakdownKey={activeBreakdownKey}
            onFavoriteToggle={handleFavoriteToggle}
            onSubsectionToggle={(sectionId, subSectionId) =>
              void runAction({
                type: "toggleSubsection",
                sectionId,
                subSectionId,
              })
            }
            onCellHover={handleCellHover}
            onCellClick={handleCellClick}
          />
        </div>
        <BreakdownPanel
          state={breakdown}
          onClose={() => setBreakdown({ status: "idle" })}
          t={t}
        />
      </div>
    </div>
  );
}

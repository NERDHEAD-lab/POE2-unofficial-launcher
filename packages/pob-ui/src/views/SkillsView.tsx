import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  PobRepoeTranslationsSnapshot,
  PobSkillDefaultGemLevel,
  PobSkillGem,
  PobSkillGemCatalogEntry,
  PobSkillGroup,
  PobSkillSortGemField,
  PobSkillSupportGemType,
  PobSkillsAction,
  PobSkillsGemTooltip,
  PobSkillsSnapshot,
  PobSkillsTooltipMode,
  PobTreeTooltipLine,
} from "@poe2-launcher/shared/types";

import {
  translateSkillsGemTooltip,
  translateSkillsSnapshot,
} from "./repoeTranslations";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobSkillsSnapshot }
  | { status: "error"; reason: string };

type ActionState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; reason: string };

interface SkillsViewProps {
  active: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onMutated: () => void;
}

const emptyToUndefined = (value: string): string | undefined =>
  value.trim() ? value.trim() : undefined;

const parseNumberInput = (value: string, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const gemToneClass = (color: string): string => {
  if (color === "strength") return " is-strength";
  if (color === "dexterity") return " is-dexterity";
  if (color === "intelligence") return " is-intelligence";
  return "";
};

type GemTooltipState =
  | { status: "idle" }
  | { status: "loading"; mode: PobSkillsTooltipMode }
  | { status: "ready"; tooltip: PobSkillsGemTooltip }
  | { status: "error"; reason: string };

const skillsTooltipLineClass = (line: PobTreeTooltipLine): string => {
  const classes = ["pob-skills-tooltip-line"];
  if (line.size !== null && line.size >= 20) classes.push("is-title");
  if (!line.text.trim()) classes.push("is-empty");
  if (line.colour) classes.push(`is-colour-${line.colour.toLowerCase()}`);
  return classes.join(" ");
};

function SkillsGemTooltip({
  tooltip,
  translations,
}: {
  tooltip: PobSkillsGemTooltip;
  translations: PobRepoeTranslationsSnapshot;
}) {
  const displayTooltip = translateSkillsGemTooltip(tooltip, translations);
  if (displayTooltip.lines.length === 0) return null;
  return (
    <div className="pob-skills-tooltip" role="tooltip">
      <div className="pob-skills-tooltip-lines">
        {displayTooltip.lines.map((line, index) =>
          line.kind === "separator" ? (
            <div
              key={`separator-${index}`}
              className="pob-skills-tooltip-separator"
            />
          ) : (
            <div key={`line-${index}`} className={skillsTooltipLineClass(line)}>
              {line.text}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function SkillsView({
  active,
  translations,
  onMutated,
}: SkillsViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(1);
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });
  const [manageOpen, setManageOpen] = useState(false);

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
      const result = await api.session.skillsSnapshot();
      if (cancelled) return;
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
        setSelectedGroupIndex(result.snapshot.groups[0]?.index ?? 1);
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
      sourceSnapshot
        ? translateSkillsSnapshot(sourceSnapshot, translations)
        : null,
    [sourceSnapshot, translations],
  );
  const busy = actionState.status === "running";

  const selectedGroup = useMemo(() => {
    if (!snapshot) return null;
    return (
      snapshot.groups.find((group) => group.index === selectedGroupIndex) ??
      snapshot.groups[0] ??
      null
    );
  }, [selectedGroupIndex, snapshot]);

  const runAction = async (
    action: PobSkillsAction,
    nextSelectedGroupIndex = selectedGroupIndex,
  ): Promise<void> => {
    const api = window.pobAPI;
    if (!api) {
      setActionState({ status: "error", reason: "pobAPI unavailable" });
      return;
    }

    setActionState({ status: "running" });
    const result = await api.session.skillsAction(action);
    if (result.status === "ok") {
      setState({ status: "ready", snapshot: result.snapshot });
      setSelectedGroupIndex(
        result.snapshot.groups.find(
          (group) => group.index === nextSelectedGroupIndex,
        )?.index ??
          result.snapshot.groups[0]?.index ??
          1,
      );
      setActionState({ status: "idle" });
      onMutated();
    } else {
      setActionState({ status: "error", reason: result.reason });
    }
  };

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
        {t("buildEdit.skills.loading")}
      </p>
    );
  }

  return (
    <div className="pob-skills">
      <div className="pob-skills-toolbar">
        <label className="pob-skills-set">
          <span>{t("buildEdit.skills.setLabel")}</span>
          <select
            value={snapshot.activeSetId}
            disabled={busy || snapshot.sets.length <= 1}
            onChange={(event) =>
              void runAction({
                type: "setActiveSkillSet",
                setId: Number(event.target.value),
              })
            }
          >
            {snapshot.sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.title || t("buildEdit.skills.defaultSet")}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pob-button"
            disabled={busy}
            onClick={() => setManageOpen(true)}
          >
            {t("buildEdit.skills.setManage")}
          </button>
        </label>
      </div>

      {actionState.status === "error" && (
        <div className="pob-error pob-skills-action-error">
          {t("buildList.error.generic", { reason: actionState.reason })}
        </div>
      )}

      <div className="pob-skills-cols">
        <aside className="pob-skills-sidebar">
          <GroupList
            groups={snapshot.groups}
            selectedGroupIndex={selectedGroupIndex}
            busy={busy}
            onSelect={setSelectedGroupIndex}
            onAction={(action, nextIndex) => void runAction(action, nextIndex)}
          />
          <GemOptions
            snapshot={snapshot}
            busy={busy}
            onAction={(action) => void runAction(action)}
          />
        </aside>

        <section className="pob-skills-detail">
          {selectedGroup ? (
            <GroupDetail
              group={selectedGroup}
              snapshot={snapshot}
              rawAvailableGems={sourceSnapshot?.availableGems ?? []}
              busy={busy}
              translations={translations}
              onAction={(action, nextIndex) =>
                void runAction(action, nextIndex)
              }
            />
          ) : (
            <p className="pob-mode-placeholder-body">
              {t("buildEdit.skills.noGroups")}
            </p>
          )}
        </section>
      </div>

      {manageOpen && (
        <SkillSetManager
          snapshot={snapshot}
          busy={busy}
          onClose={() => setManageOpen(false)}
          onAction={(action) => void runAction(action)}
        />
      )}
    </div>
  );
}

interface GroupListProps {
  groups: PobSkillGroup[];
  selectedGroupIndex: number;
  busy: boolean;
  onSelect: (index: number) => void;
  onAction: (action: PobSkillsAction, nextIndex?: number) => void;
}

function GroupList({
  groups,
  selectedGroupIndex,
  busy,
  onSelect,
  onAction,
}: GroupListProps) {
  const { t } = useTranslation();
  const selectedGroup = groups.find(
    (group) => group.index === selectedGroupIndex,
  );
  return (
    <section className="pob-skills-group-list">
      <div className="pob-skills-pane-header">
        <div className="pob-skills-pane-title">
          <strong>{t("buildEdit.skills.socketGroups")}</strong>
          <span>{groups.length}</span>
        </div>
        <div className="pob-skills-pane-actions">
          <button
            type="button"
            className="pob-button"
            disabled={busy}
            onClick={() => onAction({ type: "addGroup" }, groups.length + 1)}
          >
            {t("buildEdit.skills.group.new")}
          </button>
          <button
            type="button"
            className="pob-button"
            disabled={busy || !selectedGroup?.canDelete}
            onClick={() => {
              if (!selectedGroup) return;
              onAction(
                { type: "deleteGroup", groupIndex: selectedGroup.index },
                selectedGroup.index - 1,
              );
            }}
          >
            {t("buildEdit.skills.group.delete")}
          </button>
          <button
            type="button"
            className="pob-button pob-btn-danger"
            disabled={busy || groups.length === 0}
            onClick={() => onAction({ type: "deleteAllGroups" }, 1)}
          >
            {t("buildEdit.skills.group.deleteAll")}
          </button>
        </div>
      </div>
      <ul className="pob-skills-group-rows">
        {groups.map((group) => {
          const disabled = !group.enabled || !group.slotEnabled;
          return (
            <li key={group.index}>
              <button
                type="button"
                className={
                  "pob-skills-group-row" +
                  (group.index === selectedGroupIndex ? " is-selected" : "") +
                  (disabled ? " is-disabled" : "")
                }
                onClick={(event) => {
                  if (event.ctrlKey) {
                    onAction({
                      type: "setGroup",
                      groupIndex: group.index,
                      patch: { enabled: !group.enabled },
                    });
                    return;
                  }
                  onSelect(group.index);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onAction(
                    event.ctrlKey
                      ? {
                          type: "setGroup",
                          groupIndex: group.index,
                          patch: { includeInFullDPS: !group.includeInFullDPS },
                        }
                      : { type: "setMainGroup", groupIndex: group.index },
                    group.index,
                  );
                }}
              >
                <span className="pob-skills-group-title">
                  {group.displayLabel}
                </span>
                <span className="pob-skills-group-meta">
                  {group.slot ?? t("buildEdit.skills.slot.none")}
                </span>
                <span className="pob-skills-group-badges">
                  {group.isMain && (
                    <span>{t("buildEdit.skills.group.active")}</span>
                  )}
                  {group.includeInFullDPS && (
                    <span>{t("buildEdit.skills.group.fullDps")}</span>
                  )}
                  {disabled && (
                    <span>{t("buildEdit.skills.group.disabled")}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="pob-skills-usage">{t("buildEdit.skills.usageTips")}</p>
    </section>
  );
}

interface GemOptionsProps {
  snapshot: PobSkillsSnapshot;
  busy: boolean;
  onAction: (action: PobSkillsAction) => void;
}

function GemOptions({ snapshot, busy, onAction }: GemOptionsProps) {
  const { t } = useTranslation();
  const options = snapshot.options;
  return (
    <section className="pob-skills-options">
      <div className="pob-skills-pane-title">
        <strong>{t("buildEdit.skills.options.title")}</strong>
      </div>
      <label className="pob-skills-check-row">
        <input
          type="checkbox"
          checked={options.sortGemsByDPS}
          disabled={busy}
          onChange={(event) =>
            onAction({
              type: "setOptions",
              options: { sortGemsByDPS: event.target.checked },
            })
          }
        />
        <span>{t("buildEdit.skills.options.sortByDps")}</span>
      </label>
      <select
        value={options.sortGemsByDPSField}
        disabled={busy}
        onChange={(event) =>
          onAction({
            type: "setOptions",
            options: {
              sortGemsByDPSField: event.target.value as PobSkillSortGemField,
            },
          })
        }
      >
        {snapshot.sortGemFieldOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label>
        <span>{t("buildEdit.skills.options.defaultLevel")}</span>
        <select
          value={options.defaultGemLevel}
          disabled={busy}
          onChange={(event) =>
            onAction({
              type: "setOptions",
              options: {
                defaultGemLevel: event.target.value as PobSkillDefaultGemLevel,
              },
            })
          }
        >
          {snapshot.defaultGemLevelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("buildEdit.skills.options.defaultQuality")}</span>
        <input
          type="number"
          min={0}
          max={23}
          defaultValue={options.defaultGemQuality}
          disabled={busy}
          onBlur={(event) =>
            onAction({
              type: "setOptions",
              options: {
                defaultGemQuality: parseNumberInput(
                  event.target.value,
                  options.defaultGemQuality,
                ),
              },
            })
          }
        />
      </label>
      <label>
        <span>{t("buildEdit.skills.options.showSupport")}</span>
        <select
          value={options.showSupportGemTypes}
          disabled={busy}
          onChange={(event) =>
            onAction({
              type: "setOptions",
              options: {
                showSupportGemTypes: event.target
                  .value as PobSkillSupportGemType,
              },
            })
          }
        >
          {snapshot.supportGemTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

interface GroupDetailProps {
  group: PobSkillGroup;
  snapshot: PobSkillsSnapshot;
  rawAvailableGems: PobSkillGemCatalogEntry[];
  busy: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onAction: (action: PobSkillsAction, nextIndex?: number) => void;
}

function GroupDetail({
  group,
  snapshot,
  rawAvailableGems,
  busy,
  translations,
  onAction,
}: GroupDetailProps) {
  const { t } = useTranslation();
  const gemRows = group.canDelete
    ? [
        ...group.gems,
        {
          index: group.gems.length + 1,
          gemId: null,
          skillId: null,
          nameSpec: "",
          displayName: "",
          level: null,
          quality: null,
          enabled: false,
          enableGlobal1: true,
          enableGlobal2: true,
          count: 1,
          errMsg: null,
          reqLevel: null,
          reqStr: null,
          reqDex: null,
          reqInt: null,
          naturalMaxLevel: null,
          color: "normal" as const,
          isSupport: false,
          isVaal: false,
          fromItem: false,
          fromTree: false,
          triggered: false,
          countVisible: true,
          canEdit: true,
          canDelete: false,
          globalEffects: [],
          displayLevel: null,
          displayQuality: null,
        },
      ]
    : group.gems;

  return (
    <>
      <div className="pob-skills-detail-header">
        <label className="pob-skills-label-wide">
          <span>{t("buildEdit.skills.group.label")}</span>
          <input
            type="text"
            defaultValue={group.label}
            disabled={busy}
            onBlur={(event) =>
              onAction({
                type: "setGroup",
                groupIndex: group.index,
                patch: { label: event.target.value },
              })
            }
          />
        </label>
        <label>
          <span>{t("buildEdit.skills.group.socketedIn")}</span>
          <select
            value={group.slot ?? ""}
            disabled={busy || !group.canDelete}
            onChange={(event) =>
              onAction({
                type: "setGroup",
                groupIndex: group.index,
                patch: { slot: event.target.value },
              })
            }
          >
            {snapshot.slotOptions.map((slot) => (
              <option key={slot.slotName ?? "none"} value={slot.slotName ?? ""}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pob-skills-check-row">
          <input
            type="checkbox"
            checked={group.enabled}
            disabled={busy}
            onChange={(event) =>
              onAction({
                type: "setGroup",
                groupIndex: group.index,
                patch: { enabled: event.target.checked },
              })
            }
          />
          <span>{t("buildEdit.skills.group.enabled")}</span>
        </label>
        <label className="pob-skills-check-row">
          <input
            type="checkbox"
            checked={group.includeInFullDPS}
            disabled={busy || !group.enabled}
            onChange={(event) =>
              onAction({
                type: "setGroup",
                groupIndex: group.index,
                patch: { includeInFullDPS: event.target.checked },
              })
            }
          />
          <span>{t("buildEdit.skills.group.includeFullDps")}</span>
        </label>
        {group.source && (
          <label>
            <span>{t("buildEdit.skills.group.count")}</span>
            <input
              type="number"
              min={0}
              defaultValue={group.groupCount}
              disabled={busy}
              onBlur={(event) =>
                onAction({
                  type: "setGroup",
                  groupIndex: group.index,
                  patch: {
                    groupCount: parseNumberInput(
                      event.target.value,
                      group.groupCount,
                    ),
                  },
                })
              }
            />
          </label>
        )}
        <button
          type="button"
          className="pob-button"
          disabled={busy || group.isMain}
          onClick={() =>
            onAction({ type: "setMainGroup", groupIndex: group.index })
          }
        >
          {t("buildEdit.skills.group.setMain")}
        </button>
      </div>

      {group.sourceNote && (
        <div className="pob-skills-source-note">{group.sourceNote}</div>
      )}

      <div className="pob-skills-active-list">
        <span>{t("buildEdit.skills.activeSkills")}</span>
        {group.activeSkills.length > 0 ? (
          group.activeSkills.map((skill) => (
            <button
              key={skill.index}
              type="button"
              className={"pob-skills-active-skill" + gemToneClass(skill.color)}
              disabled={busy || group.mainActiveSkill === skill.index}
              onClick={() =>
                onAction({
                  type: "setGroup",
                  groupIndex: group.index,
                  patch: { mainActiveSkill: skill.index },
                })
              }
            >
              {skill.label}
              {skill.skillPartName ? ` · ${skill.skillPartName}` : ""}
            </button>
          ))
        ) : (
          <em>{t("buildEdit.skills.noActiveSkills")}</em>
        )}
      </div>

      <div className="pob-skills-gems">
        <div className="pob-skills-gem-header" aria-hidden="true">
          <span />
          <span>{t("buildEdit.skills.gem.name")}</span>
          <span>{t("buildEdit.skills.gem.level")}</span>
          <span>{t("buildEdit.skills.gem.quality")}</span>
          <span>{t("buildEdit.skills.gem.enabled")}</span>
          <span>{t("buildEdit.skills.gem.count")}</span>
          <span>{t("buildEdit.skills.gem.requirements")}</span>
          <span>{t("buildEdit.skills.gem.status")}</span>
        </div>
        {gemRows.map((gem) => (
          <GemRow
            key={`${group.index}-${gem.index}-${gem.gemId ?? gem.nameSpec}-${gem.displayName}`}
            group={group}
            gem={gem}
            availableGems={snapshot.availableGems}
            rawAvailableGems={rawAvailableGems}
            busy={busy}
            translations={translations}
            onAction={onAction}
          />
        ))}
      </div>
    </>
  );
}

interface GemRowProps {
  group: PobSkillGroup;
  gem: PobSkillGem;
  availableGems: PobSkillGemCatalogEntry[];
  rawAvailableGems: PobSkillGemCatalogEntry[];
  busy: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onAction: (action: PobSkillsAction, nextIndex?: number) => void;
}

function GemRow({
  group,
  gem,
  availableGems,
  rawAvailableGems,
  busy,
  translations,
  onAction,
}: GemRowProps) {
  const { t } = useTranslation();
  const [nameValue, setNameValue] = useState(gem.displayName || gem.nameSpec);
  const [tooltipState, setTooltipState] = useState<GemTooltipState>({
    status: "idle",
  });
  const tooltipRequestId = useRef(0);
  const datalistId = `pob-skills-gem-list-${group.index}-${gem.index}`;

  const commitName = () => {
    const value = nameValue.trim();
    if (!value && !gem.gemId && !gem.nameSpec) return;
    const match =
      availableGems.find((entry) => entry.name === value) ??
      rawAvailableGems.find((entry) => entry.name === value);
    onAction({
      type: "setGem",
      groupIndex: group.index,
      gemIndex: gem.index,
      patch: match ? { gemId: match.id } : { nameSpec: value },
    });
  };

  const showTooltip = (mode: PobSkillsTooltipMode) => {
    if (!nameValue.trim()) return;
    const api = window.pobAPI;
    if (!api) {
      setTooltipState({ status: "error", reason: "pobAPI unavailable" });
      return;
    }
    const requestId = tooltipRequestId.current + 1;
    tooltipRequestId.current = requestId;
    setTooltipState({ status: "loading", mode });
    void api.session
      .skillsGemTooltip(group.index, gem.index, mode)
      .then((result) => {
        if (tooltipRequestId.current !== requestId) return;
        if (result.status === "ok") {
          setTooltipState({ status: "ready", tooltip: result.tooltip });
        } else {
          setTooltipState({ status: "error", reason: result.reason });
        }
      })
      .catch((error: unknown) => {
        if (tooltipRequestId.current !== requestId) return;
        setTooltipState({
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      });
  };

  const hideTooltip = () => {
    tooltipRequestId.current += 1;
    setTooltipState({ status: "idle" });
  };

  const requirements = [
    gem.reqLevel !== null ? `Lv ${gem.reqLevel}` : null,
    gem.reqStr !== null ? `Str ${gem.reqStr}` : null,
    gem.reqDex !== null ? `Dex ${gem.reqDex}` : null,
    gem.reqInt !== null ? `Int ${gem.reqInt}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div
      className={"pob-skills-gem-row" + gemToneClass(gem.color)}
      onMouseLeave={hideTooltip}
    >
      <button
        type="button"
        className="pob-skills-gem-delete"
        disabled={busy || !gem.canDelete}
        title={t("buildEdit.skills.gem.remove")}
        onClick={() =>
          onAction({
            type: "deleteGem",
            groupIndex: group.index,
            gemIndex: gem.index,
          })
        }
      >
        x
      </button>
      <label>
        <input
          type="text"
          list={datalistId}
          value={nameValue}
          disabled={busy || !gem.canEdit}
          placeholder={t("buildEdit.skills.gem.namePlaceholder")}
          onChange={(event) => setNameValue(event.target.value)}
          onFocus={() => showTooltip("gem")}
          onMouseEnter={() => showTooltip("gem")}
          onBlur={() => {
            commitName();
            hideTooltip();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <input
        type="number"
        min={1}
        defaultValue={gem.level ?? ""}
        disabled={busy || !gem.canEdit || !nameValue.trim()}
        onBlur={(event) =>
          onAction({
            type: "setGem",
            groupIndex: group.index,
            gemIndex: gem.index,
            patch: {
              level: parseNumberInput(event.target.value, gem.level ?? 1),
            },
          })
        }
      />
      <input
        type="number"
        min={0}
        max={23}
        defaultValue={gem.quality ?? ""}
        disabled={busy || !gem.canEdit || !nameValue.trim()}
        onFocus={() => showTooltip("quality")}
        onMouseEnter={() => showTooltip("quality")}
        onBlur={(event) => {
          onAction({
            type: "setGem",
            groupIndex: group.index,
            gemIndex: gem.index,
            patch: {
              quality: parseNumberInput(event.target.value, gem.quality ?? 0),
            },
          });
          hideTooltip();
        }}
      />
      <input
        type="checkbox"
        checked={gem.enabled}
        disabled={busy || !gem.canEdit || !nameValue.trim()}
        aria-label={t("buildEdit.skills.gem.enabled")}
        onFocus={() => showTooltip("enabled")}
        onMouseEnter={() => showTooltip("enabled")}
        onBlur={hideTooltip}
        onChange={(event) =>
          onAction({
            type: "setGem",
            groupIndex: group.index,
            gemIndex: gem.index,
            patch: { enabled: event.target.checked },
          })
        }
      />
      <input
        type="number"
        min={0}
        step={0.1}
        defaultValue={gem.count}
        disabled={
          busy || !gem.canEdit || !gem.countVisible || !nameValue.trim()
        }
        onBlur={(event) =>
          onAction({
            type: "setGem",
            groupIndex: group.index,
            gemIndex: gem.index,
            patch: {
              count: parseNumberInput(event.target.value, gem.count),
            },
          })
        }
      />
      <span className="pob-skills-gem-requirements">{requirements || "-"}</span>
      <span className="pob-skills-gem-status">
        {gem.errMsg ??
          (gem.isSupport
            ? t("buildEdit.skills.gem.support")
            : gem.triggered
              ? t("buildEdit.skills.gem.triggered")
              : gem.fromItem || gem.fromTree
                ? t("buildEdit.skills.gem.granted")
                : "-")}
      </span>
      {gem.globalEffects.length > 1 && (
        <div className="pob-skills-gem-global">
          {gem.globalEffects.map((effect) => (
            <label key={effect.index} className="pob-skills-check-row">
              <input
                type="checkbox"
                checked={effect.enabled}
                disabled={busy || !gem.canEdit}
                onChange={(event) =>
                  onAction({
                    type: "setGem",
                    groupIndex: group.index,
                    gemIndex: gem.index,
                    patch:
                      effect.index === 1
                        ? { enableGlobal1: event.target.checked }
                        : { enableGlobal2: event.target.checked },
                  })
                }
              />
              <span>{effect.name}</span>
            </label>
          ))}
        </div>
      )}
      {tooltipState.status === "ready" && (
        <SkillsGemTooltip
          tooltip={tooltipState.tooltip}
          translations={translations}
        />
      )}
      <datalist id={datalistId}>
        {availableGems.map((entry) => (
          <option key={entry.id} value={entry.name} />
        ))}
        {rawAvailableGems
          .filter((entry) =>
            availableGems.every(
              (displayEntry) => displayEntry.name !== entry.name,
            ),
          )
          .map((entry) => (
            <option key={`raw-${entry.id}`} value={entry.name} />
          ))}
      </datalist>
    </div>
  );
}

interface SkillSetManagerProps {
  snapshot: PobSkillsSnapshot;
  busy: boolean;
  onClose: () => void;
  onAction: (action: PobSkillsAction) => void;
}

function SkillSetManager({
  snapshot,
  busy,
  onClose,
  onAction,
}: SkillSetManagerProps) {
  const { t } = useTranslation();
  const [selectedSetId, setSelectedSetId] = useState(snapshot.activeSetId);
  const selectedSet =
    snapshot.sets.find((set) => set.id === selectedSetId) ?? snapshot.sets[0];
  const [title, setTitle] = useState(selectedSet?.title ?? "");

  return (
    <div className="pob-skills-modal" role="dialog" aria-modal="true">
      <div className="pob-skills-modal-panel">
        <h3>{t("buildEdit.skills.setManageTitle")}</h3>
        <div className="pob-skills-set-manager">
          <ul>
            {snapshot.sets.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  className={
                    "pob-skills-set-row" +
                    (set.id === selectedSetId ? " is-selected" : "")
                  }
                  onClick={() => {
                    setSelectedSetId(set.id);
                    setTitle(set.title);
                  }}
                  onDoubleClick={() =>
                    onAction({ type: "setActiveSkillSet", setId: set.id })
                  }
                >
                  <span>{set.title || t("buildEdit.skills.defaultSet")}</span>
                  {set.id === snapshot.activeSetId && (
                    <em>{t("buildEdit.skills.setCurrent")}</em>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="pob-skills-set-editor">
            <label>
              <span>{t("buildEdit.skills.setName")}</span>
              <input
                type="text"
                value={title}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div className="pob-skills-set-actions">
              <button
                type="button"
                className="pob-button"
                disabled={busy || !emptyToUndefined(title)}
                onClick={() =>
                  onAction({ type: "newSkillSet", title: title.trim() })
                }
              >
                {t("buildEdit.skills.setNew")}
              </button>
              <button
                type="button"
                className="pob-button"
                disabled={busy || !selectedSet}
                onClick={() => {
                  if (!selectedSet) return;
                  onAction({ type: "copySkillSet", setId: selectedSet.id });
                }}
              >
                {t("buildEdit.skills.setCopy")}
              </button>
              <button
                type="button"
                className="pob-button"
                disabled={busy || !selectedSet || !emptyToUndefined(title)}
                onClick={() => {
                  if (!selectedSet) return;
                  onAction({
                    type: "renameSkillSet",
                    setId: selectedSet.id,
                    title: title.trim(),
                  });
                }}
              >
                {t("buildEdit.skills.setRename")}
              </button>
              <button
                type="button"
                className="pob-button pob-btn-danger"
                disabled={busy || !selectedSet || snapshot.sets.length <= 1}
                onClick={() => {
                  if (!selectedSet) return;
                  onAction({ type: "deleteSkillSet", setId: selectedSet.id });
                }}
              >
                {t("buildEdit.skills.setDelete")}
              </button>
            </div>
          </div>
        </div>
        <div className="pob-skills-modal-actions">
          <button type="button" className="pob-button" onClick={onClose}>
            {t("buildEdit.skills.setDone")}
          </button>
        </div>
      </div>
    </div>
  );
}

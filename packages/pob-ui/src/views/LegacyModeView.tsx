import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  PobCalcsSnapshot,
  PobItemsSnapshot,
  PobNotesSnapshot,
  PobPartySnapshot,
  PobSkillsSnapshot,
  PobTreeSnapshot,
} from "@poe2-launcher/shared/types";

import { createPobSnapshotProjection } from "./uiMode";

import type { BuildMode } from "./buildModes";
import type { PobSnapshotProjection } from "./uiMode";

type LegacySnapshot =
  | PobTreeSnapshot
  | PobSkillsSnapshot
  | PobItemsSnapshot
  | PobCalcsSnapshot
  | PobPartySnapshot
  | PobNotesSnapshot;

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      projection: PobSnapshotProjection<LegacySnapshot>;
    }
  | { status: "error"; reason: string };

interface LegacyModeViewProps {
  activeMode: BuildMode;
}

interface SummaryRow {
  label: string;
  value: string;
}

const formatNumber = (value: number): string =>
  new Intl.NumberFormat().format(value);

const snapshotSummary = (
  mode: BuildMode,
  snapshot: LegacySnapshot,
): SummaryRow[] => {
  switch (mode) {
    case "tree": {
      const tree = snapshot as PobTreeSnapshot;
      return [
        { label: "treeVersion", value: tree.treeVersion ?? "-" },
        { label: "className", value: tree.className ?? "-" },
        { label: "allocCount", value: formatNumber(tree.allocCount) },
        { label: "nodes", value: formatNumber(tree.nodes.length) },
      ];
    }
    case "skills": {
      const skills = snapshot as PobSkillsSnapshot;
      return [
        { label: "activeSetId", value: String(skills.activeSetId) },
        { label: "sets", value: formatNumber(skills.sets.length) },
        { label: "groups", value: formatNumber(skills.groups.length) },
        {
          label: "availableGems",
          value: formatNumber(skills.availableGems.length),
        },
      ];
    }
    case "items": {
      const items = snapshot as PobItemsSnapshot;
      return [
        { label: "activeSetId", value: String(items.activeSetId) },
        { label: "slots", value: formatNumber(items.slots.length) },
        { label: "items", value: formatNumber(items.items.length) },
        { label: "sharedItems", value: formatNumber(items.sharedItems.length) },
      ];
    }
    case "calcs": {
      const calcs = snapshot as PobCalcsSnapshot;
      return [
        { label: "search", value: calcs.search || "-" },
        { label: "sections", value: formatNumber(calcs.sections.length) },
        {
          label: "combinedDPS",
          value:
            calcs.summary.combinedDPS === null
              ? "-"
              : formatNumber(Math.round(calcs.summary.combinedDPS)),
        },
        {
          label: "totalEHP",
          value:
            calcs.summary.totalEHP === null
              ? "-"
              : formatNumber(Math.round(calcs.summary.totalEHP)),
        },
      ];
    }
    case "party": {
      const party = snapshot as PobPartySnapshot;
      return [
        {
          label: "enableExportBuffs",
          value: party.enableExportBuffs ? "true" : "false",
        },
        {
          label: "leftSections",
          value: formatNumber(party.leftSections.length),
        },
        {
          label: "rightSections",
          value: formatNumber(party.rightSections.length),
        },
        {
          label: "selectedDestination",
          value: String(party.importControls.selectedDestination),
        },
      ];
    }
    case "notes": {
      const notes = snapshot as PobNotesSnapshot;
      return [
        { label: "textBytes", value: formatNumber(notes.text.length) },
        {
          label: "showColorCodes",
          value: notes.showColorCodes ? "true" : "false",
        },
        { label: "dirty", value: notes.dirty ? "true" : "false" },
        {
          label: "colorControls",
          value: formatNumber(notes.colorControls.length),
        },
      ];
    }
  }
};

const loadLegacySnapshot = async (mode: BuildMode): Promise<LegacySnapshot> => {
  const api = window.pobAPI;
  if (!api) throw new Error("pobAPI unavailable");

  const result =
    mode === "tree"
      ? await api.session.treeSnapshot()
      : mode === "skills"
        ? await api.session.skillsSnapshot()
        : mode === "items"
          ? await api.session.itemsSnapshot()
          : mode === "calcs"
            ? await api.session.calcsSnapshot()
            : mode === "party"
              ? await api.session.partySnapshot()
              : await api.session.notesSnapshot();

  if (result.status === "error") throw new Error(result.reason);
  return result.snapshot;
};

export function LegacyModeView({ activeMode }: LegacyModeViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ status: "loading" });
        return loadLegacySnapshot(activeMode);
      })
      .then((snapshot) => {
        if (cancelled) return;
        setState({
          status: "ready",
          projection: createPobSnapshotProjection(
            "legacy",
            activeMode,
            snapshot,
          ),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          reason: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeMode]);

  if (state.status === "error") {
    return (
      <div className="pob-error">
        {t("buildList.error.generic", { reason: state.reason })}
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <p className="pob-mode-placeholder-body">
        {t("buildEdit.legacy.loading")}
      </p>
    );
  }

  const rows = snapshotSummary(
    state.projection.buildMode,
    state.projection.snapshot,
  );

  return (
    <div className="pob-legacy-shell">
      <header className="pob-legacy-header">
        <span>{t(`buildEdit.modes.${state.projection.buildMode}`)}</span>
        <strong>{state.projection.source}</strong>
      </header>
      <div className="pob-legacy-grid">
        {rows.map((row) => (
          <div key={row.label} className="pob-legacy-cell">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="pob-legacy-followup">
        <h3>{t("buildEdit.legacy.followupTitle")}</h3>
        <ul>
          <li>{t("buildEdit.legacy.followupLayout")}</li>
          <li>{t("buildEdit.legacy.followupControls")}</li>
          <li>{t("buildEdit.legacy.followupTooltips")}</li>
        </ul>
      </div>
    </div>
  );
}

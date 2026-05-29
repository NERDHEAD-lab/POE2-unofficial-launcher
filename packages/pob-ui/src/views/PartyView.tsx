import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  PobPartyAction,
  PobPartyButton,
  PobPartyCheckbox,
  PobPartySection,
  PobPartySnapshot,
} from "@poe2-launcher/shared/types";

import { PobErrorBanner } from "../components/PobErrorBanner";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobPartySnapshot }
  | { status: "error"; reason: string };

interface PartyViewProps {
  active: boolean;
  preload?: boolean;
  onMutated?: () => void;
}

function PartyButton({
  data,
  busy,
  onClick,
}: {
  data: PobPartyButton;
  busy: boolean;
  onClick?: () => void;
}) {
  if (!data.shown) return null;
  return (
    <button
      type="button"
      className="pob-party-button"
      disabled={busy || !data.enabled || !onClick}
      title={data.tooltip ?? undefined}
      onClick={onClick}
    >
      {data.label}
    </button>
  );
}

function PartyCheckbox({
  data,
  busy,
  onChange,
}: {
  data: PobPartyCheckbox;
  busy: boolean;
  onChange?: (checked: boolean) => void;
}) {
  if (!data.shown) return null;
  return (
    <label className="pob-party-checkbox" title={data.tooltip ?? undefined}>
      <input
        type="checkbox"
        checked={data.checked}
        disabled={busy || !data.enabled || !onChange}
        readOnly={!onChange}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span>{data.label}</span>
    </label>
  );
}

function PartySectionCard({
  section,
  busy,
  onTextChange,
}: {
  section: PobPartySection;
  busy: boolean;
  onTextChange: (section: PobPartySection, value: string) => void;
}) {
  const body = section.advancedVisible ? section.text : section.simpleText;

  return (
    <section className="pob-party-section">
      <h3>{section.label}</h3>
      {section.advancedVisible ? (
        <textarea
          key={`${section.key}:${section.text}`}
          defaultValue={section.text}
          disabled={busy}
          onBlur={(event) => {
            if (event.target.value !== section.text) {
              onTextChange(section, event.target.value);
            }
          }}
        />
      ) : (
        <pre aria-label={section.label}>{body}</pre>
      )}
    </section>
  );
}

function PartyColumn({
  sections,
  busy,
  onTextChange,
}: {
  sections: PobPartySection[];
  busy: boolean;
  onTextChange: (section: PobPartySection, value: string) => void;
}) {
  return (
    <div className="pob-party-column">
      {sections.map((section) => (
        <PartySectionCard
          key={section.key}
          section={section}
          busy={busy}
          onTextChange={onTextChange}
        />
      ))}
    </div>
  );
}

export function PartyView({
  active,
  preload = false,
  onMutated,
}: PartyViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedSnapshotRef = useRef(false);

  useEffect(() => {
    if (!active && !preload) return;
    if (loadedSnapshotRef.current) return;

    let cancelled = false;
    const loadParty = async () => {
      const api = window.pobAPI;
      if (!api) {
        setState({ status: "error", reason: "pobAPI unavailable" });
        return;
      }

      setState({ status: "loading" });
      const result = await api.session.partySnapshot();
      if (cancelled) return;
      if (result.status === "ok") {
        loadedSnapshotRef.current = true;
        setState({ status: "ready", snapshot: result.snapshot });
      } else {
        setState({ status: "error", reason: result.reason });
      }
    };

    void loadParty();
    return () => {
      cancelled = true;
    };
  }, [active, preload]);

  const runAction = async (action: PobPartyAction) => {
    const api = window.pobAPI;
    if (!api) {
      setActionError("pobAPI unavailable");
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const result = await api.session.partyAction(action);
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
        onMutated?.();
      } else {
        setActionError(result.reason);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (state.status === "error") {
    return (
      <PobErrorBanner
        message={t("buildList.error.generic", { reason: state.reason })}
        source="Party"
      />
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return (
      <p className="pob-mode-placeholder-body">
        {t("buildEdit.party.loading")}
      </p>
    );
  }

  const { snapshot } = state;
  const { importControls } = snapshot;

  return (
    <div className="pob-party">
      <section className="pob-party-import">
        <p className="pob-party-notes">{snapshot.notes}</p>
        <div className="pob-party-import-row">
          <label className="pob-party-code">
            <span>{importControls.inputLabel}</span>
            <input type="text" value={importControls.code} readOnly />
          </label>
          <span className="pob-party-code-state">{importControls.detail}</span>
        </div>
        <div className="pob-party-actions">
          <select
            value={importControls.selectedDestination}
            disabled={busy}
            title={importControls.destinationTooltip ?? undefined}
            onChange={(event) => {
              const label =
                importControls.destinations[Number(event.target.value) - 1];
              if (label) {
                void runAction({ type: "setDestination", value: label });
              }
            }}
          >
            {importControls.destinations.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
          <PartyButton data={importControls.importButton} busy={busy} />
          <PartyCheckbox
            data={importControls.append}
            busy={busy}
            onChange={(value) => void runAction({ type: "setAppend", value })}
          />
          <PartyButton
            data={importControls.clear}
            busy={busy}
            onClick={() => void runAction({ type: "clear" })}
          />
          <PartyCheckbox
            data={importControls.showAdvanced}
            busy={busy}
            onChange={(value) =>
              void runAction({ type: "setShowAdvanced", value })
            }
          />
          <PartyButton
            data={importControls.disableEffects}
            busy={busy}
            onClick={() => void runAction({ type: "disableEffects" })}
          />
          <PartyButton
            data={importControls.rebuild}
            busy={busy}
            onClick={() => void runAction({ type: "rebuild" })}
          />
        </div>
        {actionError && (
          <PobErrorBanner
            className="pob-party-action-error"
            message={t("buildList.error.generic", { reason: actionError })}
            source="Party action"
            dismissible
            onDismiss={() => setActionError(null)}
          />
        )}
      </section>
      <div className="pob-party-sections">
        <PartyColumn
          sections={snapshot.leftSections}
          busy={busy}
          onTextChange={(section, value) =>
            void runAction({
              type: "setSectionText",
              key: section.key,
              value,
            })
          }
        />
        <PartyColumn
          sections={snapshot.rightSections}
          busy={busy}
          onTextChange={(section, value) =>
            void runAction({
              type: "setSectionText",
              key: section.key,
              value,
            })
          }
        />
      </div>
    </div>
  );
}

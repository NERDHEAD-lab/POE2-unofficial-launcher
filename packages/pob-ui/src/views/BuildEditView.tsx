import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  PobBuildMetadataAction,
  PobBuildMetadataClassChangeConfirmation,
  PobBuildMetadataClassConfirmationMode,
  PobBuildMetadataSnapshot,
  PobBuildImportMode,
  PobImportExportSnapshot,
  BuildsMutationResult,
  PobBuildSummary,
} from "@poe2-launcher/shared/types";

import { POB_BUILD_HEADER_ACTIONS } from "./buildActions";
import {
  buildLevelActionValue,
  resolveBuildMetadataAscendancies,
  sanitizeBuildLevelInput,
} from "./buildMetadataControls";
import { POB_BUILD_MODES } from "./buildModes";
import { CalcsView } from "./CalcsView";
import { ConfigView } from "./ConfigView";
import { ItemsView } from "./ItemsView";
import { NotesView } from "./NotesView";
import { PartyView } from "./PartyView";
import { PassiveTreeView } from "./PassiveTreeView";
import { EMPTY_REPOE_TRANSLATIONS } from "./repoeTranslations";
import { SkillsView } from "./SkillsView";

import type { BuildAction } from "./buildActions";
import type { BuildMode } from "./buildModes";
import type { MainSkillSummaryPanelState } from "./mainSkillSummaryPanel";

export interface BuildEditViewHandle {
  saveCurrent: () => Promise<BuildsMutationResult>;
  saveDraftAs: (fileName: string) => Promise<BuildsMutationResult>;
}

interface BuildEditViewProps {
  subPath: string;
  fileName: string | null;
  draftKey: number;
  activeMode: BuildMode;
  onActiveModeChange: (mode: BuildMode) => void;
  onDirtyChange: (dirty: boolean) => void;
  onMainSkillSummaryChange: (state: MainSkillSummaryPanelState) => void;
  onSavedAs: (fileName: string) => void;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: PobBuildSummary }
  | { status: "error"; reason: string };

type BuildMetadataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobBuildMetadataSnapshot }
  | { status: "error"; reason: string };

type BuildCodeStatus = {
  kind: "info" | "success" | "error";
  message: string;
} | null;

type ImportExportSnapshotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobImportExportSnapshot }
  | { status: "error"; reason: string };

type ClassChangeConfirmationState = {
  confirmation: PobBuildMetadataClassChangeConfirmation;
} | null;

const formatNumber = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat().format(Math.round(value));
};

const present = (value: string | null | undefined): string =>
  value && value.trim() ? value : "-";

const isBuildShareUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value.trim());

const toErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const BuildEditView = forwardRef<
  BuildEditViewHandle,
  BuildEditViewProps
>(
  (
    {
      subPath,
      fileName,
      draftKey,
      activeMode,
      onActiveModeChange,
      onDirtyChange,
      onMainSkillSummaryChange,
      onSavedAs,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
    const [buildMetadataState, setBuildMetadataState] =
      useState<BuildMetadataState>({ status: "idle" });
    const [activeBuildAction, setActiveBuildAction] =
      useState<BuildAction | null>(null);
    const [sessionRevision, setSessionRevision] = useState(0);
    const [levelInput, setLevelInput] = useState("");
    const [buildMetadataBusy, setBuildMetadataBusy] = useState(false);
    const [buildMetadataActionError, setBuildMetadataActionError] = useState<
      string | null
    >(null);
    const [pendingClassConfirmation, setPendingClassConfirmation] =
      useState<ClassChangeConfirmationState>(null);
    const [buildCodeInput, setBuildCodeInput] = useState("");
    const [buildCodeOutput, setBuildCodeOutput] = useState("");
    const [buildCodeBusy, setBuildCodeBusy] = useState(false);
    const [buildCodeStatus, setBuildCodeStatus] =
      useState<BuildCodeStatus>(null);
    const [importExportSnapshotState, setImportExportSnapshotState] =
      useState<ImportExportSnapshotState>({ status: "idle" });
    const [buildImportMode, setBuildImportMode] =
      useState<PobBuildImportMode>("current");
    const [exportSupportBusy, setExportSupportBusy] = useState(false);
    const [mainSkillSummaryRevision, setMainSkillSummaryRevision] = useState(0);
    const [repoeTranslations, setRepoeTranslations] = useState(
      EMPTY_REPOE_TRANSLATIONS,
    );

    const buildName = fileName ?? t("buildEdit.empty.title");
    const isUserDraft = fileName === null && draftKey > 0;

    useEffect(() => {
      let cancelled = false;

      const loadBuild = async () => {
        const api = window.pobAPI;
        if (!api) throw new Error("pobAPI unavailable");

        if (fileName === null) {
          const created = await api.session.newBuild(buildName);
          if (created.status === "error") throw new Error(created.reason);
          return created.summary;
        }

        const read = await api.builds.readXml(subPath, fileName);
        if (read.status === "error") throw new Error(read.reason);

        const ensured = await api.session.ensure();
        if (ensured.status === "error") throw new Error(ensured.reason);

        const loaded = await api.session.loadBuild({
          xml: read.xml,
          name: fileName,
        });
        if (loaded.status === "error") throw new Error(loaded.reason);
        return loaded.summary;
      };

      setLoadState({ status: "loading" });
      onDirtyChange(false);
      if (fileName === null && !isUserDraft) {
        setLoadState({ status: "idle" });
        return () => {
          cancelled = true;
        };
      }

      void loadBuild()
        .then((summary) => {
          if (cancelled) return;
          setLoadState({ status: "ready", summary });
          onDirtyChange(isUserDraft);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const reason = err instanceof Error ? err.message : String(err);
          setLoadState({ status: "error", reason });
          onDirtyChange(false);
        });

      return () => {
        cancelled = true;
      };
    }, [buildName, draftKey, fileName, isUserDraft, onDirtyChange, subPath]);

    const saveBuildAs = useCallback(
      async (nextFileName: string): Promise<BuildsMutationResult> => {
        const api = window.pobAPI;
        if (!api) {
          return { status: "error", reason: "pobAPI unavailable" };
        }

        const exported = await api.session.saveBuildXml();
        if (exported.status === "error") {
          return { status: "error", reason: exported.reason };
        }

        const result = await api.builds.saveXml(
          subPath,
          nextFileName,
          exported.xml,
        );
        if (result.status === "ok") {
          onDirtyChange(false);
          onSavedAs(nextFileName);
        }
        return result;
      },
      [onDirtyChange, onSavedAs, subPath],
    );

    useImperativeHandle(
      ref,
      () => ({
        saveCurrent: async () => {
          if (!fileName) {
            return { status: "error", reason: "current build has no file" };
          }
          return saveBuildAs(fileName);
        },
        saveDraftAs: saveBuildAs,
      }),
      [fileName, saveBuildAs],
    );

    useEffect(() => {
      if (loadState.status !== "ready") {
        setBuildMetadataState({ status: "idle" });
        setLevelInput("");
        setBuildMetadataActionError(null);
        setPendingClassConfirmation(null);
        return;
      }

      let cancelled = false;
      const loadBuildMetadata = async () => {
        const api = window.pobAPI;
        if (!api) {
          setBuildMetadataState({
            status: "error",
            reason: "pobAPI unavailable",
          });
          return;
        }

        setBuildMetadataState({ status: "loading" });
        const result = await api.session.buildMetadata();
        if (cancelled) return;
        if (result.status === "ok") {
          setBuildMetadataState({ status: "ready", snapshot: result.snapshot });
          setLevelInput(String(result.snapshot.level));
        } else {
          setBuildMetadataState({ status: "error", reason: result.reason });
        }
      };

      void loadBuildMetadata();
      return () => {
        cancelled = true;
      };
    }, [loadState.status, sessionRevision]);

    useEffect(() => {
      if (loadState.status !== "ready") {
        setRepoeTranslations(EMPTY_REPOE_TRANSLATIONS);
        return;
      }

      let cancelled = false;
      const loadTranslations = async () => {
        const api = window.pobAPI;
        if (!api) return;
        const result = await api.session.repoeTranslations("ko");
        if (cancelled) return;
        setRepoeTranslations(
          result.status === "ok" ? result.snapshot : EMPTY_REPOE_TRANSLATIONS,
        );
      };

      void loadTranslations();
      return () => {
        cancelled = true;
      };
    }, [loadState.status]);

    useEffect(() => {
      if (loadState.status !== "ready") {
        onMainSkillSummaryChange({ status: "idle" });
        return;
      }

      let cancelled = false;
      const loadMainSkillSummary = async () => {
        const api = window.pobAPI;
        if (!api) {
          onMainSkillSummaryChange({
            status: "error",
            reason: "pobAPI unavailable",
          });
          return;
        }

        onMainSkillSummaryChange({ status: "loading" });
        const result = await api.session.mainSkillSummary();
        if (cancelled) return;
        if (result.status === "ok") {
          onMainSkillSummaryChange({
            status: "ready",
            snapshot: result.snapshot,
          });
        } else {
          onMainSkillSummaryChange({ status: "error", reason: result.reason });
        }
      };

      void loadMainSkillSummary();
      return () => {
        cancelled = true;
      };
    }, [
      loadState.status,
      mainSkillSummaryRevision,
      onMainSkillSummaryChange,
      sessionRevision,
    ]);

    useEffect(() => {
      if (
        loadState.status !== "ready" ||
        activeBuildAction !== "importExport"
      ) {
        setImportExportSnapshotState({ status: "idle" });
        return;
      }

      let cancelled = false;
      const loadImportExportSnapshot = async () => {
        const api = window.pobAPI;
        if (!api) {
          setImportExportSnapshotState({
            status: "error",
            reason: t("buildEdit.importExport.error.api"),
          });
          return;
        }

        setImportExportSnapshotState({ status: "loading" });
        const result = await api.session.importExportSnapshot();
        if (cancelled) return;
        if (result.status === "ok") {
          setImportExportSnapshotState({
            status: "ready",
            snapshot: result.snapshot,
          });
          setBuildImportMode(result.snapshot.importControls.selectedMode);
        } else {
          setImportExportSnapshotState({
            status: "error",
            reason: result.reason,
          });
        }
      };

      void loadImportExportSnapshot();
      return () => {
        cancelled = true;
      };
    }, [activeBuildAction, loadState.status, sessionRevision, t]);

    const markBuildMutated = useCallback(() => {
      onDirtyChange(true);
      setMainSkillSummaryRevision((value) => value + 1);
    }, [onDirtyChange]);

    const applyBuildMetadataSnapshot = useCallback(
      (snapshot: PobBuildMetadataSnapshot) => {
        setBuildMetadataState({ status: "ready", snapshot });
        setLevelInput(String(snapshot.level));
        setLoadState((state) =>
          state.status === "ready"
            ? {
                status: "ready",
                summary: {
                  ...state.summary,
                  level: snapshot.level,
                  className: snapshot.className ?? "",
                  ascendClassName: snapshot.ascendClassName ?? "",
                },
              }
            : state,
        );
      },
      [],
    );

    const runBuildMetadataAction = useCallback(
      async (action: PobBuildMetadataAction) => {
        const api = window.pobAPI;
        if (!api) {
          setBuildMetadataActionError("pobAPI unavailable");
          return;
        }

        setBuildMetadataBusy(true);
        setBuildMetadataActionError(null);
        try {
          const result = await api.session.buildMetadataAction(action);
          if (result.status === "ok") {
            applyBuildMetadataSnapshot(result.snapshot);
            setPendingClassConfirmation(null);
            markBuildMutated();
            setSessionRevision((value) => value + 1);
            return;
          }
          if (result.status === "confirm") {
            applyBuildMetadataSnapshot(result.snapshot);
            setPendingClassConfirmation({
              confirmation: result.confirmation,
            });
            return;
          }
          setBuildMetadataActionError(result.reason);
        } catch (err) {
          setBuildMetadataActionError(toErrorMessage(err));
        } finally {
          setBuildMetadataBusy(false);
        }
      },
      [applyBuildMetadataSnapshot, markBuildMutated],
    );

    const confirmClassChange = useCallback(
      (confirmation: PobBuildMetadataClassConfirmationMode) => {
        if (!pendingClassConfirmation) return;
        void runBuildMetadataAction({
          type: "setClass",
          classId: pendingClassConfirmation.confirmation.classId,
          confirmation,
        });
      },
      [pendingClassConfirmation, runBuildMetadataAction],
    );

    const summary = loadState.status === "ready" ? loadState.summary : null;
    const buildMetadata =
      buildMetadataState.status === "ready"
        ? buildMetadataState.snapshot
        : null;
    const ascendancyOptions = useMemo(
      () => resolveBuildMetadataAscendancies(buildMetadata),
      [buildMetadata],
    );

    const commitLevelInput = useCallback(() => {
      if (!buildMetadata) return;
      const level = buildLevelActionValue(levelInput);
      setLevelInput(String(level));
      if (level === buildMetadata.level && !buildMetadata.levelAutoMode) return;
      void runBuildMetadataAction({ type: "setLevel", value: level });
    }, [buildMetadata, levelInput, runBuildMetadataAction]);

    const summaryStats = useMemo(
      () => [
        {
          label: t("buildEdit.summary.mainSkill"),
          value: present(summary?.mainSkillName),
        },
        {
          label: t("buildEdit.summary.mainSkillDps"),
          value: formatNumber(summary?.mainSkillDPS ?? null),
        },
      ],
      [summary, t],
    );

    const ready = loadState.status === "ready";
    const importExportSnapshot =
      importExportSnapshotState.status === "ready"
        ? importExportSnapshotState.snapshot
        : null;
    const selectedImportMode = importExportSnapshot?.importControls.modes.find(
      (mode) => mode.id === buildImportMode,
    );

    const handleGenerateBuildCode = async () => {
      const api = window.pobAPI;
      if (!api) {
        setBuildCodeStatus({
          kind: "error",
          message: t("buildEdit.importExport.error.api"),
        });
        return;
      }

      setBuildCodeBusy(true);
      setBuildCodeStatus({
        kind: "info",
        message: t("buildEdit.importExport.generating"),
      });
      try {
        const result = await api.session.exportBuildCode();
        if (result.status === "error") {
          setBuildCodeStatus({ kind: "error", message: result.reason });
          return;
        }
        setBuildCodeOutput(result.code);
        setBuildCodeStatus({
          kind: "success",
          message: t("buildEdit.importExport.generated"),
        });
      } catch (err) {
        setBuildCodeStatus({ kind: "error", message: toErrorMessage(err) });
      } finally {
        setBuildCodeBusy(false);
      }
    };

    const handleCopyBuildCode = async () => {
      if (!buildCodeOutput) return;
      if (!navigator.clipboard) {
        setBuildCodeStatus({
          kind: "error",
          message: t("buildEdit.importExport.error.clipboard"),
        });
        return;
      }

      try {
        await navigator.clipboard.writeText(buildCodeOutput);
        setBuildCodeStatus({
          kind: "success",
          message: t("buildEdit.importExport.copied"),
        });
      } catch (err) {
        setBuildCodeStatus({ kind: "error", message: toErrorMessage(err) });
      }
    };

    const handleExportSupportChange = async (value: boolean) => {
      const api = window.pobAPI;
      if (!api) {
        setBuildCodeStatus({
          kind: "error",
          message: t("buildEdit.importExport.error.api"),
        });
        return;
      }

      setExportSupportBusy(true);
      setBuildCodeStatus(null);
      try {
        const result = await api.session.importExportAction({
          type: "setExportSupport",
          value,
        });
        if (result.status === "ok") {
          setImportExportSnapshotState({
            status: "ready",
            snapshot: result.snapshot,
          });
          markBuildMutated();
        } else {
          setBuildCodeStatus({
            kind: "error",
            message: result.reason,
          });
        }
      } catch (err) {
        setBuildCodeStatus({ kind: "error", message: toErrorMessage(err) });
      } finally {
        setExportSupportBusy(false);
      }
    };

    const handleImportBuildCode = async () => {
      const code = buildCodeInput.trim();
      const api = window.pobAPI;
      if (!api) {
        setBuildCodeStatus({
          kind: "error",
          message: t("buildEdit.importExport.error.api"),
        });
        return;
      }
      if (!code) {
        setBuildCodeStatus({
          kind: "error",
          message: t("buildEdit.importExport.error.empty"),
        });
        return;
      }
      if (isBuildShareUrl(code)) {
        setBuildCodeStatus({
          kind: "error",
          message: t("buildEdit.importExport.error.urlUnsupported"),
        });
        return;
      }

      setBuildCodeBusy(true);
      setBuildCodeStatus({
        kind: "info",
        message: t("buildEdit.importExport.importing"),
      });
      try {
        const result = await api.session.importExportAction({
          type: "importBuildCode",
          code,
          mode: buildImportMode,
          name:
            buildImportMode === "comparison"
              ? "Imported comparison"
              : buildName,
        });
        if (result.status === "error") {
          setBuildCodeStatus({ kind: "error", message: result.reason });
          return;
        }
        if (result.status === "unsupported") {
          setImportExportSnapshotState({
            status: "ready",
            snapshot: result.snapshot,
          });
          setBuildCodeStatus({ kind: "error", message: result.reason });
          return;
        }

        setImportExportSnapshotState({
          status: "ready",
          snapshot: result.snapshot,
        });
        if (result.summary) {
          setLoadState({ status: "ready", summary: result.summary });
        }
        if (result.mode !== "comparison") {
          setSessionRevision((value) => value + 1);
          onActiveModeChange("tree");
          onDirtyChange(true);
        }
        setBuildCodeStatus({
          kind: "success",
          message:
            result.mode === "comparison"
              ? t("buildEdit.importExport.importedComparison")
              : t("buildEdit.importExport.imported"),
        });
      } catch (err) {
        setBuildCodeStatus({ kind: "error", message: toErrorMessage(err) });
      } finally {
        setBuildCodeBusy(false);
      }
    };

    return (
      <div className="pob-edit">
        <div className="pob-edit-header">
          <div>
            <h2>{buildName}</h2>
            <p>
              {loadState.status === "loading"
                ? t("buildEdit.loading")
                : loadState.status === "idle"
                  ? t("buildEdit.empty.body")
                  : t("buildEdit.placeholder.body")}
            </p>
          </div>
          <div className="pob-edit-header-actions">
            {POB_BUILD_HEADER_ACTIONS.map((action) => {
              const label = t(action.labelKey);
              return (
                <button
                  key={action.id}
                  type="button"
                  className={
                    "pob-edit-action" +
                    (action.iconOnly ? " pob-edit-action-icon" : "")
                  }
                  disabled={!ready}
                  aria-label={action.iconOnly ? label : undefined}
                  title={label}
                  onClick={() => setActiveBuildAction(action.buildAction)}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    {action.icon}
                  </span>
                  {!action.iconOnly && <span>{label}</span>}
                </button>
              );
            })}
            {isUserDraft && (
              <span className="pob-edit-dirty">{t("buildEdit.unsaved")}</span>
            )}
          </div>
        </div>

        {loadState.status === "error" ? (
          <div className="pob-error">
            {t("buildList.error.generic", { reason: loadState.reason })}
          </div>
        ) : (
          <div
            className="pob-build-metadata"
            aria-busy={
              loadState.status === "loading" ||
              buildMetadataState.status === "loading" ||
              buildMetadataBusy
            }
          >
            <div className="pob-build-metadata-controls">
              <label className="pob-build-metadata-field is-mode">
                <span>{t("buildEdit.metadata.levelMode")}</span>
                <button
                  type="button"
                  className={
                    "pob-build-metadata-toggle" +
                    (buildMetadata?.levelAutoMode ? " is-active" : "")
                  }
                  aria-pressed={buildMetadata?.levelAutoMode ?? false}
                  disabled={!buildMetadata || buildMetadataBusy}
                  onClick={() => {
                    if (!buildMetadata) return;
                    void runBuildMetadataAction({
                      type: "setLevelAutoMode",
                      value: !buildMetadata.levelAutoMode,
                    });
                  }}
                >
                  {buildMetadata?.levelAutoMode ? "Auto" : "Manual"}
                </button>
              </label>

              <label className="pob-build-metadata-field is-level">
                <span>{t("buildEdit.summary.level")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={levelInput}
                  disabled={!buildMetadata || buildMetadataBusy}
                  onChange={(event) =>
                    setLevelInput(sanitizeBuildLevelInput(event.target.value))
                  }
                  onBlur={commitLevelInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>

              <label className="pob-build-metadata-field">
                <span>{t("buildEdit.summary.class")}</span>
                <select
                  value={buildMetadata?.classId ?? ""}
                  disabled={!buildMetadata || buildMetadataBusy}
                  onChange={(event) => {
                    const classId = Number(event.target.value);
                    if (!Number.isFinite(classId)) return;
                    void runBuildMetadataAction({ type: "setClass", classId });
                  }}
                >
                  {!buildMetadata && (
                    <option value="">{present(summary?.className)}</option>
                  )}
                  {buildMetadata?.classes.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>
                      {classOption.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="pob-build-metadata-field">
                <span>{t("buildEdit.summary.ascendancy")}</span>
                <select
                  value={buildMetadata?.ascendClassId ?? ""}
                  disabled={!buildMetadata || buildMetadataBusy}
                  onChange={(event) => {
                    const ascendClassId = Number(event.target.value);
                    if (!Number.isFinite(ascendClassId)) return;
                    void runBuildMetadataAction({
                      type: "setAscendClass",
                      ascendClassId,
                    });
                  }}
                >
                  {!buildMetadata && (
                    <option value="">
                      {present(summary?.ascendClassName)}
                    </option>
                  )}
                  {ascendancyOptions.map((ascendancy) => (
                    <option key={ascendancy.id} value={ascendancy.id}>
                      {ascendancy.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="pob-edit-summary">
              {summaryStats.map((item) => (
                <div className="pob-edit-stat" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            {(buildMetadataState.status === "error" ||
              buildMetadataActionError) && (
              <div className="pob-error pob-build-metadata-error">
                {buildMetadataActionError ??
                  (buildMetadataState.status === "error"
                    ? buildMetadataState.reason
                    : "")}
              </div>
            )}
          </div>
        )}

        <div className="pob-mode">
          <div
            className="pob-mode-tabs"
            role="tablist"
            aria-label={t("buildEdit.modes.label")}
          >
            {POB_BUILD_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={activeMode === mode}
                className={
                  "pob-mode-tab" + (activeMode === mode ? " is-active" : "")
                }
                onClick={() => onActiveModeChange(mode)}
                disabled={!ready}
              >
                {t(`buildEdit.modes.${mode}`)}
              </button>
            ))}
          </div>
          <div className="pob-mode-panel" role="tabpanel" key={sessionRevision}>
            {!ready ? (
              <p className="pob-mode-placeholder-body">
                {t("buildEdit.modes.placeholder")}
              </p>
            ) : activeMode === "tree" ? (
              <PassiveTreeView active translations={repoeTranslations} />
            ) : activeMode === "items" ? (
              <ItemsView
                active
                translations={repoeTranslations}
                onMutated={markBuildMutated}
              />
            ) : activeMode === "skills" ? (
              <SkillsView
                active
                translations={repoeTranslations}
                onMutated={markBuildMutated}
              />
            ) : activeMode === "calcs" ? (
              <CalcsView active onMutated={markBuildMutated} />
            ) : activeMode === "party" ? (
              <PartyView active onMutated={markBuildMutated} />
            ) : activeMode === "notes" ? (
              <NotesView
                active
                buildName={buildName}
                onMutated={markBuildMutated}
              />
            ) : (
              <p className="pob-mode-placeholder-body">
                {t("buildEdit.modes.pendingBody")}
              </p>
            )}
          </div>
        </div>

        {activeBuildAction && ready && (
          <div
            className="pob-build-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`pob-${activeBuildAction}-title`}
            onClick={() => setActiveBuildAction(null)}
          >
            <div
              className="pob-build-action-modal-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="pob-build-action-modal-header">
                <h3 id={`pob-${activeBuildAction}-title`}>
                  {activeBuildAction === "configuration"
                    ? t("buildEdit.config.modalTitle")
                    : t("buildEdit.importExport.modalTitle")}
                </h3>
                <button
                  type="button"
                  className="pob-edit-action"
                  onClick={() => setActiveBuildAction(null)}
                >
                  {t("window.close")}
                </button>
              </header>
              {activeBuildAction === "configuration" ? (
                <ConfigView active onMutated={markBuildMutated} />
              ) : (
                <div className="pob-build-share">
                  {importExportSnapshotState.status === "loading" && (
                    <div className="pob-build-share-status is-info">
                      {t("buildEdit.importExport.loading")}
                    </div>
                  )}
                  {importExportSnapshotState.status === "error" && (
                    <div className="pob-build-share-status is-error">
                      {importExportSnapshotState.reason}
                    </div>
                  )}
                  <section className="pob-build-share-section">
                    <header className="pob-build-share-header">
                      <strong>
                        {importExportSnapshot?.exportControls.generateLabel ??
                          t("buildEdit.importExport.generateTitle")}
                      </strong>
                      <div className="pob-build-share-actions">
                        {importExportSnapshot && (
                          <label className="pob-build-share-check">
                            <input
                              type="checkbox"
                              checked={
                                importExportSnapshot.exportControls
                                  .exportSupport.checked
                              }
                              disabled={buildCodeBusy || exportSupportBusy}
                              onChange={(event) =>
                                void handleExportSupportChange(
                                  event.currentTarget.checked,
                                )
                              }
                            />
                            <span>
                              {
                                importExportSnapshot.exportControls
                                  .exportSupport.label
                              }
                            </span>
                          </label>
                        )}
                        <button
                          type="button"
                          className="pob-edit-action"
                          disabled={buildCodeBusy}
                          onClick={() => void handleGenerateBuildCode()}
                        >
                          {t("buildEdit.importExport.generate")}
                        </button>
                        <button
                          type="button"
                          className="pob-edit-action"
                          disabled={buildCodeBusy || !buildCodeOutput}
                          onClick={() => void handleCopyBuildCode()}
                        >
                          {t("buildEdit.importExport.copy")}
                        </button>
                      </div>
                    </header>
                    <textarea
                      className="pob-build-code-textarea"
                      readOnly
                      value={buildCodeOutput}
                      placeholder={t("buildEdit.importExport.codePlaceholder")}
                    />
                    {importExportSnapshot && (
                      <div className="pob-build-share-row">
                        <select className="pob-build-share-select" disabled>
                          {importExportSnapshot.exportControls.exportSites.map(
                            (site) => (
                              <option key={site.id} value={site.id}>
                                {site.label}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          type="button"
                          className="pob-edit-action"
                          disabled
                          title={t(
                            "buildEdit.importExport.error.shareUnsupported",
                          )}
                        >
                          {
                            importExportSnapshot.exportControls.shareButton
                              .label
                          }
                        </button>
                        <span className="pob-build-share-muted">
                          {t("buildEdit.importExport.error.shareUnsupported")}
                        </span>
                      </div>
                    )}
                  </section>

                  <section className="pob-build-share-section">
                    <header className="pob-build-share-header">
                      <strong>
                        {importExportSnapshot?.importControls.inputLabel ??
                          t("buildEdit.importExport.importTitle")}
                      </strong>
                      <div className="pob-build-share-actions">
                        <select
                          className="pob-build-share-select"
                          value={buildImportMode}
                          disabled={buildCodeBusy}
                          onChange={(event) =>
                            setBuildImportMode(
                              event.currentTarget.value as PobBuildImportMode,
                            )
                          }
                        >
                          {(
                            importExportSnapshot?.importControls.modes ?? [
                              {
                                id: "current" as const,
                                label: t(
                                  "buildEdit.importExport.importMode.current",
                                ),
                                enabled: true,
                              },
                            ]
                          ).map((mode) => (
                            <option
                              key={mode.id}
                              value={mode.id}
                              disabled={!mode.enabled}
                            >
                              {mode.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="pob-edit-action"
                          disabled={
                            buildCodeBusy ||
                            selectedImportMode?.enabled === false
                          }
                          onClick={() => void handleImportBuildCode()}
                        >
                          {t("buildEdit.importExport.import")}
                        </button>
                      </div>
                    </header>
                    <textarea
                      className="pob-build-code-textarea"
                      value={buildCodeInput}
                      onChange={(event) => {
                        setBuildCodeInput(event.target.value);
                        setBuildCodeStatus(null);
                      }}
                      placeholder={t(
                        "buildEdit.importExport.importPlaceholder",
                      )}
                    />
                    {importExportSnapshot && (
                      <div className="pob-build-share-row">
                        <span className="pob-build-share-muted">
                          {t("buildEdit.importExport.error.urlUnsupported")}
                        </span>
                      </div>
                    )}
                  </section>

                  {importExportSnapshot && (
                    <section className="pob-build-share-section is-compact">
                      <header className="pob-build-share-header">
                        <strong>
                          {importExportSnapshot.characterImport.sectionLabel}
                        </strong>
                        <span className="pob-build-share-muted">
                          {importExportSnapshot.characterImport.statusLabel}
                        </span>
                      </header>
                      <div className="pob-build-share-row">
                        <button
                          type="button"
                          className="pob-edit-action"
                          disabled
                          title={t(
                            "buildEdit.importExport.error.characterUnsupported",
                          )}
                        >
                          {
                            importExportSnapshot.characterImport
                              .authenticateButton.label
                          }
                        </button>
                        <select className="pob-build-share-select" disabled>
                          {importExportSnapshot.characterImport.realmOptions.map(
                            (realm) => (
                              <option key={realm.id} value={realm.id}>
                                {realm.label}
                              </option>
                            ),
                          )}
                        </select>
                        <span className="pob-build-share-muted">
                          {t(
                            "buildEdit.importExport.error.characterUnsupported",
                          )}
                        </span>
                      </div>
                      <div className="pob-build-share-row">
                        <button
                          type="button"
                          className="pob-edit-action"
                          disabled
                        >
                          {
                            importExportSnapshot.characterImport
                              .importTreeButton.label
                          }
                        </button>
                        <button
                          type="button"
                          className="pob-edit-action"
                          disabled
                        >
                          {
                            importExportSnapshot.characterImport
                              .importItemsButton.label
                          }
                        </button>
                        <label className="pob-build-share-check is-disabled">
                          <input
                            type="checkbox"
                            checked={
                              importExportSnapshot.characterImport.clearJewels
                                .checked
                            }
                            disabled
                            readOnly
                          />
                          <span>
                            {
                              importExportSnapshot.characterImport.clearJewels
                                .label
                            }
                          </span>
                        </label>
                        <label className="pob-build-share-check is-disabled">
                          <input
                            type="checkbox"
                            checked={
                              importExportSnapshot.characterImport.clearSkills
                                .checked
                            }
                            disabled
                            readOnly
                          />
                          <span>
                            {
                              importExportSnapshot.characterImport.clearSkills
                                .label
                            }
                          </span>
                        </label>
                      </div>
                    </section>
                  )}

                  {buildCodeStatus && (
                    <div
                      className={`pob-build-share-status is-${buildCodeStatus.kind}`}
                    >
                      {buildCodeStatus.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {pendingClassConfirmation && (
          <div
            className="pob-build-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pob-class-change-title"
            onClick={() => setPendingClassConfirmation(null)}
          >
            <div
              className="pob-build-confirm-modal-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="pob-build-action-modal-header">
                <h3 id="pob-class-change-title">Class Change</h3>
                <button
                  type="button"
                  className="pob-edit-action"
                  disabled={buildMetadataBusy}
                  onClick={() => setPendingClassConfirmation(null)}
                >
                  {t("window.close")}
                </button>
              </header>
              <div className="pob-build-confirm-body">
                <p>{pendingClassConfirmation.confirmation.message}</p>
                <div className="pob-build-confirm-actions">
                  <button
                    type="button"
                    className="pob-edit-action"
                    disabled={buildMetadataBusy}
                    onClick={() => setPendingClassConfirmation(null)}
                  >
                    {t("buildList.dialog.cancel")}
                  </button>
                  <button
                    type="button"
                    className="pob-edit-action"
                    disabled={buildMetadataBusy}
                    onClick={() => confirmClassChange("connectPath")}
                  >
                    {pendingClassConfirmation.confirmation.alternateLabel}
                  </button>
                  <button
                    type="button"
                    className="pob-edit-action pob-edit-action-primary"
                    disabled={buildMetadataBusy}
                    onClick={() => confirmClassChange("continue")}
                  >
                    {pendingClassConfirmation.confirmation.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <pre className="pob-edit-path">
          {subPath || "/"} :: {fileName ?? t("buildEdit.empty.unsaved")}
        </pre>
      </div>
    );
  },
);

BuildEditView.displayName = "BuildEditView";

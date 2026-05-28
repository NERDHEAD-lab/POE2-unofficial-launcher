import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { CalcsView } from "./CalcsView";
import { ConfigView } from "./ConfigView";
import { ItemsView } from "./ItemsView";
import { PassiveTreeView } from "./PassiveTreeView";
import { EMPTY_REPOE_TRANSLATIONS } from "./repoeTranslations";
import { SkillsView } from "./SkillsView";

import type { BuildsMutationResult, PobBuildSummary } from "../../shared/types";

type BuildMode = "tree" | "items" | "skills" | "calcs" | "config";

const MODES: BuildMode[] = ["tree", "items", "skills", "calcs", "config"];

export interface BuildEditViewHandle {
  saveDraftAs: (fileName: string) => Promise<BuildsMutationResult>;
}

interface BuildEditViewProps {
  subPath: string;
  fileName: string | null;
  draftKey: number;
  onDirtyChange: (dirty: boolean) => void;
  onSavedAs: (fileName: string) => void;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: PobBuildSummary }
  | { status: "error"; reason: string };

const formatNumber = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat().format(Math.round(value));
};

const present = (value: string | null | undefined): string =>
  value && value.trim() ? value : "-";

export const BuildEditView = forwardRef<
  BuildEditViewHandle,
  BuildEditViewProps
>(({ subPath, fileName, draftKey, onDirtyChange, onSavedAs }, ref) => {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [activeMode, setActiveMode] = useState<BuildMode>("tree");
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

  useImperativeHandle(
    ref,
    () => ({
      saveDraftAs: async (nextFileName: string) => {
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
    }),
    [onDirtyChange, onSavedAs, subPath],
  );

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

  const summary = loadState.status === "ready" ? loadState.summary : null;
  const stats = useMemo(
    () => [
      {
        label: t("buildEdit.summary.class"),
        value: present(summary?.className),
      },
      {
        label: t("buildEdit.summary.ascendancy"),
        value: present(summary?.ascendClassName),
      },
      {
        label: t("buildEdit.summary.level"),
        value: summary ? String(summary.level) : "-",
      },
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
        {isUserDraft && (
          <span className="pob-edit-dirty">{t("buildEdit.unsaved")}</span>
        )}
      </div>

      {loadState.status === "error" ? (
        <div className="pob-error">
          {t("buildList.error.generic", { reason: loadState.reason })}
        </div>
      ) : (
        <div
          className="pob-edit-summary"
          aria-busy={loadState.status === "loading"}
        >
          {stats.map((item) => (
            <div className="pob-edit-stat" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="pob-mode">
        <div
          className="pob-mode-tabs"
          role="tablist"
          aria-label={t("buildEdit.modes.label")}
        >
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={activeMode === mode}
              className={
                "pob-mode-tab" + (activeMode === mode ? " is-active" : "")
              }
              onClick={() => setActiveMode(mode)}
              disabled={loadState.status !== "ready"}
            >
              {t(`buildEdit.modes.${mode}`)}
            </button>
          ))}
        </div>
        <div className="pob-mode-panel" role="tabpanel">
          {loadState.status !== "ready" ? (
            <p className="pob-mode-placeholder-body">
              {t("buildEdit.modes.placeholder")}
            </p>
          ) : activeMode === "tree" ? (
            <PassiveTreeView active translations={repoeTranslations} />
          ) : activeMode === "items" ? (
            <ItemsView
              active
              translations={repoeTranslations}
              onMutated={() => onDirtyChange(true)}
            />
          ) : activeMode === "skills" ? (
            <SkillsView
              active
              translations={repoeTranslations}
              onMutated={() => onDirtyChange(true)}
            />
          ) : activeMode === "calcs" ? (
            <CalcsView active />
          ) : (
            <ConfigView active onMutated={() => onDirtyChange(true)} />
          )}
        </div>
      </div>

      <pre className="pob-edit-path">
        {subPath || "/"} :: {fileName ?? t("buildEdit.empty.unsaved")}
      </pre>
    </div>
  );
});

BuildEditView.displayName = "BuildEditView";

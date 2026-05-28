import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type { BuildsMutationResult } from "../../shared/types";

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

export const BuildEditView = forwardRef<
  BuildEditViewHandle,
  BuildEditViewProps
>(({ subPath, fileName, draftKey, onDirtyChange, onSavedAs }, ref) => {
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState("");
  const [draftMemo, setDraftMemo] = useState("");

  useEffect(() => {
    setDraftName("");
    setDraftMemo("");
    onDirtyChange(false);
  }, [draftKey, fileName, onDirtyChange, subPath]);

  const dirty = useMemo(
    () =>
      fileName === null &&
      (draftName.trim().length > 0 || draftMemo.trim().length > 0),
    [draftMemo, draftName, fileName],
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      saveDraftAs: async (nextFileName: string) => {
        const result = await window.pobAPI?.builds.saveStub(
          subPath,
          nextFileName,
        );
        if (!result) {
          return { status: "error", reason: "pobAPI unavailable" };
        }
        if (result.status === "ok") {
          setDraftName("");
          setDraftMemo("");
          onDirtyChange(false);
          onSavedAs(nextFileName);
        }
        return result;
      },
    }),
    [onDirtyChange, onSavedAs, subPath],
  );

  if (fileName !== null) {
    return (
      <div className="pob-edit">
        <div className="pob-edit-header">
          <div>
            <h2>{fileName}</h2>
            <p>{t("buildEdit.placeholder.body")}</p>
          </div>
        </div>
        <pre className="pob-edit-path">
          {subPath || "/"} :: {fileName}
        </pre>
      </div>
    );
  }

  return (
    <div className="pob-edit pob-edit-empty">
      <div className="pob-edit-header">
        <div>
          <h2>{t("buildEdit.empty.title")}</h2>
          <p>{t("buildEdit.empty.body")}</p>
        </div>
      </div>
      <div className="pob-draft-form">
        <label>
          {t("buildEdit.empty.nameLabel")}
          <input
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder={t("buildEdit.empty.namePlaceholder")}
          />
        </label>
        <label>
          {t("buildEdit.empty.memoLabel")}
          <textarea
            value={draftMemo}
            onChange={(event) => setDraftMemo(event.target.value)}
            placeholder={t("buildEdit.empty.memoPlaceholder")}
          />
        </label>
      </div>
      <pre className="pob-edit-path">
        {subPath || "/"} :: {t("buildEdit.empty.unsaved")}
      </pre>
    </div>
  );
});

BuildEditView.displayName = "BuildEditView";

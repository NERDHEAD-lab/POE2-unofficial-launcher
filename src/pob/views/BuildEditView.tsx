import React from "react";
import { useTranslation } from "react-i18next";

interface BuildEditViewProps {
  subPath: string;
  fileName: string;
  onBack: () => void;
}

export const BuildEditView: React.FC<BuildEditViewProps> = ({
  subPath,
  fileName,
  onBack,
}) => {
  const { t } = useTranslation();
  return (
    <div className="pob-edit">
      <button className="pob-btn" onClick={onBack}>
        {t("buildEdit.backToList")}
      </button>
      <h2>{t("buildEdit.placeholder.title")}</h2>
      <p>{t("buildEdit.placeholder.body")}</p>
      <pre className="pob-edit-path">
        {subPath || "/"} :: {fileName || "(new)"}
      </pre>
    </div>
  );
};

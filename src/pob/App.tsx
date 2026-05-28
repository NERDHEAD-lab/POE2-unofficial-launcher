import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { BuildEditView } from "./views/BuildEditView";
import { BuildListView } from "./views/BuildListView";

type View =
  | { kind: "list" }
  | { kind: "edit"; subPath: string; fileName: string };

const LANGS = ["ko", "en"] as const;
type Lang = (typeof LANGS)[number];

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>({ kind: "list" });

  const game = window.pobAPI?.getInitialGame() ?? "POE2";

  const setLang = (lng: Lang) => {
    void i18n.changeLanguage(lng);
  };

  return (
    <div className="pob-app">
      <header className="pob-app-header">
        <div className="pob-app-title">
          {t("app.title")} <span className="pob-app-game">[{game}]</span>
        </div>
        <div className="pob-app-lang">
          <label>{t("lang.label")}:</label>
          <select
            value={i18n.resolvedLanguage ?? "ko"}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`lang.${l}`)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="pob-app-main">
        {view.kind === "list" && (
          <BuildListView
            onOpen={(subPath, fileName) =>
              setView({ kind: "edit", subPath, fileName })
            }
          />
        )}
        {view.kind === "edit" && (
          <BuildEditView
            subPath={view.subPath}
            fileName={view.fileName}
            onBack={() => setView({ kind: "list" })}
          />
        )}
      </main>
    </div>
  );
};

export default App;

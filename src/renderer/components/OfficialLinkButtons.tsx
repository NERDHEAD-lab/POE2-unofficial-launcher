import React from "react";

import { AppConfig } from "../../shared/types";
import { BASE_URLS, TRADE_URLS } from "../../shared/urls";

interface OfficialLinkButtonsProps {
  activeGame: AppConfig["activeGame"];
  serviceChannel: AppConfig["serviceChannel"];
}

const OfficialLinkButtons: React.FC<OfficialLinkButtonsProps> = ({
  activeGame,
  serviceChannel,
}) => {
  const handleOpenLink = (type: "home" | "trade") => {
    if (!window.electronAPI) return;

    let url: string;
    if (type === "home") {
      url = BASE_URLS[serviceChannel][activeGame];
    } else {
      url = TRADE_URLS[serviceChannel][activeGame];
    }

    if (url) {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="official-links-container">
      <button
        className="official-link-btn"
        onClick={() => handleOpenLink("home")}
      >
        홈페이지
      </button>
      <button
        className="official-link-btn"
        onClick={() => handleOpenLink("trade")}
      >
        거래소
      </button>
    </div>
  );
};

export default OfficialLinkButtons;

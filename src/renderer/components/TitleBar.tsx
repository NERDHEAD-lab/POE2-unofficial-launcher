import React from "react";

import WindowControls from "./WindowControls";
import icon from "../assets/icon.ico"; // Assuming copied icon.ico works, or fallback

interface TitleBarProps {
  title?: string;
  showUpdateIcon?: boolean;
  onUpdateClick?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({
  title = `PoE Unofficial Launcher v${__APP_VERSION__}`,
  showUpdateIcon = false,
  onUpdateClick,
}) => {
  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <img src={icon} alt="App Icon" className="app-icon" />
        <span className="app-title">{title}</span>
      </div>
      <div className="title-bar-right">
        {showUpdateIcon && (
          <button
            className="title-bar-btn update-btn"
            onClick={onUpdateClick}
            title="새로운 버전 업데이트 가능"
            style={{
              marginRight: "15px",
              padding: "4px 12px",
              color: "#dfcf99", // PoE Gold Color
              background: "rgba(0, 0, 0, 0.6)",
              border: "1px solid #7e6c42", // Muted Gold Border
              borderRadius: "2px", // Slight rounding, almost sharp
              cursor: "pointer",
              fontFamily: "Fontin-SmallCaps, sans-serif", // Try to use game font if available
              fontSize: "13px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              boxShadow: "0 0 5px rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#af944f";
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.boxShadow = "0 0 10px #af944f";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#7e6c42";
              e.currentTarget.style.color = "#dfcf99";
              e.currentTarget.style.boxShadow = "0 0 5px rgba(0, 0, 0, 0.5)";
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "16px" }}
            >
              download
            </span>
            UPDATE
          </button>
        )}
        <WindowControls />
      </div>
    </div>
  );
};

export default TitleBar;

import React, { useState } from "react";
import "../../settings/Settings.css";

interface FatalErrorModalProps {
  errorDetails: string;
}

const FatalErrorModal: React.FC<FatalErrorModalProps> = ({ errorDetails }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(errorDetails)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy error details:", err);
      });
  };

  const handleRestart = () => {
    if (window.electronAPI && window.electronAPI.relaunchApp) {
      window.electronAPI.relaunchApp();
    } else {
      window.close();
    }
  };

  const handleClose = () => {
    if (window.electronAPI && window.electronAPI.closeWindow) {
      window.electronAPI.closeWindow();
    } else {
      window.close();
    }
  };

  return (
    <div
      className="settings-overlay modal-animation-enter"
      style={{ zIndex: 10000 }}
    >
      <div
        className="settings-modal"
        style={{
          width: "750px",
          height: "550px",
          maxWidth: "95vw",
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column", // CRITICAL FIX: Ensure vertical stacking
          backgroundColor: "#111111",
          border: "1px solid rgba(255, 68, 68, 0.4)",
          boxShadow:
            "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 68, 68, 0.1)",
          borderRadius: "12px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header Section */}
        <div
          className="settings-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255, 68, 68, 0.2)",
            background:
              "linear-gradient(to right, rgba(255, 68, 68, 0.05), transparent)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="material-symbols-outlined"
              style={{
                color: "#ff4444",
                fontSize: "28px",
                textShadow: "0 0 10px rgba(255, 68, 68, 0.3)",
              }}
            >
              report
            </span>
            <h2
              style={{
                color: "#ff4444",
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              치명적 오류 보고 (Fatal Error Report)
            </h2>
          </div>
          <button
            className="settings-close-btn-inline"
            onClick={handleClose}
            style={{
              position: "static", // Override any absolute positioning from CSS
              marginRight: "-8px",
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content Section */}
        <div
          className="settings-content custom-scrollbar"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            background:
              "radial-gradient(circle at top left, rgba(20, 20, 20, 1), rgba(10, 10, 10, 1))",
          }}
        >
          <div
            style={{
              color: "#cccccc",
              fontSize: "15px",
              lineHeight: "1.7",
            }}
          >
            <p style={{ margin: "0 0 8px 0" }}>
              런처 구동 중 복구가 불가능한 시스템 오류가 발생했습니다.
            </p>
            <p style={{ margin: 0, color: "#888" }}>
              개발자에게 아래의 오류 내용을 전달해 주시면 문제 해결에 큰 도움이
              됩니다.
            </p>
          </div>

          <div
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              color: "#ff8888",
              padding: "20px",
              borderRadius: "8px",
              fontFamily: "'Consolas', 'Monaco', monospace",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              overflowY: "auto",
              flex: 1,
              border: "1px solid rgba(255, 255, 255, 0.05)",
              boxShadow: "inset 0 2px 10px rgba(0, 0, 0, 0.5)",
              lineHeight: "1.5",
            }}
          >
            <div
              style={{
                color: "#555",
                marginBottom: "8px",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Error Details Trace:
            </div>
            {errorDetails}
          </div>
        </div>

        {/* Footer Section */}
        <div
          className="settings-footer"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "12px",
            padding: "16px 24px",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            flexShrink: 0,
          }}
        >
          <button
            className="setting-btn default"
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: copied
                ? "rgba(76, 175, 80, 0.2)"
                : "rgba(255, 255, 255, 0.05)",
              color: copied ? "#81c784" : "#ccc",
              borderColor: copied ? "#4caf50" : "rgba(255, 255, 255, 0.1)",
              transition: "all 0.3s ease",
              minWidth: "140px",
              justifyContent: "center",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              {copied ? "check" : "content_copy"}
            </span>
            <span>{copied ? "복사 완료!" : "오류 내용 복사"}</span>
          </button>

          <button
            className="setting-btn primary"
            onClick={handleRestart}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#ff4444",
              color: "#000",
              fontWeight: 700,
              minWidth: "150px",
              justifyContent: "center",
              boxShadow: "0 4px 15px rgba(255, 68, 68, 0.2)",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              restart_alt
            </span>
            <span>런처 강제 재시작</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FatalErrorModal;

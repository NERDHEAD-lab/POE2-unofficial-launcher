import React, { useState } from "react";
import "../../settings/Settings.css"; // Reuse existing modal framework styles

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
      // Fallback
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
    <div className="settings-overlay modal-animation-enter">
      <div
        className="settings-modal"
        style={{
          width: "700px",
          height: "500px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          // Fallback colors in case theme CSS vars are completely broken
          backgroundColor: "var(--theme-footer-bg, #1a1a1a)",
          border: "1px solid var(--theme-accent, #ff4444)",
        }}
      >
        <div
          className="settings-header"
          style={{
            borderBottomColor: "var(--theme-accent, #ff4444)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined"
              style={{ color: "var(--theme-accent, #ff4444)" }}
            >
              error
            </span>
            <h2 style={{ color: "var(--theme-accent, #ff4444)" }}>
              치명적 오류 복구 (Fatal Error)
            </h2>
          </div>
          <button className="settings-close" onClick={handleClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div
          className="settings-content custom-scrollbar"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              color: "var(--theme-text, #e0e0e0)",
              fontSize: "14px",
              lineHeight: "1.6",
            }}
          >
            <p>
              런처에서 예기치 못한 문제가 발생하여 정상적으로 화면을 표시할 수
              없습니다.
            </p>
            <p>
              문제가 계속 발생한다면 다음의 <strong>오류 내용 복사</strong>{" "}
              버튼을 눌러 개발자에게 문의해 주세요.
            </p>
          </div>

          <div
            style={{
              backgroundColor: "#000000",
              color: "#ff8888",
              padding: "16px",
              borderRadius: "8px",
              fontFamily: "monospace",
              fontSize: "12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              overflowY: "auto",
              flex: 1,
              border: "1px solid #333",
            }}
          >
            {errorDetails}
          </div>
        </div>

        <div
          className="settings-footer"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            borderTop: "1px solid #333",
            padding: "16px 20px",
            backgroundColor: "rgba(0,0,0,0.3)",
          }}
        >
          <button
            className="settings-button primary"
            onClick={handleCopy}
            style={{
              backgroundColor: copied ? "#4caf50" : "transparent",
              borderColor: copied ? "#4caf50" : "var(--theme-text, #ffffff)",
              color: copied ? "#ffffff" : "var(--theme-text, #ffffff)",
              transition: "all 0.2s",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? "복사 완료!" : "오류 내용 복사"}
          </button>

          <button
            className="settings-button primary"
            onClick={handleRestart}
            style={{
              backgroundColor: "var(--theme-accent, #ff4444)",
              borderColor: "var(--theme-accent, #ff4444)",
              color: "#ffffff",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              refresh
            </span>
            런처 강제 재시작
          </button>
        </div>
      </div>
    </div>
  );
};

export default FatalErrorModal;

import React, { useState, useMemo } from "react";

import { SUPPORT_URLS } from "../../../shared/urls";
import "../../settings/Settings.css";
import { Toast } from "../ui/Toast";

export type ModalType = "fatal" | "bug" | "suggestion";

interface ModalConfig {
  title: string;
  icon: string;
  themeColor: string;
  showLogs: boolean;
  closeLabel: string;
  closeIcon: string;
  discordButtons: { label: string; url: string }[];
  description: string;
  subDescription: string;
}

// Custom Discord SVG Icon
const DiscordIcon = ({ size = 18, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.198.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.2259 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
  </svg>
);

// Custom GitHub SVG Icon
const GitHubIcon = ({ size = 18, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.042-1.416-4.042-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

interface FatalErrorModalProps {
  errorDetails: string;
  type?: ModalType;
  launcherVersion?: string;
  onClose?: () => void;
}

const FatalErrorModal: React.FC<FatalErrorModalProps> = ({
  errorDetails,
  type = "fatal",
  launcherVersion = "Unknown",
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [userDescription, setUserDescription] = useState("");
  const [showDiscordMenu, setShowDiscordMenu] = useState(false);
  const [timestamp] = useState(new Date().toLocaleString());
  const [toast, setToast] = useState({ visible: false, message: "" });

  const showToast = (message: string) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  };

  // Type-based Configuration Map
  const config = useMemo<ModalConfig>(() => {
    switch (type) {
      case "bug":
        return {
          title: "버그 제보",
          icon: "bug_report",
          themeColor: "var(--theme-accent, #dfcf99)",
          showLogs: true,
          closeLabel: "닫기",
          closeIcon: "close",
          discordButtons: [
            { label: "오류 제보 바로가기", url: SUPPORT_URLS.DISCORD_ERRORS },
            { label: "디스코드 참가", url: SUPPORT_URLS.DISCORD_INVITE },
          ],
          description: "런처 사용 중 발견하신 버그를 들려주세요.",
          subDescription:
            "아래 양식을 채워 GitHub나 디스코드로 전달해 주시면 감사하겠습니다.",
        };
      case "suggestion":
        return {
          title: "기능 건의",
          icon: "rate_review",
          themeColor: "var(--theme-accent, #dfcf99)",
          showLogs: false,
          closeLabel: "닫기",
          closeIcon: "close",
          discordButtons: [
            {
              label: "기능 제안 바로가기",
              url: SUPPORT_URLS.DISCORD_SUGGESTIONS,
            },
            { label: "디스코드 참가", url: SUPPORT_URLS.DISCORD_INVITE },
          ],
          description:
            "런처에 제안하고 싶은 새로운 아이디어나 개선 의견을 들려주세요.",
          subDescription:
            "사용자 여러분의 소중한 의견은 런처 발전에 큰 바탕이 됩니다.",
        };
      case "fatal":
      default:
        return {
          title: "오류",
          icon: "report",
          themeColor: "#ff4444",
          showLogs: true,
          closeLabel: "런처 종료 및 재시작",
          closeIcon: "restart_alt",
          discordButtons: [
            { label: "디스코드 참가", url: SUPPORT_URLS.DISCORD_INVITE },
          ],
          description:
            "런처 구동 중 복구가 불가능한 시스템 오류가 발생했습니다.",
          subDescription:
            "개발자에게 아래의 오류 내용을 전달해 주시면 문제 해결에 큰 도움이 됩니다.",
        };
    }
  }, [type]);

  const displayLogs =
    errorDetails && errorDetails.trim() !== ""
      ? errorDetails
      : "최근에 발생한 오류가 없습니다.";

  const handleCopy = () => {
    const report = `# [오류 보고서]
- **보고 유형**: ${type.toUpperCase()}
- **발생 시간**: ${timestamp}
- **런처 버전**: ${launcherVersion}

## 상세 내용
> ${userDescription || "(상세 내용 없음)"}

${
  config.showLogs
    ? `## 최근 에러 로그 계보 (Error Trace)
\`\`\`text
${displayLogs}
\`\`\``
    : ""
}
`;

    navigator.clipboard
      .writeText(report)
      .then(() => {
        setCopied(true);
        showToast("보고서가 클립보드에 복사되었습니다.");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy report:", err);
      });
  };

  const handleCopyEmail = () => {
    navigator.clipboard
      .writeText(SUPPORT_URLS.EMAIL)
      .then(() => {
        setEmailCopied(true);
        showToast("이메일 주소가 복사되었습니다.");
        setTimeout(() => setEmailCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy email:", err);
      });
  };

  // Custom Confirmation Dialog for UI Consistency
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [onConfirmAction, setOnConfirmAction] = useState<(() => void) | null>(
    null,
  );

  const confirmAndExecute = (action: () => void) => {
    if (type !== "fatal" && userDescription.trim() !== "") {
      setOnConfirmAction(() => action);
      setIsConfirmOpen(true);
    } else {
      action();
    }
  };

  const handleAction = () => {
    confirmAndExecute(() => {
      if (onClose) {
        onClose();
      } else if (window.electronAPI && window.electronAPI.relaunchApp) {
        window.electronAPI.relaunchApp();
      } else {
        window.close();
      }
    });
  };

  const handleHeaderClose = () => {
    confirmAndExecute(() => {
      if (onClose) {
        onClose();
      } else {
        if (window.electronAPI && window.electronAPI.closeWindow) {
          window.electronAPI.closeWindow();
        } else {
          window.close();
        }
      }
    });
  };

  // Confirm Dialog defined as a separate UI piece rather than a component during render
  const renderConfirmDialog = () => {
    if (!isConfirmOpen) return null;

    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10001,
          backdropFilter: "blur(4px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsConfirmOpen(false);
        }}
      >
        <div
          style={{
            width: "350px",
            backgroundColor: "#1c1c1c",
            border: `1px solid ${config.themeColor}44`,
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            animation: "modal-animation-enter 0.2s ease-out",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="material-symbols-outlined"
              style={{ color: "#ffb74d", fontSize: "24px" }}
            >
              warning
            </span>
            <h3 style={{ margin: 0, color: "#eee", fontSize: "16px" }}>경고</h3>
          </div>
          <p
            style={{
              margin: 0,
              color: "#aaa",
              fontSize: "14px",
              lineHeight: "1.6",
            }}
          >
            작성 중인 내용이 있습니다.
            <br />
            정말 닫으시겠습니까?
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "4px",
            }}
          >
            <button
              className="setting-btn default"
              onClick={() => setIsConfirmOpen(false)}
              style={{ minWidth: "80px" }}
            >
              취소
            </button>
            <button
              className="setting-btn primary"
              onClick={() => {
                setIsConfirmOpen(false);
                if (onConfirmAction) onConfirmAction();
              }}
              style={{
                minWidth: "80px",
                backgroundColor: config.themeColor,
                color: "#000",
                fontWeight: 600,
              }}
            >
              확인
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="settings-overlay modal-animation-enter"
      style={{ zIndex: 10000 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleHeaderClose();
      }}
    >
      <div
        className="settings-modal"
        style={{
          width: "750px",
          height: "650px",
          maxWidth: "95vw",
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#111111",
          border: `1px solid ${config.themeColor}66`,
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.8), 0 0 20px ${config.themeColor}1a`,
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
            borderBottom: `1px solid ${config.themeColor}33`,
            background: `linear-gradient(to right, ${config.themeColor}0d, transparent)`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="material-symbols-outlined"
              style={{
                color: config.themeColor,
                fontSize: "28px",
                textShadow: `0 0 10px ${config.themeColor}4d`,
              }}
            >
              {config.icon}
            </span>
            <h2
              style={{
                color: config.themeColor,
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              {config.title}
            </h2>
          </div>
          <button
            className="settings-close-btn-inline"
            onClick={handleHeaderClose}
            style={{ position: "static", marginRight: "-8px" }}
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
            <p style={{ margin: "0 0 4px 0" }}>{config.description}</p>
            <p style={{ margin: "0 0 12px 0" }}>{config.subDescription}</p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "rgba(255, 255, 255, 0.03)",
                padding: "16px 20px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      color: "#dfcf99",
                      fontWeight: 600,
                      fontSize: "14px",
                      fontFamily: "monospace",
                    }}
                  >
                    {SUPPORT_URLS.EMAIL}
                  </span>
                </div>
                <button
                  className="setting-btn default"
                  onClick={handleCopyEmail}
                  title="이메일 주소 복사"
                  style={{
                    padding: "0 12px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    backgroundColor: emailCopied
                      ? "rgba(76, 175, 80, 0.1)"
                      : "rgba(255, 255, 255, 0.05)",
                    color: emailCopied ? "#81c784" : "#ccc",
                    borderColor: emailCopied
                      ? "#4caf50"
                      : "rgba(255, 255, 255, 0.1)",
                    minWidth: "100px",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "18px" }}
                  >
                    {emailCopied ? "check" : "content_copy"}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 500 }}>
                    {emailCopied ? "복사 완료!" : "메일 복사"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* User Input Section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              flex: config.showLogs ? "0 0 auto" : "1",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: "2px",
              }}
            >
              <div
                style={{
                  color: "#888",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                {type === "suggestion"
                  ? "건의 내용:"
                  : "오류 정보 (상세 증상):"}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#666",
                  display: "flex",
                  gap: "12px",
                  fontFamily: "monospace",
                }}
              >
                <span>현재 시간: {timestamp}</span>
                <span>런처 버전: {launcherVersion}</span>
              </div>
            </div>
            <textarea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder={
                type === "suggestion"
                  ? "런처에 반영되었으면 하는 기능을 자유롭게 제안해 주세요."
                  : "상세하게 증상을 설명해주세요. (예: 게임 시작 버튼을 눌렀는데 반응이 없습니다.)"
              }
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "12px 16px",
                color: "#eee",
                fontSize: "14px",
                fontFamily: "inherit",
                minHeight: "100px",
                flex: config.showLogs ? "0 0 auto" : "1",
                resize: "none",
                outline: "none",
                transition: "border-color 0.3s ease",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#dfcf9980")}
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)")
              }
            />
          </div>

          {/* Logs Section */}
          {config.showLogs && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                flex: 1,
                minHeight: "150px",
              }}
            >
              <div
                style={{
                  color: "#555",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                최근 오류 정보 (Recent Error Trace):
              </div>
              <div
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.6)",
                  color: type === "fatal" ? "#ff8888" : "#dfcf99bb",
                  padding: "16px",
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
                {displayLogs}
              </div>
            </div>
          )}
        </div>

        {/* Footer Section */}
        <div
          className="settings-footer"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            flexShrink: 0,
          }}
        >
          {/* Tool Group (Left) */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative" }}>
              <button
                className="setting-btn default"
                onClick={() => setShowDiscordMenu(!showDiscordMenu)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "rgba(114, 137, 218, 0.1)",
                  color: "#7289da",
                  borderColor: "rgba(114, 137, 218, 0.3)",
                  minWidth: "110px",
                  justifyContent: "center",
                }}
              >
                <DiscordIcon />
                <span>Discord</span>
              </button>

              {showDiscordMenu && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 8px)",
                    left: 0,
                    backgroundColor: "#1c1c1c",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    boxShadow: "0 -10px 30px rgba(0,0,0,0.5)",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: "160px",
                    overflow: "hidden",
                    zIndex: 100,
                  }}
                >
                  {config.discordButtons.map((btn, idx) => (
                    <button
                      key={idx}
                      style={{
                        padding: "12px 16px",
                        border: "none",
                        background: "none",
                        color: "#eee",
                        fontSize: "13px",
                        textAlign: "left",
                        cursor: "pointer",
                        borderBottom:
                          idx < config.discordButtons.length - 1
                            ? "1px solid rgba(255,255,255,0.05)"
                            : "none",
                        transition: "background 0.2s",
                      }}
                      onClick={() => {
                        window.open(btn.url, "_blank");
                        setShowDiscordMenu(false);
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "rgba(255,255,255,0.08)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className="setting-btn default"
              onClick={() => window.open(SUPPORT_URLS.ISSUES, "_blank")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                color: "#ccc",
                minWidth: "140px",
                justifyContent: "center",
              }}
            >
              <GitHubIcon />
              <span>GitHub issue</span>
            </button>
          </div>

          {/* Action Group (Right) - Copy Moved Here */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
                minWidth: "160px",
                justifyContent: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px" }}
              >
                {copied ? "check" : "description"}
              </span>
              <span>{copied ? "복사 완료!" : "보고서 복사"}</span>
            </button>

            <button
              className="setting-btn primary"
              onClick={handleAction}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: config.themeColor,
                color: "#000",
                fontWeight: 700,
                minWidth: type === "fatal" ? "180px" : "120px",
                justifyContent: "center",
                boxShadow: `0 4px 15px ${config.themeColor}33`,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px" }}
              >
                {config.closeIcon}
              </span>
              <span>{config.closeLabel}</span>
            </button>
          </div>
        </div>
      </div>
      <Toast
        visible={toast.visible}
        message={toast.message}
        variant="success"
      />
      {renderConfirmDialog()}
    </div>
  );
};

export default FatalErrorModal;

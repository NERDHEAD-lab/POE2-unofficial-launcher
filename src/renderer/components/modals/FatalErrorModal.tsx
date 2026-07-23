import React, { useEffect, useMemo, useState } from "react";

import { SUPPORT_URLS } from "../../../shared/urls";
import "../../settings/Settings.css";
import iconDiscord from "../../assets/icon-discord.svg?raw";
import iconGithub from "../../assets/icon-github.svg?raw";
import { Toast } from "../ui/Toast";

import type { LauncherLogAvailability } from "../../../shared/types";

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

interface FatalErrorModalProps {
  errorDetails: string;
  errorSummary?: string;
  occurredAt?: number;
  type?: ModalType;
  launcherVersion?: string;
  onClose?: () => void;
}

const FatalErrorModal: React.FC<FatalErrorModalProps> = ({
  errorDetails,
  errorSummary,
  occurredAt,
  type = "fatal",
  launcherVersion = "Unknown",
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [userDescription, setUserDescription] = useState("");
  const [showDiscordMenu, setShowDiscordMenu] = useState(false);
  const [logAvailability, setLogAvailability] =
    useState<LauncherLogAvailability | null>(null);
  const [isCheckingLogs, setIsCheckingLogs] = useState(
    type !== "suggestion" && occurredAt !== undefined,
  );
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    variant: "success" | "warning" | "error";
  }>({ visible: false, message: "", variant: "success" });

  const showToast = (
    message: string,
    variant: "success" | "warning" | "error" = "success",
  ) => {
    setToast({ visible: true, message, variant });
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

  useEffect(() => {
    let isActive = true;

    if (!config.showLogs) {
      return () => {
        isActive = false;
      };
    }

    if (occurredAt === undefined) {
      return () => {
        isActive = false;
      };
    }

    window.electronAPI
      .getLauncherLogAvailability(occurredAt)
      .then((availability) => {
        if (isActive) {
          setLogAvailability(availability);
        }
      })
      .catch(() => {
        if (isActive) {
          setLogAvailability({ status: "unavailable" });
        }
      })
      .finally(() => {
        if (isActive) {
          setIsCheckingLogs(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [config.showLogs, occurredAt]);

  const displayLogs =
    errorDetails && errorDetails.trim() !== ""
      ? errorDetails
      : "최근에 발생한 오류가 없습니다.";
  const displaySummary = errorSummary?.trim() ?? "";
  const timestamp =
    typeof occurredAt === "number" && Number.isFinite(occurredAt)
      ? new Date(occurredAt).toLocaleString()
      : "확인되지 않음";
  const modalWidth = config.showLogs ? "900px" : "750px";
  const modalHeight = config.showLogs ? "min(820px, 92vh)" : "650px";
  const userInputMinHeight = config.showLogs ? "88px" : "100px";
  const logsMinHeight = config.showLogs ? "260px" : "150px";

  const handleCopy = () => {
    const reportLogSection = config.showLogs
      ? `${displaySummary ? `## 최근 오류 안내\n${displaySummary}\n\n` : ""}## 최근 오류 정보 (Error Trace)
\`\`\`text
${displayLogs}
\`\`\``
      : "";

    const report = `# [오류 보고서]
- **보고 유형**: ${type.toUpperCase()}
- **발생 시간**: ${timestamp}
- **런처 버전**: ${launcherVersion}

## 상세 내용
> ${userDescription || "(상세 내용 없음)"}

${reportLogSection}
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

  const handleDownloadLogs = async () => {
    if (
      isSavingLogs ||
      occurredAt === undefined ||
      logAvailability?.status !== "available"
    ) {
      return;
    }

    setIsSavingLogs(true);
    try {
      const result =
        await window.electronAPI.saveLauncherLogsForTimestamp(occurredAt);

      switch (result.status) {
        case "saved":
          showToast("로그 파일이 저장되었습니다.");
          break;
        case "canceled":
          break;
        case "missing":
          setLogAvailability({
            status: "missing",
            dateKey: logAvailability.dateKey,
          });
          showToast(
            "해당 날짜의 로그가 더 이상 존재하지 않습니다.",
            "warning",
          );
          break;
        case "failed":
          showToast("로그 파일을 저장하지 못했습니다.", "error");
          break;
      }
    } catch {
      showToast("로그 파일을 저장하지 못했습니다.", "error");
    } finally {
      setIsSavingLogs(false);
    }
  };

  const logDownloadTitle = getLogDownloadTitle({
    occurredAt,
    availability: logAvailability,
    isChecking:
      isCheckingLogs ||
      (config.showLogs &&
        occurredAt !== undefined &&
        logAvailability === null),
    isSaving: isSavingLogs,
  });
  const isLogAvailabilityPending =
    isCheckingLogs ||
    (config.showLogs &&
      occurredAt !== undefined &&
      logAvailability === null);
  const canDownloadLogs =
    !isLogAvailabilityPending &&
    !isSavingLogs &&
    logAvailability?.status === "available";
  const logDownloadLabel = isSavingLogs
    ? "로그 저장 중…"
    : isLogAvailabilityPending
      ? "로그 확인 중…"
      : "로그 다운로드";

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
          width: modalWidth,
          height: modalHeight,
          maxWidth: "96vw",
          maxHeight: "96vh",
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
                <span>발생 시간: {timestamp}</span>
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
                minHeight: userInputMinHeight,
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
                flex: "1 1 auto",
                minHeight: logsMinHeight,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
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
                <button
                  className="setting-btn default"
                  onClick={handleDownloadLogs}
                  disabled={!canDownloadLogs}
                  title={logDownloadTitle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    minWidth: "142px",
                    height: "32px",
                    opacity: canDownloadLogs ? 1 : 0.55,
                    cursor: canDownloadLogs ? "pointer" : "not-allowed",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "17px" }}
                  >
                    {isSavingLogs ? "progress_activity" : "download"}
                  </span>
                  <span>{logDownloadLabel}</span>
                </button>
              </div>
              <div
                style={{
                  color: "#8a8a8a",
                  fontSize: "11px",
                  lineHeight: "1.5",
                }}
              >
                다운로드한 로그에는 계정 ID, 로컬 경로, 페이지 URL 등 개인정보가
                포함될 수 있습니다. 공유 전에 내용을 확인해 주세요.
              </div>
              {displaySummary && (
                <div
                  style={{
                    backgroundColor: "rgba(255, 183, 77, 0.08)",
                    color: "#f0d8a8",
                    padding: "12px 14px",
                    borderRadius: "8px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "keep-all",
                    border: "1px solid rgba(255, 183, 77, 0.22)",
                    lineHeight: "1.6",
                    fontSize: "13px",
                  }}
                >
                  {displaySummary}
                </div>
              )}
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
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "currentColor",
                  }}
                  dangerouslySetInnerHTML={{ __html: iconDiscord }}
                />
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
              <span
                style={{
                  width: "18px",
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "currentColor",
                }}
                dangerouslySetInnerHTML={{ __html: iconGithub }}
              />
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
        variant={toast.variant}
      />
      {renderConfirmDialog()}
    </div>
  );
};

function getLogDownloadTitle({
  occurredAt,
  availability,
  isChecking,
  isSaving,
}: {
  occurredAt?: number;
  availability: LauncherLogAvailability | null;
  isChecking: boolean;
  isSaving: boolean;
}): string {
  if (isSaving) return "로그 파일을 저장하고 있습니다.";
  if (isChecking) return "오류 시점의 로그 파일을 확인하고 있습니다.";
  if (occurredAt === undefined) {
    return "정확한 오류 시점이 없어 다운로드할 로그를 선택할 수 없습니다.";
  }

  switch (availability?.status) {
    case "available":
      return `${availability.dateKey} 로그 ${availability.segmentCount}개 (${formatBytes(
        availability.totalBytes,
      )})를 ZIP으로 저장합니다.`;
    case "missing":
      return `${availability.dateKey}에 보관된 로그 파일이 없습니다.`;
    case "invalid":
      return "오류 시점 정보가 올바르지 않습니다.";
    case "unavailable":
      return "로그 저장소를 확인할 수 없습니다.";
    default:
      return "로그 파일을 확인할 수 없습니다.";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export default FatalErrorModal;

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import PromotionDismissModal from "./modals/PromotionDismissModal";
import { PromotionRow } from "./PromotionRow";
import {
  buildErrorReportData,
  getDebugLogNotificationId,
  formatRelativeDebugLogTime,
  getDebugLogNotificationTitle,
  getDebugLogPreview,
  getExceptionDebugLogs,
} from "../../shared/debug-log-policy";
import {
  promotionScheduleKey,
  type PromotionEvent,
} from "../../shared/promotions";
import { DebugLogPayload, OperationalNotification } from "../../shared/types";
import { usePromotions } from "../hooks/usePromotions";
import { useReadNotifications } from "../hooks/useReadNotifications";
import { dedupeOperationalNotifications } from "../utils/game-path-registry-warning";

import "./WindowControls.css";

interface WindowControlsProps {
  devMode: boolean;
  debugConsole: boolean;
  operationalNotifications?: readonly OperationalNotification[];
  onOperationalNotificationClick?: (
    notification: OperationalNotification,
  ) => void;
}

const DISMISSED_NOTIFICATION_STORAGE_KEY =
  "poe-launcher:dismissed-error-notifications";
const MAX_DISMISSED_NOTIFICATION_IDS = 100;

const WindowControls: React.FC<WindowControlsProps> = ({
  devMode,
  debugConsole,
  operationalNotifications = [],
  onOperationalNotificationClick,
}) => {
  const [exceptionLogs, setExceptionLogs] = useState<DebugLogPayload[]>([]);
  const promotions = usePromotions();
  const { readIds, markRead } = useReadNotifications();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<PromotionEvent | null>(
    null,
  );
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<
    Set<string>
  >(loadDismissedNotificationIds);
  const controlsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    window.electronAPI
      ?.getDebugHistory()
      .then((history) => {
        if (!isMounted) return;

        const dismissedIds = loadDismissedNotificationIds();
        const initialExceptionLogs = getExceptionDebugLogs(history).filter(
          (log) => !dismissedIds.has(getDebugLogNotificationId(log)),
        );

        if (initialExceptionLogs.length > 0) {
          setExceptionLogs(initialExceptionLogs);
        }
      })
      .catch(() => {
        // The warning affordance is best-effort. The report modal still works.
      });

    if (window.electronAPI?.onExceptionLog) {
      unsubscribe = window.electronAPI.onExceptionLog((log) => {
        setExceptionLogs((prev) => [...prev, log].slice(-20));
      });
    }

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!isNotificationOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isNotificationOpen]);

  const notificationLogs = useMemo(
    () =>
      [...exceptionLogs]
        .filter(
          (log) =>
            !dismissedNotificationIds.has(getDebugLogNotificationId(log)),
        )
        .reverse(),
    [dismissedNotificationIds, exceptionLogs],
  );
  const operationalNotificationItems = useMemo(
    () => dedupeOperationalNotifications(operationalNotifications),
    [operationalNotifications],
  );
  const notificationCount =
    notificationLogs.length +
    operationalNotificationItems.length +
    promotions.length;
  const unreadWarningCount =
    notificationLogs.filter(
      (log) => !readIds.has(`error:${getDebugLogNotificationId(log)}`),
    ).length +
    operationalNotificationItems.filter(
      (item) => !readIds.has(`operational:${item.id}`),
    ).length;
  const unreadCount =
    unreadWarningCount +
    promotions.filter(
      (event) => !readIds.has(`promotion:${promotionScheduleKey(event)}`),
    ).length;
  const hasWarnings = unreadWarningCount > 0;
  const notificationColor =
    unreadCount === 0 ? "#888888" : hasWarnings ? "#ffb74d" : "#90bcee";

  const handleToggleDebug = async () => {
    if (window.electronAPI) {
      // Toggle the value
      await window.electronAPI.setConfig("debug_console", !debugConsole);
    }
  };

  const handleOpenExceptionReport = async (selectedLog: DebugLogPayload) => {
    let report = buildErrorReportData(exceptionLogs, selectedLog);

    try {
      const history = await window.electronAPI.getDebugHistory();
      report = buildErrorReportData(history, selectedLog);
    } catch (err) {
      console.error("Failed to collect logs for exception report:", err);
    }

    const event = new CustomEvent("SHOW_REPORT_MODAL", {
      detail: {
        ...report,
        occurredAt: selectedLog.timestamp,
        type: "bug",
      },
    });
    window.dispatchEvent(event);
    markRead(`error:${getDebugLogNotificationId(selectedLog)}`);
    setIsNotificationOpen(false);
  };

  const handleOpenOperationalNotification = (
    notification: OperationalNotification,
  ) => {
    if (onOperationalNotificationClick) {
      onOperationalNotificationClick(notification);
      markRead(`operational:${notification.id}`);
    }
    setIsNotificationOpen(false);
  };

  const handleDismissNotification = (
    event: React.MouseEvent,
    log: DebugLogPayload,
  ) => {
    event.stopPropagation();

    const notificationId = getDebugLogNotificationId(log);
    setDismissedNotificationIds((prev) => {
      const next = trimDismissedNotificationIds(
        new Set([...prev, notificationId]),
      );
      saveDismissedNotificationIds(next);
      return next;
    });
    setExceptionLogs((prev) =>
      prev.filter(
        (entry) => getDebugLogNotificationId(entry) !== notificationId,
      ),
    );
    if (notificationCount <= 1) {
      setIsNotificationOpen(false);
    }
  };

  const handleMinimize = () => {
    if (window.electronAPI && window.electronAPI.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleClose = () => {
    if (window.electronAPI && window.electronAPI.closeWindow) {
      window.electronAPI.closeWindow();
    }
  };

  const buttonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#888",
    width: "40px",
    height: "30px",
    fontSize: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s, color 0.2s",
  };

  return (
    <div
      ref={controlsRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isNotificationOpen) {
          event.preventDefault();
          setIsNotificationOpen(false);
          controlsRef.current
            ?.querySelector<HTMLButtonElement>("[data-notification-toggle]")
            ?.focus();
        }
      }}
      style={
        {
          display: "flex",
          position: "relative",
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
    >
      {devMode && (
        <button
          onClick={handleToggleDebug}
          style={{
            ...buttonStyle,
            color: debugConsole ? "var(--theme-accent)" : "#666",
            textShadow: debugConsole ? "0 0 8px var(--theme-accent)" : "none",
          }}
          title={debugConsole ? "디버그 콘솔 닫기" : "디버그 콘솔 열기"}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            if (!debugConsole) e.currentTarget.style.color = "#aaa";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            if (!debugConsole) e.currentTarget.style.color = "#666";
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "16px" }}
          >
            bug_report
          </span>
        </button>
      )}
      {notificationCount > 0 && (
        <button
          data-notification-toggle
          aria-expanded={isNotificationOpen}
          onClick={() => setIsNotificationOpen((prev) => !prev)}
          style={{
            ...buttonStyle,
            color: notificationColor,
            textShadow:
              unreadCount > 0 ? `0 0 8px ${notificationColor}80` : "none",
            position: "relative",
          }}
          title={unreadCount > 0 ? `알림 ${unreadCount}건 확인` : "알림 확인"}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,183,77,0.12)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = notificationColor;
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "17px" }}
          >
            {hasWarnings ? "warning" : "notifications"}
          </span>
          {unreadCount > 0 && (
            <span
              data-notification-badge
              style={{
                position: "absolute",
                top: "3px",
                right: "4px",
                minWidth: "15px",
                height: "15px",
                padding: "0 4px",
                borderRadius: "999px",
                background: hasWarnings ? "#ff4444" : "#487caf",
                color: "#fff",
                fontSize: "10px",
                fontWeight: 700,
                lineHeight: "15px",
                textAlign: "center",
                boxSizing: "border-box",
                boxShadow: hasWarnings
                  ? "0 0 6px rgba(255, 68, 68, 0.9)"
                  : "none",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}
      {isNotificationOpen && notificationCount > 0 && (
        <div
          data-notification-panel
          style={
            {
              position: "absolute",
              top: "34px",
              right: "8px",
              width: "380px",
              maxHeight: "460px",
              background: "rgba(17, 17, 17, 0.98)",
              border: `1px solid ${notificationColor}59`,
              borderRadius: "8px",
              boxShadow: "0 18px 48px rgba(0, 0, 0, 0.65)",
              zIndex: 10002,
              overflow: "hidden",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#eee",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            <span>알림</span>
            <span style={{ color: notificationColor, fontSize: "12px" }}>
              {unreadCount > 0 ? `안 읽음 ${unreadCount}건` : "모두 읽음"}
            </span>
          </div>
          <div
            className="custom-scrollbar"
            style={{
              maxHeight: "min(328px, calc(100vh - 96px))",
              overflowY: "auto",
              padding: "6px",
            }}
          >
            {operationalNotificationItems.map((notification) => (
              <button
                key={notification.id}
                type="button"
                data-notification-id={notification.id}
                className={
                  readIds.has(`operational:${notification.id}`)
                    ? "notification-read"
                    : undefined
                }
                onClick={() => handleOpenOperationalNotification(notification)}
                style={{
                  width: "100%",
                  minHeight: "76px",
                  display: "grid",
                  gridTemplateColumns: "28px 1fr",
                  gap: "8px",
                  padding: "10px 8px",
                  border: "none",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "6px",
                  background: "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background =
                    "rgba(255, 183, 77, 0.1)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    color: "#ffb74d",
                    fontSize: "18px",
                    lineHeight: "20px",
                    marginTop: "1px",
                  }}
                >
                  warning
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      color: "#f0d8a8",
                      fontSize: "12px",
                      fontWeight: 700,
                      lineHeight: "1.35",
                      marginBottom: "4px",
                    }}
                  >
                    {notification.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      color: "#aaa",
                      fontSize: "11px",
                      lineHeight: "1.45",
                    }}
                  >
                    {notification.message}
                  </span>
                </span>
              </button>
            ))}
            {notificationLogs.map((log) => (
              <div
                key={getDebugLogNotificationId(log)}
                data-error-notification
                className={
                  readIds.has(`error:${getDebugLogNotificationId(log)}`)
                    ? "notification-read"
                    : undefined
                }
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "1fr 42px",
                  alignItems: "stretch",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "6px",
                  background: "transparent",
                }}
              >
                <button
                  onClick={() => void handleOpenExceptionReport(log)}
                  style={{
                    width: "100%",
                    minHeight: "76px",
                    display: "grid",
                    gridTemplateColumns: "28px 1fr",
                    gap: "8px",
                    padding: "10px 8px",
                    border: "none",
                    background: "transparent",
                    color: "#ddd",
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: "6px 0 0 6px",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(255, 183, 77, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      color: "#ffb74d",
                      fontSize: "18px",
                      lineHeight: "20px",
                      marginTop: "1px",
                    }}
                  >
                    warning
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        color: "#f0d8a8",
                        fontSize: "12px",
                        fontWeight: 700,
                        lineHeight: "1.35",
                        marginBottom: "4px",
                      }}
                    >
                      {getDebugLogNotificationTitle(log)}
                    </span>
                    <span
                      style={{
                        display: "block",
                        color: "#aaa",
                        fontSize: "11px",
                        lineHeight: "1.45",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getDebugLogPreview(log)}
                    </span>
                    <span
                      style={{
                        display: "block",
                        color: "#777",
                        fontSize: "10px",
                        marginTop: "5px",
                      }}
                    >
                      {formatRelativeDebugLogTime(log.timestamp)}
                    </span>
                  </span>
                </button>
                <button
                  onClick={(event) => handleDismissNotification(event, log)}
                  title="알림 지우기"
                  style={{
                    position: "relative",
                    width: "100%",
                    minHeight: "76px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    color: "#ff5555",
                    cursor: "pointer",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 85, 85, 0.1)";
                    e.currentTarget.style.color = "#ff8888";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#ff5555";
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: "8px",
                      bottom: "8px",
                      left: 0,
                      width: "1px",
                      background:
                        "linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.13) 24%, rgba(255, 255, 255, 0.13) 76%, transparent)",
                      pointerEvents: "none",
                    }}
                  />
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "17px",
                      lineHeight: "17px",
                    }}
                  >
                    delete
                  </span>
                </button>
              </div>
            ))}
            {promotions.map((event) => (
              <PromotionRow
                key={promotionScheduleKey(event)}
                event={event}
                isRead={readIds.has(`promotion:${promotionScheduleKey(event)}`)}
                onRead={() =>
                  markRead(`promotion:${promotionScheduleKey(event)}`)
                }
                onDismiss={() => {
                  setIsNotificationOpen(false);
                  setDismissTarget(event);
                }}
              />
            ))}
          </div>
        </div>
      )}
      {dismissTarget &&
        createPortal(
          <PromotionDismissModal
            event={dismissTarget}
            onClose={() => setDismissTarget(null)}
          />,
          document.getElementById("app-container") ?? document.body,
        )}
      <button
        onClick={handleMinimize}
        aria-label="창 최소화"
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#888";
        }}
      >
        &#8211; {/* Minus sign */}
      </button>
      <button
        onClick={handleClose}
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#d32f2f";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#888";
        }}
      >
        &#10005; {/* Cross Mark */}
      </button>
    </div>
  );
};

export default WindowControls;

function loadDismissedNotificationIds(): Set<string> {
  try {
    if (typeof window === "undefined") return new Set();

    const raw = window.localStorage.getItem(DISMISSED_NOTIFICATION_STORAGE_KEY);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed.filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return new Set();
  }
}

function saveDismissedNotificationIds(ids: Set<string>): void {
  try {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      DISMISSED_NOTIFICATION_STORAGE_KEY,
      JSON.stringify([...ids]),
    );
  } catch {
    // localStorage can be unavailable in restricted renderer contexts.
  }
}

function trimDismissedNotificationIds(ids: Set<string>): Set<string> {
  const values = [...ids];
  return new Set(values.slice(-MAX_DISMISSED_NOTIFICATION_IDS));
}

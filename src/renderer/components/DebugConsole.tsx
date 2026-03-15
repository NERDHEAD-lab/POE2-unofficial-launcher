import React, { useEffect, useState, useRef } from "react";

import { ConfigViewerProps } from "./debug/ConfigViewer";
import ExportModal from "./debug/ExportModal";
import { mergeLog } from "./debug/helpers";
import { LogViewerProps } from "./debug/LogViewer";
import { LogModule, ConfigModule } from "./debug/modules";
import { LogEntry, DebugModule } from "./debug/types";
import { AppConfig } from "../../shared/types";
import "./DebugConsole.css";

const DebugConsole: React.FC = () => {
  const [currentConfig, setCurrentConfig] = useState<Partial<AppConfig>>({});
  const [logState, setLogState] = useState<{
    all: LogEntry[];
    byType: { [key: string]: LogEntry[] };
  }>({ all: [], byType: {} });

  const modules: (
    | DebugModule<LogViewerProps>
    | DebugModule<ConfigViewerProps>
  )[] = [LogModule, ConfigModule];
  const [filter, setFilter] = useState<string>("ALL");

  const bottomRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [initialValue, setInitialValue] = useState<unknown>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // --- Scrolling Logic ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const prevLogCountRef = useRef(0);
  const prevFilterRef = useRef(filter);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    // Check if user is near bottom (within 50px)
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAutoScroll(isAtBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior });
      setIsAutoScroll(true);
    }
  };

  // --- Drag-to-scroll for Tabs ---
  const tabsRef = useRef<HTMLDivElement>(null);
  const [isTabDragging, setIsTabDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStartXRef = useRef(0);
  const dragScrollLeftRef = useRef(0);

  const handleTabMouseDown = (e: React.MouseEvent) => {
    if (!tabsRef.current) return;
    setIsTabDragging(true);
    setHasMoved(false);
    dragStartXRef.current = e.pageX;
    dragScrollLeftRef.current = tabsRef.current.scrollLeft;
  };

  useEffect(() => {
    if (isTabDragging) {
      const handleMouseMoveGlobal = (e: MouseEvent) => {
        if (!tabsRef.current) return;
        const x = e.pageX;
        const walk = (x - dragStartXRef.current) * 1.5;

        if (Math.abs(x - dragStartXRef.current) > 5) {
          setHasMoved(true);
        }

        tabsRef.current.scrollLeft = dragScrollLeftRef.current - walk;
      };

      const handleMouseUpGlobal = () => {
        setIsTabDragging(false);
        // Reset hasMoved after a short delay to allow onClick to fire with current state
        setTimeout(() => setHasMoved(false), 50);
      };

      window.addEventListener("mousemove", handleMouseMoveGlobal);
      window.addEventListener("mouseup", handleMouseUpGlobal);
      return () => {
        window.removeEventListener("mousemove", handleMouseMoveGlobal);
        window.removeEventListener("mouseup", handleMouseUpGlobal);
      };
    }
  }, [isTabDragging]);

  // --- Configuration Helpers ---
  const startEditing = (key: string, val: unknown) => {
    setEditingKey(key);
    setInitialValue(val);
    setEditValue(JSON.stringify(val, null, 2));
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setInitialValue(null);
    setEditValue("");
    setSaveError(null);
  };

  const deleteConfig = async (key: string) => {
    if (window.electronAPI) {
      await window.electronAPI.deleteConfig(key);
    }
  };

  // Specific helpers to get typed props
  const getLogViewerProps = (tabId: string): LogViewerProps => ({
    logState,
    filter: tabId,
    bottomRef: bottomRef as React.RefObject<HTMLDivElement>,
  });

  const getConfigViewerProps = (/* tabId unused */): ConfigViewerProps => ({
    currentConfig,
    editingKey,
    initialValue,
    editValue,
    saveError,
    editorRef: editorRef as React.RefObject<HTMLTextAreaElement>,
    startEditing,
    cancelEditing,
    saveConfig,
    deleteConfig,
    setEditValue,
    setSaveError,
  });

  const handleExport = async (selectedIds: string[]) => {
    const allSources = modules.flatMap((m) => {
      if (m.id === "log-module") {
        return (m as typeof LogModule).getExportSources({
          logState,
        });
      }
      if (m.id === "config-module") {
        return (m as typeof ConfigModule).getExportSources({
          currentConfig,
        });
      }
      return [];
    });

    const files: { name: string; content: string }[] = [];
    allSources.forEach((source) => {
      if (selectedIds.includes(source.id)) {
        files.push(...source.getFiles());
      }
    });

    if (files.length > 0) {
      const success = await window.electronAPI.saveReport(files);
      if (success) {
        setShowExportModal(false);
      }
    }
  };

  const saveConfig = async (key: string) => {
    try {
      const parsed = JSON.parse(editValue);
      // Validations
      if (key === "activeGame" && parsed !== "POE1" && parsed !== "POE2") {
        throw new Error("Invalid Active Game: Must be 'POE1' or 'POE2'");
      }
      if (
        key === "serviceChannel" &&
        parsed !== "Kakao Games" &&
        parsed !== "GGG"
      ) {
        throw new Error(
          "Invalid Service Channel: Must be 'Kakao Games' or 'GGG'",
        );
      }
      if (
        key === "themeCache" &&
        (typeof parsed !== "object" || Array.isArray(parsed))
      ) {
        throw new Error("Theme Cache must be an object");
      }

      if (window.electronAPI) {
        await window.electronAPI.setConfig(key, parsed);
        setEditingKey(null);
        setInitialValue(null);
        setEditValue("");
        setSaveError(null);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError("Invalid JSON structure");
      }
    }
  };

  // --- Side Effects ---

  useEffect(() => {
    if (window.electronAPI) {
      // Fetch RAW config (ignore dependencies, includeForced = false) for the viewer
      window.electronAPI.getConfig(undefined, true, false).then((config) => {
        setCurrentConfig(config as AppConfig);

        // [Splash] Fade out and remove launcher splash screen from index.html (shared with App.tsx)
        setTimeout(() => {
          const splash = document.getElementById("launcher-splash");
          if (splash) {
            splash.classList.add("fade-out");
            setTimeout(() => splash.remove(), 1000);
          }
        }, 500);
      });

      const removeConfigListener = window.electronAPI.onConfigChange(
        (key, value) => {
          setCurrentConfig((prev) => {
            const next = { ...prev };
            if (value === undefined) {
              delete next[key as keyof AppConfig];
            } else {
              next[key as keyof AppConfig] =
                value as AppConfig[keyof AppConfig];
            }
            return next;
          });
        },
      );

      let removeLogListener: (() => void) | undefined;
      if (window.electronAPI.onDebugLog) {
        // 1. 초기 히스토리 먼저 가져오기 (초기 상태 설정)
        window.electronAPI.getDebugHistory().then((history) => {
          if (history && history.length > 0) {
            setLogState(() => {
              let updatedAll: LogEntry[] = [];
              const updatedByType: { [key: string]: LogEntry[] } = {};

              // 히스토리는 과거 순이므로 루프를 돌며 mergeLog 호출
              history.forEach((log) => {
                updatedAll = mergeLog(updatedAll, log as LogEntry);
                const typeList = updatedByType[log.type] || [];
                updatedByType[log.type] = mergeLog(typeList, log as LogEntry);
              });

              return {
                all: updatedAll,
                byType: updatedByType,
              };
            });
          }

          // 2. 히스토리 로딩 완료 후 실시간 리스너 등록 (경합 방지)
          // 참고: 메인 프로세스에서 히스토리 조회 시점과 리스너 등록 시점 사이에 로그가 발생할 수 있으므로
          // 리스너 콜백 내에서도 중복 체크를 수행합니다.
          if (window.electronAPI.onDebugLog) {
            removeLogListener = window.electronAPI.onDebugLog(
              (log: LogEntry) => {
                setLogState((prev) => {
                  // 완전 중복 체크: 동일 타임스탬프와 내용(해시)을 가진 로그가 이미 존재하는지 확인
                  const isExactDuplicate = prev.all.some(
                    (p) =>
                      p.timestamp === log.timestamp &&
                      (p.contentHash || mergeLog([], p)[0]?.contentHash) ===
                        (log.contentHash || mergeLog([], log)[0]?.contentHash),
                  );

                  if (isExactDuplicate) {
                    return prev;
                  }

                  const updatedAll = mergeLog(prev.all, log);
                  const typeList = prev.byType[log.type] || [];
                  const updatedTypeList = mergeLog(typeList, log);
                  return {
                    all: updatedAll,
                    byType: { ...prev.byType, [log.type]: updatedTypeList },
                  };
                });
              },
            );
          }
        });
      }

      return () => {
        if (removeConfigListener) removeConfigListener();
        if (removeLogListener) removeLogListener();
      };
    }
  }, []);

  // --- Auto-expand Editor ---
  useEffect(() => {
    if (editingKey && editorRef.current) {
      editorRef.current.style.height = "auto";
      editorRef.current.style.height = `${editorRef.current.scrollHeight + 2}px`;
    }
  }, [editValue, editingKey]);

  // Handle auto-scroll on log updates or filter change
  useEffect(() => {
    const currentCount = logState.all.length;
    const isNewLog = currentCount > prevLogCountRef.current;
    const isFilterChanged = filter !== prevFilterRef.current;

    prevLogCountRef.current = currentCount;
    prevFilterRef.current = filter;

    if (isFilterChanged) {
      // Always scroll to bottom on tab change
      scrollToBottom("auto");
    } else if (isNewLog && isAutoScroll) {
      // Auto-scroll only if explicitly enabled (user is at bottom)
      scrollToBottom("auto");
    }
  }, [logState, filter, isAutoScroll]);

  const activeModule = modules.find((m) => {
    if (m.id === "log-module") {
      return (m as typeof LogModule)
        .getTabs({ logState })
        .some((t) => t.id === filter);
    }
    if (m.id === "config-module") {
      return (m as typeof ConfigModule)
        .getTabs({ currentConfig })
        .some((t) => t.id === filter);
    }
    return false;
  });

  return (
    <div className="debug-console-container">
      <div
        className="console-titlebar"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="console-title-text">POE2 Launcher Debug Console</div>
        <div
          className="console-controls"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            onClick={() => setShowExportModal(true)}
            title="Export Logs & Config"
            className="btn-export"
          >
            💾 Export
          </button>
          <button
            onClick={async () => {
              if (window.electronAPI) {
                await window.electronAPI.setConfig("debug_console", false);
              } else {
                window.close();
              }
            }}
            title="Close"
            className="btn-close"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="panel-container"
        style={{
          whiteSpace: filter === "RAW CONFIGS" ? "normal" : "pre-wrap",
        }}
      >
        {activeModule && (
          <>
            {activeModule.id === "log-module" &&
              (activeModule as typeof LogModule).renderPanel(
                filter,
                getLogViewerProps(filter),
              )}
            {activeModule.id === "config-module" &&
              (activeModule as typeof ConfigModule).renderPanel(
                filter,
                getConfigViewerProps(),
              )}
          </>
        )}

        {/* New Log Badge / Scroll to Bottom Button */}
        {!isAutoScroll && filter !== "RAW CONFIGS" && (
          <button
            onClick={() => scrollToBottom("smooth")}
            className="new-log-button"
          >
            <span style={{ fontSize: "12px" }}>⬇</span> 새 로그 보기
          </button>
        )}
      </div>

      {/* Footer Container */}
      <div className="console-footer">
        {/* Left: Scrollable Tabs Area */}
        <div
          ref={tabsRef}
          onMouseDown={handleTabMouseDown}
          className="tabs-scroll-area"
          style={{
            cursor: isTabDragging ? "grabbing" : "pointer",
          }}
        >
          {modules
            .filter((m) => m.position === "left")
            .sort((a, b) => a.order - b.order)
            .flatMap((m) => {
              if (m.id === "log-module") {
                return (m as typeof LogModule).getTabs({ logState });
              }
              if (m.id === "config-module") {
                return (m as typeof ConfigModule).getTabs({
                  currentConfig,
                });
              }
              return [];
            })
            .map((tab) => {
              const isActive = filter === tab.id;
              const tabColor = tab.color || "#007acc";

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!hasMoved) setFilter(tab.id);
                  }}
                  className="console-tab"
                  style={{
                    background: isActive ? "#3e3e42" : "transparent",
                    color: isActive ? "#fff" : tab.color || "#ccc",
                    cursor: isTabDragging ? "grabbing" : "pointer",
                    borderTop: isActive
                      ? `2px solid ${tabColor}`
                      : "2px solid transparent",
                    opacity: isActive ? 1 : 0.7,
                  }}
                >
                  {tab.label.toUpperCase()}
                </button>
              );
            })}
        </div>

        {/* Right: Pinned Config Button Area */}
        <div className="pinned-area">
          {modules
            .filter((m) => m.position === "right")
            .sort((a, b) => a.order - b.order)
            .flatMap((m) => {
              if (m.id === "log-module") {
                return (m as typeof LogModule).getTabs({ logState });
              }
              if (m.id === "config-module") {
                return (m as typeof ConfigModule).getTabs({
                  currentConfig,
                });
              }
              return [];
            })
            .map((tab) => {
              const isActive = filter === tab.id;
              const tabColor = tab.color || "#007acc";

              return (
                <button
                  key={tab.id}
                  onMouseDown={() => setHasMoved(false)}
                  onClick={() => {
                    if (!hasMoved) setFilter(tab.id);
                  }}
                  className="pinned-tab"
                  style={{
                    background: isActive ? tabColor : "#333",
                    borderTop: isActive
                      ? "2px solid #fff"
                      : "2px solid transparent",
                  }}
                >
                  {tab.label.toUpperCase()}
                </button>
              );
            })}
        </div>
      </div>
      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          sources={modules.flatMap((m) => {
            if (m.id === "log-module") {
              return (m as typeof LogModule).getExportSources({
                logState,
              });
            }
            if (m.id === "config-module") {
              return (m as typeof ConfigModule).getExportSources({
                currentConfig,
              });
            }
            return [];
          })}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}
    </div>
  );
};

export default DebugConsole;

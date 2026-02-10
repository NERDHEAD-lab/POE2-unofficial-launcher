import React, { useEffect, useState, useRef } from "react";

import ExportModal from "./debug/ExportModal";
import { mergeLog } from "./debug/helpers";
import { LogModule, ConfigModule } from "./debug/modules";
import { LogEntry, DebugModule } from "./debug/types";
import { AppConfig } from "../../shared/types";

const DebugConsole: React.FC = () => {
  const [currentConfig, setCurrentConfig] = useState<Partial<AppConfig>>({});
  const [logState, setLogState] = useState<{
    all: LogEntry[];
    byType: { [key: string]: LogEntry[] };
  }>({ all: [], byType: {} });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modules: DebugModule<any>[] = [LogModule, ConfigModule];
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

  const getModuleContext = (moduleId: string) => {
    if (moduleId === "log-module") return { logState };
    if (moduleId === "config-module") return { currentConfig };
    return {};
  };

  const getModuleProps = (tabId: string) => {
    const module = modules.find((m) =>
      m.getTabs(getModuleContext(m.id)).some((t) => t.id === tabId),
    );
    if (!module) return {};

    if (module.id === "log-module") {
      return { logState, filter: tabId, bottomRef };
    }
    if (module.id === "config-module") {
      return {
        currentConfig,
        editingKey,
        initialValue,
        editValue,
        saveError,
        editorRef,
        startEditing,
        cancelEditing,
        saveConfig,
        deleteConfig,
        setEditValue,
        setSaveError,
      };
    }
    return {};
  };

  const handleExport = async (selectedIds: string[]) => {
    const allSources = modules.flatMap((m) =>
      m.getExportSources(getModuleContext(m.id)),
    );

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

  const activeModule = modules.find((m) =>
    m.getTabs(getModuleContext(m.id)).some((t) => t.id === filter),
  );

  return (
    <div
      style={{
        backgroundColor: "#1e1e1e",
        color: "#d4d4d4",
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: "12px",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <style>
        {`
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          
          .new-log-button {
            background-color: rgba(0, 122, 204, 0.7);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.15);
            padding: 5px 12px;
            border-radius: 14px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            animation: slideUp 0.3s ease-out;
          }

          .new-log-button:hover {
            background-color: rgba(0, 122, 204, 0.9);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.25);
          }

          .new-log-button:active {
            transform: translateY(0);
            background-color: #007acc;
          }

          @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0.4; }
            100% { opacity: 1; }
          }
          
          /* Hide Scrollbar for Tabs Area */
          .tabs-scroll-area::-webkit-scrollbar {
            display: none;
          }
          .tabs-scroll-area {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          
          /* Custom Slim Scrollbar for Debug Console */
          *::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          *::-webkit-scrollbar-track {
            background: transparent;
          }
          *::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            transition: background 0.2s ease;
          }
          *::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
          }
          
          /* Firefox Support */
          * {
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
          }
        `}
      </style>
      <div
        style={{
          borderBottom: "1px solid #333",
          padding: "10px",
          backgroundColor: "#1e1e1e",
          fontWeight: "bold",
          userSelect: "none",
          flexShrink: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>POE2 Launcher Debug Console</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setShowExportModal(true)}
            title="Export Logs & Config"
            style={{
              background: "#333",
              color: "#fff",
              border: "none",
              padding: "4px 8px",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            💾 Export
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            title="Close"
            style={{
              background: "transparent",
              color: "#888",
              border: "none",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          whiteSpace: filter === "RAW CONFIGS" ? "normal" : "pre-wrap",
          position: "relative",
        }}
      >
        {activeModule?.renderPanel(filter, getModuleProps(filter))}

        {/* New Log Badge / Scroll to Bottom Button */}
        {!isAutoScroll && filter !== "RAW CONFIGS" && (
          <button
            onClick={() => scrollToBottom("smooth")}
            className="new-log-button"
            style={{
              position: "fixed",
              bottom: "55px",
              right: "25px",
              zIndex: 100,
            }}
          >
            <span style={{ fontSize: "12px" }}>⬇</span> 새 로그 보기
          </button>
        )}
      </div>

      {/* Footer Container */}
      <div
        style={{
          borderTop: "1px solid #333",
          backgroundColor: "#252526",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "35px",
          overflow: "hidden",
        }}
      >
        {/* Left: Scrollable Tabs Area */}
        <div
          ref={tabsRef}
          onMouseDown={handleTabMouseDown}
          className="tabs-scroll-area"
          style={{
            flex: 1,
            display: "flex",
            overflowX: "auto",
            cursor: isTabDragging ? "grabbing" : "pointer",
            userSelect: "none",
            height: "100%",
          }}
        >
          {modules
            .filter((m) => m.position === "left")
            .sort((a, b) => a.order - b.order)
            .flatMap((m) => m.getTabs(getModuleContext(m.id)))
            .map((tab) => {
              const isActive = filter === tab.id;
              const tabColor = tab.color || "#007acc";

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!hasMoved) setFilter(tab.id);
                  }}
                  style={{
                    background: isActive ? "#3e3e42" : "transparent",
                    color: isActive ? "#fff" : tab.color || "#ccc",
                    border: "none",
                    padding: "0 16px",
                    height: "100%",
                    cursor: isTabDragging ? "grabbing" : "pointer",
                    fontSize: "12px",
                    fontFamily: "inherit",
                    borderRight: "1px solid #333",
                    borderTop: isActive
                      ? `2px solid ${tabColor}`
                      : "2px solid transparent",
                    whiteSpace: "nowrap",
                    opacity: isActive ? 1 : 0.7,
                  }}
                >
                  {tab.label.toUpperCase()}
                </button>
              );
            })}
        </div>

        {/* Right: Pinned Config Button Area */}
        <div
          style={{
            display: "flex",
            height: "100%",
            flexShrink: 0,
            borderLeft: "1px solid #333",
            backgroundColor: "#252526", // Ensure it's opaque during scroll
            zIndex: 11,
          }}
        >
          {modules
            .filter((m) => m.position === "right")
            .sort((a, b) => a.order - b.order)
            .flatMap((m) => m.getTabs(getModuleContext(m.id)))
            .map((tab) => {
              const isActive = filter === tab.id;
              const tabColor = tab.color || "#007acc";

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!hasMoved) setFilter(tab.id);
                  }}
                  style={{
                    background: isActive ? tabColor : "#333",
                    color: "#fff",
                    border: "none",
                    padding: "0 20px",
                    height: "100%",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "bold",
                    fontFamily: "inherit",
                    borderTop: isActive
                      ? "2px solid #fff"
                      : "2px solid transparent",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
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
          sources={modules.flatMap((m) =>
            m.getExportSources(getModuleContext(m.id)),
          )}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      )}
    </div>
  );
};

export default DebugConsole;

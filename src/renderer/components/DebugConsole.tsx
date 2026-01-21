import React, { useEffect, useState, useRef, useMemo } from "react";

import { CONFIG_METADATA } from "../../shared/config";
import {
  AppConfig,
  ConfigCategory,
  ConfigDefinition,
} from "../../shared/types";

// ... (LogEntry interface and constants remain the same)
interface LogEntry {
  timestamp: number;
  type: string;
  content: string;
  isError: boolean;
  count?: number;
  typeColor?: string;
  textColor?: string;
  // UI Meta
  contentHash?: string;
  mergeGroupId?: string;
  mergeGroupSize?: number;
}

const MAX_MERGE_LINES = 3;

// --- Log Helper Logic (Outside to avoid re-creation) ---
const getHash = (s: string) => {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
};

const isSameLog = (a: LogEntry, b: LogEntry) =>
  (a.contentHash || getHash(a.content + a.type + a.isError)) ===
  (b.contentHash || getHash(b.content + b.type + b.isError));

const mergeLog = (prevArray: LogEntry[], log: LogEntry): LogEntry[] => {
  const hash = getHash(log.content + log.type + log.isError);
  const newEntry: LogEntry = { ...log, count: 1, contentHash: hash };
  if (prevArray.length === 0) return [newEntry];

  const lastLog = prevArray[prevArray.length - 1];
  if (isSameLog(lastLog, newEntry)) {
    const updatedLastLog = {
      ...lastLog,
      count: (lastLog.count || 1) + 1,
      timestamp: newEntry.timestamp,
    };
    return [...prevArray.slice(0, -1), updatedLastLog];
  }

  for (let n = MAX_MERGE_LINES; n >= 2; n--) {
    if (prevArray.length >= 2 * n - 1) {
      const tailSize = n - 1;
      const currentIncomingSet = [...prevArray.slice(-tailSize), newEntry];
      const previousStableSet = prevArray.slice(-(n + tailSize), -tailSize);

      let isMatch = true;
      for (let i = 0; i < n; i++) {
        if (!isSameLog(previousStableSet[i], currentIncomingSet[i])) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        const firstType = previousStableSet[0].type;
        const isSameType = previousStableSet.every(
          (it) => it.type === firstType,
        );
        if (isSameType) {
          const groupId = getHash(
            previousStableSet.map((it) => it.contentHash || "").join("|"),
          );
          const updatedSlice = previousStableSet.map((it, idx) => ({
            ...it,
            count: (it.count || 1) + 1,
            timestamp: currentIncomingSet[idx].timestamp,
            mergeGroupId: groupId,
            mergeGroupSize: n,
          }));
          return [...prevArray.slice(0, -(n + tailSize)), ...updatedSlice];
        }
      }
    }
  }
  const updatedPrev = [...prevArray, newEntry];
  return updatedPrev.length > 2000 ? updatedPrev.slice(-2000) : updatedPrev;
};

const DebugConsole: React.FC = () => {
  const [currentConfig, setCurrentConfig] = useState<Partial<AppConfig>>({});
  const [logState, setLogState] = useState<{
    all: LogEntry[];
    byType: { [key: string]: LogEntry[] };
  }>({ all: [], byType: {} });
  const [filter, setFilter] = useState<string>("ALL");

  const bottomRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [initialValue, setInitialValue] = useState<unknown>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportItems, setSelectedExportItems] = useState<string[]>([
    "ALL",
    "RAW CONFIGS",
  ]);

  // --- Configuration Helpers ---
  const startEditing = (key: string, initialValue: unknown) => {
    setEditingKey(key);
    setInitialValue(initialValue);
    setEditValue(JSON.stringify(initialValue, null, 2));
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setInitialValue(null);
    setEditValue("");
    setSaveError(null);
  };

  const handleExport = async () => {
    const files: { name: string; content: string }[] = [];

    selectedExportItems.forEach((item) => {
      if (item === "RAW CONFIGS") {
        files.push({
          name: "raw_config.json",
          content: JSON.stringify(currentConfig, null, 2),
        });
      } else {
        const logs = logState.byType[item as LogEntry["type"]] || [];
        if (logs.length > 0) {
          const content = logs
            .map((l) => `[${l.timestamp}] [${l.type}] ${l.content}`)
            .join("\n");
          files.push({
            name: `${item.toLowerCase()}.log`,
            content,
          });
        } else if (item === "ALL") {
          const content = logState.all
            .map((l) => `[${l.timestamp}] [${l.type}] ${l.content}`)
            .join("\n");
          files.push({
            name: "all.log",
            content,
          });
        }
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
      window.electronAPI.getConfig().then((config) => {
        setCurrentConfig(config as AppConfig);
      });

      const removeConfigListener = window.electronAPI.onConfigChange(
        (key, value) => {
          setCurrentConfig((prev) => ({ ...prev, [key]: value }));
        },
      );

      let removeLogListener: (() => void) | undefined;
      if (window.electronAPI.onDebugLog) {
        removeLogListener = window.electronAPI.onDebugLog((log: LogEntry) => {
          setLogState((prev) => {
            const updatedAll = mergeLog(prev.all, log);
            const typeList = prev.byType[log.type] || [];
            const updatedTypeList = mergeLog(typeList, log);
            return {
              all: updatedAll,
              byType: { ...prev.byType, [log.type]: updatedTypeList },
            };
          });
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logState, filter]);

  const tabs = ["ALL", ...Object.keys(logState.byType)];

  const groupedLogs = useMemo(() => {
    const logs =
      filter === "ALL" ? logState.all : logState.byType[filter] || [];
    const groups: { isGroup: boolean; items: LogEntry[] }[] = [];
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.mergeGroupId) {
        const groupId = log.mergeGroupId;
        const groupItems = [log];
        let j = i + 1;
        while (j < logs.length && logs[j].mergeGroupId === groupId) {
          groupItems.push(logs[j]);
          j++;
        }
        if (groupItems.length > 1) {
          groups.push({ isGroup: true, items: groupItems });
          i = j - 1;
        } else groups.push({ isGroup: false, items: [log] });
      } else groups.push({ isGroup: false, items: [log] });
    }
    return groups;
  }, [filter, logState]);

  const renderLogLine = (
    log: LogEntry,
    showType: boolean,
    isInsideGroup: boolean,
  ) => (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        lineHeight: "1.4",
        color: log.isError ? "#f48771" : log.textColor || "#d4d4d4",
        marginBottom: isInsideGroup ? "2px" : "4px",
      }}
    >
      <span
        style={{
          color: "#6a9955",
          marginRight: "8px",
          fontSize: "11px",
          fontFamily: "monospace",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        [{new Date(log.timestamp).toLocaleTimeString()}]
      </span>
      {showType && (
        <span
          style={{
            color: log.typeColor || "#ce9178",
            fontWeight: "bold",
            fontSize: "11px",
            marginRight: "8px",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          [{log.type.toUpperCase()}]
        </span>
      )}
      <div style={{ flex: 1, wordBreak: "break-all" }}>
        <span>{log.content}</span>
        {!isInsideGroup && log.count && log.count > 1 && (
          <span
            style={{ marginLeft: "8px", color: "#ffcd38", fontWeight: "bold" }}
          >
            (x{log.count})
          </span>
        )}
      </div>
    </div>
  );

  const renderConfigItem = (
    key: string,
    name: string,
    description: string,
    value: unknown,
    isOrphaned: boolean = false,
  ) => {
    const isEditing = editingKey === key;
    const accentColor = isOrphaned ? "#ff9b00" : "#007acc";

    return (
      <div
        key={key}
        style={{
          marginBottom: "20px",
          padding: "12px",
          background: isOrphaned
            ? "rgba(255,155,0,0.05)"
            : "rgba(255,255,255,0.02)",
          borderRadius: "4px",
          borderLeft: `2px solid ${accentColor}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                color: isOrphaned ? "#ff9b00" : "#dcdcaa",
                fontWeight: "bold",
              }}
            >
              {name}
            </span>
            <span
              style={{
                color: isOrphaned ? "#ff9ba0" : "#569cd6",
                fontSize: "11px",
                fontFamily: "monospace",
                opacity: 0.7,
              }}
            >
              ({key})
            </span>
            {isEditing &&
              JSON.stringify(initialValue) !==
                JSON.stringify(currentConfig[key as keyof AppConfig]) && (
                <span
                  style={{
                    color: "#f48771",
                    fontSize: "11px",
                    fontWeight: "bold",
                    background: "rgba(244,135,113,0.1)",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    animation: "blink 1s infinite",
                  }}
                >
                  ⚠️ 외부에서 값이 변경됨
                </span>
              )}
          </div>

          {!isEditing ? (
            <button
              onClick={() => startEditing(key, value)}
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#ccc",
                border: "none",
                padding: "2px 8px",
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Edit
            </button>
          ) : (
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => saveConfig(key)}
                style={{
                  background: "#1e4e2e",
                  color: "#fff",
                  border: "none",
                  padding: "2px 10px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "bold",
                }}
              >
                Save
              </button>
              <button
                onClick={cancelEditing}
                style={{
                  background: "#4e1e1e",
                  color: "#fff",
                  border: "none",
                  padding: "2px 10px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div
          style={{
            color: isOrphaned ? "#ff9b00" : "#9cdcfe",
            fontSize: "12px",
            marginBottom: "10px",
            opacity: 0.8,
          }}
        >
          {description}
        </div>

        {isEditing ? (
          <div>
            <textarea
              ref={editorRef}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                setSaveError(null);
              }}
              style={{
                width: "100%",
                background: "#000",
                color: "#ce9178",
                border: `1px solid ${saveError ? "#f48771" : "#444"}`,
                borderRadius: "3px",
                padding: "8px",
                fontSize: "11px",
                fontFamily: "monospace",
                resize: "none", // Managed by JS
                outline: "none",
                overflowY: "auto",
                minHeight: "32px",
                maxHeight: "600px",
              }}
            />
            {saveError && (
              <div
                style={{
                  color: "#f48771",
                  fontSize: "11px",
                  marginTop: "6px",
                  fontWeight: "bold",
                }}
              >
                ⚠️ {saveError}
              </div>
            )}
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              padding: "8px",
              background: "#252526",
              borderRadius: "3px",
              fontSize: "11px",
              color: isOrphaned ? "#f48771" : "#ce9178",
              overflowX: "auto",
              border: isOrphaned ? "1px solid #ff9b0055" : "1px solid #333",
            }}
          >
            {JSON.stringify(value || "null", null, 2)}
          </pre>
        )}
      </div>
    );
  };

  const renderRawConfigs = () => {
    const categories: ConfigCategory[] = ["General", "Game", "Appearance"];
    const metadataItems = Object.values(CONFIG_METADATA) as ConfigDefinition[];
    const knownKeys = new Set(metadataItems.map((m) => m.key));
    const allConfigKeys = Object.keys(currentConfig);
    const orphanedKeys = allConfigKeys.filter((k) => !knownKeys.has(k));

    return (
      <div
        style={{
          padding: "20px",
          overflowY: "auto",
          height: "100%",
          backgroundColor: "#1e1e1e",
        }}
      >
        {categories.map((cat) => {
          const items = metadataItems.filter((m) => m.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: "32px" }}>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: "#fff",
                  marginBottom: "16px",
                  borderBottom: "1px solid #333",
                  paddingBottom: "8px",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#1e1e1e",
                  zIndex: 5,
                }}
              >
                {cat}
              </div>
              {items.map((item) =>
                renderConfigItem(
                  item.key,
                  item.name,
                  item.description,
                  currentConfig[item.key as keyof AppConfig],
                ),
              )}
            </div>
          );
        })}
        {orphanedKeys.length > 0 && (
          <div style={{ marginBottom: "32px" }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                color: "#ff9b00",
                marginBottom: "16px",
                borderBottom: "1px solid #ff9b00",
                paddingBottom: "8px",
                position: "sticky",
                top: 0,
                backgroundColor: "#1e1e1e",
                zIndex: 5,
              }}
            >
              ORPHANED CONFIGS (Legacy/Unknown)
            </div>
            {orphanedKeys.map((key) =>
              renderConfigItem(
                key,
                "Unmapped Field",
                "이 설정은 현재 시스템 메타데이터에 등록되어 있지 않습니다.",
                currentConfig[key as keyof AppConfig],
                true,
              ),
            )}
          </div>
        )}
      </div>
    );
  };

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
          @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0.4; }
            100% { opacity: 1; }
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
        style={{
          flex: 1,
          overflowY: "auto",
          whiteSpace: filter === "RAW CONFIGS" ? "normal" : "pre-wrap",
        }}
      >
        {filter === "RAW CONFIGS" ? (
          renderRawConfigs()
        ) : (
          <div style={{ padding: "10px" }}>
            {groupedLogs.map((group, idx) => {
              if (group.isGroup) {
                const firstLog = group.items[0];
                return (
                  <div
                    key={`group-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      marginBottom: "6px",
                      borderLeft: `3px solid ${firstLog.isError ? "#f48771" : "#444"}`,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {group.items.map((log, lIdx) => (
                        <React.Fragment key={lIdx}>
                          {renderLogLine(log, filter === "ALL", true)}
                        </React.Fragment>
                      ))}
                    </div>
                    {firstLog.count && firstLog.count > 1 && (
                      <div
                        style={{
                          marginLeft: "12px",
                          padding: "2px 8px",
                          backgroundColor: "rgba(255, 205, 56, 0.15)",
                          color: "#ffcd38",
                          borderRadius: "10px",
                          fontWeight: "bold",
                          fontSize: "11px",
                          flexShrink: 0,
                          border: "1px solid rgba(255, 205, 56, 0.3)",
                        }}
                      >
                        x{firstLog.count}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <React.Fragment key={`single-${idx}`}>
                  {renderLogLine(group.items[0], filter === "ALL", false)}
                </React.Fragment>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Footer Tabs & Settings */}
      <div
        style={{
          borderTop: "1px solid #333",
          backgroundColor: "#252526",
          display: "flex",
          justifyContent: "space-between", // Split logs (left) and config (right)
          flexWrap: "nowrap",
          overflowX: "auto",
        }}
      >
        {/* Left Side: Logs */}
        <div style={{ display: "flex", overflowX: "auto" }}>
          {tabs.map((tab) => {
            const sampleLog = logState.all.find(
              (l: LogEntry) => l.type === tab,
            );
            const tabColor = sampleLog?.typeColor || "#969696";

            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  background: filter === tab ? "#3e3e42" : "transparent",
                  color: filter === tab ? "#fff" : tabColor,
                  border: "none",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  borderRight: "1px solid #333",
                  borderTop:
                    filter === tab
                      ? `2px solid ${tabColor}`
                      : "2px solid transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Right Side: Raw Configs */}
        <button
          onClick={() => setFilter("RAW CONFIGS")}
          style={{
            background: filter === "RAW CONFIGS" ? "#007acc" : "#333",
            color: "#fff",
            border: "none",
            padding: "8px 20px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            fontFamily: "inherit",
            borderLeft: "1px solid #444",
            borderTop:
              filter === "RAW CONFIGS"
                ? "2px solid #fff"
                : "2px solid transparent",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          ⚙️ RAW CONFIGS
        </button>
      </div>
      {/* Export Modal */}
      {showExportModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#252526",
              padding: "20px",
              borderRadius: "5px",
              width: "300px",
              border: "1px solid #444",
              boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginBottom: "15px",
                color: "#fff",
              }}
            >
              Select items to export
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "20px",
              }}
            >
              {[
                "ALL",
                "SYSTEM",
                "PROCESS",
                "EVENT_BUS",
                "DEBUG",
                "RAW CONFIGS",
              ].map((item) => (
                <label
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "#ccc",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedExportItems.includes(item)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedExportItems([...selectedExportItems, item]);
                      } else {
                        setSelectedExportItems(
                          selectedExportItems.filter((i) => i !== item),
                        );
                      }
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  background: "transparent",
                  color: "#ccc",
                  border: "1px solid #444",
                  padding: "5px 12px",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={selectedExportItems.length === 0}
                style={{
                  background: "#007acc",
                  color: "#fff",
                  border: "none",
                  padding: "5px 12px",
                  borderRadius: "3px",
                  cursor:
                    selectedExportItems.length === 0
                      ? "not-allowed"
                      : "pointer",
                  opacity: selectedExportItems.length === 0 ? 0.5 : 1,
                }}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugConsole;

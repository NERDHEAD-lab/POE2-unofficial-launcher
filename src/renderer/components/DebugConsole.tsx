import React, { useEffect, useState, useRef } from "react";

interface LogEntry {
  timestamp: number;
  type: string;
  content: string;
  isError: boolean;
  count?: number;
  typeColor?: string;
  textColor?: string;
}

const MAX_MERGE_LINES = 3;

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

const DebugConsole: React.FC = () => {
  const [logState, setLogState] = useState<{
    all: LogEntry[];
    byType: Record<string, LogEntry[]>;
  }>({ all: [], byType: {} });
  const [filter, setFilter] = useState<string>("ALL");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Simple string hash helper
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

  // Helper to merge a new log into a list (Support Universal N-line Merge)
  const mergeLog = (prev: LogEntry[], log: LogEntry): LogEntry[] => {
    const hash = getHash(log.content + log.type + log.isError);
    const newEntry: LogEntry = { ...log, count: 1, contentHash: hash };

    if (prev.length === 0) return [newEntry];

    // Priority 1: Single Line Merge (n=1)
    const lastLog = prev[prev.length - 1];
    if (isSameLog(lastLog, newEntry)) {
      const updatedLastLog = {
        ...lastLog,
        count: (lastLog.count || 1) + 1,
        timestamp: newEntry.timestamp,
        // If it was part of a pair, keep its ID
      };
      return [...prev.slice(0, -1), updatedLastLog];
    }

    // Priority 2: Multi-line Pattern Merge (n = MAX_MERGE_LINES down to 2)
    for (let n = MAX_MERGE_LINES; n >= 2; n--) {
      if (prev.length >= 2 * n - 1) {
        const tailSize = n - 1;
        const currentIncomingSet = [...prev.slice(-tailSize), newEntry];
        const previousStableSet = prev.slice(-(n + tailSize), -tailSize);

        // Check 1: Content Pattern Match
        let isMatch = true;
        for (let i = 0; i < n; i++) {
          if (!isSameLog(previousStableSet[i], currentIncomingSet[i])) {
            isMatch = false;
            break;
          }
        }

        if (isMatch) {
          // Check 2: Type Integrity (All logs in the set must have the SAME type)
          // This prevents cross-type merging in the "ALL" tab.
          const firstType = previousStableSet[0].type;
          const isSameType = previousStableSet.every(
            (item) => item.type === firstType,
          );

          if (isSameType) {
            // Generate a hash based on the combined content of the group to ensure uniqueness
            const groupContent = previousStableSet
              .map((item) => item.contentHash)
              .join("|");
            const groupId = getHash(groupContent);

            const updatedSlice = previousStableSet.map((item, idx) => ({
              ...item,
              count: (item.count || 1) + 1,
              timestamp: currentIncomingSet[idx].timestamp,
              mergeGroupId: groupId,
              mergeGroupSize: n,
            }));

            return [...prev.slice(0, -(n + tailSize)), ...updatedSlice];
          }
        }
      }
    }

    // No merge found, standard append
    const updatedPrev = [...prev, newEntry];
    return updatedPrev.length > 2000 ? updatedPrev.slice(-2000) : updatedPrev;
  };

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDebugLog) {
      const removeListener = window.electronAPI.onDebugLog((log: LogEntry) => {
        setLogState((prev) => {
          const updatedAll = mergeLog(prev.all, log);
          const typeList = prev.byType[log.type] || [];
          const updatedTypeList = mergeLog(typeList, log);

          return {
            all: updatedAll,
            byType: {
              ...prev.byType,
              [log.type]: updatedTypeList,
            },
          };
        });
      });
      return () => {
        removeListener();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logState, filter]);

  const tabs = ["ALL", ...Object.keys(logState.byType)];

  const visibleLogs =
    filter === "ALL" ? logState.all : logState.byType[filter] || [];

  // Grouping logs for UI (Improved using mergeGroupId)
  const groupedLogs: { isGroup: boolean; items: LogEntry[] }[] = [];
  for (let i = 0; i < visibleLogs.length; i++) {
    const log = visibleLogs[i];
    if (log.mergeGroupId) {
      const groupId = log.mergeGroupId;
      const groupItems = [log];
      let j = i + 1;
      while (
        j < visibleLogs.length &&
        visibleLogs[j].mergeGroupId === groupId
      ) {
        groupItems.push(visibleLogs[j]);
        j++;
      }

      // Only group if we have multiple lines (N-pair)
      if (groupItems.length > 1) {
        groupedLogs.push({ isGroup: true, items: groupItems });
        i = j - 1;
      } else {
        groupedLogs.push({ isGroup: false, items: [log] });
      }
    } else {
      groupedLogs.push({ isGroup: false, items: [log] });
    }
  }

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
          fontFamily: "'Consolas', monospace",
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
            style={{
              marginLeft: "8px",
              color: "#ffcd38",
              fontWeight: "bold",
            }}
          >
            (x{log.count})
          </span>
        )}
      </div>
    </div>
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
      <div
        style={{
          borderBottom: "1px solid #333",
          padding: "10px",
          backgroundColor: "#1e1e1e",
          fontWeight: "bold",
          userSelect: "none",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        POE2 Launcher Debug Console
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px",
          whiteSpace: "pre-wrap",
        }}
      >
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

      {/* Footer Tabs */}
      <div
        style={{
          borderTop: "1px solid #333",
          backgroundColor: "#252526",
          display: "flex",
          flexWrap: "wrap",
        }}
      >
        {tabs.map((tab) => {
          // Find the color for this tab from the first log of this type in ALL list
          const sampleLog = logState.all.find((l: LogEntry) => l.type === tab);
          const tabColor = sampleLog?.typeColor || "#969696";

          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                background: filter === tab ? "#3e3e42" : "transparent",
                color: filter === tab ? "#fff" : tabColor, // Use type color for inactive tabs too? Or just active/indicator
                // Let's make the text color matching the type color for better visibility
                // But keep active state distinct
                border: "none",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "12px",
                fontFamily: "inherit",
                borderRight: "1px solid #333",
                borderTop:
                  filter === tab
                    ? `2px solid ${tabColor}`
                    : "2px solid transparent", // Indicator
              }}
            >
              {tab.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DebugConsole;

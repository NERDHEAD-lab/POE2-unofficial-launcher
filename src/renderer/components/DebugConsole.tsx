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

const DebugConsole: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDebugLog) {
      const removeListener = window.electronAPI.onDebugLog((log: LogEntry) => {
        setLogs((prev) => {
          const lastLog = prev[prev.length - 1];
          // Check for duplicate content (ignore timestamp)
          if (
            lastLog &&
            lastLog.content === log.content &&
            lastLog.type === log.type &&
            lastLog.isError === log.isError
          ) {
            // Update last log with incremented count and new timestamp
            const updatedLastLog = {
              ...lastLog,
              count: (lastLog.count || 1) + 1,
              timestamp: log.timestamp, // Update to latest timestamp
            };
            return [...prev.slice(0, -1), updatedLastLog];
          }

          // New log
          const newLogs = [...prev, { ...log, count: 1 }];
          if (newLogs.length > 1000) return newLogs.slice(-1000);
          return newLogs;
        });
      });
      return () => {
        removeListener();
      };
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, filter]);

  // Compute unique types for tabs (always include ALL)
  const tabs = ["ALL", ...Array.from(new Set(logs.map((l) => l.type)))];

  // Filter logs logic
  const visibleLogs =
    filter === "ALL" ? logs : logs.filter((l) => l.type === filter);

  return (
    <div
      style={{
        backgroundColor: "#1e1e1e",
        color: "#d4d4d4",
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: "12px",
        height: "100vh",
        width: "100vw",
        overflow: "hidden", // Prevent outer scroll
        display: "flex", // Enable Flexbox
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Fixed Header */}
      <div
        style={{
          borderBottom: "1px solid #333",
          padding: "10px",
          backgroundColor: "#1e1e1e",
          fontWeight: "bold",
          userSelect: "none",
          flexShrink: 0, // Don't shrink
          zIndex: 10,
        }}
      >
        POE2 Launcher Debug Console
      </div>

      {/* Scrollable Log Area */}
      <div
        style={{
          flex: 1, // Fill remaining space
          overflowY: "auto", // Scroll internally
          padding: "10px",
          whiteSpace: "pre-wrap",
        }}
      >
        {visibleLogs.map((log, i) => (
          <div
            key={i}
            style={{
              marginBottom: "8px",
              display: "flex",
              flexDirection: "column",
              color: log.isError ? "#f48771" : log.textColor || "#d4d4d4",
            }}
          >
            {/* Row 1: Time & Type */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "2px",
              }}
            >
              <span
                style={{
                  color: "#6a9955",
                  marginRight: "8px",
                  fontSize: "11px",
                  fontFamily: "'Consolas', monospace",
                }}
              >
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span
                style={{
                  color: log.typeColor || "#ce9178",
                  fontWeight: "bold",
                  fontSize: "11px",
                }}
              >
                [{log.type.toUpperCase()}]
              </span>
            </div>

            {/* Row 2: Content & Count */}
            <div
              style={{
                display: "flex",
                paddingLeft: "16px",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{ wordBreak: "break-all", flex: 1, lineHeight: "1.4" }}
              >
                {log.content}
              </span>
              {log.count && log.count > 1 && (
                <span
                  style={{
                    marginLeft: "8px",
                    color: "#ffcd38",
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  (x{log.count})
                </span>
              )}
            </div>
          </div>
        ))}
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
          // Find the color for this tab from the first log of this type
          const sampleLog = logs.find((l) => l.type === tab);
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

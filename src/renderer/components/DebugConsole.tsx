import React, { useEffect, useState, useRef } from "react";

interface LogEntry {
  timestamp: number;
  type: "normal" | "admin";
  content: string;
  isError: boolean;
  count?: number;
}

const DebugConsole: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
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
  }, [logs]);

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
        {logs.map((log, i) => (
          <div
            key={i}
            style={{
              marginBottom: "2px",
              color: log.isError
                ? "#f48771"
                : log.type === "admin"
                  ? "#569cd6"
                  : "#d4d4d4",
            }}
          >
            <span style={{ color: "#808080", marginRight: "8px" }}>
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </span>
            <span
              style={{
                color: log.type === "admin" ? "#c586c0" : "#4ec9b0",
                marginRight: "8px",
                fontWeight: "bold",
              }}
            >
              {log.type.toUpperCase()}
            </span>
            <span>{log.content}</span>
            {log.count && log.count > 1 && (
              <span
                style={{
                  marginLeft: "8px",
                  color: "#ffcd38", // Warning-ish color for repeat count
                  fontWeight: "bold",
                }}
              >
                (x{log.count})
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default DebugConsole;

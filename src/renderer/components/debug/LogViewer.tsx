import React, { useMemo } from "react";

import { LogEntry } from "./types";

interface LogViewerProps {
  logState: {
    all: LogEntry[];
    byType: { [key: string]: LogEntry[] };
  };
  filter: string;
  bottomRef: React.RefObject<HTMLDivElement>;
}

const LogViewer: React.FC<LogViewerProps> = ({
  logState,
  filter,
  bottomRef,
}) => {
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

  return (
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
  );
};

export const getLogExportSources = (logState: {
  all: LogEntry[];
  byType: { [key: string]: LogEntry[] };
}) => {
  const sources = [
    {
      id: "log-all",
      label: "📄 ALL LOGS",
      getFiles: () => [
        {
          name: "all.log",
          content: logState.all
            .map(
              (l) =>
                `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type}] ${l.content}`,
            )
            .join("\n"),
        },
      ],
    },
    ...Object.keys(logState.byType).map((type) => ({
      id: `log-${type}`,
      label: `📝 ${type.toUpperCase()} LOGS`,
      getFiles: () => [
        {
          name: `${type.toLowerCase()}.log`,
          content: logState.byType[type]
            .map(
              (l) =>
                `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type}] ${l.content}`,
            )
            .join("\n"),
        },
      ],
    })),
  ];
  return sources;
};

export default LogViewer;

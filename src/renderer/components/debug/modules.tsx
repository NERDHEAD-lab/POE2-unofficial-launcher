import React from "react";

import ConfigViewer, { ConfigViewerProps } from "./ConfigViewer";
import LogViewer, { LogViewerProps } from "./LogViewer";
import { DebugModule } from "./types";

export const LogModule: DebugModule<LogViewerProps> = {
  id: "log-module",
  order: 1,
  position: "left",
  getTabs: ({ logState }) => [
    { id: "ALL", label: "ALL", color: "#969696" },
    ...Object.keys(logState.byType).map((type) => ({
      id: type,
      label: type.toUpperCase(),
      color: logState.byType[type][0]?.typeColor || "#ce9178",
    })),
  ],
  renderPanel: (activeTabId, props) => (
    <LogViewer {...props} filter={activeTabId} />
  ),
  getExportSources: ({ logState }) => {
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
                  `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type}] ${l.content}${
                    l.count && l.count > 1 ? ` (x${l.count})` : ""
                  }`,
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
                  `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type}] ${l.content}${
                    l.count && l.count > 1 ? ` (x${l.count})` : ""
                  }`,
              )
              .join("\n"),
          },
        ],
      })),
    ];
    return sources;
  },
};

export const ConfigModule: DebugModule<ConfigViewerProps> = {
  id: "config-module",
  order: 100,
  position: "right",
  getTabs: () => [
    { id: "RAW CONFIGS", label: "⚙️ RAW CONFIGS", color: "#007acc" },
  ],
  renderPanel: (_activeTabId, props) => <ConfigViewer {...props} />,
  getExportSources: ({ currentConfig }) => [
    {
      id: "raw-configs",
      label: "⚙️ RAW CONFIGS",
      getFiles: () => [
        {
          name: "raw_config.json",
          content: JSON.stringify(currentConfig, null, 2),
        },
      ],
    },
  ],
};

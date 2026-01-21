import React, { useEffect, useState, useRef } from "react";

import ConfigViewer from "./debug/ConfigViewer";
import ExportModal from "./debug/ExportModal";
import { mergeLog } from "./debug/helpers";
import LogViewer from "./debug/LogViewer";
import { LogEntry } from "./debug/types";
import { AppConfig } from "../../shared/types";

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

  const handleExport = async () => {
    const files: { name: string; content: string }[] = [];

    selectedExportItems.forEach((item) => {
      if (item === "RAW CONFIGS") {
        files.push({
          name: "raw_config.json",
          content: JSON.stringify(currentConfig, null, 2),
        });
      } else {
        const logs = logState.byType[item] || [];
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
          <ConfigViewer
            currentConfig={currentConfig}
            editingKey={editingKey}
            initialValue={initialValue}
            editValue={editValue}
            saveError={saveError}
            editorRef={editorRef}
            startEditing={startEditing}
            cancelEditing={cancelEditing}
            saveConfig={saveConfig}
            setEditValue={setEditValue}
            setSaveError={setSaveError}
          />
        ) : (
          <LogViewer
            logState={logState}
            filter={filter}
            bottomRef={bottomRef}
          />
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
            const sampleLog = logState.all.find((l) => l.type === tab);
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
        <ExportModal
          selectedExportItems={selectedExportItems}
          setSelectedExportItems={setSelectedExportItems}
          setShowExportModal={setShowExportModal}
          handleExport={handleExport}
        />
      )}
    </div>
  );
};

export default DebugConsole;

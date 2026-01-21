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
        {activeModule?.renderPanel(filter, getModuleProps(filter))}
      </div>

      {/* Footer Tabs & Settings */}
      <div
        style={{
          borderTop: "1px solid #333",
          backgroundColor: "#252526",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          overflowX: "auto",
        }}
      >
        {/* Left Aligned Modules (Logs etc) */}
        <div style={{ display: "flex", overflowX: "auto" }}>
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
                  onClick={() => setFilter(tab.id)}
                  style={{
                    background: isActive ? "#3e3e42" : "transparent",
                    color: isActive ? "#fff" : tab.color || "#ccc",
                    border: "none",
                    padding: "8px 16px",
                    cursor: "pointer",
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

        {/* Right Aligned Modules (Config etc) */}
        <div style={{ display: "flex" }}>
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
                  onClick={() => setFilter(tab.id)}
                  style={{
                    background: isActive ? tabColor : "#333",
                    color: "#fff",
                    border: "none",
                    padding: "8px 20px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "bold",
                    fontFamily: "inherit",
                    borderLeft: "1px solid #444",
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

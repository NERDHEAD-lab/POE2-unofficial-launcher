import React from "react";

import { CONFIG_METADATA } from "../../../shared/config";
import {
  AppConfig,
  CONFIG_CATEGORIES,
  ConfigCategory,
  ConfigDefinition,
} from "../../../shared/types";

export interface ConfigViewerProps {
  currentConfig: Partial<AppConfig>;
  editingKey: string | null;
  initialValue: unknown;
  editValue: string;
  saveError: string | null;
  editorRef: React.RefObject<HTMLTextAreaElement>;
  startEditing: (key: string, value: unknown) => void;
  cancelEditing: () => void;
  saveConfig: (key: string) => Promise<void>;
  deleteConfig: (key: string) => Promise<void>;
  setEditValue: (value: string) => void;
  setSaveError: (error: string | null) => void;
}

const ConfigViewer: React.FC<ConfigViewerProps> = ({
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
}) => {
  const [confirmDeleteKey, setConfirmDeleteKey] = React.useState<string | null>(
    null,
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
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setConfirmDeleteKey(key)}
                style={{
                  background: "#4e1e1e",
                  color: "#fff",
                  border: "none",
                  padding: "2px 8px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                Delete
              </button>
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
            </div>
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
                resize: "none",
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
            {JSON.stringify(value ?? null, null, 2)}
          </pre>
        )}
      </div>
    );
  };

  const categories = CONFIG_CATEGORIES;
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
      {categories.map((cat: ConfigCategory) => {
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

      {/* Delete Confirmation Modal */}
      {confirmDeleteKey && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "#252526",
              padding: "24px",
              borderRadius: "8px",
              width: "400px",
              border: "1px solid #444",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              animation: "slideUp 0.3s ease-out",
            }}
          >
            <h3
              style={{
                margin: "0 0 16px 0",
                color: "#f48771",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              ⚠️ 설정 삭제 확인
            </h3>
            <p
              style={{ margin: "0 0 24px 0", color: "#ccc", fontSize: "13px" }}
            >
              다음 설정을 정말로 삭제하시겠습니까? 삭제된 설정은 복구할 수
              없으며, 런처 재시작 후 기본값으로 초기화되거나 완전히 제거됩니다.
              <br />
              <br />
              <strong style={{ color: "#fff", fontFamily: "monospace" }}>
                Key: {confirmDeleteKey}
              </strong>
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => setConfirmDeleteKey(null)}
                style={{
                  padding: "8px 16px",
                  background: "#333",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={async () => {
                  await deleteConfig(confirmDeleteKey);
                  setConfirmDeleteKey(null);
                }}
                style={{
                  padding: "8px 16px",
                  background: "#a52a2a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigViewer;

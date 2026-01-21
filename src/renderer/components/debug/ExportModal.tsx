import React from "react";

import { ExportSource } from "./types";

interface ExportModalProps {
  sources: ExportSource[];
  onClose: () => void;
  onExport: (selectedIds: string[]) => void;
}

const ExportModal: React.FC<ExportModalProps> = ({
  sources,
  onClose,
  onExport,
}) => {
  const [selectedIds, setSelectedIds] = React.useState<string[]>(
    sources.map((s) => s.id),
  );

  return (
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
            maxHeight: "300px",
            overflowY: "auto",
            paddingRight: "5px",
          }}
        >
          {sources.map((source) => (
            <label
              key={source.id}
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
                checked={selectedIds.includes(source.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds([...selectedIds, source.id]);
                  } else {
                    setSelectedIds(
                      selectedIds.filter((id) => id !== source.id),
                    );
                  }
                }}
              />
              {source.label}
            </label>
          ))}
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <button
            onClick={onClose}
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
            onClick={() => onExport(selectedIds)}
            disabled={selectedIds.length === 0}
            style={{
              background: "#007acc",
              color: "#fff",
              border: "none",
              padding: "5px 12px",
              borderRadius: "3px",
              cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
              opacity: selectedIds.length === 0 ? 0.5 : 1,
            }}
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;

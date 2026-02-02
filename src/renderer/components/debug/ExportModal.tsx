import React, { useMemo, useRef, useEffect } from "react";

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

  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Derived state for master checkbox
  const { allSelected, noneSelected, isIndeterminate } = useMemo(() => {
    const total = sources.length;
    const selectedCount = selectedIds.length;
    return {
      allSelected: total > 0 && selectedCount === total,
      noneSelected: selectedCount === 0,
      isIndeterminate: selectedCount > 0 && selectedCount < total,
    };
  }, [sources, selectedIds]);

  // Handle indeterminate state on the actual DOM element
  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sources.map((s) => s.id));
    }
  };

  const toggleSource = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          background: "#252526",
          padding: "24px",
          borderRadius: "8px",
          width: "450px",
          border: "1px solid #444",
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "600",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>내보내기 대상 선택 (Export)</span>
          <span style={{ fontSize: "11px", color: "#888", fontWeight: "400" }}>
            {selectedIds.length} / {sources.length} 선택됨
          </span>
        </div>

        <div
          style={{
            marginBottom: "24px",
            maxHeight: "350px",
            overflowY: "auto",
            border: "1px solid #333",
            borderRadius: "4px",
            backgroundColor: "#1e1e1e",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              textAlign: "left",
            }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                backgroundColor: "#333",
                zIndex: 1,
              }}
            >
              <tr>
                <th
                  style={{
                    padding: "10px",
                    width: "40px",
                    textAlign: "center",
                  }}
                >
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={{ padding: "10px", fontWeight: "600" }}>항목</th>
                <th
                  style={{ padding: "10px", fontWeight: "600", width: "80px" }}
                >
                  종류
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => {
                const isSelected = selectedIds.includes(source.id);
                return (
                  <tr
                    key={source.id}
                    onClick={() => toggleSource(source.id)}
                    style={{
                      borderBottom: "1px solid #2d2d2d",
                      cursor: "pointer",
                      backgroundColor: isSelected
                        ? "rgba(0, 122, 204, 0.1)"
                        : "transparent",
                      transition: "background-color 0.1s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = isSelected
                        ? "rgba(0, 122, 204, 0.15)"
                        : "#2a2d2e")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = isSelected
                        ? "rgba(0, 122, 204, 0.1)"
                        : "transparent")
                    }
                  >
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSource(source.id);
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        color: isSelected ? "#fff" : "#ccc",
                      }}
                    >
                      {source.label}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        fontSize: "11px",
                        color: "#888",
                      }}
                    >
                      {source.id.includes("config") ? "Config" : "Log"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}
        >
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "#ccc",
              border: "1px solid #444",
              padding: "6px 16px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "13px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#666")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#444")}
          >
            취소
          </button>
          <button
            onClick={() => onExport(selectedIds)}
            disabled={selectedIds.length === 0}
            style={{
              background: selectedIds.length === 0 ? "#444" : "#007acc",
              color: "#fff",
              border: "none",
              padding: "6px 20px",
              borderRadius: "4px",
              cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: "600",
              opacity: selectedIds.length === 0 ? 0.6 : 1,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => {
              if (selectedIds.length > 0)
                e.currentTarget.style.background = "#0086e0";
            }}
            onMouseLeave={(e) => {
              if (selectedIds.length > 0)
                e.currentTarget.style.background = "#007acc";
            }}
          >
            내보내기 (Download)
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;

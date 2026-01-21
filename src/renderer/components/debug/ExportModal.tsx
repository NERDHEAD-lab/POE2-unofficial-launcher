import React from "react";

interface ExportModalProps {
  selectedExportItems: string[];
  setSelectedExportItems: (items: string[]) => void;
  setShowExportModal: (show: boolean) => void;
  handleExport: () => Promise<void>;
}

const ExportModal: React.FC<ExportModalProps> = ({
  selectedExportItems,
  setSelectedExportItems,
  setShowExportModal,
  handleExport,
}) => {
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
          }}
        >
          {[
            "ALL",
            "SYSTEM",
            "PROCESS",
            "EVENT_BUS",
            "DEBUG",
            "RAW CONFIGS",
          ].map((item) => (
            <label
              key={item}
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
                checked={selectedExportItems.includes(item)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedExportItems([...selectedExportItems, item]);
                  } else {
                    setSelectedExportItems(
                      selectedExportItems.filter((i) => i !== item),
                    );
                  }
                }}
              />
              {item}
            </label>
          ))}
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <button
            onClick={() => setShowExportModal(false)}
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
            onClick={handleExport}
            disabled={selectedExportItems.length === 0}
            style={{
              background: "#007acc",
              color: "#fff",
              border: "none",
              padding: "5px 12px",
              borderRadius: "3px",
              cursor:
                selectedExportItems.length === 0 ? "not-allowed" : "pointer",
              opacity: selectedExportItems.length === 0 ? 0.5 : 1,
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

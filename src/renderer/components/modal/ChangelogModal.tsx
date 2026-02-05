import DOMPurify from "dompurify";
import { marked } from "marked";
import React, { useEffect, useState } from "react";
import "github-markdown-css/github-markdown-dark.css"; // Force dark theme

import { ChangelogItem } from "../../../shared/types";

interface ChangelogModalProps {
  changelogs: ChangelogItem[];
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({
  changelogs,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade-in animation
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for fade-out
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        opacity: isVisible ? 1 : 0,
        transition: "opacity 0.3s ease",
        backdropFilter: "blur(5px)",
      }}
    >
      <div
        style={{
          width: "600px",
          maxHeight: "80vh",
          backgroundColor: "#1e1e1e",
          borderRadius: "8px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          transform: isVisible ? "scale(1)" : "scale(0.95)",
          transition: "transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
          border: "1px solid #333",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid #333",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#fff" }}>
              Launcher Update
            </h2>
            <p style={{ margin: "5px 0 0", color: "#888", fontSize: "14px" }}>
              새로운 기능과 수정사항을 확인하세요.
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: "24px",
              cursor: "pointer",
            }}
          >
            &times;
          </button>
        </div>

        {/* Content Area */}
        <div
          style={{
            padding: "20px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {changelogs.map((log) => (
            <div
              key={log.version}
              style={{
                backgroundColor: "#252526",
                borderRadius: "6px",
                padding: "15px",
                border: "1px solid #333",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <span
                    style={{
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: "#4fc3f7",
                    }}
                  >
                    {log.version}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#666",
                    }}
                  >
                    {new Date(log.date).toLocaleDateString()}
                  </span>
                </div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.electronAPI.openExternal(log.htmlUrl);
                  }}
                  style={{
                    fontSize: "12px",
                    color: "#007acc",
                    textDecoration: "none",
                  }}
                >
                  GitHub에서 보기 &rarr;
                </a>
              </div>
              <div
                className="markdown-body"
                style={{
                  backgroundColor: "transparent", // Override github-css bg to blend with our modal
                  fontSize: "14px",
                  lineHeight: "1.6",
                  color: "#d4d4d4", // Ensure text color is standard
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(marked.parse(log.body) as string),
                }}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "20px",
            borderTop: "1px solid #333",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleClose}
            style={{
              backgroundColor: "#007acc",
              color: "#fff",
              border: "none",
              padding: "10px 24px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "14px",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#0062a3")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#007acc")
            }
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;

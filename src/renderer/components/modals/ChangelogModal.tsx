import DOMPurify from "dompurify";
import { marked } from "marked";
import React, { useEffect, useState } from "react";
import "github-markdown-css/github-markdown-dark.css"; // Force dark theme

import { ChangelogItem } from "../../../shared/types";

import "./ChangelogModal.css";

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
    // Configure marked to open links in new tab (external browser)
    marked.use({
      gfm: true,
      breaks: true,
      renderer: {
        link(token) {
          const { href, title, text } = token;
          const isExternal = href.startsWith("http");
          const target = isExternal
            ? ' target="_blank" rel="noopener noreferrer"'
            : "";
          const titleAttr = title ? ` title="${title}"` : "";
          return `<a href="${href}"${target}${titleAttr}>${text}</a>`;
        },
      },
    });

    // Fade-in animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for fade-out
  };

  return (
    <div className={`changelog-overlay ${isVisible ? "visible" : ""}`}>
      <div className="changelog-modal">
        {/* Header */}
        <div className="changelog-header">
          <div className="changelog-header-title">
            <h2>패치 노트</h2>
            <p>
              PoE Unofficial Launcher의 새로운 기능과 수정사항을 확인하세요.
            </p>
          </div>
          <button onClick={handleClose} className="changelog-close-x">
            &times;
          </button>
        </div>

        {/* Content Area */}
        <div className="changelog-content">
          {changelogs.map((log) => (
            <div key={log.version} className="changelog-item">
              <div className="changelog-item-header">
                <div className="changelog-version-info">
                  <span className="changelog-version">{log.version}</span>
                  <span className="changelog-date">
                    {new Date(log.date).toLocaleDateString()}
                  </span>
                </div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(log.htmlUrl, "_blank");
                  }}
                  className="changelog-github-link"
                >
                  GitHub에서 보기 &rarr;
                </a>
              </div>
              <div className="markdown-body changelog-markdown-body">
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                      marked.parse(log.body || "") as string,
                      {
                        ADD_ATTR: ["target", "rel"],
                      },
                    ),
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="changelog-footer">
          <button onClick={handleClose} className="changelog-confirm-btn">
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;

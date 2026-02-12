import DOMPurify from "dompurify";
import { marked } from "marked";
import React, { useEffect, useState, useCallback } from "react";
import "github-markdown-css/github-markdown-dark.css";

import { NewsItem } from "../../../shared/types";
import "./NoticeModal.css";

interface NoticeModalProps {
  item: NewsItem | null;
  onClose: () => void;
}

const NoticeModal: React.FC<NoticeModalProps> = ({ item, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadContent = useCallback(async () => {
    if (!item) return;
    setIsLoading(true);
    try {
      // Try cache first
      const cached = await window.electronAPI.getNewsContentCache(item.id);
      if (cached) {
        setContent(cached);
      }

      // Fetch live
      const result = await window.electronAPI.getNewsContent(
        item.id,
        item.link,
      );
      setContent(result);
    } catch (error) {
      console.error("Failed to load notice content:", error);
      if (!content) {
        setContent("내용을 불러오는 데 실패했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [item, content]);

  useEffect(() => {
    // Configure marked to open links in new tab
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

    if (item) {
      // Fade-in animation
      const timer = setTimeout(() => setIsVisible(true), 10);

      // Load content
      loadContent();

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      setContent(null);
    }
  }, [item, loadContent]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for fade-out
  };

  if (!item && !isVisible) return null;

  return (
    <div
      className={`notice-overlay ${isVisible ? "visible" : ""}`}
      onClick={handleClose}
    >
      <div className="notice-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="notice-header">
          <div className="notice-header-title">
            <div className="notice-type-badge">개발자 공지사항</div>
            <h2>{item?.title}</h2>
            <div className="notice-meta">
              <span className="notice-date">{item?.date}</span>
            </div>
          </div>
          <button onClick={handleClose} className="notice-close-x">
            &times;
          </button>
        </div>

        {/* Content Area */}
        <div className="notice-content">
          {isLoading && !content ? (
            <div className="notice-loading">내용을 불러오는 중...</div>
          ) : (
            <div className="markdown-body notice-markdown-body">
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(
                    marked.parse(content || "") as string,
                    {
                      ADD_ATTR: ["target", "rel"],
                    },
                  ),
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="notice-footer">
          <button onClick={handleClose} className="notice-confirm-btn">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoticeModal;

import DOMPurify from "dompurify";
import React, { useState } from "react";

import { NewsItem as NewsItemType } from "../../../shared/types";
import itemBg from "../../assets/layout/img-news-bg.png";
import { logger } from "../../utils/logger";

interface NewsItemProps {
  item: NewsItemType;
  onRead: (id: string) => void;
}

const NewsItem: React.FC<NewsItemProps> = ({ item, onRead }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);

    if (nextExpanded) {
      // 1. Try to load from cache first for instant feedback
      let currentContent = content;
      if (!currentContent) {
        const cached = await window.electronAPI.getNewsContentCache(item.id);
        if (cached) {
          currentContent = cached;
          setContent(cached);
        }
      }

      // 2. Fetch live content in background to ensure it's up to date
      setIsLoading(true);
      try {
        const result = await window.electronAPI.getNewsContent(
          item.id,
          item.link,
        );
        // Update ONLY if content actually changed from what we have (cached or previous)
        if (result !== currentContent) {
          setContent(result);
        }
        onRead(item.id);
      } catch (error) {
        logger.error("Failed to load news content:", error);
        if (!currentContent) {
          setContent("내용을 불러오는 데 실패했습니다.");
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div
      className={`news-item-container ${isExpanded ? "expanded" : ""}`}
      style={{ backgroundImage: `url(${itemBg})` }}
    >
      <div className="news-item-header" onClick={handleToggle}>
        <div className="news-item-title-row">
          {item.isSticky && <span className="news-sticky-icon">📌</span>}
          <span className="news-item-title">{item.title}</span>
          {item.isNew && <span className="new-badge">N</span>}
        </div>
        <span className="news-item-date">{item.date}</span>
      </div>

      {isExpanded && (
        <div className="news-item-content-wrapper">
          <button
            className="news-browser-btn"
            onClick={(e) => {
              e.stopPropagation(); // 부모의 toggle 이벤트 전파 방지
              window.open(item.link, "_blank");
            }}
          >
            <span>🌐</span> 브라우저에서 보기
          </button>

          <div className="news-scroll-view">
            {isLoading && !content ? (
              <div className="news-content-loading">Loading content...</div>
            ) : (
              <div
                className="news-item-content forum-content"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const anchor = target.closest("a");
                  if (anchor && anchor.href) {
                    e.preventDefault();
                    window.open(anchor.href, "_blank");
                  }
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(content || ""),
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsItem;

import DOMPurify from "dompurify";
import React, { useState } from "react";

import { NewsItem as NewsItemType } from "../../../shared/types";
import itemBg from "../../assets/layout/img-news-bg.png";

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

    if (nextExpanded && !content) {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.getNewsContent(
          item.id,
          item.link,
        );
        setContent(result);
        onRead(item.id);
      } catch (error) {
        console.error("Failed to load news content:", error);
        setContent("내용을 불러오는 데 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    } else if (nextExpanded) {
      onRead(item.id);
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
          {isLoading ? (
            <div className="news-content-loading">Loading content...</div>
          ) : (
            <div
              className="news-item-content forum-content"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const anchor = target.closest("a");
                if (anchor && anchor.href) {
                  e.preventDefault();
                  window.electronAPI.openExternal(anchor.href);
                }
              }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(content || ""),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default NewsItem;

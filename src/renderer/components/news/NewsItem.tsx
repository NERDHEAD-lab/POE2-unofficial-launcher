import React, { useEffect, useRef, useState } from "react";

import { getNewsContentClassName, renderNewsContentHtml } from "./news-content";
import { scrollExpandedNewsItemIntoView } from "./news-scroll";
import { NewsItem as NewsItemType, NewsOpenMode } from "../../../shared/types";
import itemBg from "../../assets/layout/img-news-bg.png";
import { logger } from "../../utils/logger";

interface NewsItemProps {
  item: NewsItemType;
  openMode: NewsOpenMode;
  onRead: (id: string) => void;
  onShowModal?: (item: NewsItemType) => void;
}

const NewsItem: React.FC<NewsItemProps> = ({
  item,
  openMode,
  onRead,
  onShowModal,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const pendingOpenScrollRef = useRef(false);

  useEffect(() => {
    if (!isExpanded || !pendingOpenScrollRef.current) return;

    const frameId = window.requestAnimationFrame(() => {
      if (itemRef.current) {
        scrollExpandedNewsItemIntoView(itemRef.current);
      }

      if (content || !isLoading) {
        pendingOpenScrollRef.current = false;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [content, isExpanded, isLoading]);

  useEffect(() => {
    if (openMode !== "modal") return;

    pendingOpenScrollRef.current = false;

    let isCancelled = false;
    void Promise.resolve().then(() => {
      if (isCancelled) return;
      setIsExpanded(false);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [openMode]);

  const handleToggle = async () => {
    if (openMode === "modal" && onShowModal) {
      onShowModal(item);
      onRead(item.id);
      return;
    }

    const nextExpanded = !isExpanded;
    if (nextExpanded) {
      onRead(item.id);
      pendingOpenScrollRef.current = true;
      setIsLoading(true);
    } else {
      pendingOpenScrollRef.current = false;
    }

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
      try {
        const result = await window.electronAPI.getNewsContent(
          item.id,
          item.link,
        );
        // Update ONLY if content actually changed from what we have (cached or previous)
        if (result !== currentContent) {
          setContent(result);
        }
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
      ref={itemRef}
      className={`news-item-container ${isExpanded ? "expanded" : ""}`}
      style={{ backgroundImage: `url(${itemBg})` }}
    >
      <div className="news-item-header" onClick={handleToggle}>
        <div className="news-item-title-row" data-news-title-id={item.id}>
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
                className={getNewsContentClassName(item, "inline")}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const anchor = target.closest("a");
                  if (anchor && anchor.href) {
                    e.preventDefault();
                    window.open(anchor.href, "_blank");
                  }
                }}
                dangerouslySetInnerHTML={{
                  __html: renderNewsContentHtml(item, content || ""),
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

import React, { useRef } from "react";

import NewsItem from "./NewsItem";
import { useNewsVisibility } from "./useNewsVisibility";
import { NewsItem as NewsItemType, NewsOpenMode } from "../../../shared/types";

import type { NewsSource, NewsViewSnapshot } from "../../../shared/types";

interface NewsSectionProps {
  title: string;
  items: NewsItemType[];
  forumUrl: string;
  openMode: NewsOpenMode;
  onRead: (id: string) => void;
  onShowModal?: (item: NewsItemType) => void;
  isDevSection?: boolean;
  headerVariant?: "long" | "short";
  visibilityEnabled?: boolean;
  newsView?: NewsViewSnapshot;
  source?: NewsSource;
}

const NewsSection: React.FC<NewsSectionProps> = ({
  title,
  items,
  forumUrl,
  openMode,
  onRead,
  onShowModal,
  isDevSection,
  headerVariant,
  visibilityEnabled = false,
  newsView,
  source,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  useNewsVisibility(listRef, visibilityEnabled, newsView, source);
  const handleOpenForum = () => {
    if (forumUrl) {
      window.open(forumUrl, "_blank");
    }
  };

  return (
    <div className={`news-section ${isDevSection ? "dev-section" : ""}`}>
      <div className={`news-section-header ${headerVariant || "short"}`}>
        <h3 className="news-section-title">{title}</h3>
        {forumUrl && (
          <button
            className="view-more-btn"
            onClick={handleOpenForum}
            type="button"
          >
            자세히 보기 <span className="arrow">▶</span>
          </button>
        )}
      </div>

      <div className="news-list" ref={listRef}>
        {items.length > 0 ? (
          items.map((item) => (
            <NewsItem
              key={item.id}
              item={item}
              openMode={openMode}
              onRead={onRead}
              onShowModal={onShowModal}
            />
          ))
        ) : (
          <div className="no-news">게시글이 없습니다-</div>
        )}
      </div>
    </div>
  );
};

export default NewsSection;

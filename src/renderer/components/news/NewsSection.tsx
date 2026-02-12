import React from "react";

import NewsItem from "./NewsItem";
import { NewsItem as NewsItemType } from "../../../shared/types";

interface NewsSectionProps {
  title: string;
  items: NewsItemType[];
  forumUrl: string;
  onRead: (id: string) => void;
  onShowModal?: (item: NewsItemType) => void;
  isDevSection?: boolean;
  headerVariant?: "long" | "short";
}

const NewsSection: React.FC<NewsSectionProps> = ({
  title,
  items,
  forumUrl,
  onRead,
  onShowModal,
  isDevSection,
  headerVariant,
}) => {
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
          <button className="view-more-btn" onClick={handleOpenForum}>
            자세히 보기 <span className="arrow">▶</span>
          </button>
        )}
      </div>

      <div className="news-list">
        {items.length > 0 ? (
          items.map((item) => (
            <NewsItem
              key={item.id}
              item={item}
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

import React from "react";

import NewsItem from "./NewsItem";
import { NewsItem as NewsItemType } from "../../../shared/types";

interface NewsSectionProps {
  title: string;
  items: NewsItemType[];
  forumUrl: string;
  onRead: (id: string) => void;
}

const NewsSection: React.FC<NewsSectionProps> = ({
  title,
  items,
  forumUrl,
  onRead,
}) => {
  const handleOpenForum = () => {
    if (forumUrl) {
      window.electronAPI.openExternal(forumUrl);
    }
  };

  return (
    <div className="news-section">
      <div className="news-section-header">
        <h3 className="news-section-title">{title}</h3>
        <button className="view-more-btn" onClick={handleOpenForum}>
          자세히 보기 <span className="arrow">▶</span>
        </button>
      </div>

      <div className="news-list">
        {items.length > 0 ? (
          items.map((item) => (
            <NewsItem key={item.id} item={item} onRead={onRead} />
          ))
        ) : (
          <div className="no-news">등록된 소식이 없습니다.</div>
        )}
      </div>
    </div>
  );
};

export default NewsSection;

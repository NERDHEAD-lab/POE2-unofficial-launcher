import React, { useState, useEffect, useCallback } from "react";

import "./NewsDashboard.css";
import NewsSection from "./NewsSection";
import { NewsItem, AppConfig } from "../../../shared/types";

interface NewsDashboardProps {
  activeGame: AppConfig["activeGame"];
  serviceChannel: AppConfig["serviceChannel"];
}

const NewsDashboard: React.FC<NewsDashboardProps> = ({
  activeGame,
  serviceChannel,
}) => {
  const [notices, setNotices] = useState<NewsItem[]>([]);
  const [patchNotes, setPatchNotes] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNews = useCallback(
    async (useCacheOnly = false) => {
      if (!useCacheOnly) setIsLoading(true);

      try {
        // 1. Load from cache first (instant)
        const [cachedNotices, cachedPatches] = await Promise.all([
          window.electronAPI.getNewsCache(activeGame, serviceChannel, "notice"),
          window.electronAPI.getNewsCache(
            activeGame,
            serviceChannel,
            "patch-notes",
          ),
        ]);

        if (cachedNotices.length > 0 || cachedPatches.length > 0) {
          setNotices(cachedNotices);
          setPatchNotes(cachedPatches);
          setIsLoading(false); // Hide loading as we have cache
        }

        // 2. Fetch live data if not cache-only
        if (!useCacheOnly) {
          const [noticeList, patchList] = await Promise.all([
            window.electronAPI.getNews(activeGame, serviceChannel, "notice"),
            window.electronAPI.getNews(
              activeGame,
              serviceChannel,
              "patch-notes",
            ),
          ]);
          setNotices(noticeList);
          setPatchNotes(patchList);
        }
      } catch (error) {
        console.error("Failed to fetch news:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [activeGame, serviceChannel],
  );

  useEffect(() => {
    fetchNews();

    // Listen for background updates
    const unlisten = window.electronAPI.onNewsUpdated(() => {
      // Background update: we just fetch without showing global loading
      fetchNews(false);
    });

    return () => unlisten();
  }, [fetchNews]);

  const handleRead = (id: string) => {
    window.electronAPI.markNewsAsRead(id);
    // Locally update the UI to remove 'N' marker immediately
    setNotices((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isNew: false } : item)),
    );
    setPatchNotes((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isNew: false } : item)),
    );
  };

  const gggBase = "https://www.pathofexile.com/forum/view-forum";
  const kakaoBase = "https://poe.game.daum.net/forum/view-forum";
  const baseUrl = serviceChannel === "GGG" ? gggBase : kakaoBase;

  const forumUrls = {
    notice:
      activeGame === "POE2"
        ? serviceChannel === "GGG"
          ? `${baseUrl}/2211`
          : `${baseUrl}/news2`
        : `${baseUrl}/news`,
    patchNotes:
      activeGame === "POE2"
        ? serviceChannel === "GGG"
          ? `${baseUrl}/2212`
          : `${baseUrl}/patch-notes2`
        : `${baseUrl}/patch-notes`,
  };

  return (
    <div className="news-dashboard-container">
      {isLoading && notices.length === 0 && (
        <div className="news-dashboard-loading-overlay">
          <span>최신 소식을 불러오는 중...</span>
        </div>
      )}
      <div className="news-dashboard-content">
        <NewsSection
          title="공지사항"
          items={notices}
          forumUrl={forumUrls.notice}
          onRead={handleRead}
        />
        <div className="divider"></div>
        <NewsSection
          title="패치노트"
          items={patchNotes}
          forumUrl={forumUrls.patchNotes}
          onRead={handleRead}
        />
      </div>
    </div>
  );
};

export default NewsDashboard;

import React, { useState, useEffect, useCallback } from "react";

import "./NewsDashboard.css";
import NewsSection from "./NewsSection";
import { NewsItem, AppConfig } from "../../../shared/types";
import { FORUM_URLS } from "../../../shared/urls";

interface NewsDashboardProps {
  activeGame: AppConfig["activeGame"];
  serviceChannel: AppConfig["serviceChannel"];
}

const combinations = [
  { game: "POE1", service: "GGG" },
  { game: "POE2", service: "GGG" },
  { game: "POE1", service: "Kakao Games" },
  { game: "POE2", service: "Kakao Games" },
] as const;

interface NewsViewState {
  notices: NewsItem[];
  patchNotes: NewsItem[];
}

const NewsDashboard: React.FC<NewsDashboardProps> = ({
  activeGame,
  serviceChannel,
}) => {
  // Store news for all 4 combinations to allow instant switching
  const [allNews, setAllNews] = useState<Record<string, NewsViewState>>({
    "GGG-POE1": { notices: [], patchNotes: [] },
    "GGG-POE2": { notices: [], patchNotes: [] },
    "Kakao Games-POE1": { notices: [], patchNotes: [] },
    "Kakao Games-POE2": { notices: [], patchNotes: [] },
  });
  const [isInitialized, setIsInitialized] = useState(false);

  const fetchAllNews = useCallback(
    async (forced = false) => {
      // 1. Initial Load (Cache first for everyone or Active live if forced)
      const initialResults = await Promise.all(
        combinations.map(async ({ game, service }) => {
          const key = `${service}-${game}`;

          // If forced (manual refresh), we always hit network for active.
          // If not forced (startup/mount), we use cache for everyone initially to be fast.
          const useCache = !forced;

          const [notices, patchNotes] = await Promise.all([
            useCache
              ? window.electronAPI.getNewsCache(game, service, "notice")
              : window.electronAPI.getNews(game, service, "notice"),
            useCache
              ? window.electronAPI.getNewsCache(game, service, "patch-notes")
              : window.electronAPI.getNews(game, service, "patch-notes"),
          ]);
          return { key, notices, patchNotes };
        }),
      );

      setAllNews((prev) => {
        const next = { ...prev };
        initialResults.forEach((res) => {
          next[res.key] = { notices: res.notices, patchNotes: res.patchNotes };
        });
        return next;
      });

      if (forced) return; // For manual refresh, we are done after active/forced fetch

      // 2. Background Live Refresh (Sequential & Prioritized)
      // PRIORITY:
      // 1. Current Active (Active Service, Active Game)
      // 2. Same Service, Other Game
      // 3. Other Service, Active Game
      // 4. Other Service, Other Game
      const sortedCombinations = [...combinations].sort((a, b) => {
        const aIsActiveService = a.service === serviceChannel;
        const bIsActiveService = b.service === serviceChannel;
        const aIsActiveGame = a.game === activeGame;
        const bIsActiveGame = b.game === activeGame;

        // Rank Calculation
        const getRank = (isSvc: boolean, isGm: boolean) => {
          if (isSvc && isGm) return 0;
          if (isSvc && !isGm) return 1;
          if (!isSvc && isGm) return 2;
          return 3;
        };

        return (
          getRank(aIsActiveService, aIsActiveGame) -
          getRank(bIsActiveService, bIsActiveGame)
        );
      });

      // Execute sequentially to avoid concurrent network/UI load
      const updateSequentially = async () => {
        for (const { game, service } of sortedCombinations) {
          const key = `${service}-${game}`;

          // Small delay between fetches to ensure UI responsiveness
          await new Promise((resolve) => setTimeout(resolve, 500));

          const [notices, patchNotes] = await Promise.all([
            window.electronAPI.getNews(game, service, "notice"),
            window.electronAPI.getNews(game, service, "patch-notes"),
          ]);

          setAllNews((prev) => ({
            ...prev,
            [key]: { notices, patchNotes },
          }));
        }
      };

      updateSequentially();
    },
    [activeGame, serviceChannel],
  );

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // Wait for 500ms to let initial configs settle (avoid accidental transition clearing)
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!isMounted) return;

      await fetchAllNews();
      if (isMounted) {
        setIsInitialized(true);
      }
    };

    init();

    const unlisten = window.electronAPI.onNewsUpdated(() => {
      fetchAllNews(true);
    });

    return () => {
      isMounted = false;
      unlisten();
    };
  }, [fetchAllNews]);

  // Handle transition: clear 'N' markers locally AND in backend for the PREVIOUSLY active view
  const [prevKey, setPrevKey] = useState(`${serviceChannel}-${activeGame}`);

  const currentKey = `${serviceChannel}-${activeGame}`;
  if (prevKey !== currentKey) {
    // 1. Mark as read in backend store for persistence
    const prevViewData = allNews[prevKey];
    if (prevViewData) {
      const ids = [
        ...prevViewData.notices.map((n) => n.id),
        ...prevViewData.patchNotes.map((p) => p.id),
      ];
      if (ids.length > 0) {
        window.electronAPI.markMultipleNewsAsRead(ids);
      }
    }

    // 2. Clear locally for immediate UI update
    setPrevKey(currentKey);
    setAllNews((prevNews) => {
      const next = { ...prevNews };
      if (!next[prevKey]) return prevNews;
      next[prevKey] = {
        notices: next[prevKey].notices.map((item) => ({
          ...item,
          isNew: false,
        })),
        patchNotes: next[prevKey].patchNotes.map((item) => ({
          ...item,
          isNew: false,
        })),
      };
      return next;
    });
  }

  const handleRead = (id: string) => {
    window.electronAPI.markNewsAsRead(id);
    // Locally update all instances in state to remove 'N' marker
    setAllNews((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        next[key] = {
          notices: next[key].notices.map((item) =>
            item.id === id ? { ...item, isNew: false } : item,
          ),
          patchNotes: next[key].patchNotes.map((item) =>
            item.id === id ? { ...item, isNew: false } : item,
          ),
        };
      });
      return next;
    });
  };

  const getForumUrls = (game: string, service: string) => {
    // urls.ts의 상수를 사용하여 로직 간소화
    // Service Channel 타입을 단언하거나 일치하는지 확인 필요하지만, 여기서는 string으로 들어오므로 매핑
    const serviceKey = service as AppConfig["serviceChannel"];
    const baseUrl = FORUM_URLS[serviceKey] || FORUM_URLS["GGG"];

    return {
      notice:
        game === "POE2"
          ? service === "GGG"
            ? `${baseUrl}/2211`
            : `${baseUrl}/news2`
          : `${baseUrl}/news`,
      patchNotes:
        game === "POE2"
          ? service === "GGG"
            ? `${baseUrl}/2212`
            : `${baseUrl}/patch-notes2`
          : `${baseUrl}/patch-notes`,
    };
  };

  return (
    <div className="news-dashboard-container">
      {!isInitialized && (
        <div className="news-dashboard-loading-overlay">
          <span>최신 소식을 불러오는 중...</span>
        </div>
      )}
      <div className="news-dashboard-content">
        {combinations.map(({ game, service }) => {
          const key = `${service}-${game}`;
          const isActive = game === activeGame && service === serviceChannel;
          const urls = getForumUrls(game, service);
          const data = allNews[key];

          return (
            <div
              key={key}
              className="news-view-wrapper"
              style={{
                display: isActive ? "flex" : "none",
                width: "100%",
                gap: "30px",
              }}
            >
              <NewsSection
                title="공지사항"
                items={data.notices}
                forumUrl={urls.notice}
                onRead={handleRead}
                headerVariant="short"
              />
              <div className="divider"></div>
              <NewsSection
                title="패치노트"
                items={data.patchNotes}
                forumUrl={urls.patchNotes}
                onRead={handleRead}
                headerVariant="short"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NewsDashboard;

import React, { useState, useEffect, useCallback } from "react";

import "./NewsDashboard.css";
import NewsSection from "./NewsSection";
import { NewsItem, AppConfig } from "../../../shared/types";

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

  const fetchAllNews = useCallback(async (forced = false) => {
    const results = await Promise.all(
      combinations.map(async ({ game, service }) => {
        const [notices, patchNotes] = await Promise.all([
          forced
            ? window.electronAPI.getNews(game, service, "notice")
            : window.electronAPI.getNewsCache(game, service, "notice"),
          forced
            ? window.electronAPI.getNews(game, service, "patch-notes")
            : window.electronAPI.getNewsCache(game, service, "patch-notes"),
        ]);
        return { key: `${service}-${game}`, notices, patchNotes };
      }),
    );

    setAllNews((prev) => {
      const next = { ...prev };
      results.forEach((res) => {
        next[res.key] = { notices: res.notices, patchNotes: res.patchNotes };
      });
      return next;
    });

    if (!forced) {
      // If we only loaded cache, trigger a live fetch for everything in background
      Promise.all(
        combinations.map(async ({ game, service }) => {
          const [notices, patchNotes] = await Promise.all([
            window.electronAPI.getNews(game, service, "notice"),
            window.electronAPI.getNews(game, service, "patch-notes"),
          ]);
          return { key: `${service}-${game}`, notices, patchNotes };
        }),
      ).then((liveResults) => {
        setAllNews((prev) => {
          const next = { ...prev };
          liveResults.forEach((res) => {
            next[res.key] = {
              notices: res.notices,
              patchNotes: res.patchNotes,
            };
          });
          return next;
        });
      });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
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

  const gggBase = "https://www.pathofexile.com/forum/view-forum";
  const kakaoBase = "https://poe.game.daum.net/forum/view-forum";

  const getForumUrls = (game: string, service: string) => {
    const baseUrl = service === "GGG" ? gggBase : kakaoBase;
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
                height: "100%",
                gap: "30px",
              }}
            >
              <NewsSection
                title="공지사항"
                items={data.notices}
                forumUrl={urls.notice}
                onRead={handleRead}
              />
              <div className="divider"></div>
              <NewsSection
                title="패치노트"
                items={data.patchNotes}
                forumUrl={urls.patchNotes}
                onRead={handleRead}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NewsDashboard;

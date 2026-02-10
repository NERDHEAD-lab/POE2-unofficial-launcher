import React, { useState, useEffect, useCallback, useRef } from "react";

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
  const [fetchedKeys, setFetchedKeys] = useState<Set<string>>(new Set());

  // Refs to allow event listeners to access latest props without effect dependencies (Stale Closure fix)
  const gameRef = useRef(activeGame);
  const serviceRef = useRef(serviceChannel);
  const allNewsRef = useRef(allNews);
  // Track previous key for tab switching logic
  const prevKeyRef = useRef(`${serviceChannel}-${activeGame}`);

  useEffect(() => {
    gameRef.current = activeGame;
    serviceRef.current = serviceChannel;
  }, [activeGame, serviceChannel]);

  useEffect(() => {
    allNewsRef.current = allNews;
  }, [allNews]);

  const fetchCurrentNews = useCallback(
    async (force = false) => {
      // Use refs if we want to ensure we get the ABSOLUTE latest values in async/listener contexts
      const currentService = serviceRef.current;
      const currentGame = gameRef.current;
      const key = `${currentService}-${currentGame}`;

      if (!force && fetchedKeys.has(key)) return;

      try {
        const [notices, patchNotes] = await Promise.all([
          window.electronAPI.getNews(currentGame, currentService, "notice"),
          window.electronAPI.getNews(
            currentGame,
            currentService,
            "patch-notes",
          ),
        ]);

        setAllNews((prev) => ({
          ...prev,
          [key]: { notices, patchNotes },
        }));
        setFetchedKeys((prev) => new Set([...prev, key]));
      } catch (e) {
        console.error(`Failed to live fetch news for ${key}:`, e);
      }
    },
    [fetchedKeys],
  );

  const loadAllCaches = useCallback(async () => {
    const results = await Promise.all(
      combinations.map(async ({ game, service }) => {
        const notices = await window.electronAPI.getNewsCache(
          game,
          service,
          "notice",
        );
        const patchNotes = await window.electronAPI.getNewsCache(
          game,
          service,
          "patch-notes",
        );
        return {
          key: `${service}-${game}`,
          notices,
          patchNotes,
          game,
          service,
        };
      }),
    );

    const nextNews = { ...allNews };
    results.forEach((r) => {
      nextNews[r.key] = { notices: r.notices, patchNotes: r.patchNotes };
    });

    setAllNews(nextNews);
    return nextNews;
  }, [allNews]);

  const markAllViewsAsRead = useCallback(
    (targetNews?: Record<string, NewsViewState>) => {
      const currentNews = targetNews || allNewsRef.current;
      const allIds: string[] = [];
      Object.values(currentNews).forEach((v) => {
        const view = v as NewsViewState;
        view.notices.filter((n) => n.isNew).forEach((n) => allIds.push(n.id));
        view.patchNotes
          .filter((p) => p.isNew)
          .forEach((p) => allIds.push(p.id));
      });

      if (allIds.length > 0) {
        window.electronAPI.markMultipleNewsAsRead(allIds);
        // Clear locally for immediate UI update
        setAllNews((prevNews) => {
          const next = { ...prevNews };
          Object.keys(next).forEach((key) => {
            if (!next[key]) return;
            next[key] = {
              notices: next[key].notices.map((item) => ({
                ...item,
                isNew: false,
              })),
              patchNotes: next[key].patchNotes.map((item) => ({
                ...item,
                isNew: false,
              })),
            };
          });
          return next;
        });
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // 1. Initial Load (Cache first)
      const cached = await loadAllCaches();
      if (!isMounted) return;

      // 2. Clear 'N' badges BEFORE live-refreshing (Requirement: 갱신 전에 N는 지우고)
      // Pass cached data directly to avoid race condition with async state refresh
      markAllViewsAsRead(cached);

      // 3. Wait for 500ms to let initial configs settle
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!isMounted) return;

      // 4. Live fetch current active tab
      await fetchCurrentNews(true);

      if (isMounted) {
        setIsInitialized(true);
      }
    };

    init();

    const unlistenNews = window.electronAPI.onNewsUpdated(() => {
      // Periodic background refresh: Do NOT clear 'N' markers
      setFetchedKeys(new Set());
      fetchCurrentNews(true);
    });

    const unlistenShow = window.electronAPI.onWindowShow(() => {
      // Restoration from tray: Clear 'N' markers BEFORE refreshing
      markAllViewsAsRead();
      fetchCurrentNews(true);
    });

    return () => {
      isMounted = false;
      unlistenNews();
      unlistenShow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONLY once on mount

  // Lazy Loading: Trigger live fetch when tab changes IF not already fetched
  // Handle Lazy Loading & Tab Transitions
  useEffect(() => {
    if (!isInitialized) return;

    const currentKey = `${serviceChannel}-${activeGame}`;
    if (currentKey === prevKeyRef.current) return;

    // Tab Changed:
    // 1. Mark previous view as read
    const prevKey = prevKeyRef.current;
    const prevViewData = allNewsRef.current[prevKey];
    if (prevViewData) {
      const ids = [
        ...prevViewData.notices.filter((n) => n.isNew).map((n) => n.id),
        ...prevViewData.patchNotes.filter((p) => p.isNew).map((p) => p.id),
      ];

      if (ids.length > 0) {
        window.electronAPI.markMultipleNewsAsRead(ids);
        // Clear 'N' locally for previous view so it's clean when we return
        setAllNews((curr) => {
          const next = { ...curr };
          if (next[prevKey]) {
            next[prevKey] = {
              notices: next[prevKey].notices.map((n) => ({
                ...n,
                isNew: false,
              })),
              patchNotes: next[prevKey].patchNotes.map((p) => ({
                ...p,
                isNew: false,
              })),
            };
          }
          return next;
        });
      }
    }

    // 2. Update Ref
    prevKeyRef.current = currentKey;

    // 3. Force Fetch NEW view data
    fetchCurrentNews(true);
  }, [activeGame, serviceChannel, isInitialized, fetchCurrentNews]);

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

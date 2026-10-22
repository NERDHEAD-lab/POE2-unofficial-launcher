import React, { useState, useEffect } from "react";

import "./NewsDashboard.css";
import NewsSection from "./NewsSection";
import {
  NewsItem,
  AppConfig,
  NewsOpenMode,
  NewsSource,
  NewsViewSnapshot,
} from "../../../shared/types";
import { FORUM_URLS } from "../../../shared/urls";

interface NewsDashboardProps {
  activeGame: AppConfig["activeGame"];
  serviceChannel: AppConfig["serviceChannel"];
  openMode: NewsOpenMode;
  onItemClick?: (item: NewsItem) => void;
  visibilityBlocked?: boolean;
}
const combinations = [
  { game: "POE1", service: "GGG" },
  { game: "POE2", service: "GGG" },
  { game: "POE1", service: "Kakao Games" },
  { game: "POE2", service: "Kakao Games" },
] as const;

const NewsDashboard: React.FC<NewsDashboardProps> = ({
  activeGame,
  serviceChannel,
  openMode,
  onItemClick,
  visibilityBlocked = false,
}) => {
  const [views, setViews] = useState<Record<string, NewsViewSnapshot>>({});
  const [initializedKey, setInitializedKey] = useState("");
  const currentKey = `${serviceChannel}-${activeGame}`;
  const isInitialized = initializedKey === currentKey;

  useEffect(() => {
    let disposed = false;
    let requestSerial = 0;
    const key = `${serviceChannel}-${activeGame}`;
    const loadView = async () => {
      const request = ++requestSerial;
      const snapshot = await window.electronAPI.getNewsView(
        activeGame,
        serviceChannel,
      );
      if (
        disposed ||
        request !== requestSerial ||
        snapshot.game !== activeGame ||
        snapshot.service !== serviceChannel
      )
        return;
      setViews((previous) => {
        if ((previous[key]?.revision ?? -1) > snapshot.revision)
          return previous;
        return { ...previous, [key]: snapshot };
      });
      setInitializedKey(key);
    };
    const unsubscribe = window.electronAPI.onNewsUpdated(() => {
      void loadView();
    });
    void loadView();
    void Promise.all([
      window.electronAPI.getNews(activeGame, serviceChannel, "notice"),
      window.electronAPI.getNews(activeGame, serviceChannel, "patch-notes"),
    ])
      .then(() => {
        if (!disposed) return loadView();
      })
      .catch(console.error);
    return () => {
      disposed = true;
      requestSerial++;
      unsubscribe();
    };
  }, [activeGame, serviceChannel]);

  const handleRead = (id: string, source: NewsSource) => {
    void window.electronAPI.markNewsAsRead(id, source);
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
          const selected = key === currentKey;
          const urls = getForumUrls(game, service);
          const view = views[key];
          const enabled = selected && isInitialized && !visibilityBlocked;
          return (
            <div
              key={key}
              className="news-view-wrapper"
              style={{
                display: selected ? "flex" : "none",
                width: "100%",
                gap: "30px",
              }}
            >
              <NewsSection
                title="공지사항"
                items={view?.notices || []}
                forumUrl={urls.notice}
                openMode={openMode}
                onRead={(id) =>
                  handleRead(id, { game, service, category: "notice" })
                }
                onShowModal={onItemClick}
                headerVariant="short"
                visibilityEnabled={enabled}
                newsView={view}
                source={{ game, service, category: "notice" }}
              />
              <div className="divider"></div>
              <NewsSection
                title="패치노트"
                items={view?.patchNotes || []}
                forumUrl={urls.patchNotes}
                openMode={openMode}
                onRead={(id) =>
                  handleRead(id, { game, service, category: "patch-notes" })
                }
                onShowModal={onItemClick}
                headerVariant="short"
                visibilityEnabled={enabled}
                newsView={view}
                source={{ game, service, category: "patch-notes" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default NewsDashboard;

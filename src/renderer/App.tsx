import React, { useState, useEffect, useRef, useMemo } from "react";

import "./App.css";
import { CONFIG_KEYS } from "../shared/config";
import { DOWNLOAD_URLS, SUPPORT_URLS } from "../shared/urls";
import iconGithub from "./assets/icon-github.svg";
import { AppConfig, GameStatusState, RunStatus } from "../shared/types";
import { NewsItem } from "../shared/types";
import bannerBottom from "./assets/layout/banner-bottom.png";
import bgPoe from "./assets/poe1/bg-keepers.png";
import bgPoe2 from "./assets/poe2/bg-forest.webp";
import GameSelector from "./components/GameSelector";
import GameStartButton from "./components/GameStartButton";
import NewsDashboard from "./components/news/NewsDashboard";
import NewsSection from "./components/news/NewsSection";
import ServiceChannelSelector from "./components/ServiceChannelSelector";
import SettingsModal from "./components/settings/SettingsModal";
import SupportLinks from "./components/SupportLinks";
import TitleBar from "./components/TitleBar";
import UpdateModal from "./components/UpdateModal"; // [NEW]
import { extractThemeColors, applyThemeColors } from "./utils/theme";

// Status Message Configuration Interface
interface StatusMessageConfig {
  message: string;
  timeout: number; // -1 for infinite (sticky), otherwise duration in ms
}

// Status Message Mapping (Configuration)
const STATUS_MESSAGES: Record<RunStatus, StatusMessageConfig> = {
  idle: { message: "게임이 종료되었습니다.", timeout: 3000 },
  uninstalled: { message: "설치된 게임을 찾을 수 없습니다.", timeout: -1 }, // Sticky
  preparing: { message: "실행 절차 준비 중...", timeout: 3000 },
  processing: { message: "실행 절차 진행 중...", timeout: 3000 },
  authenticating: { message: "지정 PC 확인 중...", timeout: 3000 },
  ready: { message: "게임 실행 준비 완료! 잠시 후 실행됩니다.", timeout: 3000 },
  running: { message: "게임 실행 중", timeout: -1 }, // Sticky
  error: { message: "실행 오류 발생", timeout: 3000 },
};

// Keep track of revalidated backgrounds in this session to avoid redundant hashes/readbacks
const revalidatedFiles = new Set<string>();

function App() {
  const [activeGame, setActiveGame] = useState<AppConfig["activeGame"]>("POE1");
  const [bgImage, setBgImage] = useState(bgPoe);
  const [bgOpacity, setBgOpacity] = useState(1);
  const [serviceChannel, setServiceChannel] =
    useState<AppConfig["serviceChannel"]>("Kakao Games");
  // Shared Theme Cache State (from Electron Store)
  const [themeCache, setThemeCache] = useState<
    Partial<AppConfig["themeCache"]>
  >({});
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Refactor: Use globalGameState instead of simple text string
  const [globalGameStatus, setGlobalGameStatus] = useState<GameStatusState>({
    gameId: "POE1", // Default, effectively ignored until status !== idle
    serviceId: "Kakao Games",
    status: "idle",
  });

  // Active Status Message State
  const [activeMessage, setActiveMessage] = useState<string>("");

  const isFirstMount = useRef(true);

  const prevStatusRef = useRef<RunStatus>("idle");

  // [NEW] Update State
  // [NEW] Update State (Using object for richer metadata)
  const [updateState, setUpdateState] = useState<{
    state: "idle" | "checking" | "available" | "downloaded";
    version?: string;
  }>({ state: "idle" });

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // [NEW] Update Check Effect
  useEffect(() => {
    if (window.electronAPI) {
      // Listen for update status
      const unsubscribe = window.electronAPI.onUpdateStatusChange((status) => {
        console.log("[App] Update status:", status);
        if (status.state === "available") {
          setUpdateState({ state: "available", version: status.version });
          setIsUpdateModalOpen(true); // Auto-open modal on detection
        }
      });

      // Trigger check
      window.electronAPI.checkForUpdates();

      return () => unsubscribe();
    }
  }, []);

  const handleUpdateClick = () => {
    // Open external link to releases or trigger auto-update
    window.electronAPI.openExternal(SUPPORT_URLS.GITHUB_REPO + "/releases"); //TODO FIX
    setIsUpdateModalOpen(false);
  };

  const handleUpdateDismiss = () => {
    setIsUpdateModalOpen(false);
  };

  // Effect: Handle Generic Status Message & Timers
  useEffect(() => {
    const status = globalGameStatus.status;
    const prevStatus = prevStatusRef.current;

    // Ignore initial mount idle state (don't show "Game Exited" on boot)
    if (status === "idle" && prevStatus === "idle") {
      return;
    }

    // Also ignore transition from "uninstalled" to "idle" (re-install or config switch)
    // BUT we must CLEAR the sticky "uninstalled" message!
    if (status === "idle" && prevStatus === "uninstalled") {
      setTimeout(() => setActiveMessage(""), 0);
      prevStatusRef.current = status;
      return;
    }

    prevStatusRef.current = status;

    const config = STATUS_MESSAGES[status];
    if (!config) return;

    let messageText = config.message;

    // Special Case: Error Code Overrides
    if (status === "error" && globalGameStatus.errorCode) {
      messageText = `오류: ${globalGameStatus.errorCode}`;
    }

    // Set Message (Async to avoid synchronous setState warning)
    setTimeout(() => setActiveMessage(messageText), 0);

    // clear previous timers handled by useEffect cleanup

    // If timeout is defined and positive, set auto-clear
    if (config.timeout > 0) {
      const timer = setTimeout(() => {
        setActiveMessage("");
      }, config.timeout);
      return () => clearTimeout(timer);
    }
  }, [globalGameStatus.status, globalGameStatus.errorCode]);

  // Compute Active Status Message (Context Aware)
  const activeStatusMessage = useMemo(() => {
    // Only show status if it matches the currently selected Game & Service context
    if (
      globalGameStatus.gameId === activeGame &&
      globalGameStatus.serviceId === serviceChannel
    ) {
      return activeMessage;
    }
  }, [globalGameStatus, activeGame, serviceChannel, activeMessage]);

  // Compute Button Disabled State
  const isButtonDisabled = useMemo(() => {
    // Context mismatch check
    if (
      globalGameStatus.gameId !== activeGame ||
      globalGameStatus.serviceId !== serviceChannel
    ) {
      return false; // Actually, if context mismatch, we might want to allow "Starting" new context?
      // But adhering to original logic:
      return false;
    }

    const s = globalGameStatus.status;

    // ACTIVE: "Install" button should be ENABLED (not disabled)
    // allowing user to click and go to download page.
    if (s === "uninstalled") return false;

    // Running states -> Disabled
    if (
      s === "preparing" ||
      s === "processing" ||
      s === "authenticating" ||
      s === "ready" ||
      s === "running"
    ) {
      return true;
    }

    // Idle / Error -> Enabled
    return false;
  }, [globalGameStatus, activeGame, serviceChannel]);

  useEffect(() => {
    if (window.electronAPI) {
      // 1. Initial Load
      window.electronAPI.getConfig().then((rawConfig: unknown) => {
        const config = rawConfig as AppConfig;
        if (config[CONFIG_KEYS.ACTIVE_GAME])
          setActiveGame(
            config[CONFIG_KEYS.ACTIVE_GAME] as AppConfig["activeGame"],
          );
        if (config[CONFIG_KEYS.SERVICE_CHANNEL])
          setServiceChannel(
            config[CONFIG_KEYS.SERVICE_CHANNEL] as AppConfig["serviceChannel"],
          );
        if (config[CONFIG_KEYS.THEME_CACHE])
          setThemeCache(
            config[CONFIG_KEYS.THEME_CACHE] as AppConfig["themeCache"],
          );

        setIsConfigLoaded(true);

        const initialBg =
          (config[CONFIG_KEYS.ACTIVE_GAME] as AppConfig["activeGame"]) ===
          "POE2"
            ? bgPoe2
            : bgPoe;
        setBgImage(initialBg);
      });

      // 2. Listen for Changes (Reactive Observer)
      window.electronAPI.onConfigChange((key, value) => {
        if (key === CONFIG_KEYS.ACTIVE_GAME) {
          setActiveGame((prev) =>
            prev !== value ? (value as AppConfig["activeGame"]) : prev,
          );
        }
        if (key === CONFIG_KEYS.SERVICE_CHANNEL) {
          setServiceChannel((prev) =>
            prev !== value ? (value as AppConfig["serviceChannel"]) : prev,
          );
        }
        if (key === CONFIG_KEYS.THEME_CACHE) {
          setThemeCache((prev) =>
            JSON.stringify(prev) !== JSON.stringify(value)
              ? (value as AppConfig["themeCache"])
              : prev,
          );
        }
      });

      // 3. Game Status Updates (New Architecture)
      if (window.electronAPI.onGameStatusUpdate) {
        window.electronAPI.onGameStatusUpdate((statusState) => {
          setGlobalGameStatus(statusState);
        });
      }
    }
  }, []);

  // Effect 1: Theme Application (Reacts to game or cache changes)
  // This is a PURE visual application effect. No setConfig or extraction here.
  useEffect(() => {
    const poe1Fallback = {
      text: "#c8c8c8",
      accent: "#dfcf99",
      footer: "#0e0e0e",
    };
    const poe2Fallback = {
      text: "#b5c2b5",
      accent: "#aaddaa",
      footer: "#0c150c",
    };
    const activeFallback = activeGame === "POE1" ? poe1Fallback : poe2Fallback;

    const cached = themeCache[activeGame];
    if (cached) {
      applyThemeColors(cached);
    } else {
      applyThemeColors(activeFallback);
    }
  }, [activeGame, themeCache]);

  // Effect 2: Theme Extraction/Revalidation (Runs in background)
  useEffect(() => {
    const poe1Fallback = {
      text: "#c8c8c8",
      accent: "#dfcf99",
      footer: "#0e0e0e",
    };
    const poe2Fallback = {
      text: "#b5c2b5",
      accent: "#aaddaa",
      footer: "#0c150c",
    };
    const activeFallback = activeGame === "POE1" ? poe1Fallback : poe2Fallback;

    const triggerRevalidation = async () => {
      if (!window.electronAPI || !isConfigLoaded) return;
      const targetBg = activeGame === "POE1" ? bgPoe : bgPoe2;
      const cached = themeCache[activeGame];

      // Skip if already checked in this session
      if (revalidatedFiles.has(activeGame)) return;

      try {
        // [Hash-first Optimization]
        // Get FS-level hash before loading image in renderer
        const fsHash = await window.electronAPI.getFileHash(targetBg);

        // If hash matches, we are GOOD. Avoid expensive image load & extraction.
        if (cached && cached.hash === fsHash) {
          revalidatedFiles.add(activeGame);
          return;
        }

        // Only if hash changed (or no cache), we load the image and extract colors
        const { colors, hash } = await extractThemeColors(
          targetBg,
          activeFallback,
        );
        revalidatedFiles.add(activeGame);

        // Update the store
        const currentCache = (await window.electronAPI.getConfig(
          CONFIG_KEYS.THEME_CACHE,
        )) as AppConfig["themeCache"];
        const updatedCache = {
          ...(currentCache || {}),
          [activeGame]: { ...colors, hash },
        };
        window.electronAPI.setConfig(CONFIG_KEYS.THEME_CACHE, updatedCache);
      } catch (err) {
        console.error("[Theme] Revalidation failed:", err);
      }
    };

    triggerRevalidation();
  }, [activeGame, isConfigLoaded, themeCache]); // themeCache added for dependency integrity, revalidatedFiles prevents loops

  // Effect 3: Background Transition Visuals (NO setConfig here)
  useEffect(() => {
    const targetBg = activeGame === "POE1" ? bgPoe : bgPoe2;

    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    // Visual Transition only
    const fadeOutTimer = setTimeout(() => setBgOpacity(0), 0);
    const swapTimer = setTimeout(() => {
      setBgImage(targetBg);
      setBgOpacity(1);
    }, 400);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(swapTimer);
    };
  }, [activeGame]);

  const handleGameChange = (game: AppConfig["activeGame"]) => {
    setActiveGame(game);
    // 1. User triggered change moves the "Source of Truth"
    window.electronAPI?.setConfig(CONFIG_KEYS.ACTIVE_GAME, game);
  };

  const handleChannelChange = (channel: AppConfig["serviceChannel"]) => {
    setServiceChannel(channel);
    // 2. User triggered change moves the "Source of Truth"
    window.electronAPI?.setConfig(CONFIG_KEYS.SERVICE_CHANNEL, channel);
  };

  const handleGameStart = () => {
    if (!window.electronAPI) {
      console.warn("Electron API not available");
      return;
    }

    if (globalGameStatus.status === "uninstalled") {
      // Open Download Page using centralized URL constants
      const downloadUrl = DOWNLOAD_URLS[serviceChannel][activeGame];
      if (downloadUrl) {
        window.electronAPI.openExternal(downloadUrl);
      } else {
        console.error(
          `[App] No download URL found for ${activeGame} / ${serviceChannel}`,
        );
      }
      return;
    }

    window.electronAPI.triggerGameStart();
    console.log(`Game Start Triggered via IPC (${activeGame})`);
  };

  // Developer Notices State
  const [devNotices, setDevNotices] = useState<NewsItem[]>([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI
        .getNewsCache("POE1", "GGG", "dev-notice")
        .then(setDevNotices);
      window.electronAPI
        .getNews("POE1", "GGG", "dev-notice")
        .then(setDevNotices);
    }
  }, []);

  const handleDevRead = (id: string) => {
    window.electronAPI.markNewsAsRead(id);
    setDevNotices((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isNew: false } : item)),
    );
  };

  return (
    <div
      id="app-container"
      className={activeGame === "POE2" ? "bg-poe2" : "bg-poe1"}
    >
      <UpdateModal
        isOpen={isUpdateModalOpen}
        version={updateState.version || ""}
        onUpdate={handleUpdateClick}
        onClose={handleUpdateDismiss}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Background Layer for Transitions */}
      <div
        id="app-background"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${bgImage}')`,
          opacity: bgOpacity,
        }}
      />

      {/* 1. Top Title Bar (Outside Frame, High Z-Index) */}
      <TitleBar
        showUpdateIcon={!isUpdateModalOpen && updateState.state === "available"}
        onUpdateClick={() => setIsUpdateModalOpen(true)}
      />

      {/* 2. Main Content Frame */}
      <div
        className="app-main-content"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 10,
          minHeight: 0 /* Force flex constraints */,
          overflow: "hidden" /* Clip any runaway contents */,
          paddingTop:
            "32px" /* Ensure content starts below absolute TitleBar */,
        }}
      >
        {/* Gothic Top Frame Decorations (Now Inside Main Content) */}
        <div className="frame-decoration top-center"></div>
        <div className="frame-decoration top-left"></div>
        <div className="frame-decoration top-right"></div>

        <div className="app-layout">
          {/* === Left Panel: Controls (400px width) === */}
          <div className="left-panel">
            {/* Section A: Game Selector (Top) */}
            <div style={{ marginTop: "10px" }}>
              <GameSelector
                activeGame={activeGame}
                onGameChange={handleGameChange}
              />
            </div>

            {/* Section B: Menu Area (Middle) - Flex Grow */}
            <div
              className="middle-menu-area"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start" /* Top align */,
                alignItems: "flex-start" /* Left align */,
                paddingTop: "40px" /* Some top spacing */,
                paddingLeft: "20px" /* Small padding for left alignment */,
                paddingRight: "20px" /* Symmetric padding */,
              }}
            >
              <SupportLinks />
            </div>

            {/* Section C: Game Start & Company Logos (Bottom) */}
            <div className="bottom-controls">
              <div style={{ width: "340px", marginBottom: "4px" }}>
                <ServiceChannelSelector
                  channel={serviceChannel}
                  onChannelChange={handleChannelChange}
                  onSettingsClick={() => setIsSettingsOpen(true)}
                />
              </div>
              <GameStartButton
                onClick={handleGameStart}
                label={
                  globalGameStatus.status === "uninstalled"
                    ? "설치하기"
                    : "게임 시작"
                }
                className={isButtonDisabled ? "disabled" : ""}
                style={
                  isButtonDisabled
                    ? {
                        opacity: 0.5,
                        cursor: "not-allowed",
                        pointerEvents: "none",
                      }
                    : {}
                }
              />

              {/* Progress Info Message */}
              <div
                style={{
                  height: "20px",
                  marginTop: "2px",
                  marginBottom: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--theme-accent)",
                  fontSize: "13px",
                  fontWeight: 500,
                  textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  opacity: activeStatusMessage ? 1 : 0,
                  transition: "opacity 0.3s ease-in-out",
                }}
              >
                {activeStatusMessage || " "}
              </div>

              {/* Company Logos - Removed and moved to Service Channel Dropdown */}
              <div className="company-logos" style={{ display: "none" }} />
            </div>
          </div>

          {/* === Right Panel: Content Area === */}
          <div className="right-panel">
            <div className="dev-notice-container">
              <NewsSection
                title="개발자 공지사항"
                items={devNotices}
                forumUrl=""
                onRead={handleDevRead}
                isDevSection={true}
                headerVariant="long"
              />
            </div>
            <NewsDashboard
              activeGame={activeGame}
              serviceChannel={serviceChannel}
            />
          </div>
        </div>

        {/* Footer Section (Button + Image Separation) */}
        <div className="footer-section">
          {/* 1. Background Image Wrapper (Clipped) */}
          <div className="footer-bg-wrapper">
            <img
              src={bannerBottom}
              className="footer-bg-image"
              alt="Footer Banner"
            />
          </div>

          {/* 2. Content Overlay (Text & Icon) */}
          <div className="footer-content">
            <span className="credits-text">Powered by NERDHEAD LAB</span>
            <a
              href={SUPPORT_URLS.GITHUB_REPO}
              target="_blank"
              className="github-link"
            >
              <img src={iconGithub} className="github-icon" alt="GitHub Repo" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

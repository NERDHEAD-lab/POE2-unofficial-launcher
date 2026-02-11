import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";

import "./App.css";
import { CONFIG_KEYS } from "../shared/config";
import { DOWNLOAD_URLS, SUPPORT_URLS } from "../shared/urls";
import iconGithub from "./assets/icon-github.svg";
import bannerBottom from "./assets/layout/banner-bottom.png";
import bgPoe from "./assets/poe1/bg-keepers.png";
import bgPoe2 from "./assets/poe2/bg-forest.webp";
import GameSelector from "./components/GameSelector";
import GameStartButton from "./components/GameStartButton";
import {
  AppConfig,
  GameStatusState,
  RunStatus,
  NewsItem,
  PatchProgress,
  UpdateStatus,
  ChangelogItem,
} from "../shared/types";
import ChangelogModal from "./components/modals/ChangelogModal";
import MigrationModal from "./components/modals/MigrationModal";
import { OnboardingModal } from "./components/modals/OnboardingModal";
import { PatchFixModal } from "./components/modals/PatchFixModal";
import NewsDashboard from "./components/news/NewsDashboard";
import NewsSection from "./components/news/NewsSection";
import OfficialLinkButtons from "./components/OfficialLinkButtons";
import ServiceChannelSelector from "./components/ServiceChannelSelector";
import SettingsModal from "./components/settings/SettingsModal";
import SupportLinks from "./components/SupportLinks";
import TitleBar from "./components/TitleBar";
import UpdateModal from "./components/UpdateModal";
import { logger } from "./utils/logger";
import { extractThemeColors, applyThemeColors } from "./utils/theme";

// Status Message Configuration Interface
interface StatusMessageConfig {
  message: string;
  timeout: number; // -1 for infinite (sticky), otherwise duration in ms
}

// Status Message Mapping (Configuration)
const STATUS_MESSAGES: Record<RunStatus, StatusMessageConfig> = {
  idle: { message: "", timeout: 0 }, // [Updated] Clean idle state
  uninstalled: { message: "설치된 게임을 찾을 수 없습니다.", timeout: -1 }, // Sticky
  preparing: { message: "실행 절차 준비 중...", timeout: 3000 },
  processing: { message: "실행 절차 진행 중...", timeout: 3000 },
  authenticating: { message: "지정 PC 확인 중...", timeout: 3000 },
  ready: { message: "게임 실행 준비 완료! 잠시 후 실행됩니다.", timeout: 3000 },
  running: { message: "게임 실행 중", timeout: -1 }, // Sticky
  stopping: { message: "게임이 종료되었습니다.", timeout: 0 }, // Shown during transition
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Refactor: Use globalGameState instead of simple text string
  // [Refactor] Multi-Context Game Status Map
  // Key: `${gameId}_${serviceId}`
  const [gameStatusMap, setGameStatusMap] = useState<
    Record<string, GameStatusState>
  >({});

  // Computed: Current Active Status based on selection
  const activeGameStatus = useMemo(() => {
    const key = `${activeGame}_${serviceChannel}`;
    return (
      gameStatusMap[key] || {
        gameId: activeGame,
        serviceId: serviceChannel,
        status: "idle",
      }
    );
  }, [gameStatusMap, activeGame, serviceChannel]);

  // Active Status Message State
  const [activeMessage, setActiveMessage] = useState<string>("");

  const isFirstMount = useRef(true);

  const prevStatusRef = useRef<RunStatus>("idle");

  // Update State
  // Update State (Using object for richer metadata)
  const [updateState, setUpdateState] = useState<UpdateStatus>({
    state: "idle",
  });

  // Changelog State
  const [changelogs, setChangelogs] = useState<ChangelogItem[]>([]);
  const [versionRange, setVersionRange] = useState<{
    old?: string;
    new?: string;
  }>({});
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  // Changelog Listener
  useEffect(() => {
    if (window.electronAPI?.onShowChangelog) {
      return window.electronAPI.onShowChangelog((data) => {
        // Handle both old (array only) and new (object) payload for safety
        if (Array.isArray(data)) {
          setChangelogs(data);
          setVersionRange({});
        } else {
          setChangelogs(data.changelogs);
          setVersionRange({ old: data.oldVersion, new: data.newVersion });
        }
        setIsChangelogOpen(true);
      });
    }
  }, []);

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false); // [UAC Migration]

  // [UAC Migration] Listener
  useEffect(() => {
    if (window.electronAPI?.onUacMigrationRequest) {
      return window.electronAPI.onUacMigrationRequest(() => {
        setIsMigrationModalOpen(true);
      });
    }
  }, []);

  const handleMigrationConfirm = () => {
    window.electronAPI?.confirmUacMigration();
    setIsMigrationModalOpen(false);
  };

  const handleMigrationCancel = () => {
    setIsMigrationModalOpen(false);
  };

  // Launcher Title State (Managed by Main Process via Events)
  const [appTitle, setAppTitle] = useState("");

  useEffect(() => {
    if (window.electronAPI?.onTitleUpdated) {
      const cleanup = window.electronAPI.onTitleUpdated((newTitle) => {
        setAppTitle(newTitle);
      });
      return cleanup;
    }
  }, []);

  // Patch Modal State
  const [patchModalState, setPatchModalState] = useState<{
    isOpen: boolean;
    mode: "confirm" | "progress" | "done" | "error";
    gameId?: string;
    serviceId?: string;
    progress?: PatchProgress;
    autoStart?: boolean;
  }>({
    isOpen: false,
    mode: "confirm",
  });

  // Patch Progress Listener
  useEffect(() => {
    if (window.electronAPI) {
      if (window.electronAPI.onPatchProgress) {
        window.electronAPI.onPatchProgress((progress: PatchProgress) => {
          const isDone = progress.status === "done";
          if (isDone) {
            setActiveMessage(
              "패치 복구가 완료되었습니다. 이제 게임을 실행할 수 있습니다.",
            );
            // Auto-clear after 5 seconds
            setTimeout(() => setActiveMessage(""), 5000);
          }

          setPatchModalState((prev) => ({
            ...prev,
            mode: isDone
              ? "done"
              : progress.status === "error"
                ? "error"
                : "progress",
            isOpen: true,
            progress,
          }));
        });
      }

      // Listener for showing modal (from AutoPatchHandler or Manual trigger)
      if (window.electronAPI.onShowPatchFixModal) {
        window.electronAPI.onShowPatchFixModal(
          (data: {
            autoStart: boolean;
            serviceId?: string;
            gameId?: string;
          }) => {
            // data: { autoStart: boolean, serviceId?: string, gameId?: string }
            const isAuto = data.autoStart;
            setPatchModalState((prev) => ({
              ...prev,
              isOpen: true,
              mode: isAuto ? "progress" : "confirm",
              autoStart: isAuto,
              serviceId: data.serviceId,
              gameId: data.gameId,
            }));
          },
        );
      }
    }
  }, []);

  const handlePatchConfirm = useCallback(() => {
    // Trigger Manual Fix execution via Main IPC
    window.electronAPI.triggerManualPatchFix();
    setPatchModalState((prev) => ({
      ...prev,
      mode: "progress",
      progress: {
        status: "waiting",
        overallProgress: 0,
        total: 0,
        current: 0,
        files: [],
      },
    }));
  }, []);

  const handlePatchCancel = useCallback(() => {
    // We need to check the *current* state mode.
    // Since this callback depends on patchModalState.mode, it will update when mode changes.
    // However, onCancel is NOT a dependency of the auto-close effect in PatchFixModal, so this is safe.
    setPatchModalState((prev) => {
      if (prev.mode === "progress") {
        window.electronAPI.triggerPatchCancel();
      }
      return { ...prev, isOpen: false };
    });
  }, []);

  const handlePatchClose = useCallback(() => {
    setPatchModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Update Check Effect
  useEffect(() => {
    if (window.electronAPI) {
      // Listen for update status
      const unsubscribe = window.electronAPI.onUpdateStatusChange((status) => {
        logger.log("[App] Update status:", status);
        setUpdateState(status);

        if (status.state === "available" && !status.isSilent) {
          setIsUpdateModalOpen(true);
        }
      });

      // Trigger check
      window.electronAPI.checkForUpdates();

      return () => unsubscribe();
    }
  }, []);

  const handleUpdateClick = () => {
    window.electronAPI.downloadUpdate();
    // Modal stays open to show progress
  };

  const handleInstallClick = () => {
    window.electronAPI.installUpdate();
  };

  const handleUpdateDismiss = () => {
    setIsUpdateModalOpen(false);
  };

  // Effect: Handle Generic Status Message & Timers
  useEffect(() => {
    const status = activeGameStatus.status;
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
    if (status === "error" && activeGameStatus.errorCode) {
      messageText = `오류: ${activeGameStatus.errorCode}`;
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
  }, [activeGameStatus.status, activeGameStatus.errorCode]);

  // Compute Active Status Message (Context Aware)
  const activeStatusMessage = useMemo(() => {
    // Only show status if it matches the currently selected Game & Service context
    if (
      activeGameStatus.gameId === activeGame &&
      activeGameStatus.serviceId === serviceChannel
    ) {
      return activeMessage;
    }
  }, [activeGameStatus, activeGame, serviceChannel, activeMessage]);

  // Compute Button Disabled State
  const isButtonDisabled = useMemo(() => {
    // Context mismatch check
    if (
      activeGameStatus.gameId !== activeGame ||
      activeGameStatus.serviceId !== serviceChannel
    ) {
      return false; // Actually, if context mismatch, we might want to allow "Starting" new context?
      // But adhering to original logic:
      return false;
    }

    const s = activeGameStatus.status;

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
  }, [activeGameStatus, activeGame, serviceChannel]);

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

        // Load Onboarding State
        if (config[CONFIG_KEYS.SHOW_ONBOARDING] !== undefined) {
          setShowOnboarding(config[CONFIG_KEYS.SHOW_ONBOARDING] as boolean);
        }

        setIsConfigLoaded(true);

        const initialBg =
          (config[CONFIG_KEYS.ACTIVE_GAME] as AppConfig["activeGame"]) ===
          "POE2"
            ? bgPoe2
            : bgPoe;
        setBgImage(initialBg);

        // [Splash] Fade out and remove launcher splash screen from index.html
        setTimeout(() => {
          const splash = document.getElementById("launcher-splash");
          if (splash) {
            splash.classList.add("fade-out");
            // Remove from DOM after transition
            setTimeout(() => splash.remove(), 1000);
          }
        }, 500); // Small buffer for initial layout build
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
          setGameStatusMap((prev) => ({
            ...prev,
            [`${statusState.gameId}_${statusState.serviceId}`]: statusState,
          }));
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
        logger.error("[Theme] Revalidation failed:", err);
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
      logger.warn("Electron API not available");
      return;
    }

    if (activeGameStatus.status === "uninstalled") {
      // Open Download Page using centralized URL constants
      const downloadUrl = DOWNLOAD_URLS[serviceChannel][activeGame];
      if (downloadUrl) {
        window.open(downloadUrl, "_blank");
      } else {
        logger.error(
          `[App] No download URL found for ${activeGame} / ${serviceChannel}`,
        );
      }
      return;
    }

    window.electronAPI.triggerGameStart();
    logger.log(`Game Start Triggered via IPC (${activeGame})`);
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

  const handleOnboardingFinish = () => {
    setShowOnboarding(false);
    window.electronAPI?.setConfig(CONFIG_KEYS.SHOW_ONBOARDING, false);
  };

  // --- Auto Scaling Logic (Scale-to-Fit) ---
  const BASE_WIDTH = 1440;
  const BASE_HEIGHT = 960;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate ratios for both dimensions
      const widthRatio = windowWidth / BASE_WIDTH;
      const heightRatio = windowHeight / BASE_HEIGHT;

      // Use the smaller ratio to ensure UI fits within the window
      const newScale = Math.min(widthRatio, heightRatio);
      setScale(newScale);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div
      id="app-container"
      className={activeGame === "POE2" ? "bg-poe2" : "bg-poe1"}
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000",
        overflow: "hidden",
      }}
    >
      <OnboardingModal
        isOpen={showOnboarding}
        onFinish={handleOnboardingFinish}
      />

      <MigrationModal
        isOpen={isMigrationModalOpen}
        onConfirm={handleMigrationConfirm}
        onCancel={handleMigrationCancel}
      />

      {isChangelogOpen && (
        <ChangelogModal
          changelogs={changelogs}
          oldVersion={versionRange.old}
          newVersion={versionRange.new}
          onClose={() => setIsChangelogOpen(false)}
        />
      )}

      <UpdateModal
        isOpen={isUpdateModalOpen}
        version={
          (updateState.state === "available" ||
            updateState.state === "downloaded" ||
            updateState.state === "downloading") &&
          "version" in updateState
            ? updateState.version || ""
            : ""
        }
        status={updateState}
        onUpdate={handleUpdateClick}
        onInstall={handleInstallClick}
        onClose={handleUpdateDismiss}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <PatchFixModal
        isOpen={patchModalState.isOpen}
        mode={patchModalState.mode}
        gameId={patchModalState.gameId}
        serviceId={patchModalState.serviceId}
        progress={patchModalState.progress}
        autoStart={patchModalState.autoStart}
        onConfirm={handlePatchConfirm}
        onCancel={handlePatchCancel}
        onClose={handlePatchClose}
      />

      {/* Scalable UI Content */}
      <div
        className="app-scaler"
        style={{
          transform: `scale(${scale})`,
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transformOrigin: "center center",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 10,
          flexShrink: 0,
          backgroundColor: "#000", // Background of the UI frame itself
        }}
      >
        {/* Background Layer (Now inside Scaler to create Letterbox effect) */}
        <div
          id="app-background"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${bgImage}')`,
            opacity: bgOpacity,
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            zIndex: 0,
          }}
        />
        {/* 1. Top Title Bar (Outside Frame, High Z-Index) */}
        <TitleBar
          title={appTitle}
          showUpdateIcon={
            !isUpdateModalOpen && updateState.state === "available"
          }
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
          <div className="frame-decoration top-center">
            {/* Blue Fire Overlay (Localized Ripple) */}
            <div className="top-center-blue" />
            {/* Interactive Hit Zone for Blue Fire (Top Central Demon) */}
            <div className="top-center-trigger" />
          </div>
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
                <SupportLinks
                  onShowAllChangelogs={(logs) => {
                    setChangelogs(logs);
                    setVersionRange({ old: "", new: "" }); // Clear versions for "All" view
                    setIsChangelogOpen(true);
                  }}
                />
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

                {/* Official Links (Homepage/Trade) */}
                <OfficialLinkButtons
                  activeGame={activeGame}
                  serviceChannel={serviceChannel}
                />

                <GameStartButton
                  onClick={handleGameStart}
                  label={
                    activeGameStatus.status === "uninstalled"
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
                <img
                  src={iconGithub}
                  className="github-icon"
                  alt="GitHub Repo"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

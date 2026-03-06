/* eslint-disable import/order */
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";

import { CONFIG_KEYS, DEFAULT_CONFIG } from "../shared/config";
import {
  AppConfig,
  RunStatus,
  NewsItem,
  GameStatusState,
  ChangelogItem,
  UpdateStatus,
  PatchProgress,
  ThemeDefinition,
} from "../shared/types";
import { DOWNLOAD_URLS, SUPPORT_URLS } from "../shared/urls";

import "./App.css";
import iconGithub from "./assets/icon-github.svg";
import bannerBottom from "./assets/layout/banner-bottom.png";
import bgPoe from "./assets/poe1/bg-keepers.png";
import bgPoe2 from "./assets/poe2/bg-forest.webp";

import GameSelector from "./components/GameSelector";
import GameStartButton from "./components/GameStartButton";
import OfficialLinkButtons from "./components/OfficialLinkButtons";
import ServiceChannelSelector from "./components/ServiceChannelSelector";
import SupportLinks from "./components/SupportLinks";
import TitleBar from "./components/TitleBar";
import UpdateModal from "./components/UpdateModal";
import ChangelogModal from "./components/modals/ChangelogModal";
import { ForcedRepairModal } from "./components/modals/ForcedRepairModal";
import MigrationModal from "./components/modals/MigrationModal";
import NoticeModal from "./components/modals/NoticeModal";
import { OnboardingModal } from "./components/modals/OnboardingModal";
import { PatchFixModal } from "./components/modals/PatchFixModal";
import { PatchReservationModal } from "./components/modals/PatchReservationModal";
import NewsDashboard from "./components/news/NewsDashboard";
import NewsSection from "./components/news/NewsSection";
import SettingsModal from "./components/settings/SettingsModal";

import { VersionService, RemoteVersions } from "./services/VersionService";
import { logger } from "./utils/logger";
import {
  extractThemeColors,
  applyThemeColors,
  DEFAULT_THEME_COLORS,
} from "./utils/theme";

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

// --- 🛠️ Testing Scenarios (Toggle as needed) ---
// "DELAYED"   : Crash after 2 seconds (Child component)
// "IMMEDIATE" : Crash immediately during App render
// "NULL_REF"  : Crash due to null reference during render
// "NONE"      : No crash
const TEST_CRASH_MODE = (import.meta.env.VITE_TEST_CRASH_MODE || "NONE") as
  | "DELAYED"
  | "IMMEDIATE"
  | "NULL_REF"
  | "NONE";

const TestCrashComponent = () => {
  const [shouldCrash, setShouldCrash] = useState(false);

  useEffect(() => {
    if (TEST_CRASH_MODE !== "DELAYED") return;
    const timer = setTimeout(() => {
      setShouldCrash(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (shouldCrash) {
    throw new Error(
      "REAL CASE TEST: A child component (TestCrashComponent) has crashed after 2 seconds.\n\n" +
        "This confirms the ErrorBoundary works and the FatalErrorModal appears over the UI.",
    );
  }

  return null;
};

function App() {
  // 1. [TEST] Immediate Crash Scenario
  if (TEST_CRASH_MODE === "IMMEDIATE") {
    throw new Error(
      "IMMEDIATE CRASH TEST: App component crashed right at the start of rendering.\n\n" +
        "This specifically verifies that the main.tsx Root ErrorBoundary can handle failures even before App mounts.",
    );
  }

  // 2. [TEST] Null Reference Scenario
  if (TEST_CRASH_MODE === "NULL_REF") {
    const badData = null as unknown as { property_of_null: string };
    console.log(badData.property_of_null); // Explicit crash
  }

  const [activeTheme, setActiveTheme] = useState<
    | (ThemeDefinition & { assets: Record<string, string>; isRemote: boolean })
    | null
  >(null);
  const [poe1Theme, setPoe1Theme] = useState<
    | (ThemeDefinition & { assets: Record<string, string>; isRemote: boolean })
    | null
  >(null);
  const [poe2Theme, setPoe2Theme] = useState<
    | (ThemeDefinition & { assets: Record<string, string>; isRemote: boolean })
    | null
  >(null);

  // Patch Reservation State
  const [isPatchReservationOpen, setIsPatchReservationOpen] = useState(false);
  // Configuration State (Unified)
  const [config, setConfigState] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // UI States (Local only)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsFocusId, setSettingsFocusId] = useState<string | undefined>(
    undefined,
  );

  const [bgImage, setBgImage] = useState(bgPoe);
  const [bgOpacity, setBgOpacity] = useState(1);

  // [New] Theme Settings Version to trigger Effects
  const [themeVersion, setThemeVersion] = useState(0);

  // Refactor: Use globalGameState instead of simple text string
  // [Refactor] Multi-Context Game Status Map
  // Key: `${gameId}_${serviceId}`
  const [gameStatusMap, setGameStatusMap] = useState<
    Record<string, GameStatusState>
  >({});

  // Computed: Current Active Status based on selection
  const activeGameStatus = useMemo(() => {
    const key = `${config.activeGame}_${config.serviceChannel}`;
    return (
      gameStatusMap[key] || {
        gameId: config.activeGame,
        serviceId: config.serviceChannel,
        status: "idle",
      }
    );
  }, [gameStatusMap, config.activeGame, config.serviceChannel]);

  // Active Status Message State
  const [activeMessage, setActiveMessage] = useState<string>("");

  const isFirstMount = useRef(true);

  // Changelog State
  const [changelogs, setChangelogs] = useState<ChangelogItem[]>([]);
  const [versionRange, setVersionRange] = useState<{
    old?: string;
    new?: string;
  }>({});
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  // [New] Global Event Listener for Changelog
  useEffect(() => {
    const handleShowChangelogs = (event: Event) => {
      const customEvent = event as CustomEvent<ChangelogItem[]>;
      setChangelogs(customEvent.detail);
      setVersionRange({}); // Clear version range for generic changelog display
      setIsChangelogOpen(true);
    };

    window.addEventListener("SHOW_CHANGELOGS", handleShowChangelogs);
    return () => {
      window.removeEventListener("SHOW_CHANGELOGS", handleShowChangelogs);
    };
  }, []);
  const prevStatusRef = useRef<RunStatus>("idle");

  // Update State
  // Update State (Using object for richer metadata)
  const [updateState, setUpdateState] = useState<UpdateStatus>({
    state: "idle",
  });

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

  // Forced Repair Modal State
  const [isForcedRepairOpen, setIsForcedRepairOpen] = useState(false);
  const [repairVersionInfo, setRepairVersionInfo] = useState<{
    version: string;
    webRoot: string;
    timestamp: string | number;
  } | null>(null);

  // === Remote Version State ===
  const [remoteVersions, setRemoteVersions] = useState<RemoteVersions | null>(
    null,
  );

  useEffect(() => {
    VersionService.fetchRemoteVersions().then((versions) => {
      if (versions) {
        setRemoteVersions(versions);
        logger.log("[App] Remote versions loaded:", Object.keys(versions));
      }
    });
  }, []);

  // Handle Manual Force Repair Request (from SupportLinks)
  const handleForcedRepairRequest = useCallback(
    (versionInfo: {
      version: string;
      webRoot: string;
      timestamp: string | number;
    }) => {
      setRepairVersionInfo(versionInfo);
      setIsForcedRepairOpen(true);
    },
    [],
  );

  const handleForcedRepairConfirm = useCallback(
    (manualVersion: string) => {
      setIsForcedRepairOpen(false);

      // Try to get remote web root for this game to help main process
      const remoteInfo = VersionService.getRemoteVersionForGame(
        remoteVersions,
        config.activeGame,
      );

      window.electronAPI.triggerForceRepair(
        config.serviceChannel,
        config.activeGame,
        manualVersion,
        remoteInfo?.webRoot,
      );
    },
    [config.serviceChannel, config.activeGame, remoteVersions],
  );

  // [UAC Migration] Listener
  useEffect(() => {
    if (window.electronAPI?.onUacMigrationRequest) {
      const cleanup = window.electronAPI.onUacMigrationRequest(() => {
        setIsMigrationModalOpen(true);
      });

      // Signal to Main that Renderer is ready to receive UAC migration requests
      window.electronAPI.reportUacMigrationReady();

      return cleanup;
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
  const [appTitle, setAppTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (window.electronAPI?.onTitleUpdated) {
      const cleanup = window.electronAPI.onTitleUpdated((newTitle) => {
        setAppTitle(newTitle);
      });
      window.electronAPI.requestTitleUpdate();
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

      // [New] Listener for Patch Reservation Modal
      if (window.electronAPI.onShowPatchReservationModal) {
        window.electronAPI.onShowPatchReservationModal(() => {
          setIsPatchReservationOpen(true);
        });
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

  const refreshTheme = useCallback(async () => {
    if (!window.electronAPI) return;

    // Fetch both themes once to avoid redundant IPC calls
    const [t1, t2] = await Promise.all([
      window.electronAPI.getActiveTheme("POE1"),
      window.electronAPI.getActiveTheme("POE2"),
    ]);

    setPoe1Theme(t1);
    setPoe2Theme(t2);

    const theme = config.activeGame === "POE1" ? t1 : t2;
    setActiveTheme(theme);
  }, [config.activeGame]);

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

      // [New] Listen for theme settings changes to refresh
      const unsubConfig = window.electronAPI.onConfigChange((key) => {
        if (
          key === CONFIG_KEYS.REMOTE_THEME_SETTINGS ||
          key === CONFIG_KEYS.ACTIVE_GAME
        ) {
          refreshTheme();
        }
      });

      // Listen for initial theme cache sync
      const unsubThemeSync = window.electronAPI.onThemeSynced(() => {
        logger.log("[App] Theme cache synced. Refreshing UI.");
        refreshTheme();
      });

      return () => {
        unsubscribe();
        unsubConfig();
        unsubThemeSync();
      };
    }
  }, [refreshTheme]);

  useEffect(() => {
    const initTheme = async () => {
      await refreshTheme();
    };
    initTheme();
  }, [refreshTheme]);

  const handleUpdateClick = () => {
    window.electronAPI.downloadUpdate();
    // Modal stays open to show progress
  };

  const handleInstallClick = (isSilent = true) => {
    window.electronAPI.installUpdate(isSilent);
  };

  const handleUpdateDismiss = () => {
    setIsUpdateModalOpen(false);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
    setSettingsFocusId(undefined);
  };

  const openSettingsWithFocus = (configId: string) => {
    setSettingsFocusId(configId);
    setIsSettingsOpen(true);
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
      activeGameStatus.gameId === config.activeGame &&
      activeGameStatus.serviceId === config.serviceChannel
    ) {
      return activeMessage;
    }
  }, [
    activeGameStatus,
    config.activeGame,
    config.serviceChannel,
    activeMessage,
  ]);

  // Compute Button Disabled State
  const isButtonDisabled = useMemo(() => {
    // Context mismatch check
    if (
      activeGameStatus.gameId !== config.activeGame ||
      activeGameStatus.serviceId !== config.serviceChannel
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
  }, [activeGameStatus, config.activeGame, config.serviceChannel]);

  useEffect(() => {
    if (window.electronAPI) {
      // 1. Initial Load
      // 1. Initial Load
      window.electronAPI.getConfig().then((rawConfig: unknown) => {
        const loadedConfig = rawConfig as AppConfig;
        setConfigState(loadedConfig);
        setIsConfigLoaded(true);

        const initialBg = loadedConfig.activeGame === "POE2" ? bgPoe2 : bgPoe;
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
        setConfigState((prev) => ({
          ...prev,
          [key]: value,
        }));
        if (key === CONFIG_KEYS.REMOTE_THEME_SETTINGS) {
          setThemeVersion((prev) => prev + 1);
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
    if (!isConfigLoaded) return;

    const cached = config.themeCache[config.activeGame];
    if (cached) {
      applyThemeColors(cached);
    } else {
      // Fallback: Apply default theme colors if cache is missing
      applyThemeColors(DEFAULT_THEME_COLORS);
    }
  }, [isConfigLoaded, config.activeGame, config.themeCache, activeTheme]);

  // Effect 2a: Sync Theme Data from Main (Only on app start or settings change)
  useEffect(() => {
    const syncThemes = async () => {
      if (!window.electronAPI || !isConfigLoaded) return;
      try {
        const [p1Theme, p2Theme] = await Promise.all([
          window.electronAPI.getActiveTheme("POE1"),
          window.electronAPI.getActiveTheme("POE2"),
        ]);
        setPoe1Theme(p1Theme);
        setPoe2Theme(p2Theme);
        logger.log("[Theme] Theme definitions synced from main process.");
      } catch (err) {
        logger.error("[Theme] Failed to sync themes:", err);
      }
    };
    syncThemes();
  }, [isConfigLoaded, themeVersion]);

  // Effect 2b: Active Theme Selection (Local state only, instant on tab switch)
  useEffect(() => {
    const theme = config.activeGame === "POE1" ? poe1Theme : poe2Theme;
    // Use setTimeout to avoid synchronous setState inside effect
    const timer = setTimeout(() => {
      setActiveTheme(theme);
    }, 0);
    return () => clearTimeout(timer);
  }, [config.activeGame, poe1Theme, poe2Theme]);

  // Effect 2c: Color Extraction & Cache (Background task, only on visual change)
  useEffect(() => {
    const targetBg =
      (activeTheme && activeTheme.assets?.background) ||
      (config.activeGame === "POE2" ? bgPoe2 : bgPoe);

    const checkAndExtract = async () => {
      if (!window.electronAPI || !isConfigLoaded) return;

      // Skip if already checked for this session
      if (revalidatedFiles.has(targetBg)) return;

      try {
        const fsHash = await window.electronAPI.getFileHash(targetBg);
        const cached = config.themeCache[config.activeGame];

        if (cached && cached.hash === fsHash) {
          revalidatedFiles.add(targetBg);
          return;
        }

        const colors = await extractThemeColors(targetBg);
        revalidatedFiles.add(targetBg);

        const currentCache = (await window.electronAPI.getConfig(
          CONFIG_KEYS.THEME_CACHE,
        )) as AppConfig["themeCache"];

        const updatedCache = {
          ...(currentCache || {}),
          [config.activeGame]: { ...colors, hash: fsHash },
        };
        window.electronAPI.setConfig(CONFIG_KEYS.THEME_CACHE, updatedCache);
        logger.log(`[Theme] ${config.activeGame} colors updated in cache.`);
      } catch (err) {
        logger.error("[Theme] Background extraction failed:", err);
      }
    };

    checkAndExtract();
  }, [activeTheme, isConfigLoaded, config.activeGame, config.themeCache]);

  // [New] Refs to manage background transitions without double-flicker
  const pendingTargetRef = useRef<string | null>(null);
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Effect 3: Background Transition Visuals (Flicker-Free & Guaranteed Fade)
  useEffect(() => {
    // Priority: Remote Theme Background > Default Assets
    const targetBg =
      (activeTheme && activeTheme.assets?.background) ||
      (config.activeGame === "POE1" ? bgPoe : bgPoe2);

    // Initial mount: set immediately without animation (Deferred to avoid sync setState)
    if (isFirstMount.current) {
      isFirstMount.current = false;
      const timer = setTimeout(() => {
        setBgImage(targetBg);
        setBgOpacity(1);
      }, 0);
      return () => clearTimeout(timer);
    }

    // Update the intended final target
    pendingTargetRef.current = targetBg;

    // If a transition is ALREADY in progress, just stop here.
    // The current timer will pick up the latest target from pendingTargetRef when it fires.
    if (fadeTimerRef.current) return;

    // --- Start a new transition sequence ---
    // Use setTimeout to avoid synchronous setState inside effect
    const startTimer = setTimeout(() => {
      setBgOpacity(0);
    }, 0);

    fadeTimerRef.current = setTimeout(() => {
      // 1. Swap the image while it's dark (opacity 0)
      const finalTarget = pendingTargetRef.current || targetBg;
      setBgImage(finalTarget);

      // 2. [Reliability Fix] Small delay to ensure browser processed the image swap before fading in
      // This avoids the image appearing to 'snap' or skip the fade animation in some cases.
      setTimeout(() => {
        setBgOpacity(1);
        fadeTimerRef.current = null;
      }, 50);
    }, 400);

    return () => {
      clearTimeout(startTimer);
      // Note: We don't clear the main fadeTimerRef here (unless we want to restart on every update).
      // If we don't clear, we get a single smooth dark period even with rapid updates.
    };
  }, [config.activeGame, activeTheme]);

  const handleGameChange = (game: AppConfig["activeGame"]) => {
    // 1. User triggered change moves the "Source of Truth"
    window.electronAPI?.setConfig(CONFIG_KEYS.ACTIVE_GAME, game);
  };

  const handleChannelChange = (channel: AppConfig["serviceChannel"]) => {
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
      const downloadUrl =
        DOWNLOAD_URLS[config.serviceChannel][config.activeGame];
      if (downloadUrl) {
        window.open(downloadUrl, "_blank");
      } else {
        logger.error(
          `[App] No download URL found for ${config.activeGame} / ${config.serviceChannel}`,
        );
      }
      return;
    }

    window.electronAPI.triggerGameStart();
    logger.log(`Game Start Triggered via IPC (${config.activeGame})`);
  };

  // Developer Notices State
  const [devNotices, setDevNotices] = useState<NewsItem[]>([]);
  const [selectedNotice, setSelectedNotice] = useState<NewsItem | null>(null);

  const handleNoticeClick = useCallback((item: NewsItem) => {
    setSelectedNotice(item);
  }, []);

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
    window.electronAPI?.setConfig(CONFIG_KEYS.SHOW_ONBOARDING, false);
  };

  const handleAddPatchReservation = useCallback(
    (res: Omit<AppConfig["patchReservations"][0], "id" | "createdAt">) => {
      const newRes = {
        ...res,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      };
      window.electronAPI.triggerPatchReservation(newRes);
    },
    [],
  );

  const handleRemovePatchReservation = useCallback((id: string) => {
    window.electronAPI.deletePatchReservation(id);
  }, []);

  const handleSilentPatchNotificationToggle = useCallback(
    (enabled: boolean) => {
      window.electronAPI.setConfig(
        CONFIG_KEYS.SILENT_PATCH_NOTIFICATION,
        enabled,
      );
    },
    [],
  );

  // --- Auto Scaling Logic (Scale-to-Fit) ---
  const BASE_WIDTH = 1440;
  const BASE_HEIGHT = 960;
  const [scale, setScale] = useState(() => {
    // Initial calculation to prevent 1.0 -> actual_scale flicker
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const widthRatio = windowWidth / BASE_WIDTH;
    const heightRatio = windowHeight / BASE_HEIGHT;
    return Math.min(widthRatio, heightRatio);
  });

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
    <>
      {TEST_CRASH_MODE !== "NONE" && <TestCrashComponent />}
      <OnboardingModal
        isOpen={config.showOnboarding}
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
        onClose={closeSettings}
        initialSettingId={settingsFocusId}
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

      {/* Modal: Patch Reservation */}
      <PatchReservationModal
        isOpen={isPatchReservationOpen}
        reservations={config.patchReservations}
        activeGame={config.activeGame}
        activeService={config.serviceChannel}
        silentNotification={config.silentPatchNotification}
        onSilentToggle={handleSilentPatchNotificationToggle}
        onAdd={handleAddPatchReservation}
        onDelete={handleRemovePatchReservation}
        onClose={() => setIsPatchReservationOpen(false)}
        onNavigateToSetting={openSettingsWithFocus}
        launcherConfig={{
          autoLaunch: config.autoLaunch,
          closeAction: config.closeAction,
          autoFixPatchError: config.autoFixPatchError,
          skipDaumGameStarterUac: config.skipDaumGameStarterUac,
          serviceChannel: config.serviceChannel,
        }}
      />

      <NoticeModal
        item={selectedNotice}
        onClose={() => setSelectedNotice(null)}
      />

      {isForcedRepairOpen && repairVersionInfo && (
        <ForcedRepairModal
          key={`${config.activeGame}-${repairVersionInfo.version}`}
          isOpen={isForcedRepairOpen}
          gameId={config.activeGame}
          serviceId={config.serviceChannel}
          versionInfo={repairVersionInfo}
          remoteVersion={remoteVersions?.[config.activeGame]?.version}
          onCancel={() => setIsForcedRepairOpen(false)}
          onConfirm={handleForcedRepairConfirm}
        />
      )}

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
          backgroundColor: "#000",
        }}
      >
        {/* Background Layer (Now inside Scaler to create Letterbox effect) */}

        <div
          id="app-background"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${bgImage}')`,
            opacity: bgOpacity,
            transition: "opacity 0.4s ease-in-out",
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
          showUpdateIcon={updateState.state === "downloaded"}
          onUpdateClick={() => setIsUpdateModalOpen(true)}
          devMode={config.dev_mode}
          debugConsole={config.debug_console}
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
                  activeGame={config.activeGame}
                  onGameChange={handleGameChange}
                  poe1Theme={poe1Theme}
                  poe2Theme={poe2Theme}
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
                  remoteVersions={remoteVersions}
                  onForcedRepairRequest={handleForcedRepairRequest}
                  onPatchReservationRequest={() =>
                    setIsPatchReservationOpen(true)
                  }
                />
              </div>

              {/* Section C: Game Start & Company Logos (Bottom) */}
              <div className="bottom-controls">
                <div style={{ width: "340px", marginBottom: "4px" }}>
                  <ServiceChannelSelector
                    channel={config.serviceChannel}
                    onChannelChange={handleChannelChange}
                    onSettingsClick={() => setIsSettingsOpen(true)}
                  />
                </div>

                {/* Official Links (Homepage/Trade) */}
                <OfficialLinkButtons
                  activeGame={config.activeGame}
                  serviceChannel={config.serviceChannel}
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
                  onShowModal={handleNoticeClick}
                  isDevSection={true}
                  headerVariant="long"
                />
              </div>
              <NewsDashboard
                activeGame={config.activeGame}
                serviceChannel={config.serviceChannel}
                onItemClick={handleNoticeClick}
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
    </>
  );
}

export default App;

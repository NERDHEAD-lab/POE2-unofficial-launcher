import React, { useState, useEffect, useRef } from "react";
import "./App.css"; // Global Styles

// Local Imports
import { CONFIG_KEYS } from "../shared/config";
import { AppConfig } from "../shared/types";
import imgGGG from "./assets/img-ci-ggg_150x67.png";
import imgKakao from "./assets/img-ci-kakaogames_158x28.png";
import bgPoe from "./assets/poe/bg-keepers.png";
import bgPoe2 from "./assets/poe2/bg-forest.webp";
import GameSelector from "./components/GameSelector";
import GameStartButton from "./components/GameStartButton";
import ServiceChannelSelector from "./components/ServiceChannelSelector";
import SupportLinks from "./components/SupportLinks";
import TitleBar from "./components/TitleBar";
import { extractThemeColors, applyThemeColors } from "./utils/theme";

// Keep track of revalidated backgrounds in this session to avoid redundant hashes/readbacks
const revalidatedFiles = new Set<string>();

function App() {
  const [activeGame, setActiveGame] = useState<"POE1" | "POE2">("POE1");
  const [bgImage, setBgImage] = useState(bgPoe);
  const [bgOpacity, setBgOpacity] = useState(1);
  const [serviceChannel, setServiceChannel] = useState<"Kakao Games" | "GGG">(
    "Kakao Games",
  );
  // Shared Theme Cache State (from Electron Store)
  const [themeCache, setThemeCache] = useState<AppConfig["themeCache"]>({});

  const isFirstMount = useRef(true);

  // Synchronize Settings from Main Process (Reactive)
  useEffect(() => {
    if (window.electronAPI) {
      // 1. Initial Load
      window.electronAPI.getConfig().then((rawConfig: unknown) => {
        const config = rawConfig as AppConfig;
        if (config[CONFIG_KEYS.ACTIVE_GAME])
          setActiveGame(config[CONFIG_KEYS.ACTIVE_GAME]);
        if (config[CONFIG_KEYS.SERVICE_CHANNEL])
          setServiceChannel(config[CONFIG_KEYS.SERVICE_CHANNEL]);
        if (config[CONFIG_KEYS.THEME_CACHE])
          setThemeCache(config[CONFIG_KEYS.THEME_CACHE]);

        // Initial Background Image needs to match the loaded activeGame
        const initialBg =
          config[CONFIG_KEYS.ACTIVE_GAME] === "POE2" ? bgPoe2 : bgPoe;
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
    }
  }, []);

  // Effect 1: Theme Application (Reacts to game or cache changes)
  // This is a PURE visual application effect. No setConfig or extraction here.
  useEffect(() => {
    const targetBg = activeGame === "POE1" ? bgPoe : bgPoe2;
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

    const cached = themeCache[targetBg];
    if (cached) {
      applyThemeColors(cached);
    } else {
      applyThemeColors(activeFallback);
    }
  }, [activeGame, themeCache]);

  // Effect 2: Theme Extraction/Revalidation (Runs in background)
  useEffect(() => {
    const targetBg = activeGame === "POE1" ? bgPoe : bgPoe2;
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
      if (!window.electronAPI) return;
      const cached = themeCache[targetBg];

      // Skip if already checked in this session AND we have a cache
      if (revalidatedFiles.has(targetBg) && cached) return;

      try {
        const { colors, hash } = await extractThemeColors(
          targetBg,
          activeFallback,
        );
        revalidatedFiles.add(targetBg);

        // Update ONLY if hash has changed (avoids unnecessary store updates)
        if (!cached || cached.hash !== hash) {
          const updatedCache = {
            ...themeCache,
            [targetBg]: { ...colors, hash },
          };
          window.electronAPI.setConfig(CONFIG_KEYS.THEME_CACHE, updatedCache);
        }
      } catch (err) {
        console.error("[Theme] Revalidation failed:", err);
      }
    };

    triggerRevalidation();
  }, [activeGame, themeCache]); // Added themeCache to dependencies to ensure revalidation can update it

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

  const handleGameChange = (game: "POE1" | "POE2") => {
    setActiveGame(game);
    // 1. User triggered change moves the "Source of Truth"
    window.electronAPI?.setConfig(CONFIG_KEYS.ACTIVE_GAME, game);
  };

  const handleChannelChange = (channel: "Kakao Games" | "GGG") => {
    setServiceChannel(channel);
    // 2. User triggered change moves the "Source of Truth"
    window.electronAPI?.setConfig(CONFIG_KEYS.SERVICE_CHANNEL, channel);
  };

  const handleGameStart = () => {
    if (window.electronAPI) {
      window.electronAPI.triggerGameStart();
      console.log(`Game Start Triggered via IPC (${activeGame})`);
    } else {
      console.warn("Electron API not available");
    }
  };

  return (
    <div className="app-root-border">
      {/* Background Layer for Transitions */}
      <div
        id="app-background"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('${bgImage}')`,
          opacity: bgOpacity,
        }}
      />

      {/* 1. Top Title Bar */}
      <TitleBar />

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
                onSettingsClick={() => console.log("Settings Clicked")}
              />
            </div>
            <GameStartButton onClick={handleGameStart} />

            {/* Company Logos */}
            <div className="company-logos">
              <img
                src={imgKakao}
                alt="Kakao Games"
                height="14"
                style={{ opacity: 0.7 }}
              />
              <span style={{ color: "#555", fontSize: "10px" }}>|</span>
              <img
                src={imgGGG}
                alt="Grinding Gear Games"
                height="24"
                style={{ opacity: 0.7 }}
              />
            </div>
          </div>
        </div>

        {/* === Right Panel: Content Area === */}
        <div className="right-panel">
          {/* Currently Empty - Reserved for Notices/Patch Notes */}
          <div className="content-area">{/* Content Placeholder */}</div>
        </div>
      </div>
    </div>
  );
}

export default App;

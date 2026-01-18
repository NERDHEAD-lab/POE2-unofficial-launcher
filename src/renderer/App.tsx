import React, { useState, useEffect, useRef } from "react";
import "./App.css"; // Global Styles

// Local Imports
import imgGGG from "./src/assets/img-ci-ggg_150x67.png";
import imgKakao from "./src/assets/img-ci-kakaogames_158x28.png";
import bgPoe from "./src/assets/poe/bg-keepers.png";
import bgPoe2 from "./src/assets/poe2/bg-forest.webp";
import GameSelector from "./src/components/GameSelector";
import GameStartButton from "./src/components/GameStartButton";
import SupportLinks from "./src/components/SupportLinks";
import TitleBar from "./src/components/TitleBar";
import { extractThemeColors, applyThemeColors } from "./src/utils/theme";

function App() {
  const [activeGame, setActiveGame] = useState<"POE1" | "POE2">("POE1");
  const [bgImage, setBgImage] = useState(bgPoe);
  const [bgOpacity, setBgOpacity] = useState(1);
  const isFirstMount = useRef(true);

  // Background & Theme Transition Effect
  useEffect(() => {
    const targetBg = activeGame === "POE1" ? bgPoe : bgPoe2;

    // Helper to update colors
    const updateTheme = () => {
      extractThemeColors(targetBg, {
        text: "#c8c8c8",
        accent: "#dfcf99",
        footer: "#0e0e0e",
      }).then((colors) => {
        applyThemeColors(colors);
      });
    };

    if (isFirstMount.current) {
      // Initial Load: Theme update only (Image already set by initial state)
      // No fade in on first mount to prevent black screen flash
      updateTheme();
      isFirstMount.current = false;
    } else {
      // Transition: Fade Out -> Swap -> Fade In
      // Use requestAnimationFrame/setTimeout to ensure state updates trigger re-render
      setTimeout(() => {
        setBgOpacity(0); // Fade out
      }, 0);

      setTimeout(() => {
        setBgImage(targetBg); // Swap image
        updateTheme(); // Update theme
        setBgOpacity(1); // Fade in
      }, 400); // 400ms matches CSS transition
    }
  }, [activeGame]);

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
              onGameChange={setActiveGame}
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

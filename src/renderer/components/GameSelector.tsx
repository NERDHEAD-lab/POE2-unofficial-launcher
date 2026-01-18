import React from "react";
import "./GameSelector.css";

// Import Assets
import logoPoe from "../assets/poe/logo.png";
import logoPoe2 from "../assets/poe2/logo.png";

interface GameSelectorProps {
  activeGame: "POE1" | "POE2";
  onGameChange: (game: "POE1" | "POE2") => void;
}

const GameSelector: React.FC<GameSelectorProps> = ({
  activeGame,
  onGameChange,
}) => {
  return (
    <div className="logo-container">
      {/* Logos are swapped visually via CSS based on active state or just conditional rendering with animation classes */}
      <img
        src={logoPoe}
        className={`logo-item ${activeGame === "POE1" ? "active-main" : "inactive-sub"}`}
        alt="POE Logo"
        onClick={() => onGameChange("POE1")}
      />
      <img
        src={logoPoe2}
        className={`logo-item ${activeGame === "POE2" ? "active-main" : "inactive-sub"}`}
        alt="POE2 Logo"
        onClick={() => onGameChange("POE2")}
      />
    </div>
  );
};

export default GameSelector;

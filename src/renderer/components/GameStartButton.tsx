import React from "react";
import "./GameStartButton.css";

interface GameStartButtonProps {
  onClick: () => void;
  label?: string;
  style?: React.CSSProperties;
  className?: string; // Allow external class injection
}

const GameStartButton: React.FC<GameStartButtonProps> = ({
  onClick,
  label = "게임 시작",
  style,
  className = "",
}) => {
  return (
    <button
      className={`main-start__link ${className}`}
      onClick={onClick}
      style={style}
    >
      <span className="hover-overlay"></span>
      <span className="text-blind">{label}</span>
    </button>
  );
};

export default GameStartButton;

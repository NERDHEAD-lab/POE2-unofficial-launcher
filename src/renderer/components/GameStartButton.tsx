import React from "react";
import "./GameStartButton.css";

interface GameStartButtonProps {
  onClick: () => void;
  label?: string;
}

const GameStartButton: React.FC<GameStartButtonProps> = ({
  onClick,
  label = "게임 시작",
}) => {
  return (
    <button className="main-start__link" onClick={onClick}>
      <span className="hover-overlay"></span>
      <span className="text-blind">{label}</span>
    </button>
  );
};

export default GameStartButton;

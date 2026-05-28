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
      {/* Defined SVG Filter for Chiseled 3D Effect */}
      <svg
        width="0"
        height="0"
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          pointerEvents: "none",
        }}
      >
        <defs>
          <filter id="gold-bevel" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" result="blur" />
            <feSpecularLighting
              in="blur"
              surfaceScale="4"
              specularConstant="2.2"
              specularExponent="40"
              lightingColor="#ffffff"
              result="specular"
            >
              <fePointLight x="-5000" y="-10000" z="8000" />
            </feSpecularLighting>
            <feComposite
              in="specular"
              in2="SourceAlpha"
              operator="in"
              result="specular-masked"
            />
            <feComposite
              in="SourceGraphic"
              in2="specular-masked"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
            />
          </filter>
        </defs>
      </svg>

      <span className="hover-overlay"></span>
      <span className="main-start__text">{label}</span>
    </button>
  );
};

export default GameStartButton;

import React from "react";

import WindowControls from "./WindowControls";
import icon from "../assets/icon.ico"; // Assuming copied icon.ico works, or fallback

interface TitleBarProps {
  title?: string;
}

const TitleBar: React.FC<TitleBarProps> = ({
  title = `PoE Unofficial Launcher v${__APP_VERSION__}`,
}) => {
  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <img src={icon} alt="App Icon" className="app-icon" />
        <span className="app-title">{title}</span>
      </div>
      <div className="title-bar-right">
        <WindowControls />
      </div>
    </div>
  );
};

export default TitleBar;

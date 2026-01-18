import React from "react";

import "./ServiceChannelSelector.css";
import iconSettings from "../assets/icons/ic-settings.svg";

interface ServiceChannelSelectorProps {
  channel: "Kakao Games" | "GGG";
  onChannelChange: (channel: "Kakao Games" | "GGG") => void;
  onSettingsClick: () => void;
}

const ServiceChannelSelector: React.FC<ServiceChannelSelectorProps> = ({
  channel,
  onChannelChange,
  onSettingsClick,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const wasFocusedRef = React.useRef(false);

  return (
    <div className="service-channel-container">
      <div className="service-channel-label">서비스 채널</div>
      <div className="service-channel-controls">
        <select
          className={`service-channel-dropdown ${isOpen ? "active" : ""}`}
          value={channel}
          onMouseDown={(e) => {
            // Track if it was already focused before this interaction
            wasFocusedRef.current = document.activeElement === e.currentTarget;
            setIsOpen(true);
          }}
          onClick={(e) => {
            // If it was already focused, this click likely closes it (re-selection or toggle)
            if (wasFocusedRef.current) {
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            setIsOpen(false);
            wasFocusedRef.current = false;
          }}
          onChange={(e) => {
            onChannelChange(e.target.value as "Kakao Games" | "GGG");
            setIsOpen(false);
            e.target.blur();
          }}
        >
          <option value="Kakao Games">Kakao Games</option>
          <option value="GGG">GGG</option>
        </select>
        <button
          className="settings-button"
          onClick={onSettingsClick}
          aria-label="Settings"
          title="설정 (Settings)"
        >
          <span
            style={{
              display: "inline-block",
              width: "18px",
              height: "18px",
              backgroundColor: "currentColor",
              maskImage: `url(${iconSettings})`,
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskImage: `url(${iconSettings})`,
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
            }}
          />
        </button>
      </div>
    </div>
  );
};

export default ServiceChannelSelector;

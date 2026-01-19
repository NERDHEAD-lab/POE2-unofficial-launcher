import React, { useEffect, useRef, useState } from "react";

import { AppConfig } from "../../shared/types";
import iconSettings from "../assets/icons/ic-settings.svg";
import imgGGG from "../assets/img-ci-ggg_150x67.png";
import imgKakao from "../assets/img-ci-kakaogames_158x28.png";
import "./ServiceChannelSelector.css";

type ServiceChannel = AppConfig["serviceChannel"];

interface ServiceChannelInfo {
  logo: string;
  alt: string;
}

// Extensible Configuration Map
const CHANNEL_CONFIG: Record<ServiceChannel, ServiceChannelInfo> = {
  "Kakao Games": {
    logo: imgKakao,
    alt: "Kakao Games",
  },
  GGG: {
    logo: imgGGG,
    alt: "Grinding Gear Games",
  },
};

interface ServiceChannelSelectorProps {
  channel: ServiceChannel;
  onChannelChange: (channel: ServiceChannel) => void;
  onSettingsClick: () => void;
}

const ServiceChannelSelector: React.FC<ServiceChannelSelectorProps> = ({
  channel,
  onChannelChange,
  onSettingsClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const activeInfo = CHANNEL_CONFIG[channel];

  return (
    <div className="service-channel-container" ref={containerRef}>
      <div className="service-channel-label">서비스 채널</div>
      <div className="service-channel-controls">
        {/* Dropdown Wrapper (Trigger + List) */}
        <div className="dropdown-wrapper">
          <div
            className={`custom-dropdown-trigger ${isOpen ? "active" : ""}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            <img
              src={activeInfo.logo}
              alt={activeInfo.alt}
              className="channel-logo"
            />
          </div>

          {/* Dropdown List (Automatic based on CHANNEL_CONFIG) */}
          {isOpen && (
            <div className="custom-dropdown-list">
              {(Object.keys(CHANNEL_CONFIG) as ServiceChannel[]).map((key) => {
                const info = CHANNEL_CONFIG[key];
                return (
                  <div
                    key={key}
                    className={`custom-dropdown-item ${
                      channel === key ? "selected" : ""
                    }`}
                    onClick={() => {
                      onChannelChange(key);
                      setIsOpen(false);
                    }}
                  >
                    <img
                      src={info.logo}
                      alt={info.alt}
                      className="channel-logo"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings Button */}
        <button
          className="settings-button"
          onClick={onSettingsClick}
          aria-label="Settings"
          title="설정 (Settings)"
        >
          <span
            style={{
              display: "inline-block",
              width: "20px",
              height: "20px",
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

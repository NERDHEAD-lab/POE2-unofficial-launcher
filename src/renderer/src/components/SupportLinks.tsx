import React from "react";

// Icon Import
import iconBugReport from "../assets/icons/ic-bug-report.svg";
import iconCoffee from "../assets/icons/ic-coffee.svg";

const SupportLinks: React.FC = () => {
  // Using generic Material Symbols style URLs for icons based on user request (setting icon)
  // For now, simpler SVG or text emojis to ensure rendering without external font dependency issues if not loaded.
  // User asked for "https://fonts.google.com/icons?icon.size=24&icon.color=%231f1f1f&icon.query=setting"
  // We'll use a local SVG or a text fallback for now to ensure it works offline/standalone.

  const linkStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    color: "#ccc",
    textDecoration: "none",
    fontSize: "14px", // Increased from 12px
    padding: "6px 10px", // Increased padding
    transition: "color 0.2s",
    gap: "8px", // Increased gap
  };

  const hoverStyle = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = "var(--theme-accent, #dfcf99)";
  };

  const leaveStyle = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = "#ccc";
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        marginTop: "10px",
      }}
    >
      <a
        href="https://nerdhead-lab.github.io/POE2-quick-launch-for-kakao?docs=SUPPORT.md"
        target="_blank"
        rel="noreferrer"
        style={linkStyle}
        onMouseEnter={hoverStyle}
        onMouseLeave={leaveStyle}
      >
        <span
          style={{
            display: "inline-block",
            width: "16px",
            height: "16px",
            backgroundColor: "currentColor",
            maskImage: `url(${iconCoffee})`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskImage: `url(${iconCoffee})`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
          }}
        />
        후원하기
      </a>
      <a
        href="https://github.com/NERDHEAD-lab/POE2-quick-launch-for-kakao/issues"
        target="_blank"
        rel="noreferrer"
        style={linkStyle}
        onMouseEnter={hoverStyle}
        onMouseLeave={leaveStyle}
      >
        <span
          style={{
            display: "inline-block",
            width: "16px",
            height: "16px",
            backgroundColor: "currentColor",
            maskImage: `url(${iconBugReport})`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskImage: `url(${iconBugReport})`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
          }}
        />
        기능 건의/버그 제보
      </a>
    </div>
  );
};

export default SupportLinks;

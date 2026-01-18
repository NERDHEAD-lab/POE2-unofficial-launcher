import React from "react";

const SupportLinks: React.FC = () => {
  // Using generic Material Symbols style URLs for icons based on user request (setting icon)
  // For now, simpler SVG or text emojis to ensure rendering without external font dependency issues if not loaded.
  // User asked for "https://fonts.google.com/icons?icon.size=24&icon.color=%231f1f1f&icon.query=setting"
  // We'll use a local SVG or a text fallback for now to ensure it works offline/standalone.

  const linkStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    color: "#888",
    textDecoration: "none",
    fontSize: "12px",
    padding: "4px 8px",
    transition: "color 0.2s",
    gap: "6px",
  };

  const hoverStyle = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = "var(--theme-accent, #dfcf99)";
  };

  const leaveStyle = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = "#888";
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
        <span style={{ fontSize: "14px" }}>☕</span>
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
        {/* Settings Icon SVG (Simple Gear) */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
        </svg>
        기능 건의/버그 제보
      </a>
    </div>
  );
};

export default SupportLinks;

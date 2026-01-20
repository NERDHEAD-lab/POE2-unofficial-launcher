import React from "react";

// Local Settings CSS needed for font?
// It is imported in App -> SettingsModal -> Settings.css, so likely globally available.
// But to be safe and explicit, or relying on global bundle.

const SupportLinks: React.FC = () => {
  const linkStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    color: "#ccc",
    textDecoration: "none",
    fontSize: "14px",
    padding: "6px 10px",
    transition: "color 0.2s",
    gap: "8px",
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
          className="material-symbols-outlined"
          style={{ fontSize: "16px" }}
        >
          local_cafe
        </span>
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
          className="material-symbols-outlined"
          style={{ fontSize: "16px" }}
        >
          bug_report
        </span>
        기능 건의/버그 제보
      </a>
    </div>
  );
};

export default SupportLinks;

interface WindowControlsProps {
  devMode: boolean;
  debugConsole: boolean;
}

const WindowControls: React.FC<WindowControlsProps> = ({
  devMode,
  debugConsole,
}) => {
  const handleToggleDebug = async () => {
    if (window.electronAPI) {
      // Toggle the value
      await window.electronAPI.setConfig("debug_console", !debugConsole);
    }
  };

  const handleMinimize = () => {
    if (window.electronAPI && window.electronAPI.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleClose = () => {
    if (window.electronAPI && window.electronAPI.closeWindow) {
      window.electronAPI.closeWindow();
    }
  };

  const buttonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#888",
    width: "40px",
    height: "30px",
    fontSize: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s, color 0.2s",
  };

  return (
    <div
      style={
        { display: "flex", WebkitAppRegion: "no-drag" } as React.CSSProperties
      }
    >
      {devMode && (
        <button
          onClick={handleToggleDebug}
          style={{
            ...buttonStyle,
            color: debugConsole ? "var(--theme-accent)" : "#666",
            textShadow: debugConsole ? "0 0 8px var(--theme-accent)" : "none",
          }}
          title={debugConsole ? "디버그 콘솔 닫기" : "디버그 콘솔 열기"}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            if (!debugConsole) e.currentTarget.style.color = "#aaa";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            if (!debugConsole) e.currentTarget.style.color = "#666";
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "16px" }}
          >
            bug_report
          </span>
        </button>
      )}
      <button
        onClick={handleMinimize}
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#888";
        }}
      >
        &#8211; {/* Minus sign */}
      </button>
      <button
        onClick={handleClose}
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#d32f2f";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#888";
        }}
      >
        &#10005; {/* Cross Mark */}
      </button>
    </div>
  );
};

export default WindowControls;

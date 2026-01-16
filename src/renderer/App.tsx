import React from "react";
import "../shared/types"; // Import for global window type augmentation if needed, though usually requires d.ts config

function App() {
  const handleGameStart = () => {
    // Send IPC message to Main Process -> Game Window
    if (window.electronAPI) {
      window.electronAPI.triggerGameStart();
      console.log("Game Start Triggered via IPC");
    } else {
      console.warn("Electron API not available");
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#1e1e1e",
        color: "white",
        height: "100vh",
      }}
    >
      <h1>POE2 Unofficial Launcher</h1>
      <p>백그라운드 제어 모드</p>

      <div style={{ marginTop: "20px" }}>
        <button
          onClick={handleGameStart}
          style={{
            padding: "10px 20px",
            cursor: "pointer",
            background: "#f5e000",
            border: "none",
            color: "#3c1e1e",
            fontWeight: "bold",
          }}
        >
          게임 시작 (TEST)
        </button>
      </div>
    </div>
  );
}

export default App;

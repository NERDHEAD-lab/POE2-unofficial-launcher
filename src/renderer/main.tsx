import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import DebugConsole from "./components/DebugConsole";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DEBUG_APP_CONFIG } from "../shared/config";
import FatalErrorModal from "./components/modals/FatalErrorModal";
import { logger } from "./utils/logger";

import "./App.css";

const isDebug = window.location.hash === DEBUG_APP_CONFIG.HASH;

if (!isDebug) {
  logger.log("[Renderer] Renderer Logger initialized.");
}

export const Root = () => {
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<{
    errorDetails: string;
    type: "bug" | "suggestion";
  } | null>(null);
  const [launcherVersion, setLauncherVersion] = useState<string>("Unknown");

  useEffect(() => {
    // Get launcher version on mount
    if (window.electronAPI && window.electronAPI.getConfig) {
      window.electronAPI.getConfig("launcherVersion").then((v) => {
        if (v) setLauncherVersion(v as string);
      });
    }
  }, []);

  useEffect(() => {
    if (fatalError || reportData) {
      // Ensure splash screen is removed if an error or report modal occurs
      const splash = document.getElementById("launcher-splash");
      if (splash) splash.remove();
    }
  }, [fatalError, reportData]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onFatalError) {
      const cleanup = window.electronAPI.onFatalError((errorDetails) => {
        logger.error("[Root] Fatal Error received from Main:", errorDetails);
        setFatalError(errorDetails);
      });

      window.electronAPI.reportFatalReady();
      return cleanup;
    }
  }, []);

  useEffect(() => {
    // Listen for manual report modal trigger
    const handleShowReport = (event: any) => {
      setReportData(event.detail);
    };

    window.addEventListener("SHOW_REPORT_MODAL" as any, handleShowReport);
    return () => {
      window.removeEventListener("SHOW_REPORT_MODAL" as any, handleShowReport);
    };
  }, []);

  return (
    <div id="app-container">
      {fatalError && (
        <FatalErrorModal
          errorDetails={fatalError}
          launcherVersion={launcherVersion}
          type="fatal"
        />
      )}
      {reportData && !fatalError && (
        <FatalErrorModal
          errorDetails={reportData.errorDetails}
          type={reportData.type}
          launcherVersion={launcherVersion}
          onClose={() => setReportData(null)}
        />
      )}
      <ErrorBoundary onFatalError={setFatalError}>
        {isDebug ? <DebugConsole /> : <App />}
      </ErrorBoundary>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

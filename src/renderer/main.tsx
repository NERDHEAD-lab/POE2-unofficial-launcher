import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import DebugConsole from "./components/DebugConsole";
import { ErrorBoundary } from "./components/ErrorBoundary";
import FatalErrorModal from "./components/modals/FatalErrorModal";
import { GameStateProvider } from "./contexts/GameStateContext";
import { DEBUG_APP_CONFIG } from "../shared/config";
import { logger } from "./utils/logger";

import type { ErrorReportData } from "../shared/debug-log-policy";
import type { FatalErrorPayload } from "../shared/types";

import "./App.css";

const isDebug = window.location.hash === DEBUG_APP_CONFIG.HASH;

if (!isDebug) {
  logger.log("[Renderer] Renderer Logger initialized.");
}

export const Root = () => {
  const [fatalError, setFatalError] = useState<FatalErrorPayload | null>(null);
  const [reportData, setReportData] = useState<
    (ErrorReportData & {
      type: "bug" | "suggestion";
    }) | null
  >(null);
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
      const cleanup = window.electronAPI.onFatalError((payload) => {
        logger.error(
          "[Root] Fatal Error received from Main:",
          payload.errorDetails,
        );
        setFatalError(payload);
      });

      window.electronAPI.reportFatalReady();
      return cleanup;
    }
  }, []);

  useEffect(() => {
    // Listen for manual report modal trigger
    const handleShowReport = (event: Event) => {
      const customEvent = event as CustomEvent<
        ErrorReportData & { type: "bug" | "suggestion" }
      >;
      setReportData(customEvent.detail);
    };

    window.addEventListener("SHOW_REPORT_MODAL", handleShowReport);
    return () => {
      window.removeEventListener("SHOW_REPORT_MODAL", handleShowReport);
    };
  }, []);

  return (
    <div id="app-container">
      {fatalError && (
        <FatalErrorModal
          key={`fatal-${fatalError.occurredAt}`}
          errorDetails={fatalError.errorDetails}
          occurredAt={fatalError.occurredAt}
          launcherVersion={launcherVersion}
          type="fatal"
        />
      )}
      {reportData && !fatalError && (
        <FatalErrorModal
          key={`report-${reportData.occurredAt ?? "none"}`}
          errorDetails={reportData.errorDetails}
          errorSummary={reportData.errorSummary}
          occurredAt={reportData.occurredAt}
          type={reportData.type}
          launcherVersion={launcherVersion}
          onClose={() => setReportData(null)}
        />
      )}
      <ErrorBoundary
        onFatalError={(errorDetails) =>
          setFatalError({ errorDetails, occurredAt: Date.now() })
        }
      >
        <GameStateProvider>
          {isDebug ? <DebugConsole /> : <App />}
        </GameStateProvider>
      </ErrorBoundary>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

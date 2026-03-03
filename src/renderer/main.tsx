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

const Root = () => {
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onFatalError) {
      const cleanup = window.electronAPI.onFatalError((errorDetails) => {
        logger.error("[Root] Fatal Error received from Main:", errorDetails);
        setFatalError(errorDetails);
      });

      // Signal to Main that Renderer is ready to receive buffered fatal errors
      window.electronAPI.reportFatalReady();

      return cleanup;
    }
  }, []);

  return (
    <div id="app-container">
      {fatalError && <FatalErrorModal errorDetails={fatalError} />}
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

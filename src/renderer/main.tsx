import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import DebugConsole from "./components/DebugConsole";
import { DEBUG_APP_CONFIG } from "../shared/config";
import { logger } from "./utils/logger";

const isDebug = window.location.hash === DEBUG_APP_CONFIG.HASH;

if (!isDebug) {
  logger.log("[Renderer] Renderer Logger initialized.");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isDebug ? <DebugConsole /> : <App />}</React.StrictMode>,
);

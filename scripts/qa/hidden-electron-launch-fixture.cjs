#!/usr/bin/env node
"use strict";

const http = require("node:http");

const [mode, rendererTarget = "http://localhost:54321/"] =
  process.argv.slice(2);

if (mode === "exit") {
  process.exitCode = 7;
} else if (mode === "serve" || mode === "serve-own") {
  const port = Number(process.env.ELECTRON_REMOTE_DEBUGGING_PORT);
  const target =
    process.argv[2] === "serve-own"
      ? (() => {
          const value = new URL(rendererTarget);
          value.searchParams.set(
            "codexQaRun",
            process.env.ELECTRON_QA_RUN_ID || "missing-run-id",
          );
          return value.toString();
        })()
      : rendererTarget;
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      request.url === "/json/list"
        ? JSON.stringify([{ url: target }])
        : JSON.stringify({}),
    );
  });
  server.listen(port, "127.0.0.1", () => {
    setTimeout(() => server.close(), 750);
  });
} else {
  throw new Error(`Unknown fixture mode: ${mode || "<missing>"}`);
}

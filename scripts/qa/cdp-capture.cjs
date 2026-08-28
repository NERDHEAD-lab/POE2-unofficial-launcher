"use strict";

const fs = require("node:fs");
const path = require("node:path");

const port = process.env.CDP_PORT || "9222";
const targetUrl = process.env.CDP_TARGET_URL || "http://localhost:54321/";
const outputPath =
  process.env.CDP_OUTPUT ||
  path.resolve(process.cwd(), ".tmp", "electron-cdp.png");

let nextId = 1;
const pending = new Map();

async function getMainTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`Failed to list CDP targets: HTTP ${response.status}`);
  }

  const targets = await response.json();
  const target = targets.find((item) => item.url === targetUrl);

  if (!target?.webSocketDebuggerUrl) {
    throw new Error(
      `CDP target not found for ${targetUrl}. Available targets: ${targets
        .map((item) => item.url)
        .join(", ")}`,
    );
  }

  return target;
}

function send(socket, method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

async function main() {
  const target = await getMainTarget();
  const events = [];
  const socket = new WebSocket(target.webSocketDebuggerUrl);

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) {
        reject(new Error(JSON.stringify(data.error)));
        return;
      }
      resolve(data.result);
      return;
    }

    if (
      data.method === "Runtime.exceptionThrown" ||
      data.method === "Log.entryAdded"
    ) {
      events.push(data);
    }
  });

  await waitForOpen(socket);
  await send(socket, "Runtime.enable");
  await send(socket, "Page.enable");
  await send(socket, "Log.enable");

  const state = await send(socket, "Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const toolbar = document.querySelector(".news-refresh-toolbar");
      const devNotice = document.querySelector(".dev-notice-container");
      const toolbarRect = toolbar?.getBoundingClientRect();
      const devRect = devNotice?.getBoundingClientRect();
      return {
        title: document.title,
        url: location.href,
        fatalText: document.body.innerText.includes("런처 구동 중 복구가 불가능한 시스템 오류"),
        toolbarText: toolbar?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
        toolbarRect: toolbarRect ? {
          x: toolbarRect.x,
          y: toolbarRect.y,
          width: toolbarRect.width,
          height: toolbarRect.height
        } : null,
        devRect: devRect ? {
          x: devRect.x,
          y: devRect.y,
          width: devRect.width,
          height: devRect.height
        } : null
      };
    })()`,
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
  const screenshot = await send(socket, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
  socket.close();

  console.log(
    JSON.stringify(
      {
        target: target.url,
        outputPath,
        state: state.result.value,
        events,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

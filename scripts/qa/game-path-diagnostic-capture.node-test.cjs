"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */
/* global Buffer, __dirname, process, queueMicrotask, require */

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertLayoutReadyResult,
  assertScenarioState,
  buildLayoutReadyExpression,
  buildOwnedFixtureUrl,
  buildScenarioMatrix,
  buildScreenshotFileName,
  capturePureScreenshot,
  captureFixtureMatrix,
  parseCaptureEnvironment,
  parseNavigationWorkerArguments,
  parsePureScreenshotWorkerArguments,
  parseValidationWorkerArguments,
  runNavigationWorkerProcess,
  runPureScreenshotWorkerProcess,
  runValidationWorkerProcess,
  settleAfterCdpWorkerDetach,
  useCdpClient,
} = require("./game-path-diagnostic-capture.cjs");

const RUN_ID = "qa-ms64b-12345678";
const TARGET_URL = `http://localhost:54321/?codexQaFixture=diagnostic&codexQaRun=${RUN_ID}`;
const SELECTED_PATH = String.raw`C:\Games\Kakao Games\Path of Exile 2`;
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("worker-png"),
]);

const createProjectPaths = () => {
  const projectRoot = path.join(os.tmpdir(), "poe2-launcher-source");
  const outputDir = path.join(
    projectRoot,
    ".tmp",
    "electron",
    RUN_ID,
    "game-path-diagnostic-capture",
  );
  return { projectRoot, outputDir };
};

const createState = (scenario) => {
  const { width, height } = scenario.viewport;
  const nested = scenario.mode !== "diagnostic";
  const appScale = Math.min(width / 1440, height / 960);
  const modalRect = {
    left: 40,
    top: 24,
    right: width - 40,
    bottom: height - 24,
  };
  return {
    modeMarker: scenario.mode,
    splashPresent: false,
    splashVisible: false,
    appScale,
    dialogCount: nested ? 2 : 1,
    viewport: { width, height, devicePixelRatio: scenario.deviceScaleFactor },
    modalRect,
    headerRect: { left: 40, top: 24, right: width - 40, bottom: 100 },
    footerRect: {
      left: 40,
      top: height - 100,
      right: width - 40,
      bottom: height - 24,
    },
    optionRects: [
      { left: 62, top: 122, right: width / 2 - 8, bottom: height - 160 },
      {
        left: width / 2 + 8,
        top: 122,
        right: width - 62,
        bottom: height - 160,
      },
    ],
    outerAriaModal: nested ? null : "true",
    outerBackgroundInert: nested,
    outerBackgroundAriaHidden: nested ? "true" : null,
    nestedAriaModal: nested ? "true" : null,
    nestedOverlayRect: nested ? modalRect : null,
    nestedFocusInside: nested ? true : null,
    scroll: {
      document: {
        scrollWidth: width,
        clientWidth: width,
        scrollHeight: height,
        clientHeight: height,
      },
      body: {
        scrollWidth: width,
        clientWidth: width,
        scrollHeight: height,
        clientHeight: height,
      },
      modalBody: {
        scrollWidth: 800,
        clientWidth: 800,
        scrollHeight: 900,
        clientHeight: 420,
        overflowY: "auto",
        overscrollBehaviorY: "contain",
      },
    },
    longPath: {
      text: SELECTED_PATH,
      rect: { left: 62, top: 170, right: width / 2 - 8, bottom: 220 },
      scrollWidth: 360,
      clientWidth: 360,
      overflowWrap: "anywhere",
    },
    hitTargets: {
      checkboxOptions:
        scenario.mode === "selection"
          ? [
              {
                left: 160,
                top: 260,
                right: 160 + 320 * appScale,
                bottom: 260 + 52 * appScale,
              },
              {
                left: 160,
                top: 320,
                right: 160 + 320 * appScale,
                bottom: 320 + 52 * appScale,
              },
              {
                left: 160,
                top: 380,
                right: 160 + 320 * appScale,
                bottom: 380 + 52 * appScale,
              },
            ]
          : [],
      deleteButtons: [
        {
          left: 300,
          top: 260,
          right: 300 + 40 * appScale,
          bottom: 260 + 40 * appScale,
        },
      ],
      primaryAction: {
        left: 500,
        top: height - 80,
        right: 500 + 120 * appScale,
        bottom: height - 80 + 36 * appScale,
      },
    },
    selection:
      scenario.mode === "selection"
        ? {
            ctaText: "선택 (2개)",
            checks: [
              { targetId: "registry-primary", checked: true },
              { targetId: "registry-compatibility", checked: false },
              { targetId: "config", checked: true },
            ],
          }
        : null,
    partial:
      scenario.mode === "partial"
        ? {
            retryText: "실패 항목 다시 시도 (1개)",
            results: [
              { targetId: "registry-primary", status: "applied" },
              { targetId: "registry-compatibility", status: "failed" },
              { targetId: "config", status: "unchanged" },
            ],
          }
        : null,
    deletion:
      scenario.mode === "delete"
        ? {
            title: "레지스트리 경로값을 삭제할까요?",
            candidate: "Kakaogames (기본)",
            path: SELECTED_PATH,
          }
        : null,
  };
};

const createLayoutReadyResult = (scenario) => ({
  ready: true,
  marker: scenario.mode,
  appScale: Math.min(
    scenario.viewport.width / 1440,
    scenario.viewport.height / 960,
  ),
  viewport: {
    width: scenario.viewport.width,
    height: scenario.viewport.height,
    devicePixelRatio: scenario.deviceScaleFactor,
  },
  fontStatus: "loaded",
});

const createWorkerProcessHarness = ({
  stdout = PNG_BYTES,
  stderr = Buffer.alloc(0),
  exitCode = 0,
  hang = false,
  spawnError = null,
} = {}) => {
  const calls = [];
  const children = [];
  let activeChildren = 0;

  const spawn = (command, args, options) => {
    const callIndex = calls.length;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killCalls = [];
    child.closed = false;
    const closeChild = (code, signal) => {
      if (child.closed) return;
      child.closed = true;
      activeChildren -= 1;
      child.emit("close", code, signal);
    };
    child.kill = (signal) => {
      child.killCalls.push(signal);
      queueMicrotask(() => closeChild(null, signal));
      return true;
    };
    const call = {
      command,
      args,
      options,
      callIndex,
      activeAtSpawn: activeChildren,
    };
    calls.push(call);
    children.push(child);
    activeChildren += 1;

    queueMicrotask(() => {
      if (spawnError) {
        child.emit("error", spawnError);
        return;
      }
      if (hang) return;
      const stdoutValue =
        typeof stdout === "function" ? Buffer.from(stdout(call)) : stdout;
      const stderrValue =
        typeof stderr === "function" ? Buffer.from(stderr(call)) : stderr;
      if (stdoutValue.length > 0) child.stdout.emit("data", stdoutValue);
      if (stderrValue.length > 0) child.stderr.emit("data", stderrValue);
      closeChild(
        typeof exitCode === "function" ? exitCode(call) : exitCode,
        null,
      );
    });
    return child;
  };

  return {
    calls,
    children,
    spawn,
    get activeChildren() {
      return activeChildren;
    },
  };
};

const createPureScreenshotHarness = (targetUrl) => {
  const commands = [];
  const sockets = [];
  let fetchCount = 0;

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.readyState = 0;
      this.closeCount = 0;
      sockets.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.emit("open", {});
      });
    }

    addEventListener(type, callback, options = {}) {
      const listeners = this.listeners.get(type) || [];
      listeners.push({ callback, once: options.once === true });
      this.listeners.set(type, listeners);
    }

    emit(type, event) {
      const listeners = [...(this.listeners.get(type) || [])];
      for (const listener of listeners) {
        listener.callback(event);
        if (listener.once) {
          this.listeners.set(
            type,
            (this.listeners.get(type) || []).filter(
              (candidate) => candidate !== listener,
            ),
          );
        }
      }
    }

    send(payload) {
      const command = JSON.parse(payload);
      commands.push(command);
      const result =
        command.method === "Page.captureScreenshot"
          ? { data: PNG_BYTES.toString("base64") }
          : {};
      queueMicrotask(() =>
        this.emit("message", {
          data: JSON.stringify({ id: command.id, result }),
        }),
      );
    }

    close() {
      this.closeCount += 1;
      this.readyState = 3;
      this.emit("close", {});
    }
  }

  return {
    commands,
    sockets,
    get fetchCount() {
      return fetchCount;
    },
    dependencies: {
      commandTimeoutMs: 10,
      async fetch() {
        fetchCount += 1;
        return {
          ok: true,
          async json() {
            return [
              {
                url: targetUrl,
                webSocketDebuggerUrl: "ws://owned-target/devtools/page/1",
              },
            ];
          },
        };
      },
      WebSocket: FakeWebSocket,
    },
  };
};

test("accepts only the exact localhost owned target and run-owned output", () => {
  const { projectRoot, outputDir } = createProjectPaths();

  assert.deepEqual(
    parseCaptureEnvironment(
      {
        CDP_PORT: "43123",
        CDP_TARGET_URL: TARGET_URL,
        GAME_PATH_QA_OUTPUT_DIR: outputDir,
      },
      projectRoot,
    ),
    {
      port: 43123,
      targetUrl: TARGET_URL,
      runId: RUN_ID,
      initialMode: "diagnostic",
      outputDir: path.resolve(outputDir),
    },
  );
});

const invalidEnvironmentCases = [
  ["missing port", { CDP_PORT: undefined }],
  ["invalid port", { CDP_PORT: "9222x" }],
  [
    "foreign host",
    { CDP_TARGET_URL: TARGET_URL.replace("localhost", "127.0.0.1") },
  ],
  ["wrong port", { CDP_TARGET_URL: TARGET_URL.replace("54321", "54322") }],
  [
    "arbitrary path",
    { CDP_TARGET_URL: TARGET_URL.replace("/?", "/fixture.html?") },
  ],
  ["unknown query", { CDP_TARGET_URL: `${TARGET_URL}&script=alert(1)` }],
  [
    "invalid mode",
    { CDP_TARGET_URL: TARGET_URL.replace("diagnostic", "../../x") },
  ],
  ["duplicate run", { CDP_TARGET_URL: `${TARGET_URL}&codexQaRun=${RUN_ID}` }],
  ["relative output", { GAME_PATH_QA_OUTPUT_DIR: ".tmp/output" }],
  [
    "production source output",
    {
      GAME_PATH_QA_OUTPUT_DIR: path.join(
        createProjectPaths().projectRoot,
        "src",
        RUN_ID,
        "game-path-diagnostic-capture",
      ),
    },
  ],
  [
    "foreign run output",
    {
      GAME_PATH_QA_OUTPUT_DIR: path.join(
        createProjectPaths().projectRoot,
        ".tmp",
        "electron",
        "foreign-run",
        "game-path-diagnostic-capture",
      ),
    },
  ],
];

for (const [label, override] of invalidEnvironmentCases) {
  test(`fails closed for ${label}`, () => {
    const { projectRoot, outputDir } = createProjectPaths();
    assert.throws(() =>
      parseCaptureEnvironment(
        {
          CDP_PORT: "43123",
          CDP_TARGET_URL: TARGET_URL,
          GAME_PATH_QA_OUTPUT_DIR: outputDir,
          ...override,
        },
        projectRoot,
      ),
    );
  });
}

test("builds the four modes over the three paired simulated viewport/DPR cases", () => {
  const matrix = buildScenarioMatrix();

  assert.equal(matrix.length, 12);
  assert.deepEqual(
    [...new Set(matrix.map(({ mode }) => mode))],
    ["diagnostic", "selection", "partial", "delete"],
  );
  assert.deepEqual(
    [
      ...new Set(
        matrix.map(
          ({ viewportLabel, deviceScaleFactor }) =>
            `${viewportLabel}@${deviceScaleFactor}`,
        ),
      ),
    ],
    ["1024x683@1", "1440x960@1.25", "1920x1080@1.5"],
  );
  assert.equal(
    new Set(matrix.map((scenario) => buildScreenshotFileName(scenario))).size,
    12,
  );
  assert.equal(
    buildScreenshotFileName(matrix[3]),
    "selection--1024x683--dpr-1.png",
  );
  assert.equal(
    buildScreenshotFileName(matrix[5]),
    "selection--1920x1080--dpr-1p5.png",
  );
});

test("cycles only exact owned fixture URLs", () => {
  assert.equal(
    buildOwnedFixtureUrl(TARGET_URL, "partial"),
    `http://localhost:54321/?codexQaFixture=partial&codexQaRun=${RUN_ID}`,
  );
  assert.throws(() => buildOwnedFixtureUrl(TARGET_URL, "arbitrary"));
});

test("keeps the top-level orchestrator CDP-free", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "game-path-diagnostic-capture.cjs"),
    "utf8",
  );
  const mainBlock = source.slice(
    source.indexOf("const main = async"),
    source.indexOf("const useCdpClient = async"),
  );
  assert.match(mainBlock, /runNavigationWorkerProcess/);
  assert.match(mainBlock, /runValidationWorkerProcess/);
  assert.match(mainBlock, /runPureScreenshotWorkerProcess/);
  assert.doesNotMatch(mainBlock, /createCdpClient|WebSocket|\/json\/list/);
  const validationBlock = source.slice(
    source.indexOf("const executeValidationWorker = async"),
    source.indexOf("const executePureScreenshotWorker = async"),
  );
  assert.doesNotMatch(
    validationBlock,
    /Page\.bringToFront|Page\.captureScreenshot|captureScreenshot/,
  );
});

test("parses only exact navigation validation and screenshot worker argv", () => {
  const scenario = buildScenarioMatrix()[0];
  const targetUrl = buildOwnedFixtureUrl(TARGET_URL, scenario.mode);
  const shared = [
    "--cdp-port",
    "43123",
    "--target-url",
    targetUrl,
    "--scenario-id",
    scenario.id,
    "--width",
    String(scenario.viewport.width),
    "--height",
    String(scenario.viewport.height),
    "--device-scale-factor",
    String(scenario.deviceScaleFactor),
  ];

  assert.deepEqual(
    parseNavigationWorkerArguments([
      "--game-path-navigation-worker",
      "--current-target-url",
      TARGET_URL,
      ...shared,
    ]),
    {
      port: 43123,
      currentTargetUrl: TARGET_URL,
      targetUrl,
      runId: RUN_ID,
      scenario,
    },
  );
  assert.deepEqual(
    parseValidationWorkerArguments([
      "--game-path-validation-worker",
      ...shared,
    ]),
    { port: 43123, targetUrl, runId: RUN_ID, scenario },
  );
  assert.deepEqual(
    parsePureScreenshotWorkerArguments([
      "--game-path-pure-screenshot-worker",
      ...shared,
    ]),
    { port: 43123, targetUrl, runId: RUN_ID, scenario },
  );
  assert.throws(() =>
    parsePureScreenshotWorkerArguments([
      "--game-path-pure-screenshot-worker",
      ...shared.slice(0, -1),
      "1.5",
    ]),
  );
  assert.throws(() =>
    parseNavigationWorkerArguments([
      "--game-path-navigation-worker",
      "--current-target-url",
      TARGET_URL.replace("localhost", "127.0.0.1"),
      ...shared,
    ]),
  );
});

test("runs navigation validation and pure screenshot in separate workers", async () => {
  const scenario = buildScenarioMatrix()[0];
  const targetUrl = buildOwnedFixtureUrl(TARGET_URL, scenario.mode);
  const state = createState(scenario);
  const harness = createWorkerProcessHarness({
    stdout: ({ args }) => {
      if (args.includes("--game-path-pure-screenshot-worker")) {
        return PNG_BYTES;
      }
      return Buffer.from(
        JSON.stringify(
          args.includes("--game-path-navigation-worker")
            ? {
                schemaVersion: 1,
                kind: "navigation-complete",
                targetUrl,
                scenarioId: scenario.id,
              }
            : {
                schemaVersion: 1,
                kind: "validation-result",
                targetUrl,
                scenarioId: scenario.id,
                state,
                protocolErrors: [],
              },
        ),
      );
    },
  });
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  await runNavigationWorkerProcess(config, TARGET_URL, targetUrl, scenario, {
    spawn: harness.spawn,
  });
  const validation = await runValidationWorkerProcess(
    config,
    targetUrl,
    scenario,
    { spawn: harness.spawn },
  );
  const screenshot = await runPureScreenshotWorkerProcess(
    config,
    targetUrl,
    scenario,
    { spawn: harness.spawn },
  );

  assert.deepEqual(validation, { state, protocolErrors: [] });
  assert.deepEqual(screenshot, PNG_BYTES);
  assert.equal(harness.calls.length, 3);
  assert.ok(harness.calls.every(({ command }) => command === process.execPath));
  assert.match(harness.calls[0].args.join(" "), /navigation-worker/);
  assert.match(harness.calls[1].args.join(" "), /validation-worker/);
  assert.match(harness.calls[2].args.join(" "), /pure-screenshot-worker/);
  for (const { args, options } of harness.calls) {
    assert.ok(args.includes(String(scenario.viewport.width)));
    assert.ok(args.includes(String(scenario.viewport.height)));
    assert.ok(args.includes(String(scenario.deviceScaleFactor)));
    assert.deepEqual(options, {
      shell: false,
      windowsHide: true,
      env: {},
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
});

test("retries the exact pure capture timeout once in a new worker", async () => {
  const scenario = buildScenarioMatrix()[0];
  const timeoutSignature =
    "Timed out waiting for pure CDP command Page.captureScreenshot";
  const harness = createWorkerProcessHarness({
    stdout: ({ callIndex }) => (callIndex === 0 ? Buffer.alloc(0) : PNG_BYTES),
    stderr: ({ callIndex }) =>
      callIndex === 0 ? Buffer.from(timeoutSignature) : Buffer.alloc(0),
    exitCode: ({ callIndex }) => (callIndex === 0 ? 1 : 0),
  });
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  const screenshot = await runPureScreenshotWorkerProcess(
    config,
    TARGET_URL,
    scenario,
    { spawn: harness.spawn },
  );

  assert.deepEqual(screenshot, PNG_BYTES);
  assert.equal(harness.calls.length, 2);
  assert.notEqual(harness.children[0], harness.children[1]);
  assert.ok(
    harness.calls.every(({ args }) =>
      args.includes("--game-path-pure-screenshot-worker"),
    ),
  );
  assert.equal(harness.activeChildren, 0);
});

test("does not retry non-exact pure screenshot worker failures", async () => {
  const scenario = buildScenarioMatrix()[0];
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  for (const message of [
    "Timed out waiting for pure CDP command Page.bringToFront",
    "Timed out waiting for pure CDP command Page.captureScreenshot extra",
    "Pure screenshot CDP command Page.captureScreenshot failed: blocked",
  ]) {
    const harness = createWorkerProcessHarness({
      exitCode: 1,
      stderr: Buffer.from(message),
    });
    await assert.rejects(
      runPureScreenshotWorkerProcess(config, TARGET_URL, scenario, {
        spawn: harness.spawn,
      }),
      new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.equal(harness.calls.length, 1);
  }
});

test("preserves both pure screenshot failures after the one retry", async () => {
  const scenario = buildScenarioMatrix()[0];
  const firstMessage =
    "Timed out waiting for pure CDP command Page.captureScreenshot";
  const secondMessage =
    "Pure screenshot CDP command Page.captureScreenshot failed: blocked";
  const harness = createWorkerProcessHarness({
    exitCode: 1,
    stderr: ({ callIndex }) =>
      Buffer.from(callIndex === 0 ? firstMessage : secondMessage),
  });
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  await assert.rejects(
    runPureScreenshotWorkerProcess(config, TARGET_URL, scenario, {
      spawn: harness.spawn,
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, new RegExp(scenario.id));
      assert.match(error.message, new RegExp(RUN_ID));
      assert.equal(error.errors.length, 2);
      assert.match(error.errors[0].message, new RegExp(firstMessage));
      assert.match(error.errors[1].message, new RegExp(secondMessage));
      return true;
    },
  );
  assert.equal(harness.calls.length, 2);
  assert.equal(harness.activeChildren, 0);
});

test("fails closed for worker nonzero timeout oversized malformed and foreign payloads", async () => {
  const scenario = buildScenarioMatrix()[0];
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );
  const screenshotCases = [
    {
      harness: createWorkerProcessHarness({
        exitCode: 1,
        stderr: Buffer.from("Page.captureScreenshot failed: blocked"),
      }),
      dependencies: {},
      expected: /Page\.captureScreenshot failed: blocked/,
    },
    {
      harness: createWorkerProcessHarness({ hang: true }),
      dependencies: { timeoutMs: 5 },
      expected: /timed out/i,
    },
    {
      harness: createWorkerProcessHarness({ stdout: Buffer.alloc(17, 1) }),
      dependencies: { maxOutputBytes: 16 },
      expected: /maximum output/i,
    },
    {
      harness: createWorkerProcessHarness({ stdout: Buffer.from("not-png") }),
      dependencies: {},
      expected: /valid PNG/i,
    },
  ];

  for (const testCase of screenshotCases) {
    await assert.rejects(
      runPureScreenshotWorkerProcess(config, TARGET_URL, scenario, {
        spawn: testCase.harness.spawn,
        ...testCase.dependencies,
      }),
      testCase.expected,
    );
    const [child] = testCase.harness.children;
    assert.equal(child.listenerCount("error"), 0);
    assert.equal(child.listenerCount("close"), 0);
    assert.equal(child.stdout.listenerCount("data"), 0);
    assert.equal(child.stderr.listenerCount("data"), 0);
  }

  for (const [stdout, expected] of [
    [Buffer.from("not-json"), /structured payload/i],
    [
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          kind: "validation-result",
          targetUrl: TARGET_URL.replace(RUN_ID, "foreign-run-12345678"),
          scenarioId: scenario.id,
          state: createState(scenario),
          protocolErrors: [],
        }),
      ),
      /exact owned worker payload/i,
    ],
  ]) {
    const harness = createWorkerProcessHarness({ stdout });
    await assert.rejects(
      runValidationWorkerProcess(config, TARGET_URL, scenario, {
        spawn: harness.spawn,
      }),
      expected,
    );
  }
});

test("pure screenshot session sends only metrics bring-to-front and capture", async () => {
  const scenario = buildScenarioMatrix()[0];
  const harness = createPureScreenshotHarness(TARGET_URL);
  const screenshot = await capturePureScreenshot(
    {
      port: 43123,
      targetUrl: TARGET_URL,
      runId: RUN_ID,
      scenario,
    },
    harness.dependencies,
  );

  assert.deepEqual(screenshot, PNG_BYTES);
  assert.equal(harness.fetchCount, 1);
  assert.deepEqual(
    harness.commands.map(({ method }) => method),
    [
      "Emulation.setDeviceMetricsOverride",
      "Page.bringToFront",
      "Page.captureScreenshot",
    ],
  );
  assert.ok(
    harness.commands.every(
      ({ method }) =>
        !/^(Runtime|Log|Inspector)\./.test(method) &&
        method !== "Page.enable" &&
        method !== "Runtime.evaluate",
    ),
  );
  assert.deepEqual(harness.commands[0].params, {
    width: 1024,
    height: 683,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1024,
    screenHeight: 683,
  });
  assert.equal(harness.sockets[0].closeCount, 1);
});

test("worker client keeps a successful action result when close fails", async () => {
  const result = { kind: "navigation-complete" };

  assert.equal(
    await useCdpClient(
      {
        async close() {
          throw new Error("Observer WebSocket close failed");
        },
      },
      async () => result,
    ),
    result,
  );
});

test("worker client preserves an action failure when close succeeds", async () => {
  const actionError = new Error("navigation failed");

  await assert.rejects(
    useCdpClient({ async close() {} }, async () => {
      throw actionError;
    }),
    (error) => error === actionError,
  );
});

test("worker client aggregates action and close failures", async () => {
  const actionError = new Error("validation failed");
  const closeError = new Error("Observer WebSocket close failed");

  await assert.rejects(
    useCdpClient(
      {
        async close() {
          throw closeError;
        },
      },
      async () => {
        throw actionError;
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [actionError, closeError]);
      return true;
    },
  );
});

test("uses an exact bounded 1000ms CDP worker-detach settle", async () => {
  let delayMs;

  await settleAfterCdpWorkerDetach((resolve, milliseconds) => {
    delayMs = milliseconds;
    resolve();
  });

  assert.equal(delayMs, 1000);
});

test("awaits only short finite owned modal animations before two stable frames", () => {
  const scenario = buildScenarioMatrix()[0];

  assert.equal(typeof buildLayoutReadyExpression, "function");
  const expression = buildLayoutReadyExpression(scenario);
  assert.match(expression, /document\.fonts\.ready/);
  assert.match(expression, /getAnimations\(\{ subtree: true \}\)/);
  assert.match(expression, /animation\.finished/);
  assert.match(expression, /Number\.isFinite\(timing\.endTime\)/);
  assert.match(expression, /timing\.endTime <= maxOwnedAnimationMs/);
  assert.match(expression, /owned animation rejected/);
  assert.match(expression, /\.game-path-modal \[role='dialog'\]/);
  assert.doesNotMatch(expression, /, \[role='dialog'\]"/);
  assert.doesNotMatch(expression, /document\.getAnimations/);
  assert.match(expression, /requestAnimationFrame/);
  assert.match(expression, /await nextFrame\(\);\s*await nextFrame\(\);/);
  assert.match(expression, /qa-layout-ready-timeout/);
  assert.match(
    expression,
    new RegExp(`expectedMode = ${JSON.stringify(scenario.mode)}`),
  );
  assert.match(
    expression,
    new RegExp(`expectedWidth = ${scenario.viewport.width}`),
  );
  assert.match(
    expression,
    new RegExp(`expectedHeight = ${scenario.viewport.height}`),
  );

  const animationAwait = expression.indexOf("await Promise.allSettled");
  const firstStableFrame = expression.indexOf(
    "await nextFrame();",
    animationAwait,
  );
  const secondStableFrame = expression.indexOf(
    "await nextFrame();",
    firstStableFrame + 1,
  );
  const finalRecheck = expression.indexOf(
    "const stableState = readOwnedState();",
    secondStableFrame,
  );
  assert.ok(animationAwait >= 0);
  assert.ok(firstStableFrame > animationAwait);
  assert.ok(secondStableFrame > firstStableFrame);
  assert.ok(finalRecheck > secondStableFrame);
});

test("accepts only the exact ready marker, scale and simulated viewport", () => {
  const scenario = buildScenarioMatrix()[0];
  const ready = createLayoutReadyResult(scenario);

  assert.equal(typeof assertLayoutReadyResult, "function");
  assert.doesNotThrow(() => assertLayoutReadyResult(scenario, ready));
  assert.throws(
    () =>
      assertLayoutReadyResult(scenario, {
        ...ready,
        marker: "selection",
      }),
    /marker mismatch/,
  );
  assert.throws(
    () =>
      assertLayoutReadyResult(scenario, {
        ...ready,
        appScale: 1,
      }),
    /scale mismatch/,
  );
  assert.throws(
    () =>
      assertLayoutReadyResult(scenario, {
        ...ready,
        viewport: { ...ready.viewport, width: 1440 },
      }),
    /viewport mismatch/,
  );
  assert.throws(
    () =>
      assertLayoutReadyResult(scenario, {
        ...ready,
        ready: false,
        reason: "qa-layout-ready-timeout",
      }),
    /qa-layout-ready-timeout/,
  );
  assert.throws(
    () =>
      assertLayoutReadyResult(scenario, {
        ...ready,
        ready: false,
        reason: "owned animation rejected",
      }),
    /owned animation rejected/,
  );
});

test("asserts the shared modal geometry and each mode-specific contract", () => {
  for (const scenario of buildScenarioMatrix()) {
    const assertions = assertScenarioState(scenario, createState(scenario), []);
    assert.equal(assertions.modeMarker, true);
    assert.equal(assertions.splashAbsent, true);
    assert.equal(assertions.dialogCount, true);
    assert.equal(assertions.modalContained, true);
    assert.equal(assertions.headerVisible, true);
    assert.equal(assertions.footerVisible, true);
    assert.equal(assertions.twoColumn, true);
    assert.equal(assertions.appScale, true);
    assert.equal(assertions.scrollContained, true);
    assert.equal(assertions.longPathWrapped, true);
    assert.equal(assertions.hitTargets, true);
    if (scenario.mode !== "diagnostic") {
      assert.equal(assertions.nestedModal, true);
      assert.equal(assertions.nestedFocus, true);
      assert.equal(assertions.nestedOverlay, true);
    }
  }
});

test("measures nested overlay border coverage in CSS pixels at scaled viewports", () => {
  const scenario = buildScenarioMatrix().find(
    ({ mode, viewport }) => mode === "selection" && viewport.width === 1920,
  );
  assert.ok(scenario);
  const state = createState(scenario);
  const borderInset = state.appScale;
  const withinBorder = {
    ...state,
    nestedOverlayRect: {
      left: state.modalRect.left + borderInset,
      top: state.modalRect.top + borderInset,
      right: state.modalRect.right - borderInset,
      bottom: state.modalRect.bottom - borderInset,
    },
  };

  assert.doesNotThrow(() => assertScenarioState(scenario, withinBorder, []));

  const largerGap = 1.35 * state.appScale;
  assert.throws(
    () =>
      assertScenarioState(
        scenario,
        {
          ...state,
          nestedOverlayRect: {
            left: state.modalRect.left + largerGap,
            top: state.modalRect.top + largerGap,
            right: state.modalRect.right - largerGap,
            bottom: state.modalRect.bottom - largerGap,
          },
        },
        [],
      ),
    /Nested overlay containment\/coverage failed/,
  );

  const outsideAllowance = 1.35 * state.appScale;
  assert.throws(
    () =>
      assertScenarioState(
        scenario,
        {
          ...state,
          nestedOverlayRect: {
            ...state.modalRect,
            left: state.modalRect.left - outsideAllowance,
          },
        },
        [],
      ),
    /Nested overlay containment\/coverage failed/,
  );
});

test("rejects protocol errors, clipped geometry and incorrect mode states", () => {
  const scenarios = buildScenarioMatrix();
  const diagnostic = scenarios.find(({ mode }) => mode === "diagnostic");
  const selection = scenarios.find(({ mode }) => mode === "selection");
  const partial = scenarios.find(({ mode }) => mode === "partial");
  const deletion = scenarios.find(({ mode }) => mode === "delete");
  assert.ok(diagnostic && selection && partial && deletion);

  assert.throws(() =>
    assertScenarioState(diagnostic, createState(diagnostic), [
      { domain: "Runtime", message: "boom" },
    ]),
  );
  assert.throws(
    () =>
      assertScenarioState(
        diagnostic,
        {
          ...createState(diagnostic),
          splashPresent: true,
          splashVisible: true,
        },
        [],
      ),
    /Launcher splash is present or visible/,
  );
  assert.throws(() =>
    assertScenarioState(
      diagnostic,
      {
        ...createState(diagnostic),
        modalRect: { left: -1, top: 0, right: 500, bottom: 500 },
      },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      selection,
      {
        ...createState(selection),
        selection: { ...createState(selection).selection, ctaText: "적용" },
      },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      partial,
      {
        ...createState(partial),
        partial: { retryText: "전체 재시도", results: [] },
      },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      deletion,
      {
        ...createState(deletion),
        deletion: { ...createState(deletion).deletion, path: "C:\\Other" },
      },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      diagnostic,
      { ...createState(diagnostic), appScale: 1 },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      diagnostic,
      {
        ...createState(diagnostic),
        scroll: {
          ...createState(diagnostic).scroll,
          document: {
            ...createState(diagnostic).scroll.document,
            scrollWidth: diagnostic.viewport.width + 2,
          },
        },
      },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      diagnostic,
      {
        ...createState(diagnostic),
        longPath: {
          ...createState(diagnostic).longPath,
          scrollWidth: 400,
          clientWidth: 360,
        },
      },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      selection,
      {
        ...createState(selection),
        hitTargets: {
          ...createState(selection).hitTargets,
          primaryAction: { left: 0, top: 0, right: 10, bottom: 10 },
        },
      },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      selection,
      { ...createState(selection), nestedFocusInside: false },
      [],
    ),
  );
  assert.throws(() =>
    assertScenarioState(
      selection,
      {
        ...createState(selection),
        nestedOverlayRect: {
          ...createState(selection).nestedOverlayRect,
          right: selection.viewport.width + 1,
        },
      },
      [],
    ),
  );
});

test("runs three non-overlapping worker processes for each of twelve scenarios", async () => {
  const matrix = buildScenarioMatrix();
  const writes = [];
  const settledScenarios = new Set();
  const settleCalls = [];
  const workerHarness = createWorkerProcessHarness({
    stdout: ({ args }) => {
      const scenarioId = args[args.indexOf("--scenario-id") + 1];
      const targetUrl = args[args.indexOf("--target-url") + 1];
      const scenario = matrix.find(({ id }) => id === scenarioId);
      assert.ok(scenario);
      if (args.includes("--game-path-pure-screenshot-worker")) {
        return PNG_BYTES;
      }
      return Buffer.from(
        JSON.stringify(
          args.includes("--game-path-navigation-worker")
            ? {
                schemaVersion: 1,
                kind: "navigation-complete",
                targetUrl,
                scenarioId,
              }
            : {
                schemaVersion: 1,
                kind: "validation-result",
                targetUrl,
                scenarioId,
                state: createState(scenario),
                protocolErrors: [],
              },
        ),
      );
    },
  });
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  const manifest = await captureFixtureMatrix(config, {
    navigateInWorker: (currentTargetUrl, targetUrl, scenario) =>
      runNavigationWorkerProcess(
        config,
        currentTargetUrl,
        targetUrl,
        scenario,
        { spawn: workerHarness.spawn },
      ),
    validateInWorker: async (targetUrl, scenario) => {
      const validation = await runValidationWorkerProcess(
        config,
        targetUrl,
        scenario,
        {
          spawn: workerHarness.spawn,
        },
      );
      settledScenarios.delete(scenario.id);
      return validation;
    },
    async settleAfterValidation(targetUrl, scenario) {
      settleCalls.push({ targetUrl, scenarioId: scenario.id });
      await Promise.resolve();
      settledScenarios.add(scenario.id);
    },
    screenshotInWorker: (targetUrl, scenario) => {
      assert.ok(
        settledScenarios.has(scenario.id),
        "screenshot worker started before detach settle resolved",
      );
      return runPureScreenshotWorkerProcess(config, targetUrl, scenario, {
        spawn: workerHarness.spawn,
      });
    },
    now: () => "2026-08-27T00:00:00.000Z",
    writeArtifact(filePath, contents) {
      writes.push({ filePath, contents });
    },
  });

  assert.equal(workerHarness.calls.length, 36);
  assert.deepEqual(
    settleCalls,
    matrix.map((scenario) => ({
      targetUrl: buildOwnedFixtureUrl(TARGET_URL, scenario.mode),
      scenarioId: scenario.id,
    })),
  );
  assert.equal(workerHarness.activeChildren, 0);
  assert.ok(
    workerHarness.calls.every(({ activeAtSpawn }) => activeAtSpawn === 0),
  );
  assert.deepEqual(
    workerHarness.calls.map(({ args }) => args[1]),
    matrix.flatMap(() => [
      "--game-path-navigation-worker",
      "--game-path-validation-worker",
      "--game-path-pure-screenshot-worker",
    ]),
  );
  for (let index = 0; index < matrix.length; index += 1) {
    const scenario = matrix[index];
    const navigationArgs = workerHarness.calls[index * 3].args;
    const validationArgs = workerHarness.calls[index * 3 + 1].args;
    const screenshotArgs = workerHarness.calls[index * 3 + 2].args;
    assert.ok(navigationArgs.includes(String(scenario.viewport.width)));
    assert.ok(validationArgs.includes(String(scenario.viewport.width)));
    assert.ok(screenshotArgs.includes(String(scenario.viewport.width)));
    assert.ok(navigationArgs.includes(String(scenario.deviceScaleFactor)));
    assert.ok(validationArgs.includes(String(scenario.deviceScaleFactor)));
    assert.ok(screenshotArgs.includes(String(scenario.deviceScaleFactor)));
  }
  assert.equal(
    writes.filter(({ filePath }) => filePath.endsWith(".png")).length,
    12,
  );
  assert.equal(
    writes.filter(({ filePath }) => filePath.endsWith("manifest.json")).length,
    1,
  );
  assert.equal(manifest.scenarios.length, 12);
  assert.ok(
    manifest.scenarios.every(
      ({ assertions, protocolErrors }) =>
        assertions.appScale === true && protocolErrors.length === 0,
    ),
  );
});

test("writes all twelve artifacts after exact-timeout pure worker retries", async () => {
  const matrix = buildScenarioMatrix();
  const writes = [];
  const timeoutSignature =
    "Timed out waiting for pure CDP command Page.captureScreenshot";
  const workerHarness = createWorkerProcessHarness({
    stdout: ({ args, callIndex }) => {
      const scenarioId = args[args.indexOf("--scenario-id") + 1];
      const targetUrl = args[args.indexOf("--target-url") + 1];
      const scenario = matrix.find(({ id }) => id === scenarioId);
      assert.ok(scenario);
      if (args.includes("--game-path-pure-screenshot-worker")) {
        return callIndex % 4 === 3 ? PNG_BYTES : Buffer.alloc(0);
      }
      return Buffer.from(
        JSON.stringify(
          args.includes("--game-path-navigation-worker")
            ? {
                schemaVersion: 1,
                kind: "navigation-complete",
                targetUrl,
                scenarioId,
              }
            : {
                schemaVersion: 1,
                kind: "validation-result",
                targetUrl,
                scenarioId,
                state: createState(scenario),
                protocolErrors: [],
              },
        ),
      );
    },
    stderr: ({ args, callIndex }) =>
      args.includes("--game-path-pure-screenshot-worker") && callIndex % 4 === 2
        ? Buffer.from(timeoutSignature)
        : Buffer.alloc(0),
    exitCode: ({ args, callIndex }) =>
      args.includes("--game-path-pure-screenshot-worker") && callIndex % 4 === 2
        ? 1
        : 0,
  });
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  const manifest = await captureFixtureMatrix(config, {
    navigateInWorker: (currentTargetUrl, targetUrl, scenario) =>
      runNavigationWorkerProcess(
        config,
        currentTargetUrl,
        targetUrl,
        scenario,
        { spawn: workerHarness.spawn },
      ),
    validateInWorker: (targetUrl, scenario) =>
      runValidationWorkerProcess(config, targetUrl, scenario, {
        spawn: workerHarness.spawn,
      }),
    async settleAfterValidation() {},
    screenshotInWorker: (targetUrl, scenario) =>
      runPureScreenshotWorkerProcess(config, targetUrl, scenario, {
        spawn: workerHarness.spawn,
      }),
    now: () => "2026-08-27T00:00:00.000Z",
    writeArtifact(filePath, contents) {
      writes.push({ filePath, contents });
    },
  });

  assert.equal(workerHarness.calls.length, 48);
  assert.equal(
    workerHarness.calls.filter(({ args }) =>
      args.includes("--game-path-pure-screenshot-worker"),
    ).length,
    24,
  );
  assert.equal(
    writes.filter(({ filePath }) => filePath.endsWith(".png")).length,
    12,
  );
  assert.equal(
    writes.filter(({ filePath }) => filePath.endsWith("manifest.json")).length,
    1,
  );
  assert.equal(manifest.scenarios.length, 12);
  assert.equal(workerHarness.activeChildren, 0);
});

test("starts no validation or screenshot worker when navigation fails", async () => {
  const writes = [];
  let validationCount = 0;
  let settleCount = 0;
  let screenshotCount = 0;
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  await assert.rejects(
    captureFixtureMatrix(config, {
      async navigateInWorker() {
        throw new Error("navigation worker failed");
      },
      async validateInWorker() {
        validationCount += 1;
      },
      async settleAfterValidation() {
        settleCount += 1;
      },
      async screenshotInWorker() {
        screenshotCount += 1;
      },
      now: () => "2026-08-27T00:00:00.000Z",
      writeArtifact(filePath, contents) {
        writes.push({ filePath, contents });
      },
    }),
    /navigation worker failed/,
  );
  assert.equal(validationCount, 0);
  assert.equal(settleCount, 0);
  assert.equal(screenshotCount, 0);
  assert.equal(writes.length, 0);
});

test("parent starts no screenshot worker when validation fails", async () => {
  const scenario = buildScenarioMatrix()[0];
  const cases = [
    {
      error: new Error("validation worker failed"),
      expected: /validation worker failed/,
    },
    {
      result: {
        state: { ...createState(scenario), splashPresent: true },
        protocolErrors: [],
      },
      expected: /Launcher splash is present or visible/,
    },
    {
      result: {
        state: createState(scenario),
        protocolErrors: [{ domain: "Runtime", message: "worker failure" }],
      },
      expected: /worker failure/,
    },
  ];

  for (const testCase of cases) {
    const writes = [];
    let settleCount = 0;
    let screenshotCount = 0;
    const { projectRoot, outputDir } = createProjectPaths();
    const config = parseCaptureEnvironment(
      {
        CDP_PORT: "43123",
        CDP_TARGET_URL: TARGET_URL,
        GAME_PATH_QA_OUTPUT_DIR: outputDir,
      },
      projectRoot,
    );
    await assert.rejects(
      captureFixtureMatrix(config, {
        async navigateInWorker() {},
        async validateInWorker() {
          if (testCase.error) throw testCase.error;
          return testCase.result;
        },
        async settleAfterValidation() {
          settleCount += 1;
        },
        async screenshotInWorker() {
          screenshotCount += 1;
          return PNG_BYTES;
        },
        now: () => "2026-08-27T00:00:00.000Z",
        writeArtifact(filePath, contents) {
          writes.push({ filePath, contents });
        },
      }),
      testCase.expected,
    );
    assert.equal(settleCount, 0);
    assert.equal(screenshotCount, 0);
    assert.equal(writes.length, 0);
  }
});

test("writes no artifact when the pure screenshot worker fails", async () => {
  const writes = [];
  const scenario = buildScenarioMatrix()[0];
  const workerHarness = createWorkerProcessHarness({
    exitCode: 1,
    stderr: ({ callIndex }) =>
      Buffer.from(
        callIndex === 0
          ? "Timed out waiting for pure CDP command Page.captureScreenshot"
          : "Pure screenshot retry failed",
      ),
  });
  const { projectRoot, outputDir } = createProjectPaths();
  const config = parseCaptureEnvironment(
    {
      CDP_PORT: "43123",
      CDP_TARGET_URL: TARGET_URL,
      GAME_PATH_QA_OUTPUT_DIR: outputDir,
    },
    projectRoot,
  );

  await assert.rejects(
    captureFixtureMatrix(config, {
      async navigateInWorker() {},
      async validateInWorker() {
        return { state: createState(scenario), protocolErrors: [] };
      },
      async settleAfterValidation() {},
      screenshotInWorker: (targetUrl, activeScenario) =>
        runPureScreenshotWorkerProcess(config, targetUrl, activeScenario, {
          spawn: workerHarness.spawn,
        }),
      now: () => "2026-08-27T00:00:00.000Z",
      writeArtifact(filePath, contents) {
        writes.push({ filePath, contents });
      },
    }),
    /failed after one capture-timeout retry/,
  );
  assert.equal(workerHarness.calls.length, 2);
  assert.equal(writes.length, 0);
});

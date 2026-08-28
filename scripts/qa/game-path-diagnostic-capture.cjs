#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */
/* global AbortSignal, Buffer, WebSocket, __filename, clearTimeout, fetch, module, process, require, setTimeout, URL */

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const FIXTURE_MODES = ["diagnostic", "selection", "partial", "delete"];
const VIEWPORTS = [
  { viewportLabel: "1024x683", width: 1024, height: 683, deviceScaleFactor: 1 },
  {
    viewportLabel: "1440x960",
    width: 1440,
    height: 960,
    deviceScaleFactor: 1.25,
  },
  {
    viewportLabel: "1920x1080",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1.5,
  },
];
const CAPTURE_DIRECTORY_NAME = "game-path-diagnostic-capture";
const MANIFEST_FILE_NAME = "manifest.json";
const QA_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const TARGET_QUERY_KEYS = new Set(["codexQaRun", "codexQaFixture"]);
const SELECTED_PATH = String.raw`C:\Games\Kakao Games\Path of Exile 2`;
const CDP_COMMAND_TIMEOUT_MS = 10_000;
const LAYOUT_READY_TIMEOUT_MS = 5_000;
const NAVIGATION_WORKER_ARGUMENT = "--game-path-navigation-worker";
const VALIDATION_WORKER_ARGUMENT = "--game-path-validation-worker";
const PURE_SCREENSHOT_WORKER_ARGUMENT = "--game-path-pure-screenshot-worker";
const CAPTURE_WORKER_TIMEOUT_MS = 35_000;
const CAPTURE_WORKER_TERMINATION_GRACE_MS = 2_000;
const CAPTURE_WORKER_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const CAPTURE_WORKER_MAX_ERROR_BYTES = 64 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const NESTED_OVERLAY_BORDER_CSS_PX = 1;
const NESTED_OVERLAY_SUBPIXEL_TOLERANCE_CSS_PX = 0.25;

const isFixtureMode = (value) => FIXTURE_MODES.includes(value);

const parseOwnedTargetUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("CDP_TARGET_URL must be a valid URL");
  }

  const keys = [...url.searchParams.keys()];
  const runIds = url.searchParams.getAll("codexQaRun");
  const fixtureModes = url.searchParams.getAll("codexQaFixture");
  if (
    url.protocol !== "http:" ||
    url.hostname !== "localhost" ||
    url.port !== "54321" ||
    url.pathname !== "/" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    keys.some((key) => !TARGET_QUERY_KEYS.has(key)) ||
    runIds.length !== 1 ||
    fixtureModes.length !== 1 ||
    !QA_RUN_ID_PATTERN.test(runIds[0]) ||
    !isFixtureMode(fixtureModes[0])
  ) {
    throw new Error(
      "CDP_TARGET_URL must be the exact owned localhost game-path fixture target",
    );
  }

  return { runId: runIds[0], fixtureMode: fixtureModes[0] };
};

const isPathInside = (parentPath, candidatePath) => {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
};

const resolveOwnedOutputDirectory = (value, projectRoot, runId) => {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(
      "GAME_PATH_QA_OUTPUT_DIR must be an explicit absolute path",
    );
  }

  const outputDir = path.resolve(value);
  if (
    path.basename(outputDir) !== CAPTURE_DIRECTORY_NAME ||
    path.basename(path.dirname(outputDir)) !== runId
  ) {
    throw new Error(
      "GAME_PATH_QA_OUTPUT_DIR must be the exact run-owned capture directory",
    );
  }

  const root = path.resolve(projectRoot);
  if (isPathInside(root, outputDir)) {
    const allowedRepositoryOutput = path.join(
      root,
      ".tmp",
      "electron",
      runId,
      CAPTURE_DIRECTORY_NAME,
    );
    if (outputDir !== allowedRepositoryOutput) {
      throw new Error(
        "GAME_PATH_QA_OUTPUT_DIR inside the repository must use .tmp/electron/<runId>",
      );
    }
  }

  return outputDir;
};

const parseCaptureEnvironment = (environment, projectRoot = process.cwd()) => {
  const portText = environment.CDP_PORT;
  if (!portText || !/^\d+$/.test(portText)) {
    throw new Error("CDP_PORT must be an integer between 1 and 65535");
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("CDP_PORT must be an integer between 1 and 65535");
  }

  if (!environment.CDP_TARGET_URL) {
    throw new Error("CDP_TARGET_URL is required");
  }
  const target = parseOwnedTargetUrl(environment.CDP_TARGET_URL);
  const outputDir = resolveOwnedOutputDirectory(
    environment.GAME_PATH_QA_OUTPUT_DIR,
    projectRoot,
    target.runId,
  );

  return {
    port,
    targetUrl: environment.CDP_TARGET_URL,
    runId: target.runId,
    initialMode: target.fixtureMode,
    outputDir,
  };
};

const parseWorkerPort = (value) => {
  if (!/^\d+$/.test(value)) {
    throw new Error("Internal game-path worker port is invalid");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("Internal game-path worker port is invalid");
  }
  return port;
};

const resolveWorkerScenario = (
  targetUrl,
  scenarioId,
  widthText,
  heightText,
  deviceScaleFactorText,
) => {
  const target = parseOwnedTargetUrl(targetUrl);
  const width = Number(widthText);
  const height = Number(heightText);
  const deviceScaleFactor = Number(deviceScaleFactorText);
  const scenario = buildScenarioMatrix().find(
    (candidate) =>
      candidate.id === scenarioId &&
      candidate.mode === target.fixtureMode &&
      candidate.viewport.width === width &&
      candidate.viewport.height === height &&
      candidate.deviceScaleFactor === deviceScaleFactor,
  );
  if (!scenario) {
    throw new Error("Internal game-path worker scenario is not allowlisted");
  }
  return { target, scenario };
};

const parseScenarioWorkerArguments = (args, workerArgument, label) => {
  if (
    !Array.isArray(args) ||
    args.length !== 13 ||
    args[0] !== workerArgument ||
    args[1] !== "--cdp-port" ||
    args[3] !== "--target-url" ||
    args[5] !== "--scenario-id" ||
    args[7] !== "--width" ||
    args[9] !== "--height" ||
    args[11] !== "--device-scale-factor"
  ) {
    throw new Error(`Invalid internal ${label} worker arguments`);
  }
  const port = parseWorkerPort(args[2]);
  const { target, scenario } = resolveWorkerScenario(
    args[4],
    args[6],
    args[8],
    args[10],
    args[12],
  );
  return {
    port,
    targetUrl: args[4],
    runId: target.runId,
    scenario,
  };
};

const parseValidationWorkerArguments = (args) =>
  parseScenarioWorkerArguments(args, VALIDATION_WORKER_ARGUMENT, "validation");

const parsePureScreenshotWorkerArguments = (args) =>
  parseScenarioWorkerArguments(
    args,
    PURE_SCREENSHOT_WORKER_ARGUMENT,
    "pure screenshot",
  );

const parseNavigationWorkerArguments = (args) => {
  if (
    !Array.isArray(args) ||
    args.length !== 15 ||
    args[0] !== NAVIGATION_WORKER_ARGUMENT ||
    args[1] !== "--current-target-url" ||
    args[3] !== "--cdp-port" ||
    args[5] !== "--target-url" ||
    args[7] !== "--scenario-id" ||
    args[9] !== "--width" ||
    args[11] !== "--height" ||
    args[13] !== "--device-scale-factor"
  ) {
    throw new Error("Invalid internal navigation worker arguments");
  }
  const currentTarget = parseOwnedTargetUrl(args[2]);
  const port = parseWorkerPort(args[4]);
  const { target, scenario } = resolveWorkerScenario(
    args[6],
    args[8],
    args[10],
    args[12],
    args[14],
  );
  if (currentTarget.runId !== target.runId) {
    throw new Error("Navigation worker targets must belong to the same run");
  }
  return {
    port,
    currentTargetUrl: args[2],
    targetUrl: args[6],
    runId: target.runId,
    scenario,
  };
};

const buildScenarioMatrix = () =>
  FIXTURE_MODES.flatMap((mode) =>
    VIEWPORTS.map((viewport) => ({
      id: `${mode}--${viewport.viewportLabel}--dpr-${String(
        viewport.deviceScaleFactor,
      ).replace(".", "p")}`,
      mode,
      viewportLabel: viewport.viewportLabel,
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    })),
  );

const buildScreenshotFileName = (scenario) => `${scenario.id}.png`;

const buildOwnedFixtureUrl = (targetUrl, fixtureMode) => {
  if (!isFixtureMode(fixtureMode)) {
    throw new Error("fixture mode is not allowlisted");
  }
  const target = parseOwnedTargetUrl(targetUrl);
  const url = new URL(targetUrl);
  url.search = "";
  url.searchParams.set("codexQaFixture", fixtureMode);
  url.searchParams.set("codexQaRun", target.runId);
  return url.toString();
};

const requireAssertion = (condition, message) => {
  if (!condition) throw new Error(message);
};

const hasPositiveArea = (rect) =>
  rect && rect.right > rect.left && rect.bottom > rect.top;

const isRectContained = (rect, bounds, tolerance = 0.5) =>
  hasPositiveArea(rect) &&
  rect.left >= bounds.left - tolerance &&
  rect.top >= bounds.top - tolerance &&
  rect.right <= bounds.right + tolerance &&
  rect.bottom <= bounds.bottom + tolerance;

const rectWidth = (rect) =>
  hasPositiveArea(rect) ? rect.right - rect.left : 0;
const rectHeight = (rect) =>
  hasPositiveArea(rect) ? rect.bottom - rect.top : 0;

const meetsUnscaledHitTarget = (rect, appScale, minimumWidth, minimumHeight) =>
  rectWidth(rect) / appScale >= minimumWidth - 0.5 &&
  rectHeight(rect) / appScale >= minimumHeight - 0.5;

const assertNoProtocolErrors = (scenario, protocolErrors) => {
  requireAssertion(
    Array.isArray(protocolErrors) && protocolErrors.length === 0,
    `Protocol errors detected for ${scenario.id}: ${JSON.stringify(protocolErrors)}`,
  );
};

const assertScenarioState = (scenario, state, protocolErrors) => {
  assertNoProtocolErrors(scenario, protocolErrors);
  requireAssertion(
    state.modeMarker === scenario.mode,
    `Fixture mode marker mismatch for ${scenario.id}`,
  );
  requireAssertion(
    state.splashPresent === false && state.splashVisible === false,
    `Launcher splash is present or visible for ${scenario.id}`,
  );

  const expectedAppScale = Math.min(
    scenario.viewport.width / 1440,
    scenario.viewport.height / 960,
  );
  requireAssertion(
    Number.isFinite(state.appScale) &&
      Math.abs(state.appScale - expectedAppScale) <= 0.0001,
    `App scale mismatch for ${scenario.id}: expected=${expectedAppScale}, actual=${state.appScale}`,
  );

  const nested = scenario.mode !== "diagnostic";
  requireAssertion(
    state.dialogCount === (nested ? 2 : 1),
    `Unexpected dialog count for ${scenario.id}`,
  );
  requireAssertion(
    state.viewport?.width === scenario.viewport.width &&
      state.viewport?.height === scenario.viewport.height &&
      state.viewport?.devicePixelRatio === scenario.deviceScaleFactor,
    `Simulated viewport/DPR mismatch for ${scenario.id}`,
  );

  const viewportRect = {
    left: 0,
    top: 0,
    right: scenario.viewport.width,
    bottom: scenario.viewport.height,
  };
  requireAssertion(
    isRectContained(state.modalRect, viewportRect),
    `Outer modal is clipped for ${scenario.id}`,
  );
  requireAssertion(
    isRectContained(state.headerRect, state.modalRect) &&
      isRectContained(state.headerRect, viewportRect),
    `Modal header is not visible for ${scenario.id}`,
  );
  requireAssertion(
    isRectContained(state.footerRect, state.modalRect) &&
      isRectContained(state.footerRect, viewportRect),
    `Modal footer is not visible for ${scenario.id}`,
  );

  const [registryRect, configRect] = state.optionRects || [];
  requireAssertion(
    hasPositiveArea(registryRect) &&
      hasPositiveArea(configRect) &&
      Math.abs(registryRect.top - configRect.top) <= 2 &&
      registryRect.left < configRect.left,
    `Registry/config columns are not side-by-side for ${scenario.id}`,
  );

  const documentScroll = state.scroll?.document;
  const bodyScroll = state.scroll?.body;
  const modalBodyScroll = state.scroll?.modalBody;
  requireAssertion(
    documentScroll?.scrollWidth <= documentScroll?.clientWidth + 1 &&
      documentScroll?.scrollHeight <= documentScroll?.clientHeight + 1 &&
      bodyScroll?.scrollWidth <= bodyScroll?.clientWidth + 1 &&
      bodyScroll?.scrollHeight <= bodyScroll?.clientHeight + 1 &&
      modalBodyScroll?.scrollWidth <= modalBodyScroll?.clientWidth + 1 &&
      modalBodyScroll?.overflowY === "auto" &&
      modalBodyScroll?.overscrollBehaviorY === "contain",
    `Document/modal body scroll containment failed for ${scenario.id}`,
  );

  requireAssertion(
    state.longPath?.text?.includes("Path of Exile 2") &&
      state.longPath.scrollWidth <= state.longPath.clientWidth + 1 &&
      ["anywhere", "break-word"].includes(state.longPath.overflowWrap) &&
      isRectContained(state.longPath.rect, state.modalRect),
    `Long path wrapping/containment failed for ${scenario.id}`,
  );

  const checkboxTargets = state.hitTargets?.checkboxOptions || [];
  const deleteTargets = state.hitTargets?.deleteButtons || [];
  requireAssertion(
    (scenario.mode !== "selection" ||
      (checkboxTargets.length === 3 &&
        checkboxTargets.every((rect) =>
          meetsUnscaledHitTarget(rect, state.appScale, 44, 52),
        ))) &&
      deleteTargets.length >= 1 &&
      deleteTargets.every((rect) =>
        meetsUnscaledHitTarget(rect, state.appScale, 40, 40),
      ) &&
      meetsUnscaledHitTarget(
        state.hitTargets?.primaryAction,
        state.appScale,
        36,
        36,
      ),
    `Interactive hit target contract failed for ${scenario.id}`,
  );

  if (nested) {
    requireAssertion(
      state.outerAriaModal === null &&
        state.outerBackgroundInert === true &&
        state.outerBackgroundAriaHidden === "true" &&
        state.nestedAriaModal === "true",
      `Nested modality contract failed for ${scenario.id}`,
    );
    requireAssertion(
      state.nestedFocusInside === true,
      `Initial focus is outside the active nested dialog for ${scenario.id}`,
    );
    const nestedOverlayCssTolerance =
      NESTED_OVERLAY_BORDER_CSS_PX + NESTED_OVERLAY_SUBPIXEL_TOLERANCE_CSS_PX;
    const nestedOverlayPhysicalTolerance =
      nestedOverlayCssTolerance * state.appScale;
    const nestedOverlayEdgeDeltasCss = [
      Math.abs(state.nestedOverlayRect.left - state.modalRect.left) /
        state.appScale,
      Math.abs(state.nestedOverlayRect.top - state.modalRect.top) /
        state.appScale,
      Math.abs(state.nestedOverlayRect.right - state.modalRect.right) /
        state.appScale,
      Math.abs(state.nestedOverlayRect.bottom - state.modalRect.bottom) /
        state.appScale,
    ];
    requireAssertion(
      isRectContained(
        state.nestedOverlayRect,
        state.modalRect,
        nestedOverlayPhysicalTolerance,
      ) &&
        nestedOverlayEdgeDeltasCss.every(
          (delta) => delta <= nestedOverlayCssTolerance,
        ),
      `Nested overlay containment/coverage failed for ${scenario.id}`,
    );
  } else {
    requireAssertion(
      state.outerAriaModal === "true" &&
        state.outerBackgroundInert === false &&
        state.outerBackgroundAriaHidden === null &&
        state.nestedAriaModal === null,
      `Outer modality contract failed for ${scenario.id}`,
    );
  }

  if (scenario.mode === "selection") {
    requireAssertion(
      state.selection?.ctaText === "선택 (2개)" &&
        JSON.stringify(state.selection.checks) ===
          JSON.stringify([
            { targetId: "registry-primary", checked: true },
            { targetId: "registry-compatibility", checked: false },
            { targetId: "config", checked: true },
          ]),
      `Selection defaults/CTA mismatch for ${scenario.id}`,
    );
  }

  if (scenario.mode === "partial") {
    requireAssertion(
      state.partial?.retryText === "실패 항목 다시 시도 (1개)" &&
        JSON.stringify(state.partial.results) ===
          JSON.stringify([
            { targetId: "registry-primary", status: "applied" },
            { targetId: "registry-compatibility", status: "failed" },
            { targetId: "config", status: "unchanged" },
          ]),
      `Partial result/failed-only retry mismatch for ${scenario.id}`,
    );
  }

  if (scenario.mode === "delete") {
    requireAssertion(
      state.deletion?.title === "레지스트리 경로값을 삭제할까요?" &&
        state.deletion.candidate === "Kakaogames (기본)" &&
        state.deletion.path === SELECTED_PATH,
      `Delete confirmation mismatch for ${scenario.id}`,
    );
  }

  return {
    protocolErrors: true,
    modeMarker: true,
    splashAbsent: true,
    appScale: true,
    dialogCount: true,
    modalContained: true,
    headerVisible: true,
    footerVisible: true,
    twoColumn: true,
    scrollContained: true,
    longPathWrapped: true,
    hitTargets: true,
    nestedModal: true,
    nestedFocus: true,
    nestedOverlay: true,
    modeSpecific: true,
  };
};

const resolveArtifactPath = (outputDir, fileName) => {
  if (path.basename(fileName) !== fileName) {
    throw new Error("Artifact name must not contain a path");
  }
  const artifactPath = path.resolve(outputDir, fileName);
  if (path.dirname(artifactPath) !== path.resolve(outputDir)) {
    throw new Error("Artifact path escaped the run-owned output directory");
  }
  return artifactPath;
};

const buildLayoutReadyExpression = (scenario) => {
  if (!isFixtureMode(scenario?.mode)) {
    throw new Error("Layout readiness requires an allowlisted fixture mode");
  }
  const expectedAppScale = Math.min(
    scenario.viewport.width / 1440,
    scenario.viewport.height / 960,
  );

  return String.raw`(async () => {
    const expectedMode = ${JSON.stringify(scenario.mode)};
    const expectedWidth = ${scenario.viewport.width};
    const expectedHeight = ${scenario.viewport.height};
    const expectedDeviceScaleFactor = ${scenario.deviceScaleFactor};
    const expectedAppScale = ${expectedAppScale};
    const timeoutMs = ${LAYOUT_READY_TIMEOUT_MS};
    const maxOwnedAnimationMs = 1_000;
    const ownedAnimationRootSelector =
      ".game-path-modal-overlay, .game-path-modal, .game-path-confirm-overlay, .game-path-modal [role='dialog']";
    const startedAt = performance.now();
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const readOwnedState = () => ({
      marker: document.querySelector("[data-qa-fixture]")?.getAttribute("data-qa-fixture") ?? null,
      appScale: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-scale")
      ),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      fontStatus: document.fonts?.status ?? "unavailable"
    });
    const matchesExpectedState = (state) =>
      state.marker === expectedMode &&
      Number.isFinite(state.appScale) &&
      Math.abs(state.appScale - expectedAppScale) <= 0.0001 &&
      state.viewport.width === expectedWidth &&
      state.viewport.height === expectedHeight &&
      Math.abs(state.viewport.devicePixelRatio - expectedDeviceScaleFactor) <= 0.0001 &&
      state.fontStatus === "loaded";
    const failureReason = (state) => {
      if (state.marker !== expectedMode) return "fixture marker mismatch";
      if (!Number.isFinite(state.appScale) || Math.abs(state.appScale - expectedAppScale) > 0.0001) {
        return "app scale mismatch";
      }
      if (
        state.viewport.width !== expectedWidth ||
        state.viewport.height !== expectedHeight ||
        Math.abs(state.viewport.devicePixelRatio - expectedDeviceScaleFactor) > 0.0001
      ) {
        return "viewport mismatch";
      }
      if (state.fontStatus !== "loaded") return "font readiness timeout";
      return "qa-layout-ready-timeout";
    };
    const timedOutResult = () => {
      const state = readOwnedState();
      return { ready: false, reason: failureReason(state), ...state };
    };
    const getRelevantOwnedAnimations = () => {
      const animations = new Set();
      const roots = document.querySelectorAll(ownedAnimationRootSelector);
      for (const root of roots) {
        for (const animation of root.getAnimations({ subtree: true })) {
          const target = animation.effect?.target;
          const timing = animation.effect?.getComputedTiming();
          const iterations = animation.effect?.getTiming().iterations;
          const belongsToOwnedRoot =
            target instanceof Element &&
            target.closest(ownedAnimationRootSelector) !== null;
          const isRunning =
            animation.playState === "running" || animation.playState === "pending";
          if (
            belongsToOwnedRoot &&
            isRunning &&
            Number.isFinite(timing.endTime) &&
            timing.endTime > 0 &&
            timing.endTime <= maxOwnedAnimationMs &&
            Number.isFinite(iterations)
          ) {
            animations.add(animation);
          }
        }
      }
      return [...animations];
    };

    let timeoutId;
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(timedOutResult()), timeoutMs);
    });
    const readiness = (async () => {
      if (!document.fonts?.ready) return timedOutResult();
      await document.fonts.ready;
      while (performance.now() - startedAt < timeoutMs) {
        const state = readOwnedState();
        if (matchesExpectedState(state)) {
          const ownedAnimations = getRelevantOwnedAnimations();
          const animationResults = await Promise.allSettled(
            ownedAnimations.map((animation) => animation.finished)
          );
          if (animationResults.some((result) => result.status === "rejected")) {
            return {
              ready: false,
              reason: "owned animation rejected",
              ...readOwnedState()
            };
          }
          await nextFrame();
          await nextFrame();
          const stableState = readOwnedState();
          if (matchesExpectedState(stableState)) {
            return { ready: true, ...stableState };
          }
        } else {
          await nextFrame();
        }
      }
      return timedOutResult();
    })();

    try {
      return await Promise.race([readiness, timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  })()`;
};

const assertLayoutReadyResult = (scenario, result) => {
  requireAssertion(
    result?.ready === true,
    `Layout readiness failed for ${scenario.id}: ${result?.reason || "invalid result"}`,
  );
  requireAssertion(
    result.marker === scenario.mode,
    `Layout fixture marker mismatch for ${scenario.id}`,
  );
  const expectedAppScale = Math.min(
    scenario.viewport.width / 1440,
    scenario.viewport.height / 960,
  );
  requireAssertion(
    Number.isFinite(result.appScale) &&
      Math.abs(result.appScale - expectedAppScale) <= 0.0001,
    `Layout scale mismatch for ${scenario.id}`,
  );
  requireAssertion(
    result.viewport?.width === scenario.viewport.width &&
      result.viewport?.height === scenario.viewport.height &&
      Math.abs(
        result.viewport?.devicePixelRatio - scenario.deviceScaleFactor,
      ) <= 0.0001,
    `Layout viewport mismatch for ${scenario.id}`,
  );
};

const isPngBuffer = (value) =>
  Buffer.isBuffer(value) &&
  value.length >= PNG_SIGNATURE.length &&
  value.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);

const runWorkerProcess = (workerArguments, dependencies = {}) => {
  const spawnImpl = dependencies.spawn ?? spawn;
  const timeoutMs = dependencies.timeoutMs ?? CAPTURE_WORKER_TIMEOUT_MS;
  const terminationGraceMs =
    dependencies.terminationGraceMs ?? CAPTURE_WORKER_TERMINATION_GRACE_MS;
  const maxOutputBytes =
    dependencies.maxOutputBytes ?? CAPTURE_WORKER_MAX_OUTPUT_BYTES;
  const maxErrorBytes =
    dependencies.maxErrorBytes ?? CAPTURE_WORKER_MAX_ERROR_BYTES;
  const args = [__filename, ...workerArguments];

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(process.execPath, args, {
        shell: false,
        windowsHide: true,
        env: {},
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new Error("Failed to spawn game-path worker", { cause: error }));
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure = null;
    let settled = false;
    let terminationTimer = null;

    const cleanup = () => {
      clearTimeout(timeout);
      if (terminationTimer) clearTimeout(terminationTimer);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      child.stdout.removeListener("data", onStdout);
      child.stderr.removeListener("data", onStderr);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const terminate = (error) => {
      if (failure || settled) return;
      failure = error;
      let killError = null;
      try {
        child.kill("SIGKILL");
      } catch (caughtError) {
        killError = caughtError;
      }
      if (killError) {
        settle(
          reject,
          new AggregateError(
            [failure, killError],
            "Game-path worker failed and could not be terminated",
            { cause: killError },
          ),
        );
        return;
      }
      terminationTimer = setTimeout(() => {
        settle(
          reject,
          new Error(`${failure.message}; game-path worker did not terminate`, {
            cause: failure,
          }),
        );
      }, terminationGraceMs);
    };
    const onStdout = (chunk) => {
      if (failure) return;
      const value = Buffer.from(chunk);
      stdoutBytes += value.length;
      if (stdoutBytes > maxOutputBytes) {
        terminate(new Error("Game-path worker exceeded maximum output"));
        return;
      }
      stdoutChunks.push(value);
    };
    const onStderr = (chunk) => {
      if (failure) return;
      const value = Buffer.from(chunk);
      stderrBytes += value.length;
      if (stderrBytes > maxErrorBytes) {
        terminate(new Error("Game-path worker exceeded maximum error output"));
        return;
      }
      stderrChunks.push(value);
    };
    const onError = (error) => {
      terminate(
        new Error(`Game-path worker process failed: ${error.message}`, {
          cause: error,
        }),
      );
    };
    const onClose = (code, signal) => {
      if (failure) {
        settle(reject, failure);
        return;
      }
      const stderrText = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code !== 0) {
        settle(
          reject,
          new Error(
            `Game-path worker exited with code ${String(code)}${
              signal ? ` (${signal})` : ""
            }${stderrText ? `: ${stderrText}` : ""}`,
          ),
        );
        return;
      }
      settle(resolve, Buffer.concat(stdoutChunks));
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("error", onError);
    child.on("close", onClose);
    const timeout = setTimeout(
      () => terminate(new Error("Game-path worker timed out")),
      timeoutMs,
    );
  });
};

const assertConfiguredOwnedTarget = (config, targetUrl, label) => {
  const target = parseOwnedTargetUrl(targetUrl);
  if (
    target.runId !== config.runId ||
    targetUrl !== buildOwnedFixtureUrl(config.targetUrl, target.fixtureMode)
  ) {
    throw new Error(`${label} must be the exact configured run-owned target`);
  }
  return target;
};

const scenarioWorkerArguments = (config, targetUrl, scenario) => [
  "--cdp-port",
  String(config.port),
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

const parseWorkerPayload = (output) => {
  let payload;
  try {
    payload = JSON.parse(output.toString("utf8"));
  } catch (error) {
    throw new Error("Game-path worker returned no valid structured payload", {
      cause: error,
    });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Game-path worker returned no valid structured payload");
  }
  return payload;
};

const runNavigationWorkerProcess = async (
  config,
  currentTargetUrl,
  targetUrl,
  scenario,
  dependencies = {},
) => {
  const currentTarget = assertConfiguredOwnedTarget(
    config,
    currentTargetUrl,
    "Navigation current target",
  );
  const target = assertConfiguredOwnedTarget(
    config,
    targetUrl,
    "Navigation destination target",
  );
  if (
    currentTarget.runId !== target.runId ||
    target.fixtureMode !== scenario.mode
  ) {
    throw new Error("Navigation worker target does not match the scenario");
  }
  const output = await runWorkerProcess(
    [
      NAVIGATION_WORKER_ARGUMENT,
      "--current-target-url",
      currentTargetUrl,
      ...scenarioWorkerArguments(config, targetUrl, scenario),
    ],
    dependencies,
  );
  const payload = parseWorkerPayload(output);
  if (
    payload.schemaVersion !== 1 ||
    payload.kind !== "navigation-complete" ||
    payload.targetUrl !== targetUrl ||
    payload.scenarioId !== scenario.id
  ) {
    throw new Error("Navigation worker returned no exact owned worker payload");
  }
};

const runValidationWorkerProcess = async (
  config,
  targetUrl,
  scenario,
  dependencies = {},
) => {
  const target = assertConfiguredOwnedTarget(
    config,
    targetUrl,
    "Validation target",
  );
  if (target.fixtureMode !== scenario.mode) {
    throw new Error("Validation worker target does not match the scenario");
  }
  const output = await runWorkerProcess(
    [
      VALIDATION_WORKER_ARGUMENT,
      ...scenarioWorkerArguments(config, targetUrl, scenario),
    ],
    dependencies,
  );
  const payload = parseWorkerPayload(output);
  if (
    payload.schemaVersion !== 1 ||
    payload.kind !== "validation-result" ||
    payload.targetUrl !== targetUrl ||
    payload.scenarioId !== scenario.id ||
    !payload.state ||
    !Array.isArray(payload.protocolErrors)
  ) {
    throw new Error("Validation worker returned no exact owned worker payload");
  }
  return {
    state: payload.state,
    protocolErrors: payload.protocolErrors,
  };
};

const runPureScreenshotWorkerProcess = async (
  config,
  targetUrl,
  scenario,
  dependencies = {},
) => {
  const target = assertConfiguredOwnedTarget(
    config,
    targetUrl,
    "Pure screenshot target",
  );
  if (target.fixtureMode !== scenario.mode) {
    throw new Error(
      "Pure screenshot worker target does not match the scenario",
    );
  }
  const workerArguments = [
    PURE_SCREENSHOT_WORKER_ARGUMENT,
    ...scenarioWorkerArguments(config, targetUrl, scenario),
  ];
  const runAttempt = async () => {
    const screenshot = await runWorkerProcess(workerArguments, dependencies);
    if (!isPngBuffer(screenshot)) {
      throw new Error("Pure screenshot worker returned no valid PNG data");
    }
    return screenshot;
  };
  const retryableErrorMessage =
    "Game-path worker exited with code 1: Timed out waiting for pure CDP command Page.captureScreenshot";

  let firstError;
  try {
    return await runAttempt();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== retryableErrorMessage) {
      throw error;
    }
    firstError = error;
  }

  try {
    return await runAttempt();
  } catch (secondError) {
    throw new AggregateError(
      [firstError, secondError],
      `Pure screenshot worker failed after one capture-timeout retry for ${scenario.id} at ${targetUrl}`,
      { cause: secondError },
    );
  }
};

const CDP_WORKER_DETACH_SETTLE_MS = 1000;
const settleAfterCdpWorkerDetach = (schedule = setTimeout) =>
  new Promise((resolve) => schedule(resolve, CDP_WORKER_DETACH_SETTLE_MS));

const captureFixtureMatrix = async (config, dependencies) => {
  const matrix = buildScenarioMatrix();
  const startedAt = dependencies.now();
  const scenarios = [];
  let currentTargetUrl = config.targetUrl;
  const settleAfterValidation =
    dependencies.settleAfterValidation ?? (() => settleAfterCdpWorkerDetach());

  for (const scenario of matrix) {
    const url = buildOwnedFixtureUrl(config.targetUrl, scenario.mode);
    await dependencies.navigateInWorker(currentTargetUrl, url, scenario);
    const validation = await dependencies.validateInWorker(url, scenario);
    const assertions = assertScenarioState(
      scenario,
      validation.state,
      validation.protocolErrors,
    );
    await settleAfterValidation(url, scenario);
    const screenshot = await dependencies.screenshotInWorker(url, scenario);
    const screenshotFile = buildScreenshotFileName(scenario);
    dependencies.writeArtifact(
      resolveArtifactPath(config.outputDir, screenshotFile),
      screenshot,
    );
    scenarios.push({
      id: scenario.id,
      fixtureMode: scenario.mode,
      url,
      viewport: scenario.viewport,
      deviceScaleFactor: scenario.deviceScaleFactor,
      screenshot: screenshotFile,
      assertions,
      protocolErrors: validation.protocolErrors,
    });
    currentTargetUrl = url;
  }

  const manifest = {
    schemaVersion: 1,
    runId: config.runId,
    targetUrl: config.targetUrl,
    outputDir: config.outputDir,
    startedAt,
    completedAt: dependencies.now(),
    simulation: {
      viewport: "CDP Emulation.setDeviceMetricsOverride",
      deviceScaleFactor: "CDP simulated",
      windowsOsDpiChanged: false,
    },
    scenarios,
  };
  dependencies.writeArtifact(
    resolveArtifactPath(config.outputDir, MANIFEST_FILE_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
};

const LAYOUT_STATE_EXPRESSION = String.raw`(() => {
  const rect = (element) => {
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return {
      left: value.left,
      top: value.top,
      right: value.right,
      bottom: value.bottom
    };
  };
  const text = (element) => element?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  const fixture = document.querySelector("[data-qa-fixture]");
  const splash = document.getElementById("launcher-splash");
  const splashStyle = splash ? getComputedStyle(splash) : null;
  const splashRect = splash?.getBoundingClientRect() ?? null;
  const splashVisible = Boolean(
    splash &&
    splashStyle?.display !== "none" &&
    splashStyle?.visibility !== "hidden" &&
    Number.parseFloat(splashStyle?.opacity ?? "1") > 0 &&
    splashRect &&
    splashRect.width > 0 &&
    splashRect.height > 0
  );
  const outer = document.querySelector(".game-path-modal[role='dialog']");
  const background = outer?.querySelector(".game-path-modal-background");
  const modalBody = outer?.querySelector(".game-path-modal-body");
  const dialogs = [...document.querySelectorAll("[role='dialog']")];
  const nested = dialogs.find((dialog) => dialog !== outer) ?? null;
  const nestedOverlay = nested?.closest(".game-path-confirm-overlay") ?? null;
  const optionRects = [...document.querySelectorAll(".game-path-options > .game-path-option")].map(rect);
  const selectionButton = [...document.querySelectorAll(".game-path-target-actions button")]
    .find((button) => text(button)?.startsWith("선택 ("));
  const checks = [...document.querySelectorAll(".game-path-target-list input[type='checkbox']")]
    .map((input) => ({ targetId: input.value, checked: input.checked }));
  const resultTargetIds = ["registry-primary", "registry-compatibility", "config"];
  const resultItems = [...document.querySelectorAll(".game-path-target-results li")]
    .map((item, index) => ({
      targetId: resultTargetIds[index],
      status: item.classList.contains("is-applied")
        ? "applied"
        : item.classList.contains("is-unchanged")
          ? "unchanged"
          : "failed"
    }));
  const retryButton = [...document.querySelectorAll(".game-path-target-actions button")]
    .find((button) => text(button)?.startsWith("실패 항목 다시 시도"));
  const deleteDialog = document.querySelector("[aria-labelledby='game-path-registry-delete-title']");
  const deleteFields = [...(deleteDialog?.querySelectorAll(".game-path-confirm-paths > div") ?? [])];
  const longPathElement = [
    ...document.querySelectorAll(
      ".game-path-option-path, .game-path-target-selected-path strong, .game-path-confirm-paths strong"
    )
  ].find((element) => text(element)?.includes("Path of Exile 2")) ?? null;
  const activeDialog = nested ?? outer;
  const activeActions = [
    ...(activeDialog?.querySelectorAll(".game-path-action:not(:disabled)") ?? [])
  ];
  const primaryAction = activeActions.at(-1) ?? null;
  const scrollState = (element) => element ? {
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  } : null;
  const fieldValue = (label) => {
    const field = deleteFields.find((item) => text(item.querySelector("span")) === label);
    return text(field?.querySelector("strong"));
  };
  return {
    modeMarker: fixture?.getAttribute("data-qa-fixture") ?? null,
    splashPresent: splash !== null,
    splashVisible,
    appScale: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--app-scale")
    ),
    dialogCount: dialogs.length,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    modalRect: rect(outer),
    headerRect: rect(outer?.querySelector(".game-path-modal-header")),
    footerRect: rect(outer?.querySelector(".game-path-modal-footer")),
    optionRects,
    nestedOverlayRect: rect(nestedOverlay),
    nestedFocusInside: nested ? nested.contains(document.activeElement) : null,
    scroll: {
      document: scrollState(document.documentElement),
      body: scrollState(document.body),
      modalBody: modalBody ? {
        ...scrollState(modalBody),
        overflowY: getComputedStyle(modalBody).overflowY,
        overscrollBehaviorY: getComputedStyle(modalBody).overscrollBehaviorY
      } : null
    },
    longPath: longPathElement ? {
      text: text(longPathElement),
      rect: rect(longPathElement),
      scrollWidth: longPathElement.scrollWidth,
      clientWidth: longPathElement.clientWidth,
      overflowWrap: getComputedStyle(longPathElement).overflowWrap
    } : null,
    hitTargets: {
      checkboxOptions: [
        ...document.querySelectorAll(".game-path-target-option")
      ].map(rect),
      deleteButtons: [
        ...document.querySelectorAll(".game-path-candidate-delete")
      ].map(rect),
      primaryAction: rect(primaryAction)
    },
    outerAriaModal: outer?.getAttribute("aria-modal") ?? null,
    outerBackgroundInert: background?.hasAttribute("inert") ?? false,
    outerBackgroundAriaHidden: background?.getAttribute("aria-hidden") ?? null,
    nestedAriaModal: nested?.getAttribute("aria-modal") ?? null,
    selection: selectionButton ? { ctaText: text(selectionButton), checks } : null,
    partial: retryButton ? { retryText: text(retryButton), results: resultItems } : null,
    deletion: deleteDialog ? {
      title: text(deleteDialog.querySelector("#game-path-registry-delete-title")),
      candidate: fieldValue("후보"),
      path: fieldValue("삭제할 경로값")
    } : null
  };
})()`;

const capturePureScreenshot = async (worker, dependencies = {}) => {
  const targetIdentity = parseOwnedTargetUrl(worker.targetUrl);
  if (
    targetIdentity.runId !== worker.runId ||
    targetIdentity.fixtureMode !== worker.scenario.mode
  ) {
    throw new Error("Pure screenshot target identity is invalid");
  }
  const commandTimeoutMs =
    dependencies.commandTimeoutMs ?? CDP_COMMAND_TIMEOUT_MS;
  const fetchImpl = dependencies.fetch ?? fetch;
  const WebSocketImpl =
    dependencies.WebSocket ??
    (typeof WebSocket === "function" ? WebSocket : null);
  if (typeof WebSocketImpl !== "function") {
    throw new Error("This capture script requires Node.js WebSocket support");
  }

  const response = await fetchImpl(
    `http://127.0.0.1:${worker.port}/json/list`,
    { signal: AbortSignal.timeout(commandTimeoutMs) },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to list pure screenshot target: HTTP ${response.status}`,
    );
  }
  const targets = await response.json();
  const target = Array.isArray(targets)
    ? targets.find((item) => item?.url === worker.targetUrl)
    : null;
  if (!target?.webSocketDebuggerUrl) {
    throw new Error(
      `Exact owned pure screenshot target not found: ${worker.targetUrl}`,
    );
  }

  const socket = new WebSocketImpl(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  const failPending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
  };
  const socketError = (event) =>
    new Error(
      event?.message ||
        event?.error?.message ||
        "Pure screenshot WebSocket error",
    );
  const waitForOpen = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(
      () =>
        finish(
          reject,
          new Error("Timed out waiting for pure screenshot WebSocket open"),
        ),
      commandTimeoutMs,
    );
    socket.addEventListener("open", () => finish(resolve), { once: true });
    socket.addEventListener(
      "error",
      (event) => finish(reject, socketError(event)),
      { once: true },
    );
    socket.addEventListener(
      "close",
      () =>
        finish(
          reject,
          new Error("Pure screenshot WebSocket closed before opening"),
        ),
      { once: true },
    );
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      failPending(new Error("Pure screenshot WebSocket returned invalid JSON"));
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) {
      request.reject(
        new Error(
          `Pure screenshot CDP command ${request.method} failed: ${JSON.stringify(message.error)}`,
        ),
      );
    } else {
      request.resolve(message.result);
    }
  });
  socket.addEventListener("error", (event) => failPending(socketError(event)));
  socket.addEventListener("close", () =>
    failPending(new Error("Pure screenshot WebSocket closed unexpectedly")),
  );

  const send = (method, params = {}) => {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for pure CDP command ${method}`));
      }, commandTimeoutMs);
      pending.set(id, { method, resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(error);
      }
    });
  };
  const closeSocket = () =>
    new Promise((resolve, reject) => {
      if (socket.readyState === 3) {
        resolve();
        return;
      }
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };
      const timeout = setTimeout(
        () =>
          finish(
            reject,
            new Error("Timed out waiting for pure screenshot WebSocket close"),
          ),
        commandTimeoutMs,
      );
      socket.addEventListener("close", () => finish(resolve), { once: true });
      socket.addEventListener(
        "error",
        (event) => finish(reject, socketError(event)),
        { once: true },
      );
      try {
        socket.close();
      } catch (error) {
        finish(reject, error);
      }
    });

  let screenshot;
  let operationError;
  try {
    await waitForOpen;
    const scenario = worker.scenario;
    await send("Emulation.setDeviceMetricsOverride", {
      width: scenario.viewport.width,
      height: scenario.viewport.height,
      deviceScaleFactor: scenario.deviceScaleFactor,
      mobile: false,
      screenWidth: scenario.viewport.width,
      screenHeight: scenario.viewport.height,
    });
    await send("Page.bringToFront");
    const result = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    if (!result?.data) throw new Error("Pure screenshot returned no data");
    screenshot = Buffer.from(result.data, "base64");
  } catch (error) {
    operationError = error;
  }
  try {
    await closeSocket();
  } catch (closeError) {
    if (operationError) {
      throw new AggregateError(
        [operationError, closeError],
        "Pure screenshot operation and close both failed",
        { cause: closeError },
      );
    }
    throw closeError;
  } finally {
    failPending(new Error("Pure screenshot session closed"));
  }
  if (operationError) throw operationError;
  if (!isPngBuffer(screenshot)) {
    throw new Error("Pure screenshot worker received no valid PNG data");
  }
  return screenshot;
};

const createCdpClient = async (config, targetUrl) => {
  const ownedTarget = parseOwnedTargetUrl(targetUrl);
  if (
    ownedTarget.runId !== config.runId ||
    targetUrl !==
      buildOwnedFixtureUrl(config.targetUrl, ownedTarget.fixtureMode)
  ) {
    throw new Error(
      "Observer target must be the exact configured run-owned fixture target",
    );
  }
  const response = await fetch(`http://127.0.0.1:${config.port}/json/list`, {
    signal: AbortSignal.timeout(CDP_COMMAND_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to list CDP targets: HTTP ${response.status}`);
  }
  const targets = await response.json();
  const target = Array.isArray(targets)
    ? targets.find((item) => item?.url === targetUrl)
    : null;
  if (!target?.webSocketDebuggerUrl) {
    throw new Error(`Exact owned CDP target not found: ${targetUrl}`);
  }
  if (typeof WebSocket !== "function") {
    throw new Error("This capture script requires Node.js WebSocket support");
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const eventWaiters = new Map();
  let protocolErrors = [];

  const waitForOpen = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const waitForEvent = (method) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventWaiters.delete(method);
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, CDP_COMMAND_TIMEOUT_MS);
      eventWaiters.set(method, (params) => {
        clearTimeout(timeout);
        eventWaiters.delete(method);
        resolve(params);
      });
    });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timeout);
      if (message.error)
        request.reject(
          new Error(
            `CDP command ${request.method} failed: ${JSON.stringify(message.error)}`,
          ),
        );
      else request.resolve(message.result);
      return;
    }

    const waiter = eventWaiters.get(message.method);
    waiter?.(message.params);
    if (message.method === "Runtime.exceptionThrown") {
      protocolErrors.push({
        domain: "Runtime",
        message:
          message.params?.exceptionDetails?.text || "Runtime.exceptionThrown",
      });
    } else if (
      message.method === "Runtime.consoleAPICalled" &&
      message.params?.type === "error"
    ) {
      protocolErrors.push({ domain: "Runtime", message: "console.error" });
    } else if (
      message.method === "Log.entryAdded" &&
      message.params?.entry?.level === "error"
    ) {
      protocolErrors.push({
        domain: "Log",
        message: message.params.entry.text || "Log.entryAdded",
      });
    } else if (message.method === "Page.javascriptDialogOpening") {
      protocolErrors.push({
        domain: "Page",
        message: message.params?.message || "javascriptDialogOpening",
      });
    } else if (message.method === "Inspector.targetCrashed") {
      protocolErrors.push({ domain: "Page", message: "targetCrashed" });
    }
  });

  await waitForOpen;

  const send = (method, params = {}) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}`));
      }, CDP_COMMAND_TIMEOUT_MS);
      pending.set(id, { method, resolve, reject, timeout });
    });
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  await send("Inspector.enable");

  let closePromise;
  return {
    async setViewport(scenario) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: scenario.viewport.width,
        height: scenario.viewport.height,
        deviceScaleFactor: scenario.deviceScaleFactor,
        mobile: false,
        screenWidth: scenario.viewport.width,
        screenHeight: scenario.viewport.height,
      });
    },
    async navigate(url) {
      const loaded = waitForEvent("Page.loadEventFired");
      const result = await send("Page.navigate", { url });
      if (result?.errorText) {
        throw new Error(`Page navigation failed: ${result.errorText}`);
      }
      await loaded;
    },
    async waitForLayoutReady(scenario) {
      const result = await send("Runtime.evaluate", {
        expression: buildLayoutReadyExpression(scenario),
        awaitPromise: true,
        returnByValue: true,
      });
      if (result?.exceptionDetails) {
        throw new Error(
          `Layout readiness evaluation failed: ${
            result.exceptionDetails.text || "Runtime.evaluate failed"
          }`,
        );
      }
      assertLayoutReadyResult(scenario, result?.result?.value);
    },
    async readState() {
      const result = await send("Runtime.evaluate", {
        expression: LAYOUT_STATE_EXPRESSION,
        returnByValue: true,
      });
      if (result?.exceptionDetails) {
        protocolErrors.push({
          domain: "Runtime",
          message: result.exceptionDetails.text || "Runtime.evaluate failed",
        });
      }
      return result?.result?.value;
    },
    takeErrors() {
      const errors = protocolErrors;
      protocolErrors = [];
      return errors;
    },
    async close() {
      if (closePromise) return closePromise;
      closePromise = new Promise((resolve, reject) => {
        if (socket.readyState === 3) {
          resolve();
          return;
        }
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          callback(value);
        };
        const timeout = setTimeout(
          () =>
            finish(
              reject,
              new Error("Timed out waiting for observer WebSocket close"),
            ),
          CDP_COMMAND_TIMEOUT_MS,
        );
        socket.addEventListener("close", () => finish(resolve), { once: true });
        socket.addEventListener(
          "error",
          (event) =>
            finish(
              reject,
              new Error(
                event?.message ||
                  event?.error?.message ||
                  "Observer WebSocket close failed",
              ),
            ),
          { once: true },
        );
        try {
          socket.close();
        } catch (error) {
          finish(reject, error);
        }
      });
      return closePromise;
    },
  };
};

const writeArtifact = (filePath, contents) => {
  fs.writeFileSync(filePath, contents);
};

const main = async () => {
  const config = parseCaptureEnvironment(process.env, process.cwd());
  fs.mkdirSync(config.outputDir, { recursive: true });
  const manifest = await captureFixtureMatrix(config, {
    navigateInWorker: (currentTargetUrl, targetUrl, scenario) =>
      runNavigationWorkerProcess(config, currentTargetUrl, targetUrl, scenario),
    validateInWorker: (targetUrl, scenario) =>
      runValidationWorkerProcess(config, targetUrl, scenario),
    screenshotInWorker: (targetUrl, scenario) =>
      runPureScreenshotWorkerProcess(config, targetUrl, scenario),
    now: () => new Date().toISOString(),
    writeArtifact,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        runId: manifest.runId,
        outputDir: manifest.outputDir,
        manifestPath: path.join(config.outputDir, MANIFEST_FILE_NAME),
        scenarioCount: manifest.scenarios.length,
        windowsOsDpiChanged: false,
      },
      null,
      2,
    )}\n`,
  );
};

const useCdpClient = async (client, action) => {
  let result;
  let actionError;
  try {
    result = await action(client);
  } catch (error) {
    actionError = error;
  }
  try {
    await client.close();
  } catch (closeError) {
    if (actionError) {
      throw new AggregateError(
        [actionError, closeError],
        "Game-path worker operation and CDP close both failed",
        { cause: closeError },
      );
    }
    // This helper is used only at dedicated child-process boundaries. A
    // successful worker payload is authoritative; process exit releases a CDP
    // session whose WebSocket close handshake reports an error.
  }
  if (actionError) throw actionError;
  return result;
};

const executeNavigationWorker = async (args) => {
  const worker = parseNavigationWorkerArguments(args);
  const client = await createCdpClient(
    {
      port: worker.port,
      targetUrl: worker.currentTargetUrl,
      runId: worker.runId,
    },
    worker.currentTargetUrl,
  );
  await useCdpClient(client, async (activeClient) => {
    await activeClient.setViewport(worker.scenario);
    await activeClient.navigate(worker.targetUrl);
  });
  return {
    schemaVersion: 1,
    kind: "navigation-complete",
    targetUrl: worker.targetUrl,
    scenarioId: worker.scenario.id,
  };
};

const executeValidationWorker = async (args) => {
  const worker = parseValidationWorkerArguments(args);
  const client = await createCdpClient(
    {
      port: worker.port,
      targetUrl: worker.targetUrl,
      runId: worker.runId,
    },
    worker.targetUrl,
  );
  return useCdpClient(client, async (activeClient) => {
    await activeClient.setViewport(worker.scenario);
    await activeClient.waitForLayoutReady(worker.scenario);
    const state = await activeClient.readState();
    const protocolErrors = activeClient.takeErrors();
    assertScenarioState(worker.scenario, state, protocolErrors);
    return {
      schemaVersion: 1,
      kind: "validation-result",
      targetUrl: worker.targetUrl,
      scenarioId: worker.scenario.id,
      state,
      protocolErrors,
    };
  });
};

const executePureScreenshotWorker = async (args) => {
  const worker = parsePureScreenshotWorkerArguments(args);
  return capturePureScreenshot(worker);
};

if (require.main === module) {
  const cliArguments = process.argv.slice(2);
  if (cliArguments[0] === NAVIGATION_WORKER_ARGUMENT) {
    executeNavigationWorker(cliArguments)
      .then((payload) => process.stdout.write(`${JSON.stringify(payload)}\n`))
      .catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      });
  } else if (cliArguments[0] === VALIDATION_WORKER_ARGUMENT) {
    executeValidationWorker(cliArguments)
      .then((payload) => process.stdout.write(`${JSON.stringify(payload)}\n`))
      .catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      });
  } else if (cliArguments[0] === PURE_SCREENSHOT_WORKER_ARGUMENT) {
    executePureScreenshotWorker(cliArguments)
      .then((screenshot) => process.stdout.write(screenshot))
      .catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      });
  } else {
    main().catch((error) => {
      process.stderr.write(`game-path-diagnostic-capture: ${error.message}\n`);
      process.exitCode = 1;
    });
  }
}

module.exports = {
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
};

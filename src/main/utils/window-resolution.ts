import { BrowserWindow, screen } from "electron";

import { logger } from "./logger";
import { AppConfig } from "../../shared/types";

const BASE_WIDTH = 1440;
const BASE_HEIGHT = 960;
const MEDIUM_WIDTH = 1080;
const MEDIUM_HEIGHT = 720;

// Helper for approximate comparison
const isCloseTo = (val: number, target: number, tolerance = 10) =>
  Math.abs(val - target) < tolerance;

/**
 * Applies resolution and sizing rules based on configuration.
 * This is an ACTIVE operation that may resize and move the window.
 * Should only be called on initialization or when configuration changes.
 */
export const applyResolutionRules = (
  win: BrowserWindow,
  config: Partial<AppConfig>,
  onModeDetermined?: (mode: string) => void,
): boolean => {
  if (!win || win.isDestroyed()) return false;

  const autoResolution = config.autoResolution ?? true;
  const resolutionMode = config.resolutionMode ?? "1440x960";
  const currentDisplay = screen.getDisplayNearestPoint(win.getBounds());
  const { width: workW, height: workH } = currentDisplay.workAreaSize;

  logger.log(
    `[WindowResolution] Applying rules. Auto: ${autoResolution}, Mode: ${resolutionMode}, WorkArea: ${workW}x${workH}`,
  );

  let changed: boolean;

  // 1. Auto Resolution Logic
  if (autoResolution) {
    if (workW >= BASE_WIDTH + 10 && workH >= BASE_HEIGHT + 10) {
      changed = applyFixedSize(win, BASE_WIDTH, BASE_HEIGHT);
      onModeDetermined?.("1440x960");
    } else if (workW >= MEDIUM_WIDTH + 10 && workH >= MEDIUM_HEIGHT + 10) {
      changed = applyFixedSize(win, MEDIUM_WIDTH, MEDIUM_HEIGHT);
      onModeDetermined?.("1080x720");
    } else {
      changed = applyFlexibleMode(win);
      onModeDetermined?.("fullscreen");
    }
  }
  // 2. Manual Resolution Logic
  else {
    switch (resolutionMode) {
      case "1440x960":
        changed = applyFixedSize(win, BASE_WIDTH, BASE_HEIGHT);
        break;
      case "1080x720":
        changed = applyFixedSize(win, MEDIUM_WIDTH, MEDIUM_HEIGHT);
        break;
      case "fullscreen":
        changed = applyFullscreenMode(win);
        break;
      default:
        changed = applyFixedSize(win, BASE_WIDTH, BASE_HEIGHT);
        break;
    }
  }

  return changed;
};

/**
 * Enforces constraints passively during window movement or display changes.
 * This does NOT resize or move the window unless strictly necessary for constraints (e.g. aspect ratio).
 * It NEVER centers the window to prevent jitter loops.
 */
export const enforceConstraints = (
  win: BrowserWindow,
  config: Partial<AppConfig>,
) => {
  if (!win || win.isDestroyed()) return;
  // This function is for ensuring the window stays within bounds or maintains aspect ratio
  // if the OS allows resizing.
  // For fixed modes, we just ensure it's not resizable.

  // Implementation depends on if we want to force-correct size if user somehow resized it
  // But usually `setResizable(false)` handles it.
  // We can just re-apply the resizable/maximizable flags here without changing size.

  const autoResolution = config.autoResolution ?? true;
  const resolutionMode = config.resolutionMode ?? "1440x960";

  // [Fix] Log suppression: only log if state changed to prevent move-event spam
  const winExtended = win as BrowserWindow & { _lastEnforceKey?: string };
  const currentKey = `${autoResolution}:${resolutionMode}`;
  if (winExtended._lastEnforceKey !== currentKey) {
    logger.log(
      `[Enforce] Checking constraints. Auto: ${autoResolution}, Mode: ${resolutionMode}`,
    );
    winExtended._lastEnforceKey = currentKey;
  }

  // Logic to determine if we are in a fixed mode
  // ... (Simplified: If not Tier 3 or Fullscreen, it's fixed)
  // But calculating Tier 3 requires display info again.
  // Let's keep it simple: just checking resizable state might be enough,
  // or re-evaluating the tier passively.

  // For now, `applyResolutionRules` sets the flags, so `enforceConstraints` might just be for logging or edge cases.
  // We'll leave it empty-sh/logging for now unless we need strict aspect enforcement on the fly.
};

// --- Internal Helpers ---

const applyFixedSize = (
  win: BrowserWindow,
  width: number,
  height: number,
): boolean => {
  let changed = false;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
    changed = true;
  }
  if (win.isMaximized()) {
    win.unmaximize();
    changed = true;
  }

  // Unlock to set size
  if (!win.isResizable()) win.setResizable(true);

  const [currW, currH] = win.getSize();
  logger.log(
    `[WindowResolution] Current: ${currW}x${currH}, Target: ${width}x${height}, Resizable: ${win.isResizable()}`,
  );

  if (!isCloseTo(currW, width) || !isCloseTo(currH, height)) {
    logger.log(`[WindowResolution] Resizing to fixed: ${width}x${height}`);
    win.setSize(width, height);
    win.center(); // Safe to center here as it's a discrete state change, not a move loop
    changed = true;
  }

  // Lock
  win.setResizable(false);
  win.setMaximizable(false);
  win.setAspectRatio(0); // Reset aspect ratio requirement since size is fixed

  return changed;
};

const applyFlexibleMode = (win: BrowserWindow): boolean => {
  let changed = false;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
    changed = true;
  }

  // Enable resizing
  if (!win.isResizable()) win.setResizable(true);
  if (!win.isMaximizable()) win.setMaximizable(true);

  // Maximize if not already (UX choice for low res)
  if (!win.isMaximized()) {
    win.maximize();
    changed = true;
  }
  return changed;
};

const applyFullscreenMode = (win: BrowserWindow): boolean => {
  let changed = false;
  if (!win.isFullScreen()) {
    // [Fix] Windows needs the window to be resizable to transition to fullscreen correctly in some cases.
    if (!win.isResizable()) win.setResizable(true);
    if (!win.isMaximizable()) win.setMaximizable(true);

    win.setFullScreen(true);
    changed = true;
  }
  return changed;
};

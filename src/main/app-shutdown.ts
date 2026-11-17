import { app, dialog, ipcMain, session } from "electron";

import { discardAutomationDumpSession } from "./kakao/automation-page-dump";
import { KAKAO_PARTITION } from "./kakao/session";
import { serviceManager } from "./services/ServiceManager";
import { logger } from "./utils/logger";
import { PowerShellManager } from "./utils/powershell";

let preparation: Promise<void> | undefined;
type ShutdownTrigger = "quit" | "relaunch" | "install";
type ExitAction = (allowQuit: () => void) => void;
type SaveResult = "started" | "saved" | "failed" | "timeout";
type SaveDiagnostic = (trigger: ShutdownTrigger, result: SaveResult) => void;
let saveDiagnostic: SaveDiagnostic | undefined;
let pending: { trigger: ShutdownTrigger; finish: ExitAction } | undefined;
let exitCommitted = false;
let quitAllowed = false;

function reportSave(trigger: ShutdownTrigger, result: SaveResult): void {
  try {
    saveDiagnostic?.(trigger, result);
  } catch {
    /* A diagnostic write must never affect the shutdown decision. */
  }
}

class PhaseTimeout extends Error {}

async function withTimeout(
  work: Promise<void>,
  milliseconds: number,
  phase: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new PhaseTimeout(`${phase} timed out`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopServices(): Promise<void> {
  try {
    await discardAutomationDumpSession("app-cleanup");
  } catch (error) {
    logger.error("[Shutdown] Failed to discard automation dump:", error);
  }
  await serviceManager.stopAll();
}

/** Shared by explicit installation and ordinary quit (including install-on-quit). */
export function prepareForShutdown(
  trigger: ShutdownTrigger = "quit",
): Promise<void> {
  if (preparation) return preparation;

  preparation = (async () => {
    // Fail before disposing services so a failed write can be retried safely.
    reportSave(trigger, "started");
    try {
      await withTimeout(
        session.fromPartition(KAKAO_PARTITION).cookies.flushStore(),
        10_000,
        "Cookie persistence",
      );
    } catch (error) {
      reportSave(trigger, error instanceof PhaseTimeout ? "timeout" : "failed");
      throw error;
    }
    reportSave(trigger, "saved");
    logger.log("[Shutdown] Login cookies saved. Stopping services...");

    try {
      await withTimeout(stopServices(), 5_000, "Service cleanup");
    } catch (error) {
      logger.warn(
        "[Shutdown] Continuing quit after service cleanup failure:",
        error,
      );
    }
    // Always release file locks, even if an asynchronous service did not stop.
    try {
      PowerShellManager.getInstance().cleanup();
    } catch (error) {
      logger.error("[Shutdown] Failed to clean up PowerShell:", error);
    }
  })().catch((error) => {
    preparation = undefined;
    throw error;
  });
  return preparation;
}

/** Ordinary quit keeps install-on-quit. Only a restart may hand off to explicit install. */
export async function requestShutdown(
  trigger: ShutdownTrigger,
  finish: ExitAction,
): Promise<void> {
  if (exitCommitted) return;
  if (pending) {
    if (pending.trigger === "relaunch" && trigger === "install") {
      pending.trigger = trigger;
      pending.finish = finish;
    }
    return;
  }
  const request = { trigger, finish };
  pending = request;
  try {
    await prepareForShutdown(trigger);
  } catch (error) {
    pending = undefined;
    logger.error("[Shutdown] Cancelled before cookie persistence:", error);
    const messages = {
      quit: [
        "종료하지 못했습니다",
        "로그인 정보를 저장하지 못해 종료를 중단했습니다. 잠시 후 다시 종료해 주세요.",
      ],
      relaunch: [
        "재시작하지 못했습니다",
        "로그인 정보를 저장하지 못해 재시작을 중단했습니다. 잠시 후 다시 시도해 주세요.",
      ],
      install: [
        "업데이트를 시작하지 못했습니다",
        "로그인 정보를 저장하지 못해 업데이트를 중단했습니다. 잠시 후 다시 설치해 주세요.",
      ],
    };
    const [title, message] = messages[request.trigger];
    dialog.showErrorBox(title, message);
    return;
  }
  exitCommitted = true;
  request.finish(() => {
    quitAllowed = true;
  });
}

export function registerShutdownHandlers(
  setQuitting: (quitting: boolean) => void,
  installDownloaded: (allowQuit: () => void) => boolean,
  diagnostic: SaveDiagnostic,
): void {
  saveDiagnostic = diagnostic;
  ipcMain.on("app:relaunch", () =>
    requestShutdown("relaunch", (allowQuit) => {
      if (installDownloaded(allowQuit)) return;
      try {
        app.relaunch();
      } catch (error) {
        logger.error("[Shutdown] Could not schedule relaunch:", error);
        dialog.showErrorBox(
          "재시작하지 못했습니다",
          "런처를 종료합니다. 직접 다시 실행해 주세요.",
        );
      }
      app.exit(0);
    }),
  );
  app.on("before-quit", (event) => {
    if (quitAllowed || !app.isReady()) {
      setQuitting(true);
      return;
    }

    // Electron does not await an async event listener's returned Promise.
    event.preventDefault();
    setQuitting(false);
    void requestShutdown("quit", (allowQuit) => {
      allowQuit();
      app.quit();
    });
  });
}

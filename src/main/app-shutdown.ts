import { app, dialog, session } from "electron";

import { discardAutomationDumpSession } from "./kakao/automation-page-dump";
import { KAKAO_PARTITION } from "./kakao/session";
import { serviceManager } from "./services/ServiceManager";
import { logger } from "./utils/logger";
import { PowerShellManager } from "./utils/powershell";

let preparation: Promise<void> | undefined;
let prepared = false;

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
          () => reject(new Error(`${phase} timed out`)),
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
export function prepareForShutdown(): Promise<void> {
  if (preparation) return preparation;

  preparation = (async () => {
    // Fail before disposing services so a failed write can be retried safely.
    await withTimeout(
      session.fromPartition(KAKAO_PARTITION).cookies.flushStore(),
      10_000,
      "Cookie persistence",
    );
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
    prepared = true;
  })().catch((error) => {
    preparation = undefined;
    throw error;
  });
  return preparation;
}

export function registerShutdownHandlers(
  setQuitting: (quitting: boolean) => void,
): void {
  let quitPending = false;
  app.on("before-quit", (event) => {
    if (prepared || !app.isReady()) {
      setQuitting(true);
      return;
    }

    // Electron does not await an async event listener's returned Promise.
    event.preventDefault();
    if (quitPending) return;
    quitPending = true;
    void prepareForShutdown().then(
      () => app.quit(),
      (error) => {
        quitPending = false;
        setQuitting(false);
        logger.error(
          "[Shutdown] Quit cancelled before cookie persistence:",
          error,
        );
        dialog.showErrorBox(
          "종료하지 못했습니다",
          "로그인 정보를 저장하지 못해 종료를 중단했습니다. 잠시 후 다시 종료해 주세요.",
        );
      },
    );
  });
}

import {
  clipboard,
  dialog,
  shell,
  type BrowserWindow,
  type MessageBoxOptions,
} from "electron";

import { logger } from "./logger";

const OPEN_EXTERNAL_FAILURE_OPTIONS: MessageBoxOptions = {
  type: "warning",
  title: "외부 링크 열기 실패",
  message: "기본 브라우저에서 링크를 열지 못했습니다.",
  detail:
    "Windows 설정 > 앱 > 기본 앱에서 사용할 브라우저를 기본값으로 설정한 뒤 다시 시도해 주세요.\n\n필요하면 링크를 복사하여 브라우저 주소창에 붙여넣을 수 있습니다.",
  buttons: ["링크 복사", "확인"],
  defaultId: 1,
  cancelId: 1,
  noLink: true,
};

export async function openExternalSafely(
  url: string,
  parentWindow?: BrowserWindow | null,
): Promise<boolean> {
  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    logger.warn(
      "[ExternalLink] Failed to open URL in the default browser.",
      error,
    );
  }

  if (parentWindow?.isDestroyed()) {
    logger.warn(
      "[ExternalLink] Skipped the recovery dialog because its parent window was destroyed.",
    );
    return false;
  }

  let shouldCopyUrl = false;

  try {
    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, OPEN_EXTERNAL_FAILURE_OPTIONS)
      : await dialog.showMessageBox(OPEN_EXTERNAL_FAILURE_OPTIONS);
    shouldCopyUrl = result.response === 0;
  } catch (error) {
    logger.error("[ExternalLink] Failed to show the recovery dialog.", error);
  }

  if (shouldCopyUrl) {
    try {
      await clipboard.writeText(url);
    } catch (error) {
      logger.error(
        "[ExternalLink] Failed to copy URL to the clipboard.",
        error,
      );
    }
  }

  return false;
}

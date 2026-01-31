import { ipcRenderer } from "electron";

import { LoggerBase, LoggerOptions } from "../../shared/logger-base";

/**
 * Preload 전용 로거.
 * 브라우저 콘솔(DevTools)과 메인 프로세스(Debug Console) 모두에 로그를 기록합니다.
 */
export class PreloadLogger extends LoggerBase {
  constructor(optionsOrType?: LoggerOptions | string) {
    const options =
      typeof optionsOrType === "string"
        ? { type: optionsOrType }
        : optionsOrType;
    super(options);
  }

  protected emit(content: string, isError: boolean, textColor?: string): void {
    try {
      // 메인 프로세스의 Debug Log 이벤트 발생 유발
      ipcRenderer.send("debug-log:send", {
        type: this.type,
        content: content,
        isError: isError,
        timestamp: Date.now(),
        typeColor: this.typeColor,
        textColor: textColor || (isError ? "#FF5555" : this.textColor),
      });
    } catch {
      // Fail silently if IPC is not available (shouldn't happen in preload)
    }
  }
}

/**
 * 기본 인스턴스 (DEVTOOLS 타입)
 */
export const logger = new PreloadLogger({
  type: "DEVTOOLS",
  typeColor: "#50FA7B", // Dracula Green
});

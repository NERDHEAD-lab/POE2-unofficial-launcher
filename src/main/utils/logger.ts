import { LoggerBase, LoggerOptions } from "../../shared/logger-base";
import { AppContext, DebugLogEvent, EventType } from "../events/types";

import type { DebugLogPayload } from "../../shared/types";

let globalContext: AppContext | null = null;
let logEmitter: ((event: DebugLogEvent) => void) | null = null;
let diagnosticLogSink: ((payload: DebugLogPayload) => void) | null = null;
let diagnosticLogSinkErrorReported = false;

// 초기 로그 소실 방지를 위한 버퍼
const MAX_LOG_HISTORY = 200;
const logHistory: DebugLogPayload[] = [];

/**
 * 메인 프로세스가 소유하는 영구 로그 저장소를 연결합니다.
 */
export function setupDiagnosticLogSink(
  sink: (payload: DebugLogPayload) => void,
): void {
  diagnosticLogSink = sink;
  diagnosticLogSinkErrorReported = false;
}

/**
 * 로그를 메모리 히스토리와 영구 로그 sink에 각각 한 번 기록합니다.
 */
export function recordDebugLogPayload(payload: DebugLogPayload): void {
  logHistory.push(payload);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }

  if (!diagnosticLogSink) return;

  try {
    diagnosticLogSink(payload);
  } catch (error) {
    if (!diagnosticLogSinkErrorReported) {
      diagnosticLogSinkErrorReported = true;
      console.error("[Logger] Diagnostic log sink failed:", error);
    }
  }
}

/**
 * 전역 로그 히스토리를 반환합니다.
 */
export function getLogHistory(): DebugLogPayload[] {
  return [...logHistory];
}

/**
 * 앱 시작 시 ASCII 배너를 출력합니다.
 */
export function printBanner() {
  const banner = `
***************************************************************************************
 _   _  _____ ______ ______  _   _  _____   ___  ______          _       ___  ______ 
| \\ | ||  ___|| ___ \\|  _  \\| | | ||  ___| / _ \\ |  _  \\        | |     / _ \\ | ___ \\
|  \\| || |__  | |_/ /| | | || |_| || |__  / /_\\ \\| | | | ______ | |    / /_\\ \\| |_/ /
| . \` ||  __| |    / | | | ||  _  ||  __| |  _  || | | ||______|| |    |  _  || ___ \\
| |\\  || |___ | |\\ \\ | |/ / | | | || |___ | | | || |/ /         | |____| | | || |_/ /
\\_| \\_/\\____/ \\_| \\_||___/  \\_| |_/\\____/ \\_| |_/|___/          \\_____/\\_| |_/\\____/ 
***************************************************************************************
  `;
  banner.split("\n").forEach((line) => {
    if (line.trim()) {
      logger.log(line);
    }
  });
}

/**
 * 메인 프로세스에서 Logger가 AppContext와 로그 전송 콜백을 참조할 수 있도록 설정합니다.
 */
export function setupMainLogger(
  context: AppContext,
  emitter?: (event: DebugLogEvent) => void,
) {
  globalContext = context;
  if (emitter) {
    logEmitter = emitter;
  }
}

export class Logger extends LoggerBase {
  constructor(optionsOrType?: LoggerOptions | string) {
    const options =
      typeof optionsOrType === "string"
        ? { type: optionsOrType }
        : optionsOrType;
    super(options);
  }

  protected emit(
    content: string,
    isError: boolean,
    textColor?: string,
    timestamp?: number,
  ): void {
    const payload: DebugLogEvent["payload"] = {
      type: this.type,
      content: content,
      isError: isError,
      timestamp: timestamp ?? Date.now(),
      typeColor: this.typeColor,
      textColor: textColor || (isError ? "#FF5555" : this.textColor),
      priority: this.priority,
    };

    recordDebugLogPayload(payload);

    if (!globalContext || !logEmitter) return;

    logEmitter({
      type: EventType.DEBUG_LOG,
      payload,
    });
  }
}

// Default instance for general usage
export const logger = new Logger({ type: "GENERAL", priority: 0 });

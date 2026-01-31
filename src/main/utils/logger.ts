import { LoggerBase, LoggerOptions } from "../../shared/logger-base";
import { AppContext, DebugLogEvent, EventType } from "../events/types";

let globalContext: AppContext | null = null;
let logEmitter: ((event: DebugLogEvent) => void) | null = null;

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

  protected emit(content: string, isError: boolean, textColor?: string): void {
    if (!globalContext || !logEmitter) return;

    logEmitter({
      type: EventType.DEBUG_LOG,
      payload: {
        type: this.type,
        content: content,
        isError: isError,
        timestamp: Date.now(),
        typeColor: this.typeColor,
        textColor: textColor || (isError ? "#FF5555" : this.textColor),
        priority: this.priority,
      },
    });
  }
}

// Default instance for general usage
export const logger = new Logger({ type: "GENERAL", priority: 0 });

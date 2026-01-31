import { LoggerBase, LoggerOptions } from "../../shared/logger-base";
import { eventBus } from "../events/EventBus";
import { AppContext, EventType, DebugLogEvent } from "../events/types";

let globalContext: AppContext | null = null;

/**
 * 메인 프로세스에서 Logger가 AppContext를 참조할 수 있도록 설정합니다.
 */
export function setupMainLogger(context: AppContext) {
  globalContext = context;
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
    if (!globalContext) return;

    // Avoid infinite loop: Check if this is already an EventBus log or something similar
    // But since we use eventBus.emit directly, it's safer than overriding console.log.

    eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, globalContext, {
      type: this.type,
      content: content,
      isError: isError,
      timestamp: Date.now(),
      typeColor: this.typeColor,
      textColor: textColor || (isError ? "#FF5555" : this.textColor),
    });
  }
}

// Default instance for general usage
export const logger = new Logger("GENERAL");

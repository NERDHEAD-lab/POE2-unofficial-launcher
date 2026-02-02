import { LoggerBase, LoggerOptions } from "../../shared/logger-base";

export class Logger extends LoggerBase {
  constructor(optionsOrType?: LoggerOptions | string) {
    const options =
      typeof optionsOrType === "string"
        ? { type: optionsOrType }
        : optionsOrType;
    super(options);
  }

  protected emit(content: string, isError: boolean, textColor?: string): void {
    if (window.electronAPI && window.electronAPI.sendDebugLog) {
      window.electronAPI.sendDebugLog({
        type: this.type,
        content: content,
        isError: isError,
        timestamp: Date.now(),
        typeColor: this.typeColor,
        textColor: textColor || (isError ? "#FF5555" : this.textColor),
        priority: this.priority,
      });
    }
  }
}

// Default instance for general usage
export const logger = new Logger({ type: "GENERAL", priority: 0 });

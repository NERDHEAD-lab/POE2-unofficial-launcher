export interface LoggerOptions {
  type?: string;
  typeColor?: string;
  textColor?: string;
  useConsole?: boolean;
}

export abstract class LoggerBase {
  protected type: string;
  protected typeColor: string;
  protected textColor?: string;
  protected useConsole: boolean;

  constructor(optionsOrType?: LoggerOptions | string) {
    const options =
      typeof optionsOrType === "string"
        ? { type: optionsOrType }
        : optionsOrType || {};
    this.type = options.type || "GENERAL";
    this.typeColor = options.typeColor || "#bbbbbb";
    this.textColor = options.textColor;
    this.useConsole = options.useConsole !== false;
  }

  /**
   * 실제 로그를 전송하는 추상 메서드.
   * 각 프로세스(Main/Renderer)에서 환경에 맞게 구현합니다.
   */
  protected abstract emit(
    content: string,
    isError: boolean,
    textColor?: string,
  ): void;

  public log(message: unknown, ...args: unknown[]) {
    this.executeLog(message, args, false);
  }

  /**
   * log 메서드의 별칭입니다.
   */
  public info(message: unknown, ...args: unknown[]) {
    this.log(message, ...args);
  }

  public warn(message: unknown, ...args: unknown[]) {
    this.executeLog(message, args, false, "#FFB86C");
  }

  public error(message: unknown, ...args: unknown[]) {
    this.executeLog(message, args, true, "#FF5555");
  }

  /**
   * 터미널 콘솔 출력 없이 디버그 UI(Renderer)에만 로그를 보냅니다.
   * 사용 예: logger.silent().log("메시지");
   */
  public silent() {
    return {
      log: (message: unknown, ...args: unknown[]) =>
        this.executeLog(message, args, false, undefined, true),
      info: (message: unknown, ...args: unknown[]) =>
        this.executeLog(message, args, false, undefined, true),
      warn: (message: unknown, ...args: unknown[]) =>
        this.executeLog(message, args, false, "#FFB86C", true),
      error: (message: unknown, ...args: unknown[]) =>
        this.executeLog(message, args, true, "#FF5555", true),
    };
  }

  private executeLog(
    message: unknown,
    args: unknown[],
    isError: boolean,
    overrideTextColor?: string,
    forceNoTerminal?: boolean,
  ) {
    const content = this.formatMessage(message, args);

    // 1. Console Output (Local Terminal or Developer Tools)
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${this.type}]`;

    if (this.useConsole && !forceNoTerminal) {
      if (isError) {
        console.error(prefix, message, ...args);
      } else {
        console.log(prefix, message, ...args);
      }
    }

    // 2. Debug Console Sync (Process-specific implementation)
    // We send a simplified version of the message to the debug console
    this.emit(content, isError, overrideTextColor || this.textColor);
  }

  private formatMessage(message: unknown, args: unknown[]): string {
    let formatted =
      typeof message === "string" ? message : this.smartStringify(message);
    if (args.length > 0) {
      formatted +=
        " " +
        args
          .map((arg) =>
            typeof arg === "string" ? arg : this.smartStringify(arg),
          )
          .join(" ");
    }
    return formatted;
  }

  private smartStringify(val: unknown, maxLength = 80): string {
    const seen = new WeakSet();
    const process = (v: unknown, level: number): string => {
      if (typeof v !== "object" || v === null) {
        return typeof v === "bigint" ? v.toString() : JSON.stringify(v);
      }
      if (seen.has(v as object)) return '"[Circular]"';
      seen.add(v as object);
      try {
        const compact = JSON.stringify(v, (_k, val) =>
          typeof val === "bigint" ? val.toString() : val,
        );
        if (compact.length <= maxLength) {
          seen.delete(v as object);
          return compact;
        }
      } catch {
        /* proceed */
      }
      const indent = "  ".repeat(level + 1);
      const endIndent = "  ".repeat(level);
      let result: string;
      if (Array.isArray(v)) {
        const items = v
          .map((it) => process(it, level + 1))
          .join(`,\n${indent}`);
        result = `[\n${indent}${items}\n${endIndent}]`;
      } else {
        const entries = Object.entries(v)
          .map(([k, val]) => `${JSON.stringify(k)}: ${process(val, level + 1)}`)
          .join(`,\n${indent}`);
        result = `{\n${indent}${entries}\n${endIndent}}`;
      }
      seen.delete(v as object);
      return result;
    };
    return process(val, 0);
  }
}

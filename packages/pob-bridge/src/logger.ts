export interface PobBridgeLogger {
  log: (message: unknown, ...args: unknown[]) => void;
  warn: (message: unknown, ...args: unknown[]) => void;
  error: (message: unknown, ...args: unknown[]) => void;
}

const consoleLogger: PobBridgeLogger = {
  log: (message, ...args) => console.log(message, ...args),
  warn: (message, ...args) => console.warn(message, ...args),
  error: (message, ...args) => console.error(message, ...args),
};

let activeLogger: PobBridgeLogger = consoleLogger;

export const setPobBridgeLogger = (nextLogger?: PobBridgeLogger): void => {
  activeLogger = nextLogger ?? consoleLogger;
};

export const logger: PobBridgeLogger = {
  log: (message, ...args) => activeLogger.log(message, ...args),
  warn: (message, ...args) => activeLogger.warn(message, ...args),
  error: (message, ...args) => activeLogger.error(message, ...args),
};

import { AppContext } from "./events/types";

let globalContext: AppContext | null = null;

export const ContextProvider = {
  set: (context: AppContext) => {
    globalContext = context;
  },
  get: (): AppContext | null => {
    return globalContext;
  },
  /**
   * Throws if context is not initialized. Use only when sure context exists.
   */
  getOrThrow: (): AppContext => {
    if (!globalContext) {
      throw new Error("Global AppContext is not initialized yet.");
    }
    return globalContext;
  },
};

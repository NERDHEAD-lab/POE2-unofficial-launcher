import { logger } from "./utils/logger";

import type { FatalErrorPayload } from "../shared/types";

export interface FatalErrorRecord {
  payload: FatalErrorPayload;
  errorMessage: string;
}

export function createFatalErrorRecord(
  error: Error | unknown,
  type: string,
  occurredAt = Date.now(),
): FatalErrorRecord {
  const errorMessage =
    error instanceof Error ? error.stack || error.message : String(error);
  const errorDetails = `[${type}] ${errorMessage}`;
  const payload: FatalErrorPayload = {
    errorDetails,
    occurredAt,
  };

  logger.errorAt(occurredAt, `[Fatal] ${errorDetails}`);
  return { payload, errorMessage };
}

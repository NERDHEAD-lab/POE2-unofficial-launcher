import axios from "axios";

import { AppConfig } from "../../../shared/types";
import { SUPPORT_URLS } from "../../../shared/urls";

interface GhPagesEntry {
  version: string;
  webRoot: string;
  timestamp: number;
}

type GhPagesPayload = Partial<Record<AppConfig["activeGame"], GhPagesEntry>>;

const DEFAULT_TIMEOUT_MS = 3000;

export interface GhPagesResult {
  webRoot: string;
}

export class GhPagesError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "http"
      | "missing-game"
      | "missing-webroot"
      | "network",
  ) {
    super(message);
    this.name = "GhPagesError";
  }
}

export interface FetchGhPagesOptions {
  timeoutMs?: number;
}

export async function fetchGhPagesWebRoot(
  gameId: AppConfig["activeGame"],
  opts: FetchGhPagesOptions = {},
): Promise<GhPagesResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${SUPPORT_URLS.LATEST_VERSIONS_JSON}?t=${Date.now()}`;

  let response;
  try {
    response = await axios.get<GhPagesPayload>(url, {
      timeout: timeoutMs,
      responseType: "json",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GhPagesError(`gh-pages fetch failed: ${msg}`, "network");
  }

  if (response.status < 200 || response.status >= 300) {
    throw new GhPagesError(`gh-pages returned ${response.status}`, "http");
  }

  const entry = response.data?.[gameId];
  if (!entry) {
    throw new GhPagesError(
      `gh-pages missing entry for ${gameId}`,
      "missing-game",
    );
  }
  if (!entry.webRoot) {
    throw new GhPagesError(
      `gh-pages entry for ${gameId} has no webRoot`,
      "missing-webroot",
    );
  }

  return { webRoot: entry.webRoot };
}

import { Logger } from "./logger";
import { LogParser } from "./LogParser";
import {
  fetchGhPagesWebRoot,
  GhPagesError,
} from "./version-sources/ghPagesLatest";
import {
  fetchMasterWebRoot,
  MasterSocketError,
} from "./version-sources/masterSocket";
import { AppConfig } from "../../shared/types";

export type RemoteVersionSource = "master-socket" | "gh-pages";

export interface RemoteWebRoot {
  gameId: AppConfig["activeGame"];
  webRoot: string;
  version: string;
  source: RemoteVersionSource;
  fetchedAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const logger = new Logger({
  type: "REMOTE_VERSION",
  typeColor: "#FFB86C",
  priority: 5,
});

interface AdapterDeps {
  master: typeof fetchMasterWebRoot;
  ghPages: typeof fetchGhPagesWebRoot;
}

const defaultAdapters: AdapterDeps = {
  master: fetchMasterWebRoot,
  ghPages: fetchGhPagesWebRoot,
};

export class RemoteVersionResolver {
  private static cache = new Map<AppConfig["activeGame"], RemoteWebRoot>();
  private static inflight = new Map<
    AppConfig["activeGame"],
    Promise<RemoteWebRoot | null>
  >();
  private static adapters: AdapterDeps = defaultAdapters;

  // Test seam: inject mock adapters
  public static __setAdapters(adapters: Partial<AdapterDeps>): void {
    RemoteVersionResolver.adapters = { ...defaultAdapters, ...adapters };
  }

  public static __reset(): void {
    RemoteVersionResolver.adapters = defaultAdapters;
    RemoteVersionResolver.cache.clear();
    RemoteVersionResolver.inflight.clear();
  }

  /** Returns the last cached value regardless of TTL. */
  public static peekCache(
    gameId: AppConfig["activeGame"],
  ): RemoteWebRoot | undefined {
    return RemoteVersionResolver.cache.get(gameId);
  }

  /** Returns true if cached value is still fresh (within TTL). */
  public static isFresh(
    gameId: AppConfig["activeGame"],
    now = Date.now(),
  ): boolean {
    const cached = RemoteVersionResolver.cache.get(gameId);
    return !!cached && now - cached.fetchedAt < CACHE_TTL_MS;
  }

  /**
   * Resolves the remote webRoot for a game.
   * Uses cache if fresh. Otherwise tries master socket, then gh-pages.
   * Returns null only if all sources fail.
   */
  public static async resolve(
    gameId: AppConfig["activeGame"],
  ): Promise<RemoteWebRoot | null> {
    if (RemoteVersionResolver.isFresh(gameId)) {
      return RemoteVersionResolver.cache.get(gameId)!;
    }
    const existing = RemoteVersionResolver.inflight.get(gameId);
    if (existing) return existing;

    const task = RemoteVersionResolver.resolveUncached(gameId).finally(() => {
      RemoteVersionResolver.inflight.delete(gameId);
    });
    RemoteVersionResolver.inflight.set(gameId, task);
    return task;
  }

  private static async resolveUncached(
    gameId: AppConfig["activeGame"],
  ): Promise<RemoteWebRoot | null> {
    const { master, ghPages } = RemoteVersionResolver.adapters;

    try {
      const { webRoot } = await master(gameId);
      const entry = RemoteVersionResolver.build(
        gameId,
        webRoot,
        "master-socket",
      );
      RemoteVersionResolver.cache.set(gameId, entry);
      return entry;
    } catch (err) {
      const code = err instanceof MasterSocketError ? err.code : "unknown";
      logger.warn(
        `[${gameId}] master socket failed (${code}): ${(err as Error).message}`,
      );
    }

    try {
      const { webRoot } = await ghPages(gameId);
      const entry = RemoteVersionResolver.build(gameId, webRoot, "gh-pages");
      RemoteVersionResolver.cache.set(gameId, entry);
      return entry;
    } catch (err) {
      const code = err instanceof GhPagesError ? err.code : "unknown";
      logger.warn(
        `[${gameId}] gh-pages fallback failed (${code}): ${(err as Error).message}`,
      );
    }

    return null;
  }

  private static build(
    gameId: AppConfig["activeGame"],
    webRoot: string,
    source: RemoteVersionSource,
  ): RemoteWebRoot {
    return {
      gameId,
      webRoot,
      version: LogParser.extractVersion(webRoot),
      source,
      fetchedAt: Date.now(),
    };
  }
}

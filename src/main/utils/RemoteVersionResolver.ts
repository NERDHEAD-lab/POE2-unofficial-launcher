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
import {
  gameVersionKey,
  gameVersionContextKey,
  isKnownGameVersion,
} from "../../shared/game-version";
import { GameVersionContext, RemoteWebRootPayload } from "../../shared/types";

export type RemoteWebRoot = RemoteWebRootPayload;
const CACHE_TTL_MS = 10 * 60 * 1000;
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

/** Owns one context-bound snapshot, including failed lookups, for every consumer. */
export class RemoteVersionResolver {
  private static cache = new Map<string, RemoteWebRoot>();
  private static inflight = new Map<string, Promise<RemoteWebRoot>>();
  private static adapters: AdapterDeps = defaultAdapters;
  private static revision = 0;
  private static onUpdated: ((entry: RemoteWebRoot) => void) | null = null;

  public static setOnUpdated(callback: (entry: RemoteWebRoot) => void) {
    this.onUpdated = callback;
  }
  public static __setAdapters(adapters: Partial<AdapterDeps>): void {
    this.adapters = { ...defaultAdapters, ...adapters };
  }
  public static __reset(): void {
    this.adapters = defaultAdapters;
    this.cache.clear();
    this.inflight.clear();
    this.onUpdated = null;
    this.revision = 0;
  }
  private static key(context: GameVersionContext) {
    return gameVersionContextKey(context);
  }
  public static peekCache(
    context: GameVersionContext,
  ): RemoteWebRoot | undefined {
    return this.cache.get(this.key(context));
  }
  public static isFresh(
    context: GameVersionContext,
    now = Date.now(),
  ): boolean {
    const cached = this.peekCache(context);
    return cached?.status === "ok" && now - cached.fetchedAt < CACHE_TTL_MS;
  }
  public static async resolve(
    context: GameVersionContext,
  ): Promise<RemoteWebRoot> {
    if (this.isFresh(context)) return this.peekCache(context)!;
    return this.resolveFresh(context);
  }
  public static async resolveFresh(
    context: GameVersionContext,
  ): Promise<RemoteWebRoot> {
    // Copy before awaiting: a settings change cannot retarget an in-flight lookup.
    const fixedContext = { ...context };
    const key = this.key(fixedContext);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const task = this.resolveUncached(fixedContext)
      .then((entry) => {
        this.cache.set(key, entry);
        this.onUpdated?.(entry);
        return entry;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, task);
    return task;
  }
  private static build(
    context: GameVersionContext,
    webRoot: string,
    source: RemoteWebRoot["source"],
    sourceTimestamp: number | null,
  ): RemoteWebRoot {
    let validUrl = false;
    try {
      validUrl = ["http:", "https:"].includes(new URL(webRoot).protocol);
    } catch {
      /* invalid response */
    }
    const version = LogParser.extractVersion(webRoot);
    return {
      ...context,
      webRoot,
      version,
      source,
      sourceTimestamp,
      fetchedAt: Date.now(),
      revision: ++this.revision,
      status:
        source === "master-socket"
          ? validUrl && isKnownGameVersion(version)
            ? "ok"
            : "unknown"
          : "unavailable",
    };
  }
  private static async resolveUncached(
    context: GameVersionContext,
  ): Promise<RemoteWebRoot> {
    const { master, ghPages } = this.adapters;
    try {
      const { webRoot } = await master(context.gameId);
      // A successful server response is authoritative regardless of numeric-looking version values.
      return this.build(context, webRoot, "master-socket", null);
    } catch (err) {
      logger.warn(
        `[${gameVersionKey(context)}] master socket failed (${err instanceof MasterSocketError ? err.code : "unknown"})`,
      );
    }
    try {
      const fallback = await ghPages(context.gameId);
      // Retain fallback provenance for diagnosis. It cannot select a new automatic target.
      const entry = this.build(
        context,
        fallback.webRoot,
        "gh-pages",
        fallback.timestamp,
      );
      if (fallback.version !== entry.version) entry.status = "mismatch";
      return entry;
    } catch (err) {
      logger.warn(
        `[${gameVersionKey(context)}] gh-pages failed (${err instanceof GhPagesError ? err.code : "unknown"})`,
      );
    }
    return this.build(context, "", null, null);
  }
}

import {
  getPromotionEvents,
  isPromotionActive,
  normalizeEventPreferences,
  parsePromotionFeed,
  promotionScheduleKey,
  type PromotionDismissRequest,
  type PromotionEvent,
  type PromotionFeed,
  type PromotionSnapshot,
} from "../../shared/promotions";
import { currentStashEstimate } from "../../shared/stash-sales";

export interface PromotionCache {
  feed: PromotionFeed | null;
  /** Records expire at the campaign end, keyed by event schedule. */
  windows: Record<string, number>;
  hidden?: Record<string, number>;
}

interface Dependencies {
  load: () => PromotionCache;
  save: (cache: PromotionCache) => void;
  fetchFeed: (signal: AbortSignal) => Promise<unknown>;
  preferences: () => unknown;
  notify: (event: PromotionEvent) => Promise<boolean>;
  prune: (activeIds: Set<string>) => void;
  changed: (snapshot: PromotionSnapshot) => void;
  warn: (message: string) => void;
}

const REFRESH_MS = 60 * 60_000;

export class PromotionController {
  private cache: PromotionCache = { feed: null, windows: {} };
  private current: PromotionSnapshot = {
    revision: 0,
    events: [],
    activeEvents: [],
    upcomingEvents: [],
  };
  private running = false;
  private timer?: ReturnType<typeof setInterval>;
  private request?: AbortController;
  private lastFetch = -Infinity;
  private delivering = false;
  private retryAfter = new Map<string, { retryAt: number; end: number }>();
  private sessionHidden = new Map<string, number>();
  private cleanupPending = false;
  private cleanupRetryAt = 0;

  constructor(private readonly deps: Dependencies) {}

  init(): void {
    if (this.running) return;
    this.sessionHidden.clear();
    try {
      const saved = this.deps.load();
      this.cache = {
        feed: saved.feed ? parsePromotionFeed(saved.feed) : null,
        windows: saved.windows ?? {},
        hidden: saved.hidden ?? {},
      };
    } catch {
      this.deps.warn("이벤트 알림 캐시를 읽지 못했습니다.");
    }
    this.running = true;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    this.running = false;
    clearInterval(this.timer);
    this.request?.abort();
    this.deps.prune(new Set());
  }

  snapshot(): PromotionSnapshot {
    return this.current;
  }

  settingsChanged(): void {
    this.tick();
  }

  dismiss(request: PromotionDismissRequest): void {
    if (request.mode !== "session" && request.mode !== "schedule")
      throw new Error("Invalid dismissal mode");
    const event = getPromotionEvents(this.cache.feed).find(
      (item) =>
        promotionScheduleKey(item) === request.key && isPromotionActive(item),
    );
    if (!this.running || !event) throw new Error("Unknown active schedule");
    if (request.mode === "schedule") {
      const next = {
        ...this.cache,
        hidden: {
          ...this.cache.hidden,
          [request.key]: Date.parse(event.endsAt),
        },
      };
      this.deps.save(next);
      this.cache = next;
    } else {
      this.sessionHidden.set(request.key, Date.parse(event.endsAt));
    }
    this.tick();
  }

  wake(): void {
    this.lastFetch = -Infinity;
    this.tick();
  }

  private tick(): void {
    if (!this.running) return;
    this.expireRecords();
    const prefs = normalizeEventPreferences(this.deps.preferences());
    const schedules = [
      ...new Map(
        getPromotionEvents(this.cache.feed).map((event) => [
          promotionScheduleKey(event),
          event,
        ]),
      ).values(),
    ];
    const activeEvents = schedules.filter((event) => isPromotionActive(event));
    const upcomingEvents = schedules.filter(
      (event) => Date.parse(event.startsAt) > Date.now(),
    );
    const stashEstimate = currentStashEstimate(
      this.cache.feed?.stashSales?.nextEstimate,
    );
    const kind = (event: PromotionEvent) =>
      event.kind === "twitch-drops" ? "twitch" : "stash";
    const selected = activeEvents.filter((event) => prefs.types[kind(event)]);
    const events = prefs.channels.inApp
      ? selected.filter((event) => {
          const key = promotionScheduleKey(event);
          return !this.sessionHidden.has(key) && !this.cache.hidden?.[key];
        })
      : [];
    if (
      JSON.stringify(events) !== JSON.stringify(this.current.events) ||
      JSON.stringify(activeEvents) !==
        JSON.stringify(this.current.activeEvents) ||
      JSON.stringify(upcomingEvents) !==
        JSON.stringify(this.current.upcomingEvents) ||
      JSON.stringify(stashEstimate) !==
        JSON.stringify(this.current.stashEstimate)
    ) {
      this.current = {
        revision: this.current.revision + 1,
        events,
        activeEvents,
        upcomingEvents,
        stashEstimate,
      };
      this.deps.changed(this.current);
    }
    const windows = prefs.channels.windows ? selected : [];
    this.deps.prune(new Set(windows.map(promotionScheduleKey)));
    if (!this.delivering) void this.deliver(windows);
    if (!this.request && Date.now() - this.lastFetch >= REFRESH_MS)
      void this.refresh();
  }

  private expireRecords(): void {
    const now = Date.now();
    for (const [key, end] of this.sessionHidden)
      if (end <= now) this.sessionHidden.delete(key);
    for (const [key, retry] of this.retryAfter)
      if (retry.end <= now) this.retryAfter.delete(key);
    for (const field of ["windows", "hidden"] as const) {
      const entries = Object.entries(this.cache[field] ?? {});
      const retained = entries
        .filter(
          ([key, end]) =>
            /^[a-z0-9:-]{1,160}$/.test(key) &&
            Number.isFinite(end) &&
            end > now,
        )
        .slice(-500);
      if (retained.length !== entries.length) {
        this.cache = { ...this.cache, [field]: Object.fromEntries(retained) };
        this.cleanupPending = true;
      }
    }
    if (!this.cleanupPending || now < this.cleanupRetryAt) return;
    try {
      this.deps.save(this.cache);
      this.cleanupPending = false;
    } catch {
      // Keep expired entries out of memory even if disk cleanup needs a retry.
      this.cleanupRetryAt = now + REFRESH_MS;
      this.deps.warn("만료된 이벤트 알림 기록을 저장하지 못했습니다.");
    }
  }

  private async refresh(): Promise<void> {
    const request = new AbortController();
    this.request = request;
    this.lastFetch = Date.now();
    try {
      const feed = parsePromotionFeed(
        await this.deps.fetchFeed(request.signal),
      );
      if (!this.running || request.signal.aborted) return;
      if (
        Date.parse(feed.generatedAt) > Date.now() + 5 * 60_000 ||
        (this.cache.feed &&
          Date.parse(feed.generatedAt) <
            Date.parse(this.cache.feed.generatedAt))
      ) {
        throw new Error("Feed generation time is invalid");
      }
      const next = { ...this.cache, feed };
      this.deps.save(next);
      this.cache = next;
      this.tick();
    } catch {
      if (this.running)
        this.deps.warn(
          "이벤트 일정을 갱신하지 못해 마지막 정상 일정을 유지합니다.",
        );
    } finally {
      if (this.request === request) this.request = undefined;
    }
  }

  private async deliver(events: PromotionEvent[]): Promise<void> {
    this.delivering = true;
    try {
      for (const queued of events) {
        const event = getPromotionEvents(this.cache.feed).find(
          (item) => item.id === queued.id,
        );
        if (!event) continue;
        const key = event.kind === "twitch-drops" ? "twitch" : "stash";
        const schedule = promotionScheduleKey(event);
        const prefs = normalizeEventPreferences(this.deps.preferences());
        if (
          !this.running ||
          !isPromotionActive(event) ||
          !prefs.types[key] ||
          !prefs.channels.windows ||
          this.cache.windows[schedule] ||
          (this.retryAfter.get(schedule)?.retryAt ?? 0) > Date.now()
        )
          continue;
        const next = {
          ...this.cache,
          windows: {
            ...this.cache.windows,
            [schedule]: Date.parse(event.endsAt),
          },
        };
        try {
          // At-most-once on uncertain delivery: persist before invoking the native API.
          this.deps.save(next);
          this.cache = next;
          const delivered = await this.deps.notify(event);
          if (!delivered && this.running) {
            const windows = { ...this.cache.windows };
            delete windows[schedule];
            const retry = { ...this.cache, windows };
            this.deps.save(retry);
            this.cache = retry;
            this.retryAfter.set(schedule, {
              retryAt: Date.now() + REFRESH_MS,
              end: Date.parse(event.endsAt),
            });
          }
        } catch {
          this.retryAfter.set(schedule, {
            retryAt: Date.now() + REFRESH_MS,
            end: Date.parse(event.endsAt),
          });
          this.deps.warn("이벤트 알림을 저장하거나 전달하지 못했습니다.");
        }
      }
    } finally {
      this.delivering = false;
    }
  }
}

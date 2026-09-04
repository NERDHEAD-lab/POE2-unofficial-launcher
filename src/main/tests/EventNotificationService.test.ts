import { afterEach, describe, expect, it, vi } from "vitest";

import { promotionScheduleKey } from "../../shared/promotions";
import { STASH_API_URLS } from "../../shared/stash-sales";
import {
  stashSection,
  stashObservations,
  observedStashPeriod,
} from "../../shared/test-fixtures/stash-sales";
import { EventNotificationService } from "../services/EventNotificationService";

import type { AppContext } from "../events/types";
import type { PromotionCache } from "../services/PromotionController";

const mocks = vi.hoisted(() => ({
  instances: [] as {
    emit: (name: string) => void;
    close: ReturnType<typeof vi.fn>;
  }[],
  cache: { feed: null, windows: {} } as PromotionCache,
  supported: true,
  delivery: "show",
  on: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeNotification extends EventEmitter {
    constructor() {
      super();
      mocks.instances.push(this);
    }
    static isSupported() {
      return mocks.supported;
    }
    show() {
      this.emit(mocks.delivery);
    }
    close = vi.fn(() => {
      this.emit("close");
    });
  }
  return {
    Notification: FakeNotification,
    powerMonitor: { on: mocks.on, removeListener: mocks.remove },
  };
});
vi.mock("electron-store", () => ({
  default: class {
    get store() {
      return mocks.cache;
    }
    set store(value: PromotionCache) {
      mocks.cache = value;
    }
  },
}));
vi.mock("axios", () => ({
  default: { get: vi.fn(async () => ({ data: mocks.cache.feed })) },
}));
vi.mock("../utils/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../events/EventBus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("../../shared/urls", () => ({
  SUPPORT_URLS: { PROMOTIONS_JSON: "https://example.test/promotions.json" },
}));

describe.skipIf(process.platform !== "win32")(
  "Windows notification lifetime",
  () => {
    it("closes an already delivered toast when one shop is revoked without resetting its ledger", async () => {
      vi.useFakeTimers();
      vi.setSystemTime("2026-09-04T00:10:00Z");
      const first = {
        ...stashSection.observations[0],
        confirmedPeriod: observedStashPeriod,
      };
      const second = {
        ...first,
        service: "ggg" as const,
        sourceUrl: STASH_API_URLS["ggg:poe2"],
      };
      mocks.cache = {
        windows: {},
        feed: {
          schemaVersion: 1,
          generatedAt: "2026-09-04T00:00:00Z",
          events: [],
          stashSales: {
            ...stashSection,
            observations: stashObservations(first, second),
          },
        },
      };
      const service = new EventNotificationService({
        getConfig: () => ({ channels: { inApp: true, windows: true } }),
      } as unknown as AppContext);
      service.init();
      await vi.advanceTimersByTimeAsync(1);
      const toast = mocks.instances[0];
      expect(toast).toBeDefined();
      const ledger = { ...mocks.cache.windows };
      mocks.cache.feed!.stashSales!.observations = stashObservations(first, {
        ...second,
        confirmedPeriod: null,
      });
      await vi.advanceTimersByTimeAsync(3600_000);
      expect(toast.close).toHaveBeenCalledOnce();
      expect(mocks.instances).toHaveLength(1);
      expect(mocks.cache.windows).toEqual(ledger);
      expect(service.snapshot().events[0].targets).toEqual([
        { service: "kakao", game: "poe2" },
      ]);
      service.stop();
    });
    afterEach(() => {
      vi.useRealTimers();
      mocks.instances.length = 0;
      mocks.supported = true;
      mocks.delivery = "show";
    });
    it("retains timed-out banners until expiry and unregisters resume on stop", async () => {
      vi.useFakeTimers();
      vi.setSystemTime("2026-09-04T00:00:00Z");
      mocks.cache = {
        windows: {},
        feed: {
          schemaVersion: 1,
          generatedAt: "2026-09-04T00:00:00Z",
          events: [
            {
              id: "ggg-1-twitch",
              kind: "twitch-drops",
              game: "poe1",
              startsAt: "2026-09-03T00:00:00Z",
              endsAt: "2026-09-04T00:00:02Z",
              sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
              precision: "exact",
            },
          ],
        },
      };
      const service = new EventNotificationService({
        getConfig: () => ({ channels: { inApp: true, windows: true } }),
      } as unknown as AppContext);
      service.init();
      await vi.advanceTimersByTimeAsync(1);
      const toast = mocks.instances[0];
      expect(toast).toBeDefined();
      toast.emit("close"); // Windows banner timeout; Action Center entry still exists.
      expect(toast.close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(toast.close).toHaveBeenCalledOnce();
      service.stop();
      expect(mocks.remove).toHaveBeenCalledWith("resume", expect.any(Function));
    });

    const setupDelivery = () => {
      vi.useFakeTimers();
      vi.setSystemTime("2026-09-04T00:00:00Z");
      mocks.cache = {
        windows: {},
        feed: {
          schemaVersion: 1,
          generatedAt: "2026-09-04T00:00:00Z",
          events: [
            {
              id: "ggg-1-twitch",
              kind: "twitch-drops",
              game: "poe1",
              startsAt: "2026-09-03T00:00:00Z",
              endsAt: "2026-09-05T00:00:00Z",
              sourceUrl: "https://www.pathofexile.com/forum/view-thread/1",
              precision: "exact",
            },
          ],
        },
      };
      return new EventNotificationService({
        getConfig: () => ({ channels: { inApp: true, windows: true } }),
      } as unknown as AppContext);
    };

    it("does not construct a toast when Windows reports notifications unsupported", async () => {
      const service = setupDelivery();
      mocks.supported = false;
      service.init();
      await vi.advanceTimersByTimeAsync(1);
      expect(mocks.instances).toHaveLength(0);
      expect(mocks.cache.windows).toEqual({});
      service.stop();
    });

    it("clears a known failed delivery and retries only after the refresh interval", async () => {
      const service = setupDelivery();
      mocks.delivery = "failed";
      service.init();
      await vi.advanceTimersByTimeAsync(5000);
      expect(mocks.instances).toHaveLength(1);
      expect(mocks.cache.windows).toEqual({});
      mocks.delivery = "show";
      await vi.advanceTimersByTimeAsync(3600_000);
      expect(mocks.instances).toHaveLength(2);
      expect(
        mocks.cache.windows[promotionScheduleKey(mocks.cache.feed!.events[0])],
      ).toBeGreaterThan(Date.now());
      service.stop();
    });
  },
);

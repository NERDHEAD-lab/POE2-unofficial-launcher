import axios from "axios";
import { Notification, powerMonitor } from "electron";
import Store from "electron-store";

import { buildPromotionToast } from "./promotion-toast";
import {
  PromotionController,
  type PromotionCache,
} from "./PromotionController";
import {
  promotionScheduleKey,
  type PromotionDismissRequest,
  type PromotionEvent,
} from "../../shared/promotions";
import { SUPPORT_URLS } from "../../shared/urls";
import { eventBus } from "../events/EventBus";
import { EventType, type AppContext, type IService } from "../events/types";
import { logger } from "../utils/logger";

export class EventNotificationService implements IService {
  readonly id = "EventNotificationService";
  private readonly controller: PromotionController;
  private readonly notifications = new Map<
    string,
    { notification: Notification; targets: string[] }
  >();
  private readonly resume = () => this.controller.wake();

  constructor(context: AppContext) {
    const store = new Store<PromotionCache>({
      name: "event-notifications",
      defaults: { feed: null, windows: {} },
    });
    this.controller = new PromotionController({
      load: () => store.store,
      save: (value) => {
        store.store = value;
      },
      preferences: () => context.getConfig("eventNotifications"),
      fetchFeed: async (signal) =>
        (
          await axios.get(SUPPORT_URLS.PROMOTIONS_JSON, {
            signal,
            timeout: 15_000,
            maxContentLength: 256 * 1024,
            headers: { Accept: "application/json" },
          })
        ).data,
      changed: (snapshot) => {
        void eventBus.emit(EventType.PROMOTIONS_UPDATED, context, snapshot);
      },
      warn: (message) => logger.warn(`[EventNotificationService] ${message}`),
      notify: (event) => this.notify(event),
      prune: (active) => {
        const currentTargets = new Map(
          this.controller
            .snapshot()
            .activeEvents.map((event) => [
              promotionScheduleKey(event),
              new Set(
                event.targets?.map(
                  (target) => `${target.service}:${target.game}`,
                ),
              ),
            ]),
        );
        for (const [id, { notification, targets }] of this.notifications) {
          const revoked = targets.some(
            (target) => !currentTargets.get(id)?.has(target),
          );
          if (!active.has(id) || revoked) {
            notification.close();
            this.notifications.delete(id);
          }
        }
      },
    });
  }

  init(): void {
    powerMonitor.on("resume", this.resume);
    this.controller.init();
  }
  stop(): void {
    powerMonitor.removeListener("resume", this.resume);
    this.controller.stop();
  }
  snapshot() {
    return this.controller.snapshot();
  }
  settingsChanged(): void {
    this.controller.settingsChanged();
  }

  dismiss(request: PromotionDismissRequest): void {
    this.controller.dismiss(request);
  }

  private notify(event: PromotionEvent): Promise<boolean> {
    if (process.platform !== "win32" || !Notification.isSupported())
      return Promise.resolve(false);
    return new Promise((resolve) => {
      const notification = new Notification({
        toastXml: buildPromotionToast(event),
      });
      const key = promotionScheduleKey(event);
      this.notifications.set(key, {
        notification,
        targets:
          event.targets?.map((target) => `${target.service}:${target.game}`) ??
          [],
      });
      // A missing callback is uncertain, not proof that the OS rejected delivery.
      const timer = setTimeout(() => resolve(true), 5000);
      notification.once("show", () => {
        clearTimeout(timer);
        resolve(true);
      });
      notification.once("failed", () => {
        clearTimeout(timer);
        this.notifications.delete(key);
        logger.warn(
          "[EventNotificationService] Windows 알림을 표시하지 못했습니다.",
        );
        resolve(false);
      });
      // Windows emits "close" when only the banner times out. Keep the object
      // so expiry/settings changes can also remove its Action Center entry.
      notification.show();
    });
  }
}

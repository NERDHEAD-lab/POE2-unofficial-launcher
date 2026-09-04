import { useEffect, useState } from "react";

import {
  isPromotionActive,
  type PromotionSnapshot,
} from "../../shared/promotions";
import { currentStashEstimate } from "../../shared/stash-sales";

function usePromotionSnapshot() {
  const [snapshot, setSnapshot] = useState<PromotionSnapshot>({
    revision: -1,
    events: [],
    activeEvents: [],
    upcomingEvents: [],
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let active = true;
    const accept = (next: PromotionSnapshot) => {
      if (active) {
        setNow(Date.now());
        setSnapshot((previous) =>
          next.revision >= previous.revision ? next : previous,
        );
      }
    };
    const unsubscribe = window.electronAPI?.onPromotionsUpdated?.(accept);
    window.electronAPI
      ?.getPromotions?.()
      .then(accept)
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const hasSchedules = !!(
    snapshot.events.length ||
    snapshot.activeEvents.length ||
    snapshot.upcomingEvents.length ||
    snapshot.stashEstimate
  );
  useEffect(() => {
    if (!hasSchedules) return;
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [hasSchedules]);
  return { snapshot, now };
}

export function usePromotions(
  scope: "notifications" | "schedule" = "notifications",
) {
  const { snapshot, now } = usePromotionSnapshot();
  const events =
    scope === "schedule"
      ? [...snapshot.activeEvents, ...snapshot.upcomingEvents]
      : snapshot.events;
  return events.filter((event) =>
    scope === "schedule"
      ? now < Date.parse(event.endsAt)
      : isPromotionActive(event, now),
  );
}

export function usePromotionSchedule() {
  const { snapshot, now } = usePromotionSnapshot();
  return {
    events: [...snapshot.activeEvents, ...snapshot.upcomingEvents].filter(
      (event) => now < Date.parse(event.endsAt),
    ),
    stashEstimate: currentStashEstimate(snapshot.stashEstimate, now),
  };
}

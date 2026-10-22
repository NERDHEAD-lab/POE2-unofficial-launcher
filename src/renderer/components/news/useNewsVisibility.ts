import { useLayoutEffect, type RefObject } from "react";

import type { NewsSource, NewsViewSnapshot } from "../../../shared/types";

/** Reports only titles intersecting the actual list scrollport. Main owns all
 * read state and rejects late activation/selection reports. */
export function useNewsVisibility(
  listRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  view: NewsViewSnapshot | undefined,
  source: NewsSource | undefined,
) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (
      !enabled ||
      !list ||
      !view?.active ||
      !source ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    let cancelled = false;
    const reported = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        if (cancelled || document.visibilityState !== "visible") return;
        const ids = entries
          .filter(
            (entry) =>
              entry.isIntersecting &&
              entry.intersectionRect.width > 0 &&
              entry.intersectionRect.height > 0,
          )
          .map((entry) => (entry.target as HTMLElement).dataset.newsTitleId)
          .filter((id): id is string => !!id && !reported.has(id));
        if (!ids.length) return;
        ids.forEach((id) => reported.add(id));
        void window.electronAPI.reportNewsDisplayed({
          ...source,
          generation: view.generation,
          selectionRevision: view.selectionRevision,
          ids,
        });
      },
      { root: list, threshold: 0 },
    );
    list
      .querySelectorAll("[data-news-title-id]")
      .forEach((title) => observer.observe(title));
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [listRef, enabled, view, source]);
}

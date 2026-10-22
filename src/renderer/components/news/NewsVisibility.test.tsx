import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NewsDashboard from "./NewsDashboard";
import NewsSection from "./NewsSection";

import type { NewsViewSnapshot } from "../../../shared/types";

type Observer = {
  callback: IntersectionObserverCallback;
  targets: Element[];
  disconnected: boolean;
};
const source = { game: "POE2", service: "GGG", category: "notice" } as const;
const view: NewsViewSnapshot = {
  ...source,
  generation: 4,
  selectionRevision: 7,
  revision: 10,
  active: true,
  notices: ["visible", "outside"].map((id) => ({
    id,
    title: id,
    link: "https://example.com/" + id,
    date: "today",
    type: "notice",
    isNew: true,
  })),
  patchNotes: [],
};

describe("news title display reports", () => {
  let root: Root;
  let container: HTMLDivElement;
  let observers: Observer[];
  const report = vi.fn().mockResolvedValue(true);
  const send = (observer: Observer, visible: boolean) =>
    observer.callback(
      observer.targets.map((target) => ({
        target,
        isIntersecting: visible && target.textContent?.includes("visible"),
        intersectionRect: {
          width: visible ? 100 : 0,
          height: visible ? 20 : 0,
        },
      })) as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
  const render = (enabled: boolean, snapshot = view) =>
    act(async () => {
      root.render(
        <NewsSection
          title="공지사항"
          items={snapshot.notices}
          forumUrl=""
          openMode="modal"
          onRead={vi.fn()}
          visibilityEnabled={enabled}
          newsView={snapshot}
          source={source}
        />,
      );
    });

  beforeEach(() => {
    observers = [];
    report.mockClear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        state: Observer;
        constructor(callback: IntersectionObserverCallback) {
          this.state = { callback, targets: [], disconnected: false };
          observers.push(this.state);
        }
        observe(target: Element) {
          this.state.targets.push(target);
        }
        disconnect() {
          this.state.disconnected = true;
        }
      },
    );
    window.electronAPI = {
      reportNewsDisplayed: report,
    } as unknown as typeof window.electronAPI;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("reports only a title intersecting the scrollport, and drops a late observer report after a modal blocks it", async () => {
    await render(true);
    const observer = observers[0];
    send(observer, false);
    expect(report).not.toHaveBeenCalled();
    send(observer, true);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        ...source,
        generation: 4,
        selectionRevision: 7,
        ids: ["visible"],
      }),
    );
    report.mockClear();
    await render(false);
    expect(observer.disconnected).toBe(true);
    send(observer, true);
    expect(report).not.toHaveBeenCalled();
  });

  it("does not observe inactive or loading views, and begins observing after that barrier clears", async () => {
    await render(true, { ...view, active: false });
    expect(observers).toHaveLength(0);
    await render(false);
    expect(observers).toHaveLength(0);
    await render(true);
    send(observers[0], true);
    expect(report).toHaveBeenCalledOnce();
  });

  it("keeps the newest Main snapshot when cache requests return in reverse order", async () => {
    const pending: Array<(value: NewsViewSnapshot) => void> = [];
    let updated = () => {};
    window.electronAPI = {
      reportNewsDisplayed: report,
      getNewsView: vi.fn(
        () => new Promise<NewsViewSnapshot>((resolve) => pending.push(resolve)),
      ),
      getNews: vi.fn(() => new Promise(() => {})),
      onNewsUpdated: vi.fn((callback) => {
        updated = callback;
        return () => {};
      }),
    } as unknown as typeof window.electronAPI;
    await act(async () =>
      root.render(
        <NewsDashboard
          activeGame="POE2"
          serviceChannel="GGG"
          openMode="modal"
        />,
      ),
    );
    await act(async () => {
      updated();
    });
    await act(async () => {
      pending[1]({
        ...view,
        revision: 12,
        notices: [{ ...view.notices[0], title: "new snapshot" }],
      });
    });
    await act(async () => {
      pending[0]({
        ...view,
        revision: 11,
        notices: [{ ...view.notices[0], title: "stale snapshot" }],
      });
    });
    expect(container.textContent).toContain("new snapshot");
    expect(container.textContent).not.toContain("stale snapshot");
  });
});

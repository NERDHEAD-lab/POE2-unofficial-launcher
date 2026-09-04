import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EventNotificationModal from "./EventNotificationModal";
import { normalizeEventPreferences } from "../../../shared/promotions";

describe("event settings confirmation", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  const click = async (selector: string) => {
    const element = container.querySelector<HTMLElement>(selector);
    expect(element).not.toBeNull();
    await act(async () => element!.click());
  };
  const mount = async (onSave = vi.fn(async () => {}), onClose = vi.fn()) => {
    await act(async () =>
      root.render(
        <EventNotificationModal
          preferences={normalizeEventPreferences(undefined)}
          onSave={onSave}
          onClose={onClose}
        />,
      ),
    );
    return { onSave, onClose };
  };

  it("cancels without saving draft type or channel changes", async () => {
    const { onSave, onClose } = await mount();
    await click("input");
    await click(".event-notification-cancel");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("waits for confirmation to persist and blocks dismissal while saving", async () => {
    let finish!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { onClose } = await mount(onSave);
    await click("input");
    await click(".event-notification-confirm");
    expect(onSave).toHaveBeenCalledWith({
      types: { twitch: false, stash: true },
      channels: { inApp: true, windows: false },
    });
    await click(".event-notification-confirm");
    await click(".event-notification-cancel");
    await click(".event-notification-close");
    await click(".event-notification-overlay");
    await act(async () =>
      container
        .querySelector('[role="dialog"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("preserves the draft after a save failure and allows retry", async () => {
    const onSave = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new Error("write failed"));
    const { onClose } = await mount(onSave);
    await click("input");
    await click(".event-notification-confirm");
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "저장하지 못했습니다",
    );
    expect(container.querySelector<HTMLInputElement>("input")?.checked).toBe(
      false,
    );
    await click(".event-notification-confirm");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[1]).toEqual(onSave.mock.calls[0]);
  });
});

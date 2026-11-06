import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EventNotificationModal from "./EventNotificationModal";
import {
  normalizeEventPreferences,
  type EventNotificationPreferences,
} from "../../../shared/promotions";

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
  const mount = async (
    onSave = vi.fn(async (_preferences: EventNotificationPreferences) => {}),
    onClose = vi.fn(),
    preferences = normalizeEventPreferences(undefined),
  ) => {
    await act(async () =>
      root.render(
        <EventNotificationModal
          preferences={preferences}
          onSave={onSave}
          onClose={onClose}
        />,
      ),
    );
    return { onSave, onClose };
  };
  const toggle = async (label: string) => {
    const control = [...container.querySelectorAll("label")]
      .find((item) => item.textContent?.trim() === label)
      ?.querySelector("input");
    expect(control).toBeDefined();
    await act(async () => control!.click());
  };
  const setCustom = async (value: string, unit: string) => {
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>(
        '[aria-label="직접 입력 시간"]',
      )!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const select = container.querySelector<HTMLSelectElement>("select")!;
      select.value = unit;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  it("cancels without saving draft type or channel changes", async () => {
    const { onSave, onClose } = await mount();
    await click("input");
    await toggle("30분 전");
    await toggle("직접 입력");
    await setCustom("15", "second");
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
      reminders: {
        presets: [],
        custom: { enabled: false, value: 30, unit: "minute" },
      },
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
    await toggle("하루 전");
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

  it("saves multiple presets plus numeric custom units and leaves Windows opt-in unchanged", async () => {
    const { onSave } = await mount();
    await toggle("30분 전");
    await toggle("1시간 전");
    await toggle("하루 전");
    await toggle("직접 입력");
    await setCustom("1.5", "hour");
    await click(".event-notification-confirm");
    expect(onSave).toHaveBeenCalledWith({
      types: { twitch: true, stash: true },
      channels: { inApp: true, windows: false },
      reminders: {
        presets: [1800, 3600, 86400],
        custom: { enabled: true, value: 1.5, unit: "hour" },
      },
    });
    const saved = onSave.mock.calls[0][0];
    await act(async () => root.render(null));
    await mount(
      vi.fn(async () => {}),
      vi.fn(),
      saved,
    );
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="직접 입력 시간"]')
        ?.value,
    ).toBe("1.5");
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe(
      "hour",
    );
  });

  it("keeps invalid custom drafts unsaved until a valid positive integer is entered", async () => {
    const { onSave, onClose } = await mount();
    await toggle("직접 입력");
    for (const value of ["", "0", "0.5", "9007199254740991"]) {
      await setCustom(value, "second");
      await click(".event-notification-confirm");
      expect(onSave).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "정수여야 합니다",
      );
    }
    await setCustom("120", "second");
    await click(".event-notification-confirm");
    expect(onSave).toHaveBeenCalledOnce();
  });
});

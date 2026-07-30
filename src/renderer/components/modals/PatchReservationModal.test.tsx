import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PatchReservationModal } from "./PatchReservationModal";

import type {
  AppConfig,
  PatchReservation,
  RenewedPatchReservation,
  RenewedPatchReservationCommandResult,
  RenewedPatchReservationInput,
} from "../../../shared/types";

const buttonByText = (container: HTMLElement, text: string) => {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button as HTMLButtonElement;
};

const timePartAriaLabel: Record<string, string> = {
  YYYY: "연도",
  MM: "월",
  DD: "일",
  HH: "시",
  mm: "분",
};

const findTimeSelectTrigger = (
  container: HTMLElement,
  label: string,
  partLabel: string,
) =>
  [...container.querySelectorAll<HTMLElement>(".time-select-trigger")].find(
    (candidate) =>
      candidate
        .getAttribute("aria-label")
        ?.startsWith(`${label} ${partLabel}, 현재 값 `),
  );

const setInlinePart = async (
  container: HTMLElement,
  label: string,
  caption: string,
  value: string,
) => {
  const partLabel = timePartAriaLabel[caption];
  const trigger = findTimeSelectTrigger(container, label, partLabel);
  if (!trigger) throw new Error(`TimeSelect not found: ${label} ${caption}`);
  await act(async () => trigger.click());
  const openTrigger = findTimeSelectTrigger(container, label, partLabel);
  const item = [
    ...(openTrigger?.parentElement?.querySelectorAll<HTMLElement>(
      ".time-select-item",
    ) ?? []),
  ].find((candidate) => candidate.textContent?.trim() === value);
  if (!item) {
    const available = [
      ...(openTrigger?.parentElement?.querySelectorAll<HTMLElement>(
        ".time-select-item",
      ) ?? []),
    ].map((candidate) => candidate.textContent?.trim());
    throw new Error(
      `TimeSelect value not found: ${label} ${caption} ${value}; available=${available.join(",")}`,
    );
  }
  await act(async () => item.click());
};

const setInlineDateTime = async (
  container: HTMLElement,
  label: string,
  date: Date,
  time: string,
) => {
  const [hour, minute] = time.split(":");
  for (const [caption, partValue] of [
    ["YYYY", String(date.getFullYear())],
    ["MM", String(date.getMonth() + 1).padStart(2, "0")],
    ["DD", String(date.getDate()).padStart(2, "0")],
    ["HH", hour],
    ["mm", minute],
  ] as const) {
    await setInlinePart(container, label, caption, partValue);
  }
};

const setInputValue = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("PatchReservationModal renewed controls", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onAddRenewed = vi.fn(
    async (
      _reservation: RenewedPatchReservationInput,
    ): Promise<RenewedPatchReservationCommandResult> => ({ ok: true }),
  );
  const onDeleteRenewed = vi.fn(
    async (_id: string): Promise<RenewedPatchReservationCommandResult> => ({
      ok: true,
    }),
  );
  const onAddLegacy = vi.fn();

  const renderModal = async (
    renewedReservations: RenewedPatchReservation[] = [],
    reservations: PatchReservation[] = [],
    isOpen = true,
    launcherConfigOverrides: Partial<AppConfig> = {},
  ) => {
    await act(async () => {
      root.render(
        <PatchReservationModal
          isOpen={isOpen}
          reservations={reservations}
          renewedReservations={renewedReservations}
          activeGame="POE1"
          activeService="Kakao Games"
          silentNotification
          terminateAfterPatch={false}
          onSilentToggle={vi.fn()}
          onTerminateAfterPatchToggle={vi.fn()}
          onAdd={onAddLegacy}
          onDelete={vi.fn()}
          onAddRenewed={onAddRenewed}
          onDeleteRenewed={onDeleteRenewed}
          onClose={vi.fn()}
          launcherConfig={{
            autoLaunch: true,
            closeAction: "minimize",
            autoFixPatchError: true,
            skipDaumGameStarterUac: true,
            serviceChannel: "Kakao Games",
            ...launcherConfigOverrides,
          }}
        />,
      );
    });
    await act(async () => {
      if (vi.isFakeTimers()) {
        await vi.advanceTimersByTimeAsync(0);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("centers the selected time option when opened and keeps arrow changes visible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 30, 12, 30, 15, 100));
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("time-select-item")
          ? Number(this.textContent?.trim()) * 24
          : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(24);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("time-select-list") ? 168 : 0;
      },
    );
    await renderModal();

    const minuteTrigger = findTimeSelectTrigger(container, "확인 시각", "분");
    expect(minuteTrigger?.textContent).toBe("30");
    await act(async () => minuteTrigger?.click());

    const listbox =
      minuteTrigger?.parentElement?.querySelector<HTMLElement>(
        ".time-select-list",
      );
    let selectedOption = listbox?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    expect(selectedOption?.textContent).toBe("30");
    expect(listbox?.scrollTop).toBe(648);
    expect(minuteTrigger?.getAttribute("aria-activedescendant")).toBe(
      selectedOption?.id,
    );

    await act(async () => {
      minuteTrigger?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
        }),
      );
    });

    selectedOption = listbox?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    expect(selectedOption?.textContent).toBe("31");
    expect(listbox?.scrollTop).toBe(672);
    expect(minuteTrigger?.getAttribute("aria-activedescendant")).toBe(
      selectedOption?.id,
    );
  });

  it("defaults to the compact renewed switch and keeps both reservation types in the shared list", async () => {
    await renderModal(
      [
        {
          id: "renewed-shared",
          gameId: "POE2",
          serviceId: "GGG",
          createdAt: "2099-07-25T00:00:00.000Z",
          schedule: {
            kind: "daily",
            localTime: "07:30:00",
          },
          action: { kind: "notify", onlyNewVersion: true },
        },
      ],
      [
        {
          id: "legacy-shared",
          gameId: "POE1",
          serviceId: "Kakao Games",
          createdAt: "2099-07-24T00:00:00.000Z",
          targetTime: "2099-07-25T01:00:00.000Z",
        },
      ],
    );

    const switchGroup = container.querySelector<HTMLElement>(
      '.reservation-mode-switch[aria-label="예약 방식"]',
    );
    expect(switchGroup).not.toBeNull();
    expect(
      switchGroup?.querySelector('button[aria-pressed="true"]')?.textContent,
    ).toBe("리뉴얼");
    expect(container.textContent).toContain("확인 주기");
    expect(container.querySelector(".patch-workspace")).not.toBeNull();
    expect(container.textContent).toContain("현재 예약 목록");
    const actionGroup = [
      ...container.querySelectorAll<HTMLElement>(".form-group"),
    ].find(
      (group) =>
        group.querySelector("label")?.textContent === "업데이트 감지 후",
    );
    const actionButtons = [
      ...(actionGroup?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    expect(actionButtons.map((button) => button.textContent?.trim())).toEqual([
      "자동 업데이트",
      "알림만",
    ]);
    expect(
      actionButtons.find((button) => button.classList.contains("selected"))
        ?.textContent,
    ).toBe("자동 업데이트");
    expect(container.textContent).toContain("업데이트 완료 후 게임 실행");
    expect(
      container.querySelector(".reservation-list-section .count")?.textContent,
    ).toBe("2개");
    expect(container.textContent).toContain("매일 · 07:30 · 알림만");
    expect(
      container.querySelector('[aria-label="레거시 예약 삭제"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="리뉴얼 예약 삭제"]'),
    ).not.toBeNull();

    await act(async () => buttonByText(container, "레거시").click());
    expect(container.textContent).toContain("예약 시간");
    expect(
      container.querySelector('[aria-label="레거시 예약 삭제"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="리뉴얼 예약 삭제"]'),
    ).not.toBeNull();
    const legacyYear = findTimeSelectTrigger(container, "예약 시간", "연도");
    expect(legacyYear?.getAttribute("aria-label")).toBe(
      `예약 시간 연도, 현재 값 ${legacyYear?.textContent}`,
    );
  });

  it("reports a blocking stability check from an actionable unavailable button", async () => {
    await renderModal([], [], true, {
      skipDaumGameStarterUac: false,
    });
    await act(async () => buttonByText(container, "자동 업데이트").click());

    const addButton = container.querySelector<HTMLButtonElement>(
      ".btn-add-reservation",
    );
    const expectedReason =
      "현재 설정으로는 예약 패치가 불가능합니다. '확인 필요' 항목을 해결해주세요.";
    expect(addButton?.disabled).toBe(false);
    expect(addButton?.getAttribute("aria-disabled")).toBe("true");
    expect(addButton?.classList.contains("is-disabled")).toBe(true);
    expect(addButton?.title).toBe(expectedReason);

    await act(async () => addButton?.click());
    expect(container.textContent).toContain(expectedReason);
    expect(onAddRenewed).not.toHaveBeenCalled();
  });

  it("reports the legacy current-minute reason without submitting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 12, 30, 15, 100));
    await renderModal();
    await act(async () => buttonByText(container, "레거시").click());

    const addButton = container.querySelector<HTMLButtonElement>(
      ".btn-add-reservation",
    );
    const expectedReason =
      "현재 시간으로는 예약할 수 없습니다. 시간을 다시 설정해주세요.";
    expect(addButton?.disabled).toBe(false);
    expect(addButton?.getAttribute("aria-disabled")).toBe("true");
    expect(addButton?.classList.contains("is-disabled")).toBe(true);
    expect(addButton?.title).toBe(expectedReason);

    await act(async () => addButton?.click());
    expect(container.textContent).toContain(expectedReason);
    expect(onAddLegacy).not.toHaveBeenCalled();
  });

  it("derives the range end from hours and keeps the custom 180/181 warning accessible", async () => {
    await renderModal();
    await act(async () => buttonByText(container, "리뉴얼").click());

    expect(container.textContent).toContain("확인 방식");
    expect(container.textContent).not.toContain("확인 간격");
    expect(container.querySelector(".renewed-time-fields.once")).not.toBeNull();
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(container.querySelector('input[type="time"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="확인 시각 날짜와 시각"]'),
    ).not.toBeNull();
    for (const caption of ["YYYY", "MM", "DD", "HH", "mm"]) {
      expect(
        findTimeSelectTrigger(
          container,
          "확인 시각",
          timePartAriaLabel[caption],
        ),
      ).toBeDefined();
    }
    expect(findTimeSelectTrigger(container, "확인 시각", "초")).toBeUndefined();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("24H");

    const hourTrigger = findTimeSelectTrigger(container, "확인 시각", "시")!;
    expect(hourTrigger.getAttribute("aria-label")).toBe(
      `확인 시각 시, 현재 값 ${hourTrigger.textContent}`,
    );
    hourTrigger.focus();
    await act(async () => {
      hourTrigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(hourTrigger.getAttribute("aria-expanded")).toBe("true");
    const listboxId = hourTrigger.getAttribute("aria-controls");
    const selectedOption =
      hourTrigger.parentElement?.querySelector<HTMLElement>(
        '[role="option"][aria-selected="true"]',
      );
    expect(listboxId).not.toBeNull();
    expect(document.getElementById(listboxId!)).not.toBeNull();
    expect(hourTrigger.getAttribute("aria-activedescendant")).toBe(
      selectedOption?.id,
    );
    expect(
      [
        ...hourTrigger.parentElement!.querySelectorAll(".time-select-item"),
      ].some((item) => item.textContent?.trim() === "23"),
    ).toBe(true);
    await act(async () => {
      hourTrigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(hourTrigger.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      hourTrigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await act(async () => {
      hourTrigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(hourTrigger.getAttribute("aria-expanded")).toBe("false");
    const minuteTrigger = findTimeSelectTrigger(container, "확인 시각", "분")!;
    await act(async () => minuteTrigger.focus());
    expect(hourTrigger.getAttribute("aria-expanded")).toBe("false");

    await act(async () => buttonByText(container, "시간 범위").click());
    expect(
      container.querySelectorAll(".renewed-inline-date-time"),
    ).toHaveLength(1);
    const endMode = container.querySelector('[aria-label="종료 방식"]');
    expect(endMode?.textContent).toContain("시간 단위");
    expect(endMode?.textContent).toContain("사용자 지정");
    expect(endMode?.querySelector('[aria-pressed="true"]')?.textContent).toBe(
      "시간 단위",
    );
    const durationInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="예약 시간"]',
    );
    expect(durationInput?.value).toBe("1");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await setInlineDateTime(container, "시작", tomorrow, "12:00");
    await setInputValue(durationInput!, "0");
    const addButton = container.querySelector<HTMLButtonElement>(
      ".btn-add-reservation",
    );
    expect(addButton?.disabled).toBe(false);
    expect(addButton?.getAttribute("aria-disabled")).toBe("true");
    expect(addButton?.classList.contains("is-disabled")).toBe(true);
    await act(async () => addButton?.click());
    expect(container.textContent).toContain(
      "예약 시간을 1시간 이상의 정수로 입력해주세요.",
    );
    expect(onAddRenewed).not.toHaveBeenCalled();

    await setInputValue(durationInput!, "3");
    expect(addButton?.getAttribute("aria-disabled")).toBe("false");
    expect(container.textContent).toContain("예상 최대 181회");

    await act(async () => addButton?.click());
    const submittedRange = onAddRenewed.mock.calls.at(-1)?.[0];
    expect(submittedRange?.schedule.kind).toBe("once-range");
    if (submittedRange?.schedule.kind !== "once-range") {
      throw new Error("Expected a once-range reservation");
    }
    expect(
      Date.parse(submittedRange.schedule.endsAt) -
        Date.parse(submittedRange.schedule.startsAt),
    ).toBe(3 * 60 * 60_000);

    await act(async () => buttonByText(container, "사용자 지정").click());
    expect(
      container.querySelectorAll(".renewed-inline-date-time"),
    ).toHaveLength(2);
    expect(
      container
        .querySelector('[aria-label="종료 방식"]')
        ?.querySelector('[aria-pressed="true"]')?.textContent,
    ).toBe("사용자 지정");
    await setInlineDateTime(container, "종료", tomorrow, "14:59");
    expect(container.textContent).toContain("예상 최대 180회");
    expect(container.querySelector(".range-warning")).toBeNull();

    await setInlineDateTime(container, "종료", tomorrow, "15:00");
    expect(container.textContent).toContain("예상 최대 181회");

    const warning =
      container.querySelector<HTMLButtonElement>(".range-warning");
    expect(warning?.tagName).toBe("BUTTON");
    expect(warning?.tabIndex).toBe(0);
    expect(warning?.getAttribute("aria-label")).toContain(
      "반복 확인이 패치 서버에 미치는 영향이 명확하지 않으므로",
    );
    warning?.focus();
    expect(document.activeElement).toBe(warning);
  });

  it("keeps the range end at or after a moved start", async () => {
    await renderModal();
    await act(async () => buttonByText(container, "시간 범위").click());
    await act(async () => buttonByText(container, "사용자 지정").click());

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await setInlineDateTime(container, "종료", tomorrow, "14:00");
    await setInlineDateTime(container, "시작", tomorrow, "15:00");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const endHour = findTimeSelectTrigger(container, "종료", "시");
    const endMinute = findTimeSelectTrigger(container, "종료", "분");
    expect(
      Number(`${endHour?.textContent}${endMinute?.textContent}`),
    ).toBeGreaterThan(1500);
  });

  it("keeps the default one-time start on the current minute and rejects past selections", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 12, 30, 15, 100));
    await renderModal();

    const readStart = () =>
      ["연도", "월", "일", "시", "분"].map(
        (part) =>
          findTimeSelectTrigger(container, "확인 시각", part)?.textContent,
      );
    expect(readStart()).toEqual(["2026", "07", "25", "12", "30"]);

    const addButton = container.querySelector<HTMLButtonElement>(
      ".btn-add-reservation",
    );
    expect(addButton?.disabled).toBe(false);
    expect(addButton?.getAttribute("aria-disabled")).toBe("true");
    expect(addButton?.classList.contains("is-disabled")).toBe(true);
    await act(async () => addButton?.click());
    expect(container.textContent).toContain(
      "확인 시각을 현재보다 이후로 설정해주세요.",
    );
    expect(onAddRenewed).not.toHaveBeenCalled();

    await setInlinePart(container, "확인 시각", "mm", "32");
    expect(addButton?.getAttribute("aria-disabled")).toBe("false");
    expect(readStart()).toEqual(["2026", "07", "25", "12", "32"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(readStart()).toEqual(["2026", "07", "25", "12", "32"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(readStart()).toEqual(["2026", "07", "25", "12", "33"]);

    await setInlinePart(container, "확인 시각", "HH", "11");

    expect(container.textContent).toContain(
      "현재보다 과거로 설정할 수 없습니다.",
    );
    expect(readStart()).toEqual(["2026", "07", "25", "12", "33"]);
  });

  it("uses a fresh current minute when a closed modal opens across a minute boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 12, 30, 50, 100));
    await renderModal([], [], false);

    vi.setSystemTime(new Date(2026, 6, 25, 12, 31, 5, 100));
    await renderModal([], [], true);

    const readStart = () =>
      ["연도", "월", "일", "시", "분"].map(
        (part) =>
          findTimeSelectTrigger(container, "확인 시각", part)?.textContent,
      );
    expect(readStart()).toEqual(["2026", "07", "25", "12", "31"]);
  });

  it("submits launch-after-update only for a one-time automatic reservation", async () => {
    await renderModal();
    await act(async () => buttonByText(container, "리뉴얼").click());
    await act(async () => buttonByText(container, "자동 업데이트").click());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await setInlineDateTime(container, "확인 시각", tomorrow, "12:00");

    const launchCheckbox = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find((input) =>
      input.parentElement?.textContent?.includes("업데이트 완료 후 게임 실행"),
    );
    expect(launchCheckbox).toBeDefined();
    await act(async () => launchCheckbox?.click());
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".btn-add-reservation")
        ?.click(),
    );

    expect(onAddRenewed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schedule: expect.objectContaining({ kind: "once-at" }),
        action: { kind: "auto-update", launchAfterUpdate: true },
      }),
    );

    await act(async () => buttonByText(container, "매일").click());
    expect(container.textContent).not.toContain("업데이트 완료 후 게임 실행");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".btn-add-reservation")
        ?.click(),
    );
    expect(onAddRenewed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schedule: expect.objectContaining({ kind: "daily" }),
        action: { kind: "auto-update" },
      }),
    );

    await act(async () => buttonByText(container, "매주").click());
    expect(container.textContent).not.toContain("업데이트 완료 후 게임 실행");
    expect(container.querySelector('select option[value="0"]')).not.toBeNull();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".btn-add-reservation")
        ?.click(),
    );

    expect(onAddRenewed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schedule: expect.objectContaining({ kind: "weekly" }),
        action: { kind: "auto-update" },
      }),
    );
  });

  it("submits the recurring notification preference without exposing it for one-time checks", async () => {
    await renderModal();
    await act(async () => buttonByText(container, "리뉴얼").click());
    await act(async () => buttonByText(container, "알림만").click());
    await act(async () => buttonByText(container, "매일").click());

    for (const [caption, value] of [
      ["HH", "23"],
      ["mm", "58"],
    ] as const) {
      await setInlinePart(container, "확인 시각", caption, value);
    }

    const onlyNewCheckbox = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find((input) =>
      input.parentElement?.textContent?.includes("새로운 업데이트일 때만 알림"),
    );
    expect(onlyNewCheckbox?.checked).toBe(true);
    await act(async () => onlyNewCheckbox?.click());
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".btn-add-reservation")
        ?.click(),
    );

    expect(onAddRenewed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schedule: expect.objectContaining({
          kind: "daily",
          localTime: "23:58:00",
        }),
        action: { kind: "notify", onlyNewVersion: false },
      }),
    );

    await act(async () => buttonByText(container, "한 번").click());
    expect(container.textContent).not.toContain("새로운 업데이트일 때만 알림");
  });

  it("shows a failure message when a renewed reservation cannot be deleted", async () => {
    onDeleteRenewed.mockResolvedValueOnce({
      ok: false,
      reason: "not-found",
    });
    await renderModal([
      {
        id: "renewed-delete",
        gameId: "POE1",
        serviceId: "Kakao Games",
        createdAt: "2099-07-25T00:00:00.000Z",
        schedule: {
          kind: "once-at",
          at: "2099-07-25T01:00:00.000Z",
        },
        action: { kind: "notify" },
      },
    ]);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="리뉴얼 예약 삭제"]')
        ?.click();
      await Promise.resolve();
    });

    expect(onDeleteRenewed).toHaveBeenCalledWith("renewed-delete");
    expect(container.textContent).toContain(
      "리뉴얼 패치 예약을 삭제하지 못했습니다. 목록을 확인해주세요.",
    );
  });
});

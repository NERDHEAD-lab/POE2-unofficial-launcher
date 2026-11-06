import { useEffect, useRef, useState } from "react";

import {
  normalizeEventPreferences,
  EVENT_REMINDER_PRESETS,
  toReminderSeconds,
  type EventNotificationPreferences,
  type ReminderUnit,
} from "../../../shared/promotions";
import PromotionIcon from "../PromotionIcon";

import "./EventNotificationModal.css";

const GROUPS = [
  {
    id: "types",
    name: "알림 종류",
    options: [
      {
        id: "twitch",
        name: "트위치 드롭스",
        icon: <PromotionIcon kind="twitch-drops" />,
      },
      {
        id: "stash",
        name: "보관함 할인",
        icon: <PromotionIcon kind="stash-sale" />,
      },
    ],
  },
  {
    id: "channels",
    name: "알림 방식",
    options: [
      { id: "inApp", name: "앱 내 알림", icon: "notifications" },
      { id: "windows", name: "Windows 알림", icon: "desktop_windows" },
    ],
  },
] as const;

interface EventNotificationModalProps {
  onClose: () => void;
  preferences: EventNotificationPreferences;
  onSave: (preferences: EventNotificationPreferences) => Promise<void>;
}

export default function EventNotificationModal({
  onClose,
  preferences,
  onSave,
}: EventNotificationModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const [selection, setSelection] = useState(() =>
    normalizeEventPreferences(preferences),
  );
  const [saving, setSaving] = useState(false);
  const [customValue, setCustomValue] = useState(() =>
    String(selection.reminders.custom.value),
  );
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const close = () => {
    if (!savingRef.current) onClose();
  };
  const save = async () => {
    if (savingRef.current) return;
    if (
      selection.reminders.custom.enabled &&
      toReminderSeconds(
        selection.reminders.custom.value,
        selection.reminders.custom.unit,
      ) === null
    ) {
      setSaveError(
        "미리 알림 시간은 0보다 크고, 초 단위로 환산했을 때 정수여야 합니다.",
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(normalizeEventPreferences(selection));
      onClose();
    } catch {
      setSaveError("설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
    );
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="event-notification-overlay" onClick={close}>
      <div
        ref={dialogRef}
        className="event-notification-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-notification-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="event-notification-header">
          <span
            className="material-symbols-outlined event-notification-header-icon"
            aria-hidden="true"
          >
            notifications_active
          </span>
          <h2 id="event-notification-title">이벤트 알림 관리</h2>
          <button
            type="button"
            className="event-notification-close"
            aria-label="이벤트 알림 관리 닫기"
            aria-disabled={saving}
            onClick={close}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </header>
        <div className="event-notification-body custom-scrollbar">
          {GROUPS.map((group) => (
            <fieldset
              key={group.id}
              className="event-notification-group"
              disabled={saving}
            >
              <legend>{group.name}</legend>
              {group.id === "channels" && (
                <p className="event-notification-hint">
                  선택한 모든 알림 종류에 공통으로 적용됩니다.
                </p>
              )}
              <div className="event-notification-options">
                {group.options.map((option) => (
                  <label key={option.id} className="event-notification-option">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        (selection[group.id] as Record<string, boolean>)[
                          option.id
                        ],
                      )}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSaveError("");
                        setSelection((previous) => ({
                          ...previous,
                          [group.id]: {
                            ...previous[group.id],
                            [option.id]: checked,
                          },
                        }));
                      }}
                    />
                    <span
                      className={
                        typeof option.icon === "string"
                          ? "material-symbols-outlined"
                          : "event-notification-option-icon"
                      }
                      aria-hidden="true"
                    >
                      {option.icon}
                    </span>
                    <span>{option.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset className="event-notification-group" disabled={saving}>
            <legend>미리 알림</legend>
            <p className="event-notification-hint">
              시작 전에 받을 시점을 여러 개 선택할 수 있습니다. 앱이 실행 중일
              때 선택한 알림 방식으로 전달됩니다.
            </p>
            <div className="event-notification-options">
              {EVENT_REMINDER_PRESETS.map(({ seconds, label }) => (
                <label key={seconds} className="event-notification-option">
                  <input
                    type="checkbox"
                    checked={selection.reminders.presets.includes(seconds)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSaveError("");
                      setSelection((previous) => ({
                        ...previous,
                        reminders: {
                          ...previous.reminders,
                          presets: checked
                            ? [...previous.reminders.presets, seconds]
                            : previous.reminders.presets.filter(
                                (value) => value !== seconds,
                              ),
                        },
                      }));
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
              <label className="event-notification-option">
                <input
                  type="checkbox"
                  checked={selection.reminders.custom.enabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setSaveError("");
                    setSelection((previous) => ({
                      ...previous,
                      reminders: {
                        ...previous.reminders,
                        custom: { ...previous.reminders.custom, enabled },
                      },
                    }));
                  }}
                />
                <span>직접 입력</span>
              </label>
            </div>
            <div className="event-reminder-custom">
              <input
                type="number"
                min="0"
                step="any"
                aria-label="직접 입력 시간"
                disabled={!selection.reminders.custom.enabled}
                value={customValue}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomValue(value);
                  setSaveError("");
                  setSelection((previous) => ({
                    ...previous,
                    reminders: {
                      ...previous.reminders,
                      custom: {
                        ...previous.reminders.custom,
                        value: Number(value),
                      },
                    },
                  }));
                }}
              />
              <select
                aria-label="직접 입력 단위"
                disabled={!selection.reminders.custom.enabled}
                value={selection.reminders.custom.unit}
                onChange={(event) => {
                  const unit = event.target.value as ReminderUnit;
                  setSaveError("");
                  setSelection((previous) => ({
                    ...previous,
                    reminders: {
                      ...previous.reminders,
                      custom: { ...previous.reminders.custom, unit },
                    },
                  }));
                }}
              >
                <option value="day">일</option>
                <option value="hour">시간</option>
                <option value="minute">분</option>
                <option value="second">초</option>
              </select>
              <span>전</span>
            </div>
          </fieldset>
          {saveError && (
            <p className="event-notification-error" role="alert">
              {saveError}
            </p>
          )}
        </div>
        <footer className="event-notification-footer">
          <button
            type="button"
            className="event-notification-confirm"
            aria-disabled={saving}
            onClick={save}
          >
            {saving ? "저장 중…" : "확인"}
          </button>
          <button
            type="button"
            className="event-notification-cancel"
            aria-disabled={saving}
            onClick={close}
          >
            취소
          </button>
        </footer>
      </div>
    </div>
  );
}

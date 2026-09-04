import { useEffect, useRef, useState } from "react";

import {
  normalizeEventPreferences,
  type EventNotificationPreferences,
} from "../../../shared/promotions";

import "./EventNotificationModal.css";

const GROUPS = [
  {
    id: "types",
    name: "알림 종류",
    options: [
      { id: "twitch", name: "트위치 드롭스", icon: "live_tv" },
      { id: "stash", name: "보관함 할인", icon: "inventory_2" },
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
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(selection);
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
      "button:not(:disabled), input:not(:disabled)",
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
                      className="material-symbols-outlined"
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

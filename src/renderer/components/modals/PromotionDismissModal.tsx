import { useEffect, useRef, useState } from "react";

import {
  formatPromotionPeriod,
  promotionScheduleKey,
  promotionTitle,
  type PromotionEvent,
} from "../../../shared/promotions";

import "./EventNotificationModal.css";
import "./PromotionDismissModal.css";

export default function PromotionDismissModal({
  event,
  onClose,
}: {
  event: PromotionEvent;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [hideSchedule, setHideSchedule] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current
      ?.querySelector<HTMLButtonElement>(".event-notification-cancel")
      ?.focus();
    return () => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-notification-toggle], [aria-label="창 최소화"]',
        )
        ?.focus();
    };
  }, []);
  const close = () => {
    if (!pending.current) onClose();
  };
  const dismiss = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await window.electronAPI.dismissPromotion({
        key: promotionScheduleKey(event),
        mode: hideSchedule ? "schedule" : "session",
      });
      if (!result.ok) throw new Error(result.reason);
      onClose();
    } catch {
      setError("알림을 숨기지 못했습니다. 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <div
      className="event-notification-overlay promotion-dismiss-overlay"
      onClick={close}
    >
      <div
        ref={dialog}
        className="event-notification-modal promotion-dismiss-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-dismiss-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if (e.key === "Tab") {
            const items = dialog.current?.querySelectorAll<HTMLElement>(
              "button, input:not(:disabled)",
            );
            if (!items?.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className="event-notification-header">
          <h2 id="promotion-dismiss-title">알림 삭제</h2>
          <button
            type="button"
            className="event-notification-close"
            aria-label="알림 삭제 닫기"
            aria-disabled={saving}
            onClick={close}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </header>
        <div className="event-notification-body">
          <p className="promotion-dismiss-event">
            {promotionTitle(event)} 진행 중
          </p>
          <p className="promotion-dismiss-period">
            {formatPromotionPeriod(event)}
          </p>
          <label className="promotion-dismiss-remember">
            <input
              type="checkbox"
              checked={hideSchedule}
              disabled={saving}
              onChange={(e) => setHideSchedule(e.target.checked)}
            />
            <span>이번 일정 내 표시하지 않음</span>
          </label>
          {error && (
            <p className="event-notification-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="event-notification-footer">
          <button
            type="button"
            className="event-notification-confirm"
            aria-disabled={saving}
            onClick={() => void dismiss()}
          >
            {saving ? "삭제 중…" : "삭제"}
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

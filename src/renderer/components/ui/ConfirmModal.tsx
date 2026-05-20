import React from "react";
import "./ConfirmModal.css";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  timeoutSeconds?: number;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "확인",
  cancelText = "취소",
  variant = "primary",
  onConfirm,
  onCancel,
  timeoutSeconds,
}) => {
  const [timeLeft, setTimeLeft] = React.useState<number | undefined>(
    timeoutSeconds,
  );

  // Reset countdown when the modal (re)opens or the timeout prop changes.
  // Render-phase comparison avoids a cascading render from inside an effect.
  const [prevSessionKey, setPrevSessionKey] = React.useState<string>(
    `${isOpen}|${timeoutSeconds ?? ""}`,
  );
  const sessionKey = `${isOpen}|${timeoutSeconds ?? ""}`;
  if (sessionKey !== prevSessionKey) {
    setPrevSessionKey(sessionKey);
    setTimeLeft(timeoutSeconds);
  }

  React.useEffect(() => {
    if (!isOpen || timeoutSeconds === undefined) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev !== undefined && prev <= 1) {
          clearInterval(timer);
          onCancel(); // Auto-cancel on timeout
          return 0;
        }
        return prev !== undefined ? prev - 1 : undefined;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, timeoutSeconds, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div
        className={`confirm-modal-content variant-${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <h2 className="confirm-title">{title}</h2>
        </div>
        <div className="confirm-modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="confirm-modal-actions">
          <button className="btn-confirm-secondary" onClick={onCancel}>
            {cancelText}
            {timeLeft !== undefined ? ` (${timeLeft}s)` : ""}
          </button>
          <button
            className={`btn-confirm-primary btn-${variant}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

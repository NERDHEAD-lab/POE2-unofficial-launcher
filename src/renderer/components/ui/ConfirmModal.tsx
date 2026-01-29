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
}) => {
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

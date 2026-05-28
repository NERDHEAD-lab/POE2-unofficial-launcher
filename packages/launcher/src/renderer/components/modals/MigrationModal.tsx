import React from "react";
import "../ui/ConfirmModal.css"; // Reuse ConfirmModal styles for consistency

interface MigrationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const MigrationModal: React.FC<MigrationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="confirm-modal-overlay">
      <div
        className="confirm-modal-content variant-primary"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "500px" }} // Slightly wider for explanation
      >
        <div className="confirm-modal-header">
          <h2 className="confirm-title">UAC 우회 방식 업데이트</h2>
        </div>
        <div className="confirm-modal-body">
          <p className="confirm-message" style={{ whiteSpace: "pre-line" }}>
            더 이상 관리자 권한이 필요하지 않는 안정화된 방식이 적용되었습니다.
            {"\n\n"}
            기존의 불안정한 우회 설정(작업 스케줄러 등)을 정리하고 새로운
            방식으로 업데이트하시겠습니까?
            {"\n\n"}
            <span style={{ color: "#f48771", fontWeight: "bold" }}>
              * 업데이트를 하지 않을 경우, 앱 제거(언인스톨) 후에도 일부 설정이
              시스템에 잔류할 수 있습니다.
            </span>
            {"\n\n"}
            <small style={{ color: "#aaa" }}>
              * 업데이트 후에는 런처가 표준 사용자 권한으로 실행됩니다.
            </small>
          </p>
        </div>
        <div className="confirm-modal-actions">
          <button className="btn-confirm-secondary" onClick={onCancel}>
            나중에
          </button>
          <button
            className="btn-confirm-primary btn-primary"
            onClick={onConfirm}
          >
            업데이트 (권장)
          </button>
        </div>
      </div>
    </div>
  );
};

export default MigrationModal;

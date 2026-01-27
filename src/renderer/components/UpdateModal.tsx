import React from "react";
import "./UpdateModal.css";

interface UpdateModalProps {
  isOpen: boolean;
  version: string;
  onUpdate: () => void; // Click "Update Now"
  onClose: () => void; // Click "Later"
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  version,
  onUpdate,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-content">
        <h2 className="update-title">새로운 업데이트가 있습니다!</h2>
        <p className="update-message">
          새로운 버전 <strong>v{version}</strong>을 사용할 수 있습니다.
          <br />
          지금 업데이트하시겠습니까?
        </p>

        <div className="update-actions">
          <button className="btn-update-primary" onClick={onUpdate}>
            🚀 지금 업데이트
          </button>
          <button className="btn-update-secondary" onClick={onClose}>
            나중에 하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;

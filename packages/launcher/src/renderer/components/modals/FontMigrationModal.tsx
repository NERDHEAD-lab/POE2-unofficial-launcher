import React, { useState } from "react";
import "../ui/ConfirmModal.css"; // ConfirmModal 스타일 재사용 (일관성)

interface FontMigrationModalProps {
  isOpen: boolean;
  /** 재적용 실행. 성공 시 resolve, 실패 시 reject. */
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * 폰트 변조 스키마 마이그레이션 안내.
 *
 * 구버전 변조 방식으로 설치된 커스텀 폰트가 감지됐을 때 부팅 시 노출.
 * 재적용은 시간이 걸리므로 진행 중 로딩 상태를 표시한다.
 */
const FontMigrationModal: React.FC<FontMigrationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setErrorMsg("");
    setApplying(true);
    try {
      await onConfirm();
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "폰트 재설치 중 오류가 발생했습니다.",
      );
      setApplying(false);
    }
  };

  return (
    <div className="confirm-modal-overlay">
      <div
        className="confirm-modal-content variant-primary"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "500px" }}
      >
        <div className="confirm-modal-header">
          <h2 className="confirm-title">커스텀 폰트 업데이트</h2>
        </div>
        <div className="confirm-modal-body">
          {applying ? (
            <p className="confirm-message" style={{ textAlign: "center" }}>
              폰트를 수정하고 다시 설치하는 중입니다…
              {"\n\n"}
              <small style={{ color: "#aaa" }}>
                관리자 권한 요청이 표시될 수 있습니다.
              </small>
            </p>
          ) : (
            <p className="confirm-message" style={{ whiteSpace: "pre-line" }}>
              폰트 적용 방식이 개선되었습니다. 현재 설치된 커스텀 폰트는 이전
              방식으로 만들어져 게임에서 글자 크기가 어긋날 수 있습니다.
              {"\n\n"}
              지금 새 방식으로 다시 설치하시겠습니까?
              {errorMsg && (
                <>
                  {"\n\n"}
                  <span style={{ color: "#f48771", fontWeight: "bold" }}>
                    {errorMsg}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="confirm-modal-actions">
          <button
            className="btn-confirm-secondary"
            onClick={onCancel}
            disabled={applying}
          >
            나중에
          </button>
          <button
            className="btn-confirm-primary btn-primary"
            onClick={handleConfirm}
            disabled={applying}
          >
            {applying ? "적용 중…" : "지금 업데이트 (권장)"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FontMigrationModal;

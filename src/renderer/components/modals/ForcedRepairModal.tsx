import React, { useState } from "react";
import "./ForcedRepairModal.css";

interface ForcedRepairModalProps {
  isOpen: boolean;
  gameId: string;
  serviceId: string;
  initialVersion: string;
  lastDetected?: number | string;
  onCancel: () => void;
  onConfirm: (manualVersion: string) => void;
}

export const ForcedRepairModal: React.FC<ForcedRepairModalProps> = ({
  isOpen,
  gameId,
  serviceId,
  initialVersion,
  lastDetected,
  onCancel,
  onConfirm,
}) => {
  const [version, setVersion] = useState(initialVersion);
  const [prevInitialVersion, setPrevInitialVersion] = useState(initialVersion);

  // Sync version state when initialVersion prop changes (during rendering as per React docs)
  if (initialVersion !== prevInitialVersion) {
    setVersion(initialVersion);
    setPrevInitialVersion(initialVersion);
  }

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(version);
  };

  return (
    <div className="forced-repair-overlay" onClick={onCancel}>
      <div
        className="forced-repair-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="forced-header">
          <span className="material-symbols-outlined icon">build</span>
          <h2>실행 파일 강제 복구</h2>
        </div>

        <div className="forced-body">
          <p>
            로그상에서 마지막으로 확인된 정보를 기반으로 실행 파일을 강제
            복구합니다. 기존 파일이 손상된 경우 최신 실행 파일을 다시
            다운로드하여 덮어씌웁니다.
          </p>

          <div
            className="patch-info-summary"
            style={{ fontSize: "13px", color: "#888", marginBottom: "14px" }}
          >
            대상: <strong>{gameId}</strong> / {serviceId}
          </div>

          <div className="version-edit-container">
            <div className="version-field">
              <label className="version-label">복구 대상 버전</label>
              <input
                type="text"
                className="version-input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="예: 3.25.1.0"
              />
              <div className="version-info-sub">
                {lastDetected ? (
                  <span>
                    마지막 감지:{" "}
                    {(() => {
                      const d = new Date(
                        typeof lastDetected === "string" &&
                          /^\d+$/.test(lastDetected)
                          ? Number(lastDetected)
                          : lastDetected,
                      );
                      return d.toString() === "Invalid Date"
                        ? "알 수 없음"
                        : d.toLocaleString();
                    })()}
                  </span>
                ) : (
                  <span>* 버전을 정확히 입력해주세요.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="forced-actions">
          <button className="btn-cancel" onClick={onCancel}>
            취소
          </button>
          <button className="btn-repair" onClick={handleConfirm}>
            복구 시작
          </button>
        </div>
      </div>
    </div>
  );
};

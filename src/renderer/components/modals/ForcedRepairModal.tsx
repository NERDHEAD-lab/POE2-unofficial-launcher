import React, { useState } from "react";

import "./ForcedRepairModal.css";

export interface VersionInfo {
  version: string;
  webRoot: string;
  fetchedAt: number;
}

export interface ForcedRepairModalProps {
  isOpen: boolean;
  gameId: string;
  serviceId: string;
  versionInfo: VersionInfo;
  onCancel: () => void;
  onConfirm: (manualVersion: string) => Promise<boolean>;
}

export const ForcedRepairModal: React.FC<ForcedRepairModalProps> = ({
  isOpen,
  gameId,
  serviceId,
  versionInfo,
  onCancel,
  onConfirm,
}) => {
  const [version, setVersion] = useState(versionInfo.version);
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsStarting(true);
    setError("");
    try {
      if (!(await onConfirm(version)))
        setError(
          "서버 목표 또는 설치 경로를 확인하지 못했습니다. 창을 닫고 다시 조회해 주세요.",
        );
    } catch {
      setError("복구를 시작하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsStarting(false);
    }
  };

  const lastDetected = versionInfo.fetchedAt;

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
            서버가 직접 반환한 버전과 주소를 기반으로 실행 파일을 강제
            복구합니다. 기존 파일이 손상되었거나 실행되지 않는 경우, 해당 버전의
            최신 파일을 다시 다운로드하여 원본 상태로 복구합니다.
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
                <div>
                  서버에서 직접 확인한 복구 대상입니다. 버전을 수정하면 이
                  작업에만 수동 적용됩니다.
                </div>

                {lastDetected && lastDetected !== 0 ? (
                  <span>
                    서버 조회:{" "}
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
          {error && <p role="alert">{error}</p>}
          <button
            className="btn-repair"
            disabled={isStarting || !version.trim()}
            onClick={handleConfirm}
          >
            복구 시작
          </button>
        </div>
      </div>
    </div>
  );
};

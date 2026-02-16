import React, { useState } from "react";

import "./ForcedRepairModal.css";
import { VersionService } from "../../services/VersionService";

export interface VersionInfo {
  version: string;
  webRoot: string;
  timestamp: string | number;
}

export interface ForcedRepairModalProps {
  isOpen: boolean;
  gameId: string;
  serviceId: string;
  versionInfo: VersionInfo;
  remoteVersion?: string;
  onCancel: () => void;
  onConfirm: (manualVersion: string) => void;
}

export const ForcedRepairModal: React.FC<ForcedRepairModalProps> = ({
  isOpen,
  gameId,
  serviceId,
  versionInfo,
  remoteVersion,
  onCancel,
  onConfirm,
}) => {
  const [version, setVersion] = useState(versionInfo.version);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(version);
  };

  const lastDetected = versionInfo.timestamp;

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
            원격 서버 정보와 로컬 로그를 비교하여 확인된 최신 버전을 기반으로
            실행 파일을 강제 복구합니다. 기존 파일이 손상되었거나 실행되지 않는
            경우, 해당 버전의 최신 파일을 다시 다운로드하여 원본 상태로
            복구합니다.
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
                {remoteVersion &&
                versionInfo.version &&
                VersionService.compareVersions(
                  remoteVersion,
                  versionInfo.version,
                ) >= 0 ? (
                  <div
                    style={{
                      color: "var(--theme-accent)",
                      marginBottom: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "14px" }}
                    >
                      info
                    </span>
                    <span>원격 서버에서 확인된 최신 권장 버전입니다.</span>
                  </div>
                ) : versionInfo.version ? (
                  <div
                    style={{
                      color: "#aaa",
                      marginBottom: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "14px" }}
                    >
                      history
                    </span>
                    <span>로컬 로그에서 마지막으로 감지된 버전입니다.</span>
                  </div>
                ) : (
                  <div
                    style={{
                      color: "#ff6b6b",
                      marginBottom: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "14px" }}
                    >
                      warning
                    </span>
                    <span>
                      외부 서버 및 로그에서 최신 버전을 가져오는데 실패했습니다.
                    </span>
                  </div>
                )}

                {lastDetected && lastDetected !== 0 ? (
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

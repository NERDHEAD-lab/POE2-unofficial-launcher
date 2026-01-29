import React from "react";

import "./UpdateModal.css";
import { UpdateStatus } from "../../shared/types";

interface UpdateModalProps {
  isOpen: boolean;
  version: string;
  status: UpdateStatus;
  onUpdate: () => void; // Trigger Download
  onInstall: () => void; // Trigger Restart & Install
  onClose: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  version,
  status,
  onUpdate,
  onInstall,
  onClose,
}) => {
  if (!isOpen) return null;

  const isDownloading = status.state === "downloading";
  const isDownloaded = status.state === "downloaded";
  const progress = status.state === "downloading" ? status.progress : 0;

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-content">
        <h2 className="update-title">
          {isDownloaded ? "업데이트 준비 완료!" : "새로운 업데이트가 있습니다!"}
        </h2>
        <p className="update-message">
          {isDownloaded ? (
            <>
              새로운 버전 <strong>v{version}</strong>의 다운로드가
              완료되었습니다.
              <br />
              런처를 재시작하여 설치를 완료할까요?
            </>
          ) : (
            <>
              새로운 버전 <strong>v{version}</strong>을 사용할 수 있습니다.
              <br />
              {isDownloading
                ? "파일을 다운로드 중입니다..."
                : "지금 업데이트하시겠습니까?"}
            </>
          )}
        </p>

        {isDownloading && (
          <>
            <div className="update-progress-container">
              <div
                className="update-progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span className="update-progress-text">
              {Math.round(progress)}%
            </span>
          </>
        )}

        <div className="update-actions">
          {isDownloaded ? (
            <button className="btn-update-primary" onClick={onInstall}>
              재시작하여 설치
            </button>
          ) : (
            <button
              className={`btn-update-primary ${isDownloading ? "disabled" : ""}`}
              onClick={onUpdate}
              disabled={isDownloading}
            >
              {isDownloading ? "다운로드 중..." : "지금 업데이트"}
            </button>
          )}
          {!isDownloading && (
            <button className="btn-update-secondary" onClick={onClose}>
              나중에 하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;

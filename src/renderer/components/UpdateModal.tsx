import React from "react";

import ChangelogView from "./ui/ChangelogView";
import { UpdateStatus } from "../../shared/types";

import "./UpdateModal.css";
import "./ui/ChangelogView.css";

interface UpdateModalProps {
  isOpen: boolean;
  version: string;
  status: UpdateStatus;
  onUpdate: () => void; // Trigger Download
  onInstall: (isSilent?: boolean) => void; // Trigger Restart & Install
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

  const currentVersion = __APP_VERSION__;
  const isAvailable = status.state === "available";
  const isDownloading = status.state === "downloading";
  const isDownloaded = status.state === "downloaded";
  const progress = status.state === "downloading" ? status.progress : 0;
  const changelogs = isAvailable ? status.changelogs || [] : [];

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-content">
        <h2 className="update-title">
          {isDownloaded ? "업데이트 준비 완료!" : "새로운 업데이트가 있습니다!"}
          {!isDownloaded && (
            <span className="update-title-version">
              (v{currentVersion} → v{version})
            </span>
          )}
        </h2>

        <div className="update-info-container">
          <p className="update-message">
            {isDownloaded ? (
              <>
                다운로드가 완료되었습니다.
                <br />
                런처를 재시작하여 설치를 완료할까요?
              </>
            ) : (
              <>
                PoE Unofficial Launcher의 새로운 버전이 출시되었습니다.
                <br />
                지금 업데이트하시겠습니까?
              </>
            )}
          </p>

          {/* Content Area - Reuse ChangelogView */}
          {isAvailable && (
            <div className="update-changelog-list">
              {changelogs.length > 0 ? (
                <ChangelogView changelogs={changelogs} />
              ) : (
                <div className="changelog-loading">
                  변경 사항을 불러오는 중...
                </div>
              )}
            </div>
          )}
        </div>

        {isDownloading && (
          <div className="update-progress-wrapper">
            <div className="update-progress-container">
              <div
                className="update-progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span className="update-progress-text">
              {Math.round(progress)}%
            </span>
          </div>
        )}

        <div className="update-actions">
          <div className="update-primary-actions">
            {isDownloaded ? (
              <>
                <button
                  className="btn-update-primary"
                  onClick={() => onInstall(true)}
                >
                  재시작하여 설치
                </button>
                <button
                  className="btn-update-manual"
                  onClick={() => onInstall(false)}
                >
                  <span>수동 업데이트</span>
                </button>
              </>
            ) : (
              <button
                className={`btn-update-primary ${isDownloading ? "disabled" : ""}`}
                onClick={onUpdate}
                disabled={isDownloading}
              >
                {isDownloading ? "다운로드 중..." : "지금 업데이트"}
              </button>
            )}
          </div>

          {!isDownloading && (
            <div className="update-secondary-actions">
              <button className="btn-update-secondary" onClick={onClose}>
                나중에 하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;

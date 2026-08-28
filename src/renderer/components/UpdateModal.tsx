import React from "react";

import ChangelogView from "./ui/ChangelogView";
import { UpdateStatus } from "../../shared/types";
import { getUpdateModalCopy } from "../utils/update-modal-copy";

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
  const isRequesting = status.state === "requesting";
  const isDownloading = status.state === "downloading";
  const isDownloadBusy = isRequesting || isDownloading;
  const isDownloaded = status.state === "downloaded";
  const progress = isDownloadBusy ? status.progress : 0;
  const changelogs = isAvailable ? status.changelogs || [] : [];
  const copy = getUpdateModalCopy(status);

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-content">
        <h2 className="update-title">
          {copy.title}
          {!isDownloaded && version && (
            <span className="update-title-version">
              (v{currentVersion} → v{version})
            </span>
          )}
        </h2>

        <div className="update-info-container">
          <p className="update-message">
            {copy.messageLines.map((line, index) => (
              <React.Fragment key={line}>
                {index > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
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

        {isDownloadBusy && (
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
                  {copy.primaryActionText}
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
                className={`btn-update-primary ${isDownloadBusy ? "disabled" : ""}`}
                onClick={onUpdate}
                disabled={isDownloadBusy}
              >
                {copy.primaryActionText}
              </button>
            )}
          </div>

          {!isDownloadBusy && (
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

import React, { useMemo } from "react";

import "./PatchFixModal.css";
import { PatchProgress, FileProgress } from "../../../shared/types";

interface PatchFixModalProps {
  isOpen: boolean;
  mode: "confirm" | "progress" | "done" | "error";
  gameId?: string;
  serviceId?: string;
  progress?: PatchProgress;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  autoStart?: boolean;
}

export const PatchFixModal: React.FC<PatchFixModalProps> = ({
  isOpen,
  mode: initialMode,
  gameId,
  serviceId,
  progress: initialProgress,
  onConfirm,
  onCancel,
  onClose,
  autoStart: _autoStart = false,
}) => {
  // Derive visible files list
  const fileList = useMemo(() => {
    return initialProgress?.files || [];
  }, [initialProgress]);

  if (!isOpen) return null;

  return (
    <div className="patch-fix-modal-overlay">
      <div className="patch-fix-modal-content">
        <div className="patch-header">
          <span className="material-icons-round icon">
            {initialMode === "error"
              ? "error"
              : initialMode === "done"
                ? "check_circle"
                : "build"}
          </span>
          <div className="header-text">
            <h2>
              {initialMode === "confirm" && "패치 오류 감지됨"}
              {initialMode === "progress" && "패치 복구 진행 중..."}
              {initialMode === "done" && "패치 복구 완료"}
              {initialMode === "error" && "패치 복구 실패"}
            </h2>
            {/* Overall Progress displayed in Header area for prominence */}
            {(initialMode === "progress" || initialMode === "done") &&
              initialProgress && (
                <div className="header-progress-info">
                  총 진행률 {initialProgress.current}/{initialProgress.total} (
                  {initialProgress.overallProgress}%)
                </div>
              )}
          </div>
        </div>

        {/* Overall Progress Bar - Slim line at top of body/bottom of header style */}
        {(initialMode === "progress" || initialMode === "done") &&
          initialProgress && (
            <div className="overall-progress-bar-bg">
              <div
                className="overall-progress-bar-fill"
                style={{ width: `${initialProgress.overallProgress}%` }}
              />
            </div>
          )}

        <div className="patch-body">
          {initialMode === "confirm" && (
            <>
              <p>
                게임 실행 로그에서 <strong>패치 파일 전송 오류</strong>가
                감지되었습니다.
                <br />
                손상된 파일을 다시 다운로드하여 복구를 시도하시겠습니까?
              </p>
              <div className="patch-info">
                <span>
                  게임: {gameId} ({serviceId})
                </span>
              </div>
            </>
          )}

          {(initialMode === "progress" || initialMode === "done") &&
            initialProgress && (
              <div className="progress-container">
                {/* File Queue List - As Progress Bars */}
                <div className="file-queue-list">
                  {fileList.map((file: FileProgress) => (
                    <div
                      key={file.fileName}
                      className={`file-item-bar-layout ${file.status}`}
                    >
                      <div className="file-info-row">
                        <span className="name">{file.fileName}</span>
                        <span className="status-text">
                          {file.status === "downloading" && `${file.progress}%`}
                          {file.status === "waiting" && "대기 중"}
                          {file.status === "done" && "완료"}
                          {file.status === "error" && "오류"}
                        </span>
                      </div>
                      <div className="file-progress-bg">
                        <div
                          className="file-progress-fill"
                          style={{
                            width: `${file.status === "waiting" ? 0 : file.status === "done" ? 100 : file.progress}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {initialMode === "error" && initialProgress?.error && (
            <div className="error-message">
              <p>{initialProgress.error}</p>
              <p className="sub-text">
                잠시 후 다시 시도하거나 수동으로 해결해주세요.
              </p>
            </div>
          )}

          {initialMode === "done" && (
            <p className="success-message">
              모든 패치 파일이 정상적으로 복구되었습니다.
              <br />
              이제 게임을 실행하실 수 있습니다.
            </p>
          )}
        </div>

        <div className="patch-actions">
          {initialMode === "confirm" && (
            <>
              <button className="btn-cancel" onClick={onCancel}>
                나중에 하기
              </button>
              <button className="btn-confirm" onClick={onConfirm}>
                지금 복구하기
              </button>
            </>
          )}
          {initialMode === "progress" && (
            <button className="btn-cancel" onClick={onCancel}>
              취소
            </button>
          )}
          {initialMode === "done" && (
            <button className="btn-confirm" onClick={onClose}>
              확인 (닫기)
            </button>
          )}
          {initialMode === "error" && (
            <button className="btn-confirm" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

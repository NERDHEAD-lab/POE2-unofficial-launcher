import React from "react";

import "./PatchFixModal.css";
import { PatchProgress } from "../../../shared/types";

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
          <h2>
            {initialMode === "confirm" && "패치 오류 감지됨"}
            {initialMode === "progress" && "패치 복구 진행 중..."}
            {initialMode === "done" && "패치 복구 완료"}
            {initialMode === "error" && "패치 복구 실패"}
          </h2>
        </div>

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
                <div className="progress-status">
                  <span className="file-name">{initialProgress.fileName}</span>
                  <span className="percent">{initialProgress.progress}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${initialProgress.progress}%` }}
                  ></div>
                </div>
                <div className="progress-detail">
                  {initialProgress.total !== undefined &&
                    `${initialProgress.current} / ${initialProgress.total} 파일 처리 중`}
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
              모든 복구 작업이 완료되었습니다.
              <br />
              게임을 다시 실행해주세요.
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

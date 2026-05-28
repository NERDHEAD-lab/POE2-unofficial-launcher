import React, { useState } from "react";

import "./InstallerModal.css";
import { PobDetectedPayload } from "@poe2-launcher/shared/types";

interface DetectedPathConfirmModalProps {
  payload: PobDetectedPayload | null;
  onConfirmed: () => void;
  onReject: () => void;
}

export const DetectedPathConfirmModal: React.FC<
  DetectedPathConfirmModalProps
> = ({ payload, onConfirmed, onReject }) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!payload) return null;

  const handleConfirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const result =
        await window.electronAPI.pob?.confirmDetectedLocation(payload);
      if (!result) {
        setError("내부 오류로 등록을 실행하지 못했습니다.");
        return;
      }
      if (result.status === "ok") {
        onConfirmed();
        return;
      }
      setError(result.reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pob-installer-overlay" onClick={onReject}>
      <div
        className="pob-installer-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pob-installer-header">
          <span className="material-symbols-outlined icon">extension</span>
          <h2>공식 PoB 설치를 발견했습니다</h2>
        </div>

        <div className="pob-installer-body">
          <p>아래 경로에 Path of Building Community 가 감지되었습니다.</p>
          <p
            style={{
              padding: "8px 10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              fontFamily: "monospace",
              fontSize: "12px",
              wordBreak: "break-all",
            }}
          >
            {payload.installLocation}
          </p>
          <p style={{ color: "#888", fontSize: "12px" }}>
            출처: {payload.source} 레지스트리. 이 경로를 사용해도 될까요?
          </p>
          {error && <div className="pob-installer-error">{error}</div>}
        </div>

        <div className="pob-installer-actions">
          <button className="btn-secondary" onClick={onReject} disabled={busy}>
            아니요, 직접 지정
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "등록 중..." : "이 경로로 등록"}
          </button>
        </div>
      </div>
    </div>
  );
};

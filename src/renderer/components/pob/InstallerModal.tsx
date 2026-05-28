import React, { useState } from "react";

import "./InstallerModal.css";
import { PobPickResult } from "../../../shared/types";

interface InstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocated: (installPath: string) => void;
}

export const InstallerModal: React.FC<InstallerModalProps> = ({
  isOpen,
  onClose,
  onLocated,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleOpenSite = () => {
    window.electronAPI.pob?.openOfficialSite();
  };

  const handlePick = async () => {
    setError(null);
    setBusy(true);
    try {
      const result: PobPickResult | undefined =
        await window.electronAPI.pob?.pickInstallLocation();
      if (!result) {
        setError("내부 오류로 폴더 선택을 실행하지 못했습니다.");
        return;
      }
      if (result.status === "ok") {
        onLocated(result.path);
        return;
      }
      if (result.status === "invalid") {
        setError(result.reason);
        return;
      }
      if (result.status === "error") {
        setError(result.reason || "알 수 없는 오류가 발생했습니다.");
        return;
      }
      // cancelled: 사용자가 취소 — 조용히 모달 유지
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pob-installer-overlay" onClick={onClose}>
      <div
        className="pob-installer-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pob-installer-header">
          <span className="material-symbols-outlined icon">extension</span>
          <h2>공식 PoB (PoE2) 가 감지되지 않았습니다</h2>
        </div>

        <div className="pob-installer-body">
          <p>
            Path of Building Community (PoE2) 를 설치하거나 설치 폴더를 직접
            지정해주세요.
          </p>
          <p style={{ color: "#888", fontSize: "12px" }}>
            선택한 폴더 안에 <code>Path of Building-PoE2.exe</code> 가 있어야
            합니다.
          </p>
          {error && <div className="pob-installer-error">{error}</div>}
        </div>

        <div className="pob-installer-actions">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            닫기
          </button>
          <button
            className="btn-secondary"
            onClick={handleOpenSite}
            disabled={busy}
          >
            공식 사이트 열기
          </button>
          <button className="btn-primary" onClick={handlePick} disabled={busy}>
            {busy ? "선택 중..." : "수동 경로 지정"}
          </button>
        </div>
      </div>
    </div>
  );
};

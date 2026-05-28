import React, { useEffect, useState } from "react";

import "./PobLaunchButton.css";
import { InstallerModal } from "./InstallerModal";

interface PobLaunchButtonProps {
  activeGame: "POE1" | "POE2";
}

/**
 * 좌측 패널 진입 버튼. PoE2 활성 시에만 렌더링 (Q10 — handoff §3 / plan §5).
 * 부모(App.tsx) 가 이미 가드를 두지만 컴포넌트 자체에도 이중 안전.
 */
export const PobLaunchButton: React.FC<PobLaunchButtonProps> = ({
  activeGame,
}) => {
  const [installerOpen, setInstallerOpen] = useState(false);

  useEffect(() => {
    const off = window.electronAPI.pob?.onShowInstallerModal(() => {
      setInstallerOpen(true);
    });
    return () => {
      off?.();
    };
  }, []);

  if (activeGame !== "POE2") return null;

  const handleClick = () => {
    void window.electronAPI.pob?.open();
  };

  return (
    <>
      <div
        className="pob-launch-button"
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <div className="pob-launch-button-icon-wrapper">
          <span className="material-symbols-outlined">extension</span>
        </div>
        <span className="pob-launch-button-label">POB i18n</span>
        <span className="pob-launch-button-beta">BETA</span>
      </div>

      <InstallerModal
        isOpen={installerOpen}
        onClose={() => setInstallerOpen(false)}
        onLocated={() => {
          // PR-3 에서 새 BrowserWindow 띄우는 흐름 연결.
          // PR-1 단계: 저장만 됐다는 표시로 모달만 닫음.
          setInstallerOpen(false);
        }}
      />
    </>
  );
};

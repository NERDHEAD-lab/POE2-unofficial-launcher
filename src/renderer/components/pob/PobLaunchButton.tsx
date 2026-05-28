import React, { useEffect, useState } from "react";

import "./PobLaunchButton.css";
import { DetectedPathConfirmModal } from "./DetectedPathConfirmModal";
import { InstallerModal } from "./InstallerModal";
import { PobDetectedPayload, PobGame } from "../../../shared/types";

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
  const [installerGame, setInstallerGame] = useState<PobGame>("POE2");
  const [detectedPayload, setDetectedPayload] =
    useState<PobDetectedPayload | null>(null);

  useEffect(() => {
    const offInstaller = window.electronAPI.pob?.onShowInstallerModal(
      ({ game }) => {
        setInstallerGame(game);
        setInstallerOpen(true);
      },
    );
    const offDetected = window.electronAPI.pob?.onShowDetectedConfirm(
      (payload) => {
        setDetectedPayload(payload);
      },
    );
    return () => {
      offInstaller?.();
      offDetected?.();
    };
  }, []);

  if (activeGame !== "POE2") return null;

  const handleClick = () => {
    void window.electronAPI.pob?.open(activeGame);
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
        game={installerGame}
        onClose={() => setInstallerOpen(false)}
        onLocated={() => {
          // main 이 pob:pick-install-location 성공 시 BrowserWindow 를 직접 생성.
          setInstallerOpen(false);
        }}
      />

      <DetectedPathConfirmModal
        payload={detectedPayload}
        onConfirmed={() => {
          // main 이 pob:confirm-detected-location 성공 시 BrowserWindow 를 직접 생성.
          setDetectedPayload(null);
        }}
        onReject={() => {
          // 사용자가 자동 감지 경로 거부 → 수동 지정 modal 로 전환.
          const game = detectedPayload?.game ?? "POE2";
          setDetectedPayload(null);
          setInstallerGame(game);
          setInstallerOpen(true);
        }}
      />
    </>
  );
};

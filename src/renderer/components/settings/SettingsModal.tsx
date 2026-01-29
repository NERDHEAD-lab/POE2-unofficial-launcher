import React, { useState, useEffect } from "react";

import "../../settings/Settings.css";
import SettingsContent from "./SettingsContent";
import SettingsSidebar from "./SettingsSidebar";
import { SETTINGS_CONFIG } from "../../settings/settings-config";
import { Toast } from "../ui/Toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeCatId, setActiveCatId] = useState(SETTINGS_CONFIG[0].id);
  const [isVisible, setIsVisible] = useState(false);
  const [isRestartNeeded, setIsRestartNeeded] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  // Toast State (Lifted)
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Container Ref for Toast Portal (State-based to trigger re-render on mount)
  const [modalContainer, setModalContainer] = useState<HTMLDivElement | null>(
    null,
  );

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2000);
  };

  // Animation Logic
  useEffect(() => {
    if (isOpen) {
      // Defer state update to avoid sync render warning and allow transition
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 200); // Wait for fade out
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const activeCategory =
    SETTINGS_CONFIG.find((c) => c.id === activeCatId) || SETTINGS_CONFIG[0];

  // Prevent click propagation from modal to overlay
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleCloseAttempt = () => {
    if (isRestartNeeded) {
      setShowRestartConfirm(true);
    } else {
      onClose();
    }
  };

  const handleRelaunch = () => {
    if (window.electronAPI) {
      window.electronAPI.relaunchApp();
    }
  };

  return (
    <div
      className="settings-overlay"
      onClick={handleCloseAttempt}
      style={{ opacity: isOpen ? 1 : 0, transition: "opacity 0.2s" }}
    >
      <div
        className="settings-modal"
        ref={setModalContainer}
        onClick={handleModalClick}
      >
        {/* Shared Toast Notification (Portal to this modal) */}
        <Toast
          message={toastMsg}
          visible={toastVisible}
          container={modalContainer}
        />

        {/* Left Sidebar */}
        <SettingsSidebar
          categories={SETTINGS_CONFIG}
          activeCategoryId={activeCatId}
          onSelectCategory={setActiveCatId}
        />

        {/* Right Content */}
        <SettingsContent
          category={activeCategory}
          onClose={handleCloseAttempt}
          onShowToast={showToast}
          onRestartRequired={() => setIsRestartNeeded(true)}
        />

        {/* Restart Confirmation Popup */}
        {showRestartConfirm && (
          <div
            className="confirm-overlay"
            onClick={() => setShowRestartConfirm(false)}
          >
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-header">재시작 필요</div>
              <div className="confirm-body">
                일부 설정을 적용하려면 프로그램 재시작이 필요합니다. 지금
                재시작하시겠습니까?
              </div>
              <div className="confirm-footer">
                <button
                  className="confirm-btn cancel"
                  onClick={() => {
                    setShowRestartConfirm(false);
                    onClose(); // Just close, will apply on next manual restart
                  }}
                >
                  나중에
                </button>
                <button
                  className="confirm-btn primary"
                  onClick={handleRelaunch}
                >
                  지금 재시작
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsModal;

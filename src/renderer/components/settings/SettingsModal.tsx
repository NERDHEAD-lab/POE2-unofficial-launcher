import React, { useState, useEffect } from "react";

import "../../settings/Settings.css";
import SettingsContent from "./SettingsContent";
import SettingsSidebar from "./SettingsSidebar";
import { DUMMY_SETTINGS } from "../../settings/dummy-config";
import { Toast } from "../ui/Toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeCatId, setActiveCatId] = useState(DUMMY_SETTINGS[0].id);
  const [isVisible, setIsVisible] = useState(false);

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
    DUMMY_SETTINGS.find((c) => c.id === activeCatId) || DUMMY_SETTINGS[0];

  // Prevent click propagation from modal to overlay
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="settings-overlay"
      onClick={onClose}
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
          categories={DUMMY_SETTINGS}
          activeCategoryId={activeCatId}
          onSelectCategory={setActiveCatId}
        />

        {/* Right Content */}
        <SettingsContent
          category={activeCategory}
          onClose={onClose}
          onShowToast={showToast}
        />
      </div>
    </div>
  );
};

export default SettingsModal;

import React, { useEffect, useState } from "react";

import { ChangelogItem } from "../../../shared/types";
import ChangelogView from "../ui/ChangelogView";

import "../ui/ChangelogView.css";

interface ChangelogModalProps {
  changelogs: ChangelogItem[];
  oldVersion?: string;
  newVersion?: string;
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({
  changelogs,
  oldVersion,
  newVersion,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade-in animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for fade-out
  };

  return (
    <div
      className={`changelog-overlay ${isVisible ? "visible" : ""}`}
      onClick={handleClose}
    >
      <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="changelog-header">
          <div className="changelog-header-title">
            <h2>
              {oldVersion && newVersion
                ? `패치 노트 (${oldVersion} → ${newVersion})`
                : "전체 패치 노트"}
            </h2>
            <p>
              PoE Unofficial Launcher의 새로운 기능과 수정사항을 확인하세요.
            </p>
          </div>
          <button onClick={handleClose} className="changelog-close-x">
            &times;
          </button>
        </div>

        {/* Content Area - Reuse ChangelogView */}
        <div className="changelog-content">
          <ChangelogView changelogs={changelogs} />
        </div>

        {/* Footer */}
        <div className="changelog-footer">
          <button onClick={handleClose} className="changelog-confirm-btn">
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;

import React, { useState } from "react";
import "./AliasDialog.css";

interface AliasDialogProps {
  isVisible: boolean;
  defaultAlias: string;
  title: string;
  onConfirm: (alias: string) => void;
  onCancel: () => void;
}

const AliasDialog: React.FC<AliasDialogProps> = ({
  isVisible,
  defaultAlias,
  title,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultAlias);

  if (!isVisible) return null;

  return (
    <div className="alias-dialog-overlay" onClick={onCancel}>
      <div className="alias-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="alias-dialog-header">
          <span className="material-symbols-outlined">edit_square</span>
          <h3>{title}</h3>
        </div>
        <div className="alias-dialog-body">
          <p>라이브러리에 등록할 폰트 별칭을 입력해 주세요.</p>
          <div className="alias-input-wrapper">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="별칭을 입력하세요 (예: PoE2 고딕)"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && value.trim()) {
                  e.preventDefault();
                  onConfirm(value.trim());
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                }
              }}
            />
          </div>
          <small>
            별칭은 폰트 관리 목록에서 식별용으로 사용됩니다. 언제든지 수정할 수
            있습니다.
          </small>
        </div>
        <div className="alias-dialog-footer">
          <button className="alias-btn-cancel" onClick={onCancel}>
            취소
          </button>
          <button
            className="alias-btn-confirm"
            onClick={() => onConfirm(value.trim())}
            disabled={!value.trim()}
          >
            추가하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default AliasDialog;

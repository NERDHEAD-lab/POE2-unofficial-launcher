import React from "react";

import { SettingCheck } from "../../../settings/types";

interface Props {
  item: SettingCheck;
  value: boolean;
  onChange: (id: string, value: boolean) => void;
}

export const CheckItem: React.FC<Props> = ({ item, value, onChange }) => {
  return (
    <div className="setting-control check-control">
      <label className="checkbox-wrapper">
        <input
          type="checkbox"
          className="checkbox-input"
          checked={value}
          onChange={(e) => onChange(item.id, e.target.checked)}
          disabled={item.disabled}
        />
        <span className="checkbox-visual">
          {value && <span className="material-symbols-outlined">check</span>}
        </span>
      </label>
    </div>
  );
};

import React from "react";

import { SettingSwitch } from "../../../settings/types";

interface Props {
  item: SettingSwitch;
  value: boolean;
  onChange: (id: string, value: boolean) => void;
}

export const SwitchItem: React.FC<Props> = ({ item, value, onChange }) => {
  return (
    <div className="setting-control switch-control">
      <label className="toggle-switch-wrapper">
        <input
          type="checkbox"
          className="toggle-switch-input"
          checked={value}
          onChange={(e) => onChange(item.id, e.target.checked)}
          disabled={item.disabled}
        />
        <span className="toggle-switch-track">
          <span className="toggle-switch-thumb" />
        </span>
      </label>
    </div>
  );
};

import React from "react";

import { SettingRadio } from "../../../settings/types";

interface Props {
  item: SettingRadio;
  value: string;
  onChange: (id: string, value: string) => void;
}

export const RadioItem: React.FC<Props> = ({ item, value, onChange }) => {
  return (
    <div className="setting-control select-control-group">
      {item.options.map((option) => (
        <label key={option.value} className="radio-option">
          <input
            type="radio"
            name={item.id}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(item.id, option.value)}
            disabled={item.disabled}
          />
          <span className="radio-label">{option.label}</span>
        </label>
      ))}
    </div>
  );
};

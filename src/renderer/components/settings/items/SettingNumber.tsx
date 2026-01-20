import React from "react";

import { SettingNumber } from "../../../settings/types";

interface Props {
  item: SettingNumber;
  value: number;
  onChange: (id: string, value: number) => void;
}

export const NumberItem: React.FC<Props> = ({ item, value, onChange }) => {
  return (
    <div className="setting-control">
      <input
        type="number"
        className="setting-number"
        min={item.min}
        max={item.max}
        step={item.step}
        value={value}
        onChange={(e) => onChange(item.id, parseFloat(e.target.value))}
        disabled={item.disabled}
      />
      {item.suffix && (
        <span style={{ marginLeft: "8px", color: "#888", fontSize: "13px" }}>
          {item.suffix}
        </span>
      )}
    </div>
  );
};

import React from "react";

import { SettingSlider } from "../../../settings/types";

interface Props {
  item: SettingSlider;
  value: number;
  onChange: (id: string, value: number) => void;
}

export const SliderItem: React.FC<Props> = ({ item, value, onChange }) => {
  const displayValue = item.valueFormat ? item.valueFormat(value) : value;

  return (
    <div className="setting-control">
      <div className="setting-slider-container">
        <input
          type="range"
          className="setting-slider"
          min={item.min}
          max={item.max}
          step={item.step}
          value={value}
          onChange={(e) => onChange(item.id, parseFloat(e.target.value))}
          disabled={item.disabled}
        />
        <span className="slider-value">{displayValue}</span>
      </div>
    </div>
  );
};

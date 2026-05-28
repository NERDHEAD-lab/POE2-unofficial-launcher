import React, { useState, useRef, useEffect } from "react";

import { SettingSelect } from "../../../settings/types";
import "../../../settings/Settings.css";

interface Props {
  item: SettingSelect;
  value: string;
  onChange: (id: string, value: string) => void;
}

export const SelectItem: React.FC<Props> = ({ item, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = item.options.find((opt) => opt.value === value);

  return (
    <div
      className={`custom-select-container ${isOpen ? "open" : ""}`}
      ref={dropdownRef}
    >
      <div className="custom-select-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="selected-value-text">
          {selectedOption ? selectedOption.label : value}
        </span>
        <span className="material-symbols-outlined dropdown-chevron">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </div>

      {isOpen && (
        <div className="custom-select-list">
          {item.options.map((option) => (
            <div
              key={option.value}
              className={`custom-select-option ${
                value === option.value ? "selected" : ""
              }`}
              onClick={() => {
                onChange(item.id, option.value);
                setIsOpen(false);
              }}
            >
              <span className="option-label">{option.label}</span>
              {value === option.value && (
                <span className="material-symbols-outlined check-icon">
                  check
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

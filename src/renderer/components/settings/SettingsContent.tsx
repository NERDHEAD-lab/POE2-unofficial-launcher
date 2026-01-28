import React, { useState, useEffect } from "react";

import { ButtonItem } from "./items/SettingButton";
import { NumberItem } from "./items/SettingNumber";
import { RadioItem } from "./items/SettingRadio";
import { SelectItem } from "./items/SettingSelect";
import { SliderItem } from "./items/SettingSlider";
import { SwitchItem } from "./items/SettingSwitch";
import { TextItem } from "./items/SettingText";
import {
  SettingsCategory,
  SettingItem,
  SettingValue,
} from "../../settings/types";
import "../../settings/Settings.css";

interface Props {
  category: SettingsCategory;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

const SettingsContent: React.FC<Props> = ({
  category,
  onClose,
  onShowToast,
}) => {
  // Tooltip State
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // UI State for expandable items
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Local state for demonstration. In real app, this would sync with Electron Store.
  const [values, setValues] = useState<Record<string, SettingValue>>({});

  // [NEW] Initialize settings based on item definitions
  useEffect(() => {
    const initValues = async () => {
      if (!window.electronAPI) return;

      const newValues: Record<string, SettingValue> = {};

      for (const section of category.sections) {
        for (const item of section.items) {
          try {
            if (item.onInit) {
              // Priority 1: Custom initialization logic
              const val = await item.onInit();
              if (val !== undefined) newValues[item.id] = val;
            } else {
              // Priority 2: Standard Electron Store
              const saved = await window.electronAPI.getConfig(item.id);
              if (saved !== undefined)
                newValues[item.id] = saved as SettingValue;
            }
          } catch (error) {
            console.error(`[Settings] Failed to init ${item.id}:`, error);
          }
        }
      }

      setValues((prev) => ({ ...prev, ...newValues }));
    };

    initValues();
  }, [category]);

  const handleAction = (actionId: string) => {
    console.log(`[Settings] Action Triggered: ${actionId}`);
    onShowToast(`[버튼 클릭] 액션: ${actionId}`);
  };

  const handleChange = (id: string, newValue: SettingValue) => {
    console.log(`[Settings] Change ${id}:`, newValue);
    setValues((prev) => ({ ...prev, [id]: newValue }));
  };

  // Wrapper to capture Item context for feedback
  const handleItemChange = (item: SettingItem, val: SettingValue) => {
    handleChange(item.id, val);

    // Generic Listener Execution
    // Pass 'showToast' as a utility to the listener
    if ("onChangeListener" in item && item.onChangeListener) {
      if (item.type === "switch" && typeof val === "boolean") {
        item.onChangeListener(val, { showToast: onShowToast });
      } else if (
        (item.type === "radio" || item.type === "select") &&
        typeof val === "string"
      ) {
        item.onChangeListener(val, { showToast: onShowToast });
      } else if (
        (item.type === "number" || item.type === "slider") &&
        typeof val === "number"
      ) {
        item.onChangeListener(val, { showToast: onShowToast });
      }
    }
  };

  const renderItemControl = (item: SettingItem) => {
    // Get current value or default
    // specific check to avoid any cast since not all items have defaultValue
    const defaultVal = "defaultValue" in item ? item.defaultValue : undefined;
    const val = values[item.id] ?? defaultVal;

    const onChange = (id: string, v: SettingValue) => handleItemChange(item, v);

    switch (item.type) {
      case "switch":
        return (
          <SwitchItem item={item} value={val as boolean} onChange={onChange} />
        );
      case "radio":
        return (
          <RadioItem item={item} value={val as string} onChange={onChange} />
        );
      case "select":
        return (
          <SelectItem item={item} value={val as string} onChange={onChange} />
        );
      case "number":
        return (
          <NumberItem item={item} value={val as number} onChange={onChange} />
        );
      case "slider":
        return (
          <SliderItem item={item} value={val as number} onChange={onChange} />
        );
      case "button":
        return <ButtonItem item={item} onClick={handleAction} />;
      case "text":
        return (
          <TextItem
            item={item}
            isExpanded={expandedItems.has(item.id)}
            onToggleExpand={(expanded) => {
              setExpandedItems((prev) => {
                const next = new Set(prev);
                if (expanded) next.add(item.id);
                else next.delete(item.id);
                return next;
              });
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="settings-content" style={{ position: "relative" }}>
      {/* Toast Notification Removed (Handled by Parent) */}

      {/* Header / Actions Bar */}
      <div className="content-actions-bar">
        <button className="settings-close-btn-inline" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* Body */}
      <div className="content-body">
        {category.sections.map((section) => (
          <div key={section.id} className="settings-section">
            {section.title && (
              <div className="section-title">{section.title}</div>
            )}

            {section.items.map((item) => {
              const isText = item.type === "text";
              const isExpanded = expandedItems.has(item.id);
              const isExpandable = isText && (item.value as string).length > 50;

              return (
                <div
                  key={item.id}
                  className={`setting-item type-${item.type} ${
                    isExpanded ? "is-expanded" : ""
                  } ${isExpandable ? "is-clickable" : ""}`}
                  onClick={() => {
                    if (isExpandable) {
                      setExpandedItems((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }
                  }}
                  style={{ cursor: isExpandable ? "pointer" : "default" }}
                >
                  <div className="setting-header-group">
                    {item.icon && (
                      <div className="setting-icon">
                        <span className="material-symbols-outlined">
                          {item.icon}
                        </span>
                      </div>
                    )}
                    <div className="setting-info">
                      <div className="setting-label">
                        <div className="label-wrapper">
                          {item.label}
                          {item.infoImage && (
                            <div
                              className="info-icon-trigger"
                              onMouseEnter={(e) => {
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                setTooltipPos({
                                  x: rect.right + 10,
                                  y: rect.top,
                                });
                                setHoveredInfo(item.id);
                              }}
                              onMouseLeave={() => setHoveredInfo(null)}
                            >
                              <span className="material-symbols-outlined">
                                info
                              </span>

                              {hoveredInfo === item.id && (
                                <div
                                  className="image-tooltip-popup"
                                  style={{
                                    position: "fixed",
                                    left: tooltipPos.x,
                                    top: tooltipPos.y,
                                  }}
                                >
                                  <img src={item.infoImage} alt="Setup Guide" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Min/Max Display for Number Inputs */}
                        {item.type === "number" &&
                          item.min !== undefined &&
                          item.max !== undefined && (
                            <span className="limit-label">
                              ({item.min} ~ {item.max})
                            </span>
                          )}
                      </div>
                      {item.description && (
                        <div className="setting-description">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {renderItemControl(item)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsContent;

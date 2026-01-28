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
  onRestartRequired: () => void;
}

const SettingsContent: React.FC<Props> = ({
  category,
  onClose,
  onShowToast,
  onRestartRequired,
}) => {
  // Constants for environment variable priority
  const FORCE_DEBUG = import.meta.env.VITE_SHOW_GAME_WINDOW === "true";
  const DEBUG_SETTING_IDS = [
    "dev_mode",
    "debug_console",
    "show_inactive_windows",
    "show_inactive_window_console",
  ];
  // Tooltip State
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // UI State for expandable items
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Local state for demonstration. In real app, this would sync with Electron Store.
  const [values, setValues] = useState<Record<string, SettingValue>>({});
  // Track if restart is required due to changes in this session
  const [restartRequired, setRestartRequired] = useState(false);

  // [NEW] Initialize settings based on item definitions
  useEffect(() => {
    const initValues = async () => {
      if (!window.electronAPI) return;

      const newValues: Record<string, SettingValue> = {};

      for (const section of category.sections) {
        for (const item of section.items) {
          try {
            if (item.onInit) {
              const val = await item.onInit();
              if (val !== undefined) newValues[item.id] = val;
            } else {
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

  const handleAction = async (actionId: string) => {
    console.log(`[Settings] Action Triggered: ${actionId}`);

    if (actionId === "logout_kakao") {
      if (window.electronAPI) {
        onShowToast("[로그아웃] 카카오 계정 연동을 해제 중입니다...");
        const success = await window.electronAPI.logoutSession();
        if (success) {
          onShowToast("[로그아웃] 성공적으로 연동 해제되었습니다.");
        } else {
          onShowToast("[로그아웃] 연동 해제에 실패했습니다.");
        }
      }
      return;
    }

    if (actionId.startsWith("restore_backup_")) {
      if (window.electronAPI && window.electronAPI.triggerManualPatchFix) {
        const parts = actionId.replace("restore_backup_", "").split("_");
        // e.g. kakao_poe1 -> service=Kakao Games, game=POE1
        // e.g. ggg_poe2 -> service=GGG, game=POE2
        let service: "Kakao Games" | "GGG" = "Kakao Games";
        let game: "POE1" | "POE2" = "POE1";

        if (parts.includes("ggg")) service = "GGG";
        if (parts.includes("poe2")) game = "POE2";

        onShowToast(`[복구] ${service} / ${game} 패치 복구를 시작합니다...`);

        // TODO: Update IPC to support arguments or use context switching?
        // For now, let's assume we can pass these as arguments if I update the signature.
        // Current signature: triggerManualPatchFix() -> void.
        // I will update it in next step. For now, calling it with args (TS might complain, casting to any).
        (
          window.electronAPI.triggerManualPatchFix as (
            serviceId: "Kakao Games" | "GGG",
            gameId: "POE1" | "POE2",
          ) => void
        )(service, game);
      } else {
        onShowToast("기능을 사용할 수 없습니다 (Electron API 미연동)");
      }
      return;
    }

    onShowToast(`[버튼 클릭] 액션: ${actionId}`);
  };

  const handleChange = (id: string, newValue: SettingValue) => {
    console.log(`[Settings] Change ${id}:`, newValue);
    setValues((prev) => ({ ...prev, [id]: newValue }));
  };

  // Wrapper to capture Item context for feedback
  const handleItemChange = (item: SettingItem, val: SettingValue) => {
    handleChange(item.id, val);

    // [New] Persist to Electron Store
    if (window.electronAPI) {
      window.electronAPI.setConfig(item.id, val);
    }

    if (item.requiresRestart) {
      setRestartRequired(true);
      onRestartRequired();
    }

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
    const isForced = FORCE_DEBUG && DEBUG_SETTING_IDS.includes(item.id);

    // Initial value resolved with priority: Env (if forced) > Values (Store) > Default
    const defaultVal =
      "defaultValue" in item
        ? item.defaultValue
        : "value" in item
          ? item.value
          : undefined;

    const val = isForced ? true : (values[item.id] ?? defaultVal);
    const isDisabled = item.disabled || isForced;

    const onChange = (id: string, v: SettingValue) => {
      // Prevent changing if forced by environment variable
      if (isForced) return;
      handleItemChange(item, v);
    };

    switch (item.type) {
      case "switch":
        return (
          <SwitchItem
            item={{ ...item, disabled: isDisabled }}
            value={val as boolean}
            onChange={onChange}
          />
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
            value={val as string}
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
              // Dependency Logic: Hide if parent setting is false
              if (item.dependsOn) {
                const parentValue = values[item.dependsOn];
                const isForcedParent =
                  FORCE_DEBUG && DEBUG_SETTING_IDS.includes(item.dependsOn);
                // Parent value is considered true if forced or if explicitly true in values
                const resolvedParentValue =
                  isForcedParent || parentValue === true;

                if (!resolvedParentValue) return null;
              }

              // [New] Visibility Logic for Buttons (based on onInit result)
              if (item.type === "button" && values[item.id] === false) {
                return null;
              }

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

      {restartRequired && (
        <div className="restart-notice-wrapper">
          <div className="restart-notice">
            <span className="material-symbols-outlined">info</span>
            <span>일부 설정은 앱을 재시작해야 적용됩니다.</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsContent;

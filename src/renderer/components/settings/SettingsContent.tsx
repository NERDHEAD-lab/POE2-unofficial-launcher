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

// [GENERIC] Individual Item Renderer to manage its own initialization and dynamic state
const SettingItemRenderer: React.FC<{
  item: SettingItem;
  initialValue: SettingValue | undefined;
  onRestartRequired: () => void;
  onShowToast: (msg: string) => void;
  forceDebug: boolean;
  debugIds: string[];
}> = ({
  item,
  initialValue,
  onRestartRequired,
  onShowToast,
  forceDebug,
  debugIds,
}) => {
  const [val, setVal] = useState<SettingValue | undefined>(initialValue);
  const [description, setDescription] = useState<string | undefined>(
    item.description,
  );

  // Tooltip State
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  // Expanded State for TextItem
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync with prop updates (e.g. from global config change)
  // [Fix] Avoid cascading render warning by checking value difference
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue);
  if (initialValue !== prevInitialValue) {
    setVal(initialValue);
    setPrevInitialValue(initialValue);
  }

  // [Generic] onInit Implementation - Uses Context to allow items to update themselves
  useEffect(() => {
    let mounted = true;
    if (item.onInit) {
      item
        .onInit({
          setValue: (newValue) => {
            if (mounted) setVal(newValue);
          },
          setDescription: (newDesc) => {
            if (mounted) setDescription(newDesc);
          },
        })
        .catch((err) => {
          console.error(`[Settings] Failed to init setting ${item.id}:`, err);
        });
    }
    return () => {
      mounted = false;
    };
  }, [item]);

  const handleChange = async (newValue: SettingValue) => {
    setVal(newValue); // Optimistic update

    // Persist to Store
    if (window.electronAPI) {
      await window.electronAPI.setConfig(item.id, newValue);
    }

    if (item.requiresRestart) {
      onRestartRequired();
    }

    // Call listener
    if ("onChangeListener" in item && item.onChangeListener) {
      // @ts-expect-error - listener signature is generic
      item.onChangeListener(newValue, { showToast: onShowToast });
    }
  };

  const handleActionClick = () => {
    // If it's a generic button, we trigger the onChangeListener as an action
    if ("onChangeListener" in item && item.onChangeListener) {
      // @ts-expect-error - listener signature is generic
      item.onChangeListener(true, { showToast: onShowToast });
    }
  };

  const isForced = forceDebug && debugIds.includes(item.id);
  const isDisabled = item.disabled || isForced;
  const currentVal = isForced ? true : val;

  // Render Control based on type
  const renderControl = () => {
    const boolVal = !!currentVal;
    const stringVal = String(currentVal ?? "");
    const numVal = Number(currentVal ?? 0);

    switch (item.type) {
      case "switch":
        return (
          <SwitchItem
            item={{ ...item, disabled: isDisabled }}
            value={boolVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      case "radio":
        return (
          <RadioItem
            item={item}
            value={stringVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      case "select":
        return (
          <SelectItem
            item={item}
            value={stringVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      case "number":
        return (
          <NumberItem
            item={item}
            value={numVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      case "slider":
        return (
          <SliderItem
            item={item}
            value={numVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      case "button":
        return <ButtonItem item={item} onClick={() => handleActionClick()} />;
      case "text":
        return (
          <TextItem
            item={item}
            value={stringVal}
            isExpanded={isExpanded}
            onToggleExpand={setIsExpanded}
          />
        );
      default:
        return null;
    }
  };

  const isText = item.type === "text";
  const getSVal = (v: SettingValue | undefined) => String(v ?? "");
  const isExpandable = isText && getSVal(currentVal).length > 50;

  return (
    <div
      className={`setting-item type-${item.type} ${
        isExpanded ? "is-expanded" : ""
      } ${isExpandable ? "is-clickable" : ""}`}
      onClick={() => {
        if (isExpandable) setIsExpanded(!isExpanded);
      }}
      style={{ cursor: isExpandable ? "pointer" : "default" }}
    >
      <div className="setting-header-group">
        {item.icon && (
          <div className="setting-icon">
            <span className="material-symbols-outlined">{item.icon}</span>
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
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltipPos({ x: rect.right + 10, y: rect.top });
                    setHoveredInfo(item.id);
                  }}
                  onMouseLeave={() => setHoveredInfo(null)}
                >
                  <span className="material-symbols-outlined">info</span>
                  {hoveredInfo === item.id && (
                    <div
                      className="image-tooltip-popup"
                      style={{
                        position: "fixed",
                        left: tooltipPos.x,
                        top: tooltipPos.y,
                        zIndex: 9999,
                      }}
                    >
                      <img src={item.infoImage} alt="Setup Guide" />
                    </div>
                  )}
                </div>
              )}
            </div>
            {item.type === "number" &&
              item.min !== undefined &&
              item.max !== undefined && (
                <span className="limit-label">
                  ({item.min} ~ {item.max})
                </span>
              )}
          </div>

          {/* Dynamic Description Rendering */}
          {description && (
            <div
              className="setting-description"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {description}
            </div>
          )}
        </div>
      </div>
      {renderControl()}
    </div>
  );
};

export const SettingsContent: React.FC<Props> = ({
  category,
  onClose,
  onShowToast,
  onRestartRequired,
}) => {
  const FORCE_DEBUG = import.meta.env.VITE_SHOW_GAME_WINDOW === "true";
  const DEBUG_SETTING_IDS = [
    "dev_mode",
    "debug_console",
    "show_inactive_windows",
    "show_inactive_window_console",
  ];

  // Global Config Sync State
  const [config, setConfig] = useState<Record<string, SettingValue>>({});
  const [restartRequired, setRestartRequired] = useState(false);

  // Load Config and Sync with Main Process
  useEffect(() => {
    const loadConfig = async () => {
      if (!window.electronAPI) return;
      const newValues: Record<string, SettingValue> = {};

      for (const section of category.sections) {
        for (const item of section.items) {
          const saved = await window.electronAPI.getConfig(item.id);
          if (saved !== undefined) newValues[item.id] = saved as SettingValue;
        }
      }
      setConfig((prev) => ({ ...prev, ...newValues }));
    };

    loadConfig();

    if (window.electronAPI) {
      const removeListener = window.electronAPI.onConfigChange((key, value) => {
        setConfig((prev) => ({ ...prev, [key]: value as SettingValue }));
      });
      return () => removeListener();
    }
  }, [category]);

  const handleRestartNotice = () => {
    setRestartRequired(true);
    onRestartRequired();
  };

  return (
    <div className="settings-content" style={{ position: "relative" }}>
      <div className="content-actions-bar">
        <button className="settings-close-btn-inline" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="content-body">
        {category.sections.map((section) => (
          <div key={section.id} className="settings-section">
            {section.title && (
              <div className="section-title">{section.title}</div>
            )}

            {section.items.map((item) => {
              // Priority Dependency Check
              if (item.dependsOn) {
                const parentVal = config[item.dependsOn];
                const isForcedParent =
                  FORCE_DEBUG && DEBUG_SETTING_IDS.includes(item.dependsOn);
                // Hide if parent is not enabled (considering force-debug)
                if (!isForcedParent && parentVal !== true) return null;
              }

              // Visibility check for buttons (if configured to hide when value is false)
              // This can be used for availability checks (restore buttons)
              if (item.type === "button" && config[item.id] === false) {
                return null;
              }

              // Resolve value for prop (falls back to default if not in config yet)
              const defaultVal =
                "defaultValue" in item
                  ? item.defaultValue
                  : "value" in item
                    ? item.value
                    : undefined;
              const currentValue = config[item.id] ?? defaultVal;

              return (
                <SettingItemRenderer
                  key={item.id}
                  item={item}
                  initialValue={currentValue}
                  onRestartRequired={handleRestartNotice}
                  onShowToast={onShowToast}
                  forceDebug={FORCE_DEBUG}
                  debugIds={DEBUG_SETTING_IDS}
                />
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

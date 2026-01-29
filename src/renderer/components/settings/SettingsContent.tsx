import React, { useState, useEffect } from "react";

import ConfirmModal, { ConfirmModalProps } from "../ui/ConfirmModal";
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
  SettingSwitch,
  SettingRadio,
  SettingSelect,
  SettingNumber,
  SettingSlider,
  SettingButton,
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
  config: Record<string, SettingValue>; // [New] Pass config for dependsOn check
  onRestartRequired: () => void;
  onShowToast: (msg: string) => void;
  onValueChange: (id: string, value: SettingValue) => void; // [New] Real-time state local sync
  onShowConfirm?: (props: ConfirmModalProps) => void;
  onHideConfirm?: () => void;
}> = ({
  item,
  initialValue,
  config,
  onRestartRequired,
  onShowToast,
  onValueChange,
  onShowConfirm,
  onHideConfirm,
}) => {
  const [val, setVal] = useState<SettingValue | undefined>(initialValue);
  const [description, setDescription] = useState<string | undefined>(
    item.description,
  );
  const [disabled, setDisabled] = useState<boolean>(!!item.disabled);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  // Tooltip State
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  // Expanded State for TextItem
  const [isExpanded, setIsExpanded] = useState(false);

  // [Fix] Track if onInit has taken control to avoid store-override race conditions
  const [authorityClaimed, setAuthorityClaimed] = useState(false);

  // Sync with prop updates (e.g. from global config change)
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue);
  if (initialValue !== prevInitialValue) {
    setPrevInitialValue(initialValue);
    // Only override if onInit hasn't claimed authority yet.
    // This prevents the store-load from crushing the real-time system status.
    if (!authorityClaimed) {
      setVal(initialValue);
    }
  }

  // [Generic] onInit Implementation - Uses Context to allow items to update themselves
  useEffect(() => {
    let mounted = true;
    if (item.onInit) {
      console.log(`[Settings] Running onInit for ${item.id}`);
      item
        .onInit({
          setValue: (newValue) => {
            if (mounted) {
              console.log(`[Settings] onInit ${item.id} -> ${newValue}`);
              setVal(newValue);
              setAuthorityClaimed(true); // Claim authority: don't let further initialValue syncs overwrite this
            }
          },
          setDescription: (newDesc) => {
            if (mounted) setDescription(newDesc);
          },
          setDisabled: (newDisabled) => {
            if (mounted) setDisabled(newDisabled);
          },
          setVisible: (newVisible) => {
            if (mounted) setIsVisible(newVisible);
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

  const isDependentVisible = !item.dependsOn || config[item.dependsOn] === true;
  const isFinalVisible = isVisible && isDependentVisible;

  const handleChange = async (newValue: SettingValue) => {
    setVal(newValue); // Optimistic update
    onValueChange(item.id, newValue); // [New] Sync locally immediately for dependsOn items

    // Persist to Store
    // [Updated Logic] Only persist if the item is NOT transient (i.e., NO defaultValue).
    // If defaultValue exists, it means it's a UI-only setting or managed elsewhere.
    const isStoreBacked =
      !("defaultValue" in item) || item.defaultValue === undefined;

    if (isStoreBacked && window.electronAPI) {
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

  const handleActionClick = (_actionId: string) => {
    // console.log(`[Settings] Action Clicked: ${item.id} (${actionId})`);

    // Priority 1: Generic listener (onClickListener)
    if ("onClickListener" in item && item.onClickListener) {
      item.onClickListener({
        showToast: onShowToast,
        showConfirm: (options) => {
          onShowConfirm?.({
            ...options,
            isOpen: true,
            onCancel: () => onHideConfirm?.(),
            onConfirm: () => {
              options.onConfirm();
              onHideConfirm?.();
            },
          });
        },
      });
    }
    // Priority 2: Standard onChangeListener (for legacy support if needed)
    else if ("onChangeListener" in item && item.onChangeListener) {
      // @ts-expect-error - listener signature is generic
      item.onChangeListener(true, { showToast: onShowToast });
    }
  };

  const currentVal = val;
  const isDisabled = disabled;

  // Render Control based on type
  const renderControl = () => {
    const boolVal = !!currentVal;
    const stringVal = String(currentVal ?? "");
    const numVal = Number(currentVal ?? 0);

    switch (item.type) {
      case "switch": {
        const i = item as SettingSwitch;
        return (
          <SwitchItem
            item={{ ...i, disabled: isDisabled }}
            value={boolVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      }
      case "radio": {
        const i = item as SettingRadio;
        return (
          <RadioItem
            item={{ ...i, disabled: isDisabled }}
            value={stringVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      }
      case "select": {
        const i = item as SettingSelect;
        return (
          <SelectItem
            item={{ ...i, disabled: isDisabled }}
            value={stringVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      }
      case "number": {
        const i = item as SettingNumber;
        return (
          <NumberItem
            item={{ ...i, disabled: isDisabled }}
            value={numVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      }
      case "slider": {
        const i = item as SettingSlider;
        return (
          <SliderItem
            item={{ ...i, disabled: isDisabled }}
            value={numVal}
            onChange={(_, v) => handleChange(v)}
          />
        );
      }
      case "button": {
        const i = item as SettingButton;
        return (
          <ButtonItem
            item={{ ...i, disabled: isDisabled }}
            onClick={(actionId) => handleActionClick(actionId)}
          />
        );
      }
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
      } ${isExpandable ? "is-clickable" : ""} ${isDisabled ? "is-disabled" : ""} ${
        !isFinalVisible ? "is-hidden" : ""
      }`}
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

  // Confirmation Modal State
  const [confirmProps, setConfirmProps] = useState<ConfirmModalProps | null>(
    null,
  );

  const handleUpdateConfig = (id: string, value: SettingValue) => {
    setConfig((prev) => ({ ...prev, [id]: value }));
  };

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
              // Priority Dependency Check - Now handled in SettingItemRenderer for better reactivity
              // and to maintain component state even when hidden.

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
                  config={config}
                  initialValue={currentValue}
                  onRestartRequired={handleRestartNotice}
                  onShowToast={onShowToast}
                  onValueChange={handleUpdateConfig}
                  onShowConfirm={(props) => setConfirmProps(props)}
                  onHideConfirm={() => setConfirmProps(null)}
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

      {confirmProps && <ConfirmModal {...confirmProps} />}
    </div>
  );
};

export default SettingsContent;

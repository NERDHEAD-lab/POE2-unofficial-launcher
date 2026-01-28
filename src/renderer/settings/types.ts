// --- Base Definitions ---
export type SettingItemType =
  | "switch" // Checkbox/Switch
  | "radio" // Radio List
  | "select" // Dropdown/Select
  | "number" // Numeric Input
  | "slider" // Range Slider
  | "text" // Static Text / Info (DivText)
  | "button"; // Action Button

export type SettingValue = string | number | boolean;

export interface BaseSettingItem {
  id: string;
  type: SettingItemType;
  label: string; // Name
  description?: string;
  disabled?: boolean;
  icon?: string; // Material Symbols Icon Name
  infoImage?: string; // Tooltip image path (Optional)
  onInit?: () => Promise<SettingValue | undefined>; // Initialization logic (Optional)
}

// --- Specific Item Types ---

export interface SettingSwitch extends BaseSettingItem {
  type: "switch";
  defaultValue: boolean;
  onChangeListener?: (
    value: boolean,
    context: { showToast: (msg: string) => void },
  ) => void;
}

export interface SettingRadio extends BaseSettingItem {
  type: "radio";
  defaultValue: string;
  options: { label: string; value: string }[];
  onChangeListener?: (
    value: string,
    context: { showToast: (msg: string) => void },
  ) => void;
}

export interface SettingSelect extends BaseSettingItem {
  type: "select";
  defaultValue: string;
  options: { label: string; value: string }[];
  onChangeListener?: (
    value: string,
    context: { showToast: (msg: string) => void },
  ) => void;
}

export interface SettingNumber extends BaseSettingItem {
  type: "number";
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string; // e.g. "px", "%"
  onChangeListener?: (
    value: number,
    context: { showToast: (msg: string) => void },
  ) => void;
}

export interface SettingSlider extends BaseSettingItem {
  type: "slider";
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  valueFormat?: (value: number) => string;
  onChangeListener?: (
    value: number,
    context: { showToast: (msg: string) => void },
  ) => void;
}

export interface SettingText extends BaseSettingItem {
  type: "text";
  value: string; // The text content to display
  isExpandable?: boolean; // For long text (e.g. licenses)
}

export interface SettingButton extends BaseSettingItem {
  type: "button";
  buttonText: string;
  actionId: string;
  variant?: "primary" | "danger" | "default";
}

// Union Type
export type SettingItem =
  | SettingSwitch
  | SettingRadio
  | SettingSelect
  | SettingNumber
  | SettingSlider
  | SettingText
  | SettingButton;

// --- Structure Definitions ---

export interface SettingsSection {
  id: string;
  title?: string; // Optional Section Header
  items: SettingItem[];
}

export interface SettingsCategory {
  id: string;
  label: string; // Tab Name
  icon: string; // Google Fonts Icon Name
  sections: SettingsSection[];
}

/**
 * 설정 항목의 UI 타입을 정의합니다.
 */
export type SettingItemType =
  | "check" // 체크박스 형태 (구 switch)
  | "switch" // 토글 스위치 형태
  | "radio" // 라디오 버튼 리스트 형태
  | "select" // 드롭다운 선택창 형태
  | "number" // 숫자 입력 형태
  | "slider" // 범위 슬라이더 형태
  | "text" // 단순 텍스트 표시 또는 긴 정보 표시
  | "button"; // 클릭 가능한 액션 버튼

/**
 * 설정값으로 허용되는 데이터 타입의 집합입니다.
 */
export type SettingValue = string | number | boolean;

// --- Structure Definitions (New Semantic Blocks) ---

export type DescriptionVariant = "default" | "info" | "warning" | "error";

export interface DescriptionBlock {
  id?: string;
  text: string;
  variant: DescriptionVariant;
}

/**
 * 모든 설정 항목의 공통 속성을 정의하는 베이스 인터페이스입니다.
 */
export interface BaseSettingItem {
  /** 설정 항목의 고유 ID (저장소 키값으로 사용됨) */
  id: string;
  /** UI 렌더링에 사용될 컨트롤 타입 */
  type: SettingItemType;
  /** 사용자에게 표시될 항목 이름 */
  label: string;
  /** 항목에 대한 상세 설명 (옵션) */
  description?: string;
  /** 항목의 비활성화 여부 (옵션) */
  disabled?: boolean;
  /** 표시될 아이콘 이름 (Material Symbols 기반, 옵션) */
  icon?: string;
  /** 특정 설정이 활성화되었을 때만 항목을 표시하기 위한 부모 설정 ID (옵션) */
  dependsOn?: string;
  /** 특정 설정들이 변경될 때 이 항목을 다시 초기화(onInit 재호출)하기 위한 설정 ID 리스트 (옵션) */
  refreshOn?: string[];
  /** 마우스 오버 시 표시될 가이드 이미지 경로 (옵션) */
  infoImage?: string;
  /**
   * 설정창이 열릴 때 실행될 동적 초기화 로직 (옵션)
   * 저장된 값보다 우선순위가 높으며, 시스템 상태를 실시간으로 반영할 때 사용합니다.
   * @param context 값과 설명을 동적으로 변경할 수 있는 함수들을 제공합니다.
   */
  onInit?: (context: {
    setValue: (value: SettingValue) => void;
    addDescription: (text: string, variant?: DescriptionVariant) => void;
    resetDescription: () => void;
    setDisabled: (disabled: boolean) => void;
    setVisible: (visible: boolean) => void;
    setLabel: (label: string) => void;
    showToast: (
      message: string,
      variant?: "success" | "white" | "error" | "warning",
    ) => void;
  }) => Promise<void> | void;
  /** 변경 시 애플리케이션 재시작이 필요한지 여부 (옵션) */
  requiresRestart?: boolean;
}

// --- Specific Item Types ---

/**
 * [Refactored] Checkbox 형태의 설정 항목입니다. (구 SettingSwitch)
 */
export interface SettingCheck extends BaseSettingItem {
  type: "check";
  /**
   * 이 값이 존재하면 Electron Store를 사용하지 않고, UI 상태로만 관리됩니다.
   * (없으면 Electron Store의 값을 사용하며, shared/config.ts에 정의되어 있어야 함)
   */
  defaultValue?: boolean;
  /**
   * @param context 토스트 메시지 출력 등의 유틸리티를 포함한 컨텍스트
   */
  onChangeListener?: (
    value: boolean,
    context: {
      showToast: (
        msg: string,
        variant?: "success" | "white" | "error" | "warning",
      ) => void;
      addDescription: (text: string, variant?: DescriptionVariant) => void;
      resetDescription: () => void;
      setLabel: (label: string) => void;
      setDisabled: (disabled: boolean) => void;
      showConfirm: (options: {
        title: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        variant?: "primary" | "danger";
        onConfirm: () => void;
        onCancel?: () => void;
      }) => void;
    },
  ) => void | Promise<void | boolean>;
}

/**
 * [New] 실제 Toggle Switch 형태의 설정 항목입니다.
 */
export interface SettingSwitch extends BaseSettingItem {
  type: "switch";
  /**
   * 이 값이 존재하면 Electron Store를 사용하지 않고, UI 상태로만 관리됩니다.
   * (없으면 Electron Store의 값을 사용하며, shared/config.ts에 정의되어 있어야 함)
   */
  defaultValue?: boolean;
  /**
   * 값이 변경되었을 때 실행될 리스너 (옵션)
   * @param value 변경된 값
   * @param context 토스트 메시지 출력 등의 유틸리티를 포함한 컨텍스트
   */
  onChangeListener?: (
    value: boolean,
    context: {
      showToast: (
        msg: string,
        variant?: "success" | "white" | "error" | "warning",
      ) => void;
      addDescription: (text: string, variant?: DescriptionVariant) => void;
      resetDescription: () => void;
      setLabel: (label: string) => void;
      setDisabled: (disabled: boolean) => void;
    },
  ) => void | Promise<void | boolean>;
}

/**
 * 여러 옵션 중 하나를 선택하는 라디오 버튼 형태의 설정 항목입니다.
 */
export interface SettingRadio extends BaseSettingItem {
  type: "radio";
  /**
   * 이 값이 존재하면 Electron Store를 사용하지 않고, UI 상태로만 관리됩니다.
   * (없으면 Electron Store의 값을 사용하며, shared/config.ts에 정의되어 있어야 함)
   */
  defaultValue?: string;
  /** 선택 가능한 옵션 리스트 */
  options: { label: string; value: string; description?: string }[];
  /** 값이 변경되었을 때 실행될 리스너 (옵션) */
  onChangeListener?: (
    value: string,
    context: {
      showToast: (
        msg: string,
        variant?: "success" | "white" | "error" | "warning",
      ) => void;
      addDescription: (text: string, variant?: DescriptionVariant) => void;
      resetDescription: () => void;
      setLabel: (label: string) => void;
    },
  ) => void | Promise<void | boolean>;
}

/**
 * 드롭다운 목록에서 하나를 선택하는 형태의 설정 항목입니다.
 */
export interface SettingSelect extends BaseSettingItem {
  type: "select";
  /**
   * 이 값이 존재하면 Electron Store를 사용하지 않고, UI 상태로만 관리됩니다.
   * (없으면 Electron Store의 값을 사용하며, shared/config.ts에 정의되어 있어야 함)
   */
  defaultValue?: string;
  /** 선택 가능한 옵션 리스트 */
  options: { label: string; value: string }[];
  /** 값이 변경되었을 때 실행될 리스너 (옵션) */
  onChangeListener?: (
    value: string,
    context: {
      showToast: (msg: string) => void;
      addDescription: (text: string, variant?: DescriptionVariant) => void;
      resetDescription: () => void;
      setLabel: (label: string) => void;
    },
  ) => void | Promise<void>;
}

/**
 * 숫자를 직접 입력하거나 증감시키는 형태의 설정 항목입니다.
 */
export interface SettingNumber extends BaseSettingItem {
  type: "number";
  /**
   * 이 값이 존재하면 Electron Store를 사용하지 않고, UI 상태로만 관리됩니다.
   * (없으면 Electron Store의 값을 사용하며, shared/config.ts에 정의되어 있어야 함)
   */
  defaultValue?: number;
  /** 입력 가능한 최소값 */
  min?: number;
  /** 입력 가능한 최대값 */
  max?: number;
  /** 증감 단위 */
  step?: number;
  /** 값 뒤에 표시될 단위 (예: "px", "%") */
  suffix?: string;
  /** 값이 변경되었을 때 실행될 리스너 (옵션) */
  onChangeListener?: (
    value: number,
    context: {
      showToast: (msg: string) => void;
      addDescription: (text: string, variant?: DescriptionVariant) => void;
      resetDescription: () => void;
      setLabel: (label: string) => void;
    },
  ) => void | Promise<void>;
}

/**
 * 슬라이더 바를 좌우로 움직여 범위를 조절하는 형태의 설정 항목입니다.
 */
export interface SettingSlider extends BaseSettingItem {
  type: "slider";
  /**
   * 이 값이 존재하면 Electron Store를 사용하지 않고, UI 상태로만 관리됩니다.
   * (없으면 Electron Store의 값을 사용하며, shared/config.ts에 정의되어 있어야 함)
   */
  defaultValue?: number;
  /** 최소값 */
  min: number;
  /** 최대값 */
  max: number;
  /** 이동 단위 */
  step: number;
  /** 화면에 표시될 값의 포맷 함수 (예: (v) => `${v}%`) */
  valueFormat?: (value: number) => string;
  /** 값이 변경되었을 때 실행될 리스너 (옵션) */
  onChangeListener?: (
    value: number,
    context: {
      showToast: (msg: string) => void;
      addDescription: (text: string, variant?: DescriptionVariant) => void;
      resetDescription: () => void;
      setLabel: (label: string) => void;
    },
  ) => void | Promise<void>;
}

/**
 * 텍스트 정보를 표시하는 형태의 설정 항목입니다. (읽기 전용 또는 단순 링크/복사 기능)
 */
export interface SettingText extends BaseSettingItem {
  type: "text";
  /** 표시될 텍스트 값 */
  value: string;
  /** 클릭 시 값이 클립보드에 복사되는지 여부 */
  copyable?: boolean;
  /** 외부 링크 정보 (존재 시 클릭하면 브라우저 열기) */
  externalLink?: {
    label: string;
    url: string;
  };
  /** 텍스트가 길 경우 펼치기/접기 기능을 사용할지 여부 */
  isExpandable?: boolean;
}

/**
 * 버튼 형태의 설정 항목입니다. (특정 액션 수행)
 */
export interface SettingButton extends BaseSettingItem {
  type: "button";
  /** 버튼에 표시될 텍스트 */
  buttonText: string;
  /** 버튼 스타일 변형 (default, primary, danger 등) */
  variant?: "default" | "primary" | "danger";
  /** 클릭 시 실행될 액션 ID (이벤트 핸들러 등에서 구분용) */
  actionId?: string;
  /**
   * 클릭 시 실행될 리스너 (옵션)
   * @param context 각종 유틸리티 및 값 제어 함수
   */
  onClickListener?: (context: {
    showToast: (msg: string) => void;
    showConfirm: (options: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      variant?: "primary" | "danger";
      onConfirm: () => void;
      onCancel?: () => void;
    }) => void;
    setValue: (value: SettingValue) => void; // 필요하다면 다른 아이템 제어 가능하도록 확장 고려
  }) => void | Promise<void>;
}

/**
 * 모든 설정 항목 타입을 포함하는 유니온 타입입니다.
 */
export type SettingItem =
  | SettingCheck
  | SettingSwitch
  | SettingRadio
  | SettingSelect
  | SettingNumber
  | SettingSlider
  | SettingText
  | SettingButton;

// --- Structure Definitions ---

/**
 * 설정 화면의 하나의 그룹(섹션)을 정의합니다.
 */
export interface SettingsSection {
  /** 섹션 고유 ID */
  id: string;
  /** 섹션 상단에 표시될 제목 (옵션) */
  title?: string;
  /** 섹션에 포함된 설정 항목들 */
  items: SettingItem[];
}

/**
 * 설정 화면의 하나의 탭(카테고리)을 정의합니다.
 */
export interface SettingsCategory {
  /** 카테고리 고유 ID */
  id: string;
  /** 사이드바 탭에 표시될 이름 */
  label: string;
  /** 사이드바 탭에 표시될 아이콘 */
  icon: string;
  /** 카테고리에 포함된 섹션들 */
  sections: SettingsSection[];
}

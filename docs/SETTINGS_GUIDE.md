# Settings System Guide

이 문서는 POE2-Unofficial-Launcher의 선언적 설정 시스템 사용법과 각 설정 항목(`SettingItem`)의 구현 예제를 상세히 설명합니다.

## 1. 핵심 개념

이 프로젝트는 `src/renderer/settings/types.ts`에 정의된 인터페이스를 기반으로 설정 UI를 자동 생성합니다.

- **설정 정의**: [settings-config.ts](../src/renderer/settings/settings-config.ts)에서 전체 구조(`SETTINGS_CONFIG`)를 관리합니다.
- **영속성**: 메인 프로세스의 `electron-store`와 연동되어 설정값이 자동으로 저장되고 앱 재시작 시 유지됩니다.
- **반응성**: 값이 변경되면 시스템 전체에 `config-changed` 이벤트가 브로드캐스트되어 실시간으로 반영됩니다.
- **Transience vs Persistence**: `SettingItem`의 `defaultValue` 속성 유무에 따라 저장소 사용 여부가 결정됩니다.
- **Semantic Description**: `onInit` 또는 `onChangeListener`를 통해 항목 아래에 동적인 설명 블록(`DescriptionBlock`)을 추가하여 사용자에게 실시간 피드백(경고, 정보 등)을 제공할 수 있습니다.

## 2. Persistence Model

`defaultValue` 속성은 단순한 초기값이 아니라, **저장소(Electron Store) 사용 여부**를 결정하는 핵심 플래그입니다.

### A. Persistent Settings (영속 설정)

- **정의**: `defaultValue` 속성이 **없는(`undefined`)** 항목.
- **동작**:
  - `src/shared/config.ts`의 `DEFAULT_CONFIG`에 반드시 동일한 `id`가 정의되어 있어야 합니다. (무결성 테스트로 검증됨)
  - 앱 재시작 시 `Electron Store`에서 값을 불러옵니다.
  - 값이 변경되면 자동으로 `Electron Store`에 저장됩니다.

### B. Transient Settings (임시 설정)

- **정의**: `defaultValue` 속성이 **있는** 항목.
- **동작**:
  - `Electron Store`를 **사용하지 않습니다**.
  - UI가 열릴 때마다 `defaultValue`로 초기화되거나 `onInit` 훅을 통해 동적으로 값을 설정해야 합니다.
  - 값이 변경되어도 저장소에 기록되지 않으며, 주로 런타임 상태 제어(예: UAC 우회 토글, 액션 트리거)에 사용됩니다.

---

## 3. SettingItem Types & Examples

### Check (Checkbox)

표준 체크박스 형태의 On/Off 토글입니다. 주로 일반적인 설정을 켜고 끌 때 사용합니다.

```typescript
{
  id: "autoLaunch",
  type: "check",
  label: "컴퓨터 시작 시 자동 실행",
  description: "컴퓨터 시작 시 게임 런처를 자동으로 실행합니다.",
  icon: "power_settings_new"
}
```

### Switch (Toggle Switch)

시각적으로 강조된 토글 스위치 형태입니다. `check`와 기능적으로는 동일하나 UI 상의 강조가 필요할 때 사용합니다.

```typescript
{
  id: "noti_patch",
  type: "switch",
  label: "실시간 감지 활성화",
  // ...
}
```

### Radio & Select (Option Selection)

여러 옵션 중 하나를 선택할 때 사용합니다. `radio`는 각 옵션별로 상세 설명(`description`)을 추가할 수 있는 확장 기능을 지원합니다.

```typescript
{
  id: "processWatchMode",
  type: "radio",
  label: "패치 오류 감지 모드",
  options: [
    {
      label: "런처를 통한 실행만 감지",
      value: "resource-saving",
      description: "런처의 [게임 시작] 버튼으로 실행할 때만 오류를 검사합니다." // [New] 옵션별 설명
    },
    {
      label: "항상 감지",
      value: "always-on",
      description: "런처가 켜져 있다면 어떤 경로로 실행해도 오류를 감지합니다."
    }
  ]
}
```

### Slider & Number (Value Adjustment)

수치 데이터를 조절할 때 사용합니다. `number` 타입은 `suffix`(단위) 속성을 지원합니다.

```typescript
{
  id: "ui_scale",
  type: "slider",
  label: "UI 크기 조절",
  min: 80, max: 120, step: 5,
  valueFormat: (v) => `${v}%`
}
```

### Text (Information Display)

정보를 표시하거나 복사하기, 외부 링크 연결 등에 사용됩니다.

```typescript
{
  id: "version_info",
  type: "text",
  label: "현재 버전",
  value: "v1.0.0",
  copyable: true, // 클릭 시 클립보드 복사
  externalLink: { label: "기록 보기", url: "https://..." }, // 외부 링크 연결
  isExpandable: true // 긴 텍스트 접기/펴기
}
```

### Button (Action Trigger)

즉시 실행이 필요한 액션을 처리합니다. `variant`를 통해 스타일(primary, danger)을 지정할 수 있습니다.

```typescript
{
  id: "btn_logout",
  type: "button",
  buttonText: "로그아웃",
  variant: "danger",
  onClickListener: ({ showConfirm, showToast }) => {
    showConfirm({
      title: "로그아웃",
      message: "정말 로그아웃 하시겠습니까?",
      onConfirm: () => { /* ... logic */ }
    });
  }
}
```

---

## 4. Advanced Hooks & Logic (Context API)

모든 설정 항목은 실행 시점에 강력한 **Context API**를 제공받아 UI를 동적으로 제어할 수 있습니다.

### `onInit` (동적 초기화)

설정창이 열릴 때 호출됩니다.

- **제공되는 함수**:
  - `setValue(value)`: 항목의 현재 값을 강제로 설정합니다.
  - `addDescription(text, variant?)`: 항목 아래에 설명 블록을 추가합니다. (`default`, `info`, `warning`, `error`)
  - `clearDescription()`: 추가된 모든 설명을 제거합니다.
  - `setDisabled(boolean)`: 항목의 활성화 상태를 제어합니다.
  - `setVisible(boolean)`: 항목의 표시 여부를 제어합니다.
  - `setLabel(text)`: 레이블 텍스트를 동적으로 변경합니다.

### `onChangeListener` (값 변경 대응)

사용자가 값을 변경할 때 호출됩니다.

- **제공되는 함수**:
  - `showToast(message)`: 상단 토스트 알림을 띄웁니다.
  - `addDescription / clearDescription / setLabel`: `onInit`과 동일한 UI 제어가 가능합니다.

### `dependsOn` (조건부 노출)

특정 부모 설정이 `true`일 때만 해당 항목을 화면에 표시합니다.

---

## 5. Semantic Description Variants

`addDescription` 호출 시 `variant`를 지정하여 의미에 맞는 색상과 스타일을 적용할 수 있습니다.

- **`default`**: 일반적인 보조 설명 (회색)
- **`info`**: 정보 제공 (파란색, 'i' 아이콘)
- **`warning`**: 주의 사항 (노란색, 삼각형 '!' 아이콘)
- **`error`**: 심각한 경고 또는 오류 (빨간색, 동그라미 '!' 아이콘)

---

## 6. 개발 원칙 (Clean UI Principles)

> [!CAUTION]
> **NO HARD-CODING IN RENDERER (Zero Tolerance)**
>
> 런처의 모든 설정 항목은 **선언적(Declarative)**으로 관리되어야 합니다. `SettingsContent.tsx` 및 `items/*.tsx` 파일들은 순수하게 UI를 렌더링하는 역할만 수행해야 하며, 절대로 특정 `setting.id`를 직접 참조하여 비즈니스 로직(예: `if (id === "dev_mode") ...`)을 추가해서는 안 됩니다.

### 왜 하드코딩을 하면 안 되나요?

1. **유지보수 저하**: 설정 항목이 수백 개로 늘어날 경우 렌더러 코드가 거대해지고 복잡해집니다.
2. **확장성 결여**: 동일한 컴포넌트(`CheckItem` 등)를 다른 곳에서 재사용하기 어려워집니다.
3. **가독성 오염**: 선언적 구조(`settings-config.ts`)와 명령형 로직(Renderer)이 섞여 전체 아키텍처 파악이 어려워집니다.

### 올바른 접근 방법

모든 조건부 로직, 상태 제어, 보안 가드는 반드시 `settings-config.ts`의 **`onInit`** 및 **`onChangeListener`** 훅 내에서 구현하십시오. 렌더러는 오직 전달받은 `disabled`, `value`, `label` 상태를 그리는 역할만 담당합니다.

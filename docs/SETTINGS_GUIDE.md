# Settings System Guide

이 문서는 POE2-Unofficial-Launcher의 선언적 설정 시스템 사용법과 각 설정 항목(`SettingItem`)의 구현 예제를 상세히 설명합니다.

## 1. 핵심 개념

이 프로젝트는 `src/renderer/settings/types.ts`에 정의된 인터페이스를 기반으로 설정 UI를 자동 생성합니다.

- **설정 정의**: [settings-config.ts](../src/renderer/settings/settings-config.ts)에서 전체 구조(`SETTINGS_CONFIG`)를 관리합니다.
- **영속성**: 메인 프로세스의 `electron-store`와 연동되어 설정값이 자동으로 저장되고 앱 재시작 시 유지됩니다.
- **반응성**: 값이 변경되면 시스템 전체에 `config-changed` 이벤트가 브로드캐스트되어 실시간으로 반영됩니다.
- **Transience vs Persistence**: `SettingItem`의 `defaultValue` 속성 유무에 따라 저장소 사용 여부가 결정됩니다.

## 2. Persistence Model (중요)

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
  - 값이 변경되어도 저장소에 기록되지 않으며, 주로 런타임 상태 제어(예: UI 토글, 액션 트리거)에 사용됩니다.

---

## 2. SettingItem Types & Examples

### Switch (Boolean)

가장 기본적인 On/Off 형태의 토글 스위치입니다.

```typescript
{
  id: "noti_patch",
  type: "switch",
  label: "업데이트 알림 받기",
  description: "새로운 패치가 있을 때 알림을 보냅니다.",
  // defaultValue 없음: 영속 설정 (Store 저장)
  icon: "system_update",
  onChangeListener: (val, { showToast }) => {
    showToast(`알림 설정이 ${val ? "켜짐" : "꺼짐"}으로 변경되었습니다.`);
  }
}
```

### Radio & Select (Option Selection)

여러 옵션 중 하나를 선택할 때 사용합니다. `radio`는 모든 옵션을 나열하고, `select`는 드롭다운 형식으로 표시합니다.

```typescript
{
  id: "close_action",
  type: "radio",
  label: "닫기 설정",
  // defaultValue: "minimize", // 주석 처리 시 영속 설정이 됨
  options: [
    { label: "트레이로 최소화", value: "minimize" },
    { label: "런처 닫기", value: "close" }
  ]
}
```

### Slider & Number (Value Adjustment)

수치 데이터를 조절할 때 사용합니다.

```typescript
{
  id: "ui_scale",
  type: "slider",
  label: "UI 크기 조절",
  min: 80,
  max: 120,
  step: 5,
  defaultValue: 100,
  valueFormat: (v) => `${v}%`
}
```

### Button (Action Trigger)

즉시 실행이 필요한 액션(로그아웃, 데이터 복구 등)을 처리합니다.

```typescript
{
  id: "btn_logout",
  type: "button",
  label: "계정 관리",
  buttonText: "로그아웃",
  variant: "danger",
  onClickListener: ({ showConfirm, showToast }) => {
    showConfirm({
      title: "로그아웃",
      message: "정말 로그아웃 하시겠습니까?",
      confirmText: "로그아웃",
      variant: "danger",
      onConfirm: async () => {
        // ... 로그아웃 로직
        showToast("로그아웃 되었습니다.");
      }
    });
  }
}
```

---

## 3. Advanced Hooks & Logic

### `onInit` (실시간 상태 반영)

설정창이 열릴 때 시스템의 현재 상태(예: 외부 설정, 실제 레지스트리 값 등)를 읽어와 UI에 강제로 반영해야 할 때 사용합니다.

```typescript
onInit: async ({ setValue, setDisabled }) => {
  const isEnabled = await window.electronAPI.checkSomeSystemStatus();
  setValue(isEnabled);
  if (import.meta.env.VITE_DEBUG) setDisabled(true); // 디버그 모드 시 수정 불가 처리 등
};
```

### `dependsOn` (조건부 표시)

특정 부모 설정이 `true`일 때만 해당 항목을 화면에 표시합니다.

```typescript
{
  id: "dev_mode",
  type: "switch",
  label: "개발자 모드"
},
{
  id: "debug_console",
  type: "switch",
  label: "콘솔 표시",
  dependsOn: "dev_mode" // dev_mode가 켜졌을 때만 보임
}
```

### `requiresRestart` (재시작 안내)

중요한 시스템 설정이라 즉시 반영이 어렵고 앱 재시작이 필요한 경우, UI 하단에 안내 메시지를 표시합니다.

```typescript
{
  id: "language",
  type: "select",
  label: "언어 선택",
  requiresRestart: true,
  // ...
}
```

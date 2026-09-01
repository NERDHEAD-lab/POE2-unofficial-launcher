# 모달 오버레이의 타이틀바 침범 수정

**목표:** 일반 모달의 배경과 내용이 앱 타이틀바를 덮지 않게 한다.

## 원인

- 일반 모달은 `#app-container`의 direct child이며 전체 화면 `position: fixed`와 높은 `z-index`를 사용한다.
- 타이틀바는 `transform: scale(...)`이 적용된 `.app-scaler` 내부 stacking context에 있어 자체 `z-index`만으로 sibling overlay보다 위로 올라갈 수 없다.
- 고정 `top: 32px`은 축소 배율과 세로 letterbox를 반영하지 못한다.

## 최소 변경

- 기존 scale 계산에서 `상단 letterbox + 32px × scale`을 CSS 변수로 함께 제공한다.
- `#app-container`의 direct-child 일반 모달만 그 위치부터 시작시킨다. 모달 내부의 확인창 등 nested overlay는 건드리지 않는다.
- 고정 높이인 폰트 관리 모달은 남은 높이를 넘지 않게 제한한다.

## 제외 범위

- 타이틀바 버튼의 활성/비활성 정책 변경
- 모달 컴포넌트의 상태·애니메이션 변경
- IPC, preload, main process, 설치 경로 및 레지스트리 로직
- Electron/CDP 캡처 하네스와 자동 해상도 매트릭스

## 확인 기준

- [x] scale과 letterbox를 반영한 타이틀바 하단 좌표를 사용한다.
- [x] top-level overlay와 nested overlay의 범위를 분리한다.
- [x] 실제 앱의 온보딩 및 설정 모달에서 타이틀바가 보인다.
- [x] 작은 창에서도 모달이 타이틀바를 침범하지 않는다.
- [x] 검증 화면을 확보한다.

## 커밋 구성

1. `internal: 모달 타이틀바 수정 계획 추가`
2. `fix: 일반 모달에서 창 제어 영역이 가려지는 문제 수정`
3. `internal: 모달 타이틀바 QA 캡처 추가`

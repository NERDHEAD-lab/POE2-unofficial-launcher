# TODO: 런처 핵심 로직 개선 사항

이 문서는 개발 과정에서 발견된 개선 필요 사항이나 기술 부채를 기록합니다.

## 1. 이벤트 구독 및 노출 순서 개선 (`main.ts`, `handlers`)

### [ ] `GameInstallCheckHandler` 로직 통합 및 이벤트 확장

- **현상**: 현재 설치 상태 확인 로직이 `main.ts`의 `checkAllGameStatuses`(앱 시작 시)와 `GameInstallCheckHandler`(`CONFIG_CHANGE` 시)로 이원화되어 있음.
- **문제점**: 앱 시작 시점에는 핸들러의 정밀 프로세스 판별 로직(Launcher 이름 구분, GGG 경로 필터링 등)이 적용되지 않아 상태가 부정확할 수 있음.
- **개선안**:
  - 설치 및 상태 체크 로직을 공통 서비스 함수(예: `GameStatusService.revalidateStatus`)로 추출.
  - `main.ts` 초기화 시점과 `GameInstallCheckHandler`에서 위 공통 함수를 호출하도록 통합.
  - `UI_GAME_INSTALL_CHECK` 이벤트를 활성화하여 렌더러에서 명시적으로 상태 갱신을 요청할 수 있도록 대응.

### [ ] 윈도우 노출 순서 및 레이어링 최적화

- **현상**: 디버그 콘솔이 메인 창보다 먼저 혹은 동시에 뜨는 현상으로 인해 시각적 불일치 발생.
- **개선안**:
  - 메인 창의 `ready-to-show` 이벤트 이후 특정 지연 시간이나 렌더링 완료 신호를 받아 디버그 콘솔을 표시하는 구조 강화.
  - `parent: mainWindow` 설정 외에도 `alwaysOnTop` 등의 설정을 통해 런처 레이어링 정책 확립.
  - [ ] **[Maintenance]** package.json: Remove `overrides` for `eslint` once `typescript-eslint` and `eslint-plugin-import` officially support v10. (Reason: Cleanup technical debt after ecosystem catch-up)
  - [ ] **[Refactoring]** src/main/kakao/preload.ts: `about:blank` 및 보안되지 않은 컨텍스트에서 `SessionStorage` 접근 시 발생하는 보안 경고(SecurityError)를 방지하기 위한 프로토콜 체크 추가 필요. (Reason: 불필요한 에러 로그 감소 및 안정성 확보)

## 2. 로그 시스템 안정화

### [ ] 초기 로그 중복 방지 로직 고도화

- **현상**: 히스토리 조회와 실시간 구독 사이의 경합으로 로그가 중복 노출될 가능성이 상존함.
- **개선안**:
  - 메인 프로세스의 `logHistory`에 각 로그별 고유 시퀀스 ID를 부여.
  - 렌더러는 히스토리의 마지막 ID 이후의 로그만 수락하는 방식으로 중복 체크 로직 간소화 및 정밀도 향상.

### [ ] `GameProcessStatusHandler` 상태 전이 로직 개선

- **현상**: 게임 종료 시 즉시 `idle`로 돌아가면 비정상적인 UI 깜빡임이나 잔여 프로세스 체크 경합이 발생할 수 있음.
- **개선안**:
  - `stopping` 상태를 도입하여 종료 중임을 UI에 명시.
  - `setTimeout`을 통해 일정 시간 후 `idle`로 전환하는 완충 로직(3초 정도) 검토.
  - `quitOnGameStart` 설정에 따라 게임 실행 시 자동으로 메인 창을 닫거나 최소화하는 기능 통합.

### [ ] `CleanupLauncherWindowHandler` 예외 처리 및 디버그 창 보호

- **현상**: 런처 정리 과정에서 `about:blank` 로드 중 오류가 발생하거나 닫히면 안 되는 디버그 창이 함께 닫힐 수 있음.
- **개선안**:
  - `try-catch` 및 `isDestroyed` 체크를 통해 안정적인 창 닫기 구현.
  - `DEBUG_APP_CONFIG` 정보를 활용하여 참조 외에도 타이틀/URL 등을 통해 디버그 창을 더 견고하게 필터링.

### [ ] `DebugLogHandler` 데이터 무결성 및 성능 최적화

- **현상**: 불필요하게 잦은 IPC 통신이나 닫힌 창에 대한 메시지 전송 시도가 발생할 수 있음.
- **개선안**:
  - `dev_mode` 및 `debug_console` 설정값에 따른 초기 필터링(Early return) 강화.
  - 로그 전송 전 창의 유효성(`isDestroyed`)을 철저히 검증.
  - 메인 윈도우로의 백업 로그 전송(Redundancy) 검토.

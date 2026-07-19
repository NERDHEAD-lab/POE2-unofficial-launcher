# 예약 패치 무응답 watchdog 개선

> 작성일: 2026-07-19 · 갱신: 2026-07-20 · 상태: 완료 · 브랜치: `fix/patch-reservation-watchdog`

## 배경

POE1 Kakao Games 예약 패치가 실제로는 다운로드를 정상 진행했지만,
`TRIGGERED` 진입 후 고정 30초가 지나자 실패 알림을 표시했다. 로그에서는
런처 프로세스 활동이 27초, 게임 프로세스 및 로그 세션이 36~37초,
패치 확인 완료가 44초, UI 완료가 86초에 관찰됐다.

현재 `TRIGGERED` 타이머는 이름과 달리 마지막 활동 기준 silence timeout이
아니라 상태 진입 기준 절대 timeout이다. 30초가 지나면 실행 이벤트 구독을
모두 제거하므로 이후의 정상 패치 진행과 완료를 관찰하지 못한다.

회귀 경계는 `4536cfe`(`feat: 게임 예약 패치 성능 최적화`)다. 이 변경에서
초기 제한이 60초에서 30초로 단축되고 `PATCH_RESERVATION_SUCCESS` 기반
timeout 해제가 제거됐다.

## 소유권과 경계

- `PatchReservationService`: 예약 task, FSM, 현재 PID, watchdog의 단일 owner
- `ProcessWatcher`: 프로세스 시작/종료 사실의 owner
- `LogWatcher`: 로그 세션과 패치 확인 사실의 owner
- `AutoPatchHandler`: WebRoot 기반 예약 readiness/failure 신호의 owner
- 새 EventBus 이벤트, IPC, 설정 필드는 추가하지 않는다.
- 실제 다운로드 총시간에는 절대 제한을 두지 않는다.

## 계획

### M1. 회귀 테스트

- 실제 로그 순서(27초 process start → 37초 session/readiness → 44초 patch
  check → 장시간 title tick → done)를 fake timer로 재현한다.
- 각 유효 활동 후 59초까지 생존하고 추가 활동 없이 60초가 되면 실패하는
  계약을 고정한다.
- PID 교체, 이전 task의 stale timeout, 기존 PID 종료 무시를 검증한다.

### M2. sliding watchdog

- 단계별 무응답 제한과 PID 교체 유예를 각각 60초 상수로 정의한다.
- task generation과 예상 상태를 timeout callback에서 재검증한다.
- `PROCESS_START`, `LOG_SESSION_START`, `PATCH_RESERVATION_SUCCESS`를 현재
  task의 유효 활동으로 처리한다.
- `LOG_PATCH_CHECK_COMPLETE`만 `TRIGGERED`에서 `PATCH_WAITING`으로 전환한다.
- `PATCH_WAITING`에서는 현재 PID의 UI title tick을 liveness로 인정한다.
- 현재 PID가 종료되면 state watchdog을 멈추고 60초 PID 교체 유예로
  전환한다. 후속 process/session 신호에서 state watchdog을 재개한다.
- `PATCH_RESERVATION_FAILED`는 현재 task에 한해 즉시 실패 처리한다.

### M3. 검증과 리뷰

- Windows PowerShell에서 관련 테스트, 전체 테스트, lint, build:check를
  실행한다.
- 구현과 분리된 리뷰어가 DoD, 이벤트 소유권, timeout 경합을 검토한다.
- 실제 Windows POE1 예약 패치 확인은 사용자가 수행한다.

## DoD

- `[Windows-pwsh]` 각 상태의 유효 활동 후 59초에는 실패하지 않고, 이후
  60초 동안 무응답이면 실패한다.
- `[Windows-pwsh]` 다운로드가 1분을 넘더라도 현재 patch PID의 title tick이
  계속되면 실패하지 않는다.
- `[Windows-pwsh]` 현재 PID 종료 후 60초 이내 교체 PID가 나타나면 작업을
  유지하고, 나타나지 않으면 실패한다.
- `[Windows-pwsh]` 이전 PID 종료와 이전 task의 stale timeout은 현재 task에
  영향을 주지 않는다.
- `[Windows-pwsh]` no-update, 완료, 명시적 예약 실패 경로가 유지된다.
- `[Windows-pwsh]` 전체 테스트, lint, build:check가 통과한다.
- `[사용자]` POE1 예약 패치가 오류 알림 없이 실제 완료되고 설정에 따른
  후속 종료까지 정상 동작한다.

## 설계 리뷰

- 2026-07-19 설계 패스: 진행 가능, blocking 없음.
- 이벤트 payload에 reservation id가 없어 같은 game/service의 늦은 domain
  event를 완전히 상관시킬 수는 없다. 이번 수정은 local generation으로 stale
  timeout을 차단하고, 이벤트 schema 확장은 범위에 포함하지 않는다.

## 검증 현황

- 전용 회귀 테스트: 구현 전 6건 실패 → 구현 후 6건 통과
- 전체 테스트 1차: 신규 테스트 포함 207건 통과, 무관한
  `UpdateHandler.test.ts` 1건이 5초 suite timeout으로 실패
- `UpdateHandler.test.ts` 단독 재실행: 2건 통과
- 전체 테스트 2차: 42개 파일, 208건 전부 통과
- 전체 ESLint: 통과
- `build:check`(`tsc && vite build`): 통과

## 구현 리뷰

- 2026-07-19 리뷰 1라운드: **통과**, blocking 지적 없음.
- sliding state watchdog/PID rotation, generation+epoch 방어, terminal-first
  전환, 큐/stop cleanup, no-update 및 `terminateAfterPatch` 의미 보존 확인.
- 새 이벤트, IPC, 설정 계약 변경 없음.
- 2026-07-20 `[사용자]`: POE1 예약 패치 실동작 정상 확인.
- 사용자 검증을 포함한 모든 DoD 통과.

## 마무리

- 로컬에서 `project_llm_wiki` 저장소를 찾지 못해 raw note 작성 및 `/ingest`는
  수행하지 못했다. 이 문서를 완료 기록으로 `docs/archive/`에 보존한다.

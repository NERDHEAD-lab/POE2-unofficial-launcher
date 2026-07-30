# 게임 패치 예약 리뉴얼

> 작성일: 2026-07-25 · 상태: 구현·분리 리뷰 완료, 드래프트 PR 제출 · 브랜치:
> `feat/patch-reservation-renewal`

## 배경

현재 패치 예약은 사용자가 지정한 절대 시각에 게임 실행 흐름을 한 번 시작하는
레거시 방식이다. 실제 시즌 오픈 준비에서는 특정 시각에 무조건 패치를 시작하는
것보다, 일정 구간 동안 게임 서버가 제공하는 최신 패치 버전을 확인하고 로컬
버전보다 새로운 버전이 확인됐을 때 알림 또는 자동 업데이트를 수행하려는 요구가
있다.

리뉴얼 기능은 기존 예약의 저장 데이터와 실행 의미를 변경하지 않고 별도 기능으로
추가한다. 특히 기존 `PatchReservationService`의 실행 큐, FSM, watchdog,
프로세스·로그 감시를 재사용하고, 버전 감지 및 후속 동작 정책만 확장한다.

## 목표

- 예약 UI에서 `레거시 | 리뉴얼` 방식을 선택한다.
- 레거시 UI, 저장 데이터, 실행·알림·종료 의미를 그대로 보존한다.
- 리뉴얼 예약은 `한 번 | 매일 | 매주` 주기를 지원한다.
- `한 번`에서만 `지정 시각 | 시간 범위` 확인 방식을 지원한다.
- 시간 범위는 시작 시 즉시 확인한 뒤 최소 1분 간격으로 종료 시각까지 확인한다.
- 원격 버전이 유효한 로컬 버전보다 높을 때만 새 업데이트로 판정한다.
- 감지 후 `알림만 | 자동 업데이트`를 선택한다.
- `한 번 + 자동 업데이트`에서만 `업데이트 완료 후 게임 실행`을 선택한다.
- 매일·매주 자동 업데이트는 게임을 실행 상태로 남기지 않는다.
- 기존 모달의 색상, 밀도, 타이포그래피, 로고, 목록 스타일을 유지한다.

## 비목표

- 레거시 예약의 타이머·FSM 동작 변경
- Windows 작업 스케줄러 또는 별도 백그라운드 프로세스 도입
- 초 단위 반복 조회
- 매주 예약의 복수 요일 선택
- 패치 버전 감지를 게임 서버 오픈/로그인 가능 상태로 표현
- 새 UI 프레임워크 또는 외부 의존성 추가
- 런처가 꺼져 있던 동안 놓친 지정 시각을 소급 실행

## 확정된 제품 결정

### 저장 및 호환성

- 기존 `patchReservations`는 레거시 전용으로 유지한다.
- 리뉴얼 예약은 신규 `AppConfig` 키 `renewedPatchReservations`에 저장한다.
- 별도 migration은 두지 않는다. 현재 `electron-store`/`conf` 기본값 병합
  동작에 따라 기존 설치의 설정 파일에는 신규 기본 키가 물리적으로 추가되지만,
  기존 키의 값과 의미는 보존한다.
- 다운그레이드한 구버전 런처는 신규 키를 무시하며 레거시 예약만 처리한다.

### 리뉴얼 일정

- `한 번`
  - `지정 시각`: 초 단위까지 지정한 절대 시각에 한 번 확인한다.
  - `시간 범위`: 절대 시작·종료 시각과 분 단위 확인 간격을 지정한다.
  - 확인 간격은 정수이며 최소 1분이다.
  - 런처가 범위 안에서 다시 시작되면 남은 범위를 즉시 확인부터 재개한다.
  - 지정 시각 또는 범위를 이미 놓쳤다면 소급 실행하지 않고 만료한다.
- `매일`
  - 로컬 벽시계 `HH:mm:ss`에 하루 한 번 확인한다.
  - 런처가 꺼져 놓친 회차는 건너뛰고 다음 날로 이동한다.
- `매주`
  - 요일 한 개와 로컬 벽시계 `HH:mm:ss`를 지정한다.
  - 놓친 회차는 건너뛰고 다음 주로 이동한다.

### 버전 판정

- 원격 버전 owner는 `RemoteVersionResolver`이다.
- 로컬 버전은 기존과 동일하게
  `knownGameVersions["${gameId}_${serviceId}"]`를 사용한다.
- 원격·로컬 버전이 모두 존재하고 `unknown`이 아니며
  `compareVersions(remote, local) > 0`일 때만 새 업데이트로 판정한다.
- 원격 조회 실패, 로컬 버전 없음, `unknown`은 자동 업데이트로 승격하지 않는다.
- 일반 UI의 10분 TTL 캐시는 그대로 유지한다.
- 예약 감시는 선택한 간격에 맞는 fresh 조회 경로를 사용하되, 같은 게임의 동시
  요청은 한 번으로 병합한다.

### 감지 후 동작

- `알림만`
  - 게임 실행 또는 패치 실행 큐에 진입하지 않는다.
  - 매일·매주에서는 하위 옵션 `새로운 업데이트일 때만 알림`을 제공한다.
  - 하위 옵션 기본값은 켜짐이다.
  - 켜짐이면 동일 원격 버전은 한 번만 알리고 새 버전에서 다시 알린다.
  - 꺼짐이면 업데이트 필요 상태가 유지되는 동안 각 회차에 다시 알린다.
- `자동 업데이트`
  - 기존 `PatchReservationService` 실행 큐와 FSM을 재사용한다.
  - `한 번`에서만 `업데이트 완료 후 게임 실행`을 선택할 수 있다.
  - 이 옵션이 켜지면 리뉴얼 예약의 후속 실행 정책이 전역
    `terminateAfterPatch`보다 우선한다.
  - 패치 실패 시 게임을 실행하지 않는다.
  - no-update 경로에서 게임이 이미 정상 시작됐다면 종료하지 않고 완료 처리한다.
  - 매일·매주는 패치 후 게임 프로세스를 남기지 않는다.
- 레거시는 기존 전역 `terminateAfterPatch` 의미를 그대로 따른다.

### 게임 실행 중 및 결과 알림

- 확인 시각에 대상 게임이 실행 중이면 예약 형태와 관계없이 자동 업데이트를
  시도하지 않고 해당 회차를 즉시 건너뛴다.
- 한 번·시간 범위에서 업데이트가 확인되지 않은 채 종료되면 기존 레거시와 같은
  Windows 알림으로 지정했던 기간과 종료 결과를 알린다.
- 게임 실행 중 건너뜀도 Windows 알림으로 알린다.
- 기존 `silentPatchNotification`이 켜져 있으면 위 알림도 표시하지 않는다.

권장 알림 예시:

- 제목: `예약 패치 확인 종료`
- 본문:
  `02:59:00~03:30:00 동안 새 업데이트가 확인되지 않아 예약 패치 확인을 종료했습니다.`
- 제목: `예약 패치 건너뜀`
- 본문:
  `[Kakao Games] POE2가 실행 중이어서 예약 업데이트를 시작하지 않았습니다.`

## UI 설계

### 조건부 폼 순서

1. 서비스 / 게임
2. 예약 방식: `레거시 | 리뉴얼`
3. 리뉴얼 반복: `한 번 | 매일 | 매주`
4. 한 번 확인 방식: `지정 시각 | 시간 범위`
5. 한 번·시간 범위: 시작 / 종료 / 확인 간격 / 예상 확인 수
6. 감지 후 동작: `알림만 | 자동 업데이트`
7. 매일·매주·알림만:
   `새로운 업데이트일 때만 알림`
8. 한 번·자동 업데이트:
   `업데이트 완료 후 게임 실행`

레거시를 선택하면 현재 폼과 footer의 알림·종료 설정을 그대로 표시한다.
리뉴얼에서는 예약 자체가 후속 동작을 소유하므로 의미가 충돌하는 레거시 전역
종료 옵션을 표시하지 않는다.

### 예상 확인 수와 경고

예상 확인 수는 실행기와 UI가 공유하는 순수 함수로 계산한다.

```text
floor((종료 시각 - 시작 시각) / 확인 간격) + 1
```

- 시작 시각의 즉시 확인을 포함한다.
- 계산된 다음 확인 시각이 종료 시각보다 늦으면 실행하지 않는다.
- `180`회 이하는 기본색으로 `예상 최대 N회`를 표시한다.
- `180`회 초과부터 횟수 옆에 빨간 느낌표 아이콘을 표시한다.
- 경고는 예약 등록을 차단하지 않는다.
- 툴팁은 hover뿐 아니라 키보드 focus와 클릭으로도 열 수 있어야 한다.

툴팁:

> 지정한 시간 범위에서 확인 요청이 180회를 초과합니다. 반복 확인이 패치
> 서버에 미치는 영향이 명확하지 않으므로, 확인 간격을 늘리거나 시간 범위를
> 줄이는 것을 권장합니다.

### 기존 스타일 보존

- 현재 모달의 배경색, border, radius, typography, 로고 자산을 재사용한다.
- 선택 UI는 저장소에 이미 존재하는 radio/선택 카드 패턴을 현재 모달 톤에 맞춰
  사용한다.
- 경고에서는 느낌표 아이콘만 경고색으로 표시하고 예상 횟수는 기본색을 유지한다.
- 모달은 합의된 1024px, 설정·목록 `1:1` 구성을 사용하고 viewport 여백을
  보존한다.
- 조건부 필드가 늘어나는 경우 viewport 기반 `max-height`와 body 내부 스크롤로
  작은 창의 잘림만 방지한다.
- 한 번 예약의 날짜와 시각은 하나의 입력 트리거로 표시한다. 트리거를 열면 같은
  팝업 안에서 달력과 `00~23시 / 00~59분 / 00~59초`를 선택한다.
- 팝업의 시·분·초는 한 줄 가로 배치하며 별도 `24H` 문구를 표시하지 않는다.
- 매일·매주의 확인 시각도 같은 시·분·초 가로 입력을 사용한다.
- 목록 항목은 최대 두 줄 안에서 다음 정보를 요약한다.
  - `레거시/리뉴얼`
  - 한 번/매일/매주
  - 지정 시각 또는 범위·간격
  - 알림만/자동 업데이트
  - 완료 후 게임 실행 여부

## 데이터 계약

기존 모델은 변경하지 않는다.

```ts
patchReservations: PatchReservation[];
```

신규 키는 판별 유니온으로 구성한다. 아래 이름은 구현 중 타입 가독성에 따라
조정할 수 있으나 표현 가능한 조합은 바꾸지 않는다.

```ts
type RenewedPatchReservation =
  | (RenewedBase & {
      schedule:
        | { kind: "once-at"; at: string }
        | {
            kind: "once-range";
            startsAt: string;
            endsAt: string;
            intervalMinutes: number;
          };
      action:
        | { kind: "notify" }
        | { kind: "auto-update"; launchAfterUpdate: boolean };
    })
  | (RenewedBase & {
      schedule:
        | { kind: "daily"; localTime: string }
        | { kind: "weekly"; weekday: number; localTime: string };
      action:
        { kind: "notify"; onlyNewVersion: boolean } | { kind: "auto-update" };
    });
```

추가 영속 상태:

- 반복 `알림만 + 새로운 업데이트일 때만 알림`의 중복 방지를 위해 마지막 알림
  원격 버전을 예약 항목에 선택적으로 저장한다.
- 이 상태의 저장·갱신 owner는 Main의 예약 서비스이다.
- Renderer는 전달받은 배열을 직접 mutate하지 않는다.

`config-management` 규칙에 따라 다음을 모두 등록한다.

- `AppConfig.renewedPatchReservations`
- `CONFIG_METADATA`
- `DEFAULT_CONFIG`
- 실제 호출부가 필요할 때만 `CONFIG_KEYS`

## 아키텍처 및 소유권

- `PatchReservationService`
  - 레거시 타이머와 리뉴얼 일정의 단일 owner
  - 리뉴얼 확인 상태, 중복 방지, 실행 큐, FSM, 현재 PID, watchdog 소유
  - config refresh는 예약 ID별 fingerprint/token으로 변경·삭제된 예약만
    무효화하고, `stop()`은 모든 타이머·진행 중 조회를 무효화
- `RemoteVersionResolver`
  - 원격 소스 선택, 캐시, inflight 병합의 단일 owner
  - 기존 `resolve()`의 10분 의미를 보존
  - 예약 전용 fresh 조회는 기존 inflight와 성공 캐시를 공유하되 TTL 판정과 분리
- `ProcessWatcher` / `LogWatcher`
  - 프로세스 시작·종료와 로그 사실의 owner
- `AutoPatchHandler`
  - WebRoot readiness/failure 및 auto-patch expectation owner
- Renderer
  - 예약 입력 초안, 조건부 표시, 예상 확인 수 표시만 담당
  - 실행·버전 판정·영속 런타임 상태를 만들지 않음

리뉴얼 자동 업데이트의 후속 정책이 재시도나 늦은 이벤트에 오염되지 않도록
내부 execution task에 `reservationId`와 `runId`를 둔다. 필요한
`PATCH_RESERVATION_SUCCESS`, `PATCH_RESERVATION_FAILED`,
`PATCH_RETRY_REQUESTED` payload에는 선택적 `runId`를 추가하고,
`registerAutoPatchExpectation`이 동일 run을 전달하도록 한다. 새 Renderer IPC는
기존 레거시 계약과 분리된 reserve/delete 채널로 제한하고, IPC handler에는
비즈니스 로직을 두지 않는다.

## 마일스톤

### M1. 저장 계약과 순수 일정 계산

- `renewedPatchReservations` 등록
- 판별 유니온과 Main 입력 validator
- 다음 occurrence, 범위 확인 시각, 예상 확인 수 계산 함수
- 기존 설정 값 보존 및 신규 기본 키 추가 호환성 확인

DoD:

- `[WSL]` 기존 `patchReservations`, metadata, default 의미가 변경되지 않는다.
- `[Windows-pwsh]` 기존 설정 fixture의 기존 값은 동일하게 유지되고 신규
  `renewedPatchReservations: []` 기본 키만 추가된다.
- `[Windows-pwsh]` once-at/once-range/daily/weekly의 다음 시각 계산 테스트가
  통과한다.
- `[Windows-pwsh]` 자정·월/연도 경계·요일·DST 경계 테스트가 통과한다.
- `[Windows-pwsh]` 범위 양끝 계산과 `180/181` 경계 테스트가 통과한다.
- `[Windows-pwsh]` 1분 미만 간격, 종료≤시작, 불가능한 action 조합이
  거부된다.

### M2. fresh 버전 감시와 리뉴얼 scheduler

- 일반 10분 캐시와 분리된 fresh resolve
- 동일 게임 동시 요청 병합
- 한 번/매일/매주 타이머와 범위 polling
- 만료, 다음 회차, 재시작 복구, stale callback 방어

DoD:

- `[Windows-pwsh]` 일반 resolve는 기존 10분 캐시 의미를 유지한다.
- `[Windows-pwsh]` 예약 fresh resolve는 선택한 확인 시각마다 실제 조회하며,
  같은 게임 동시 확인은 외부 호출 한 번으로 병합된다.
- `[Windows-pwsh]` 범위 시작 즉시 확인 후 설정 간격으로만 확인하고 종료 후
  호출하지 않는다.
- `[Windows-pwsh]` 로컬/원격 버전 없음·unknown·조회 실패는 업데이트로
  판정하지 않는다.
- `[Windows-pwsh]` 런처 재시작이 범위 안이면 남은 범위를 재개하고, 범위
  밖이거나 놓친 지정 회차는 소급 실행하지 않는다.
- `[Windows-pwsh]` config 변경·service stop 후 늦은 조회 결과가 동작하지
  않는다.

### M3. 알림·자동 업데이트·후속 게임 실행

- 알림만 및 동일 버전 알림 정책
- 실행 중 게임 건너뜀
- 기존 실행 큐/FSM 연동과 `runId` 상관
- 재시도 정책 보존
- 예약별 cleanup/게임 실행 매트릭스

DoD:

- `[Windows-pwsh]` 알림만은 게임 시작·패치 큐 이벤트를 발생시키지 않는다.
- `[Windows-pwsh]` 반복 `새로운 업데이트일 때만 알림` on/off에 따라 동일
  버전 알림 횟수가 정확하다.
- `[Windows-pwsh]` 범위 만료와 실행 중 게임 건너뜀은 지정 기간·대상을 포함한
  기존 방식 Windows 알림을 사용한다.
- `[Windows-pwsh]` `silentPatchNotification`이 위 알림을 억제한다.
- `[Windows-pwsh]` 리뉴얼 자동 업데이트만 기존 FSM에 진입한다.
- `[Windows-pwsh]` 재시도는 새 attempt `runId`를 사용하면서도
  launch/cleanup 정책을 유지한다.
- `[Windows-pwsh]` stale 이벤트가 다음 task를 완료·실패시키지 않는다.
- `[Windows-pwsh]` 매일·매주와 한 번+실행 해제는 게임을 남기지 않는다.
- `[Windows-pwsh]` 한 번+실행 설정은 성공 후 게임 실행을 시작하고,
  no-update로 이미 실행된 게임은 종료하지 않는다.
- `[Windows-pwsh]` 기존 watchdog, legacy no-update/success/failure 및 전역
  `terminateAfterPatch` 회귀 테스트가 통과한다.

### M4. 조건부 UI와 목록

- 레거시/리뉴얼 선택과 조건부 필드
- 예상 확인 수 및 비차단 경고 툴팁
- 예약 목록 요약
- 작은 창 스크롤 및 키보드 접근성

DoD:

- `[Windows-pwsh]` 각 선택 조합에서 허용된 필드만 렌더링된다.
- `[Windows-pwsh]` 숨겨진 필드 값이 저장 payload에 섞이지 않는다.
- `[Windows-pwsh]` 180회에는 경고가 없고 181회부터 빨간 느낌표와 합의된
  문구가 표시되며 예약 등록은 가능하다.
- `[Windows-pwsh]` 키보드로 선택 UI, checkbox, tooltip에 접근할 수 있다.
- `[Windows-pwsh]` build:check가 판별 유니온의 불가능한 조합을 차단한다.
- `[사용자]` 레거시 모달의 기존 색상·간격·로고·목록·footer가 훼손되지 않는다.
- `[사용자]` 작은 창에서도 조건부 필드와 현재 예약 목록이 잘리지 않는다.

### M5. 통합 검증과 리뷰

- 대상 테스트, 전체 테스트, lint, build:check
- Windows hidden/muted Electron UI 확인
- 구현과 분리된 리뷰 루프
- 사용자 실동작 검증

DoD:

- `[Windows-pwsh]` 대상 테스트, 전체 테스트, lint, build:check가 통과한다.
- `[Windows-pwsh]` 실제 Electron 캡처에서 fatal/IPC 오류가 없고 조건부 UI와
  180/181 경계가 기존 스타일로 표시된다.
- `[사용자]` 레거시 예약이 기존과 동일하게 실행·완료·종료된다.
- `[사용자]` 한 번·범위에서 새 버전 감지 → 자동 패치 → 설정 시 게임 실행을
  확인한다.
- `[사용자]` 매일·매주 자동 업데이트에서 게임이 실행 상태로 남지 않는다.
- 분리 리뷰어가 config 호환성, lifecycle, fresh 조회, stale event,
  retry flag, UI 조건부 상태를 검토해 통과한다.

## 검증 명령

모든 npm gate는 Windows PowerShell에서 실행한다.

```powershell
cd "D:\project_poe2\POE2-unofficial-launcher"
npm test -- <관련 테스트>
npm test
npm run lint
npm run build:check
```

실제 런처 UI 검증은 `windows-electron-debugging` 절차에 따라 Windows에서
실행하고, 터미널 로그 → CDP target → 실제 Electron 캡처 순으로 확인한다.
실제 패치 및 게임 실행은 빌드나 mock으로 대체하지 않고 사용자 검증을 받는다.

## 리뷰 기록

### 설계 회귀 — 분리 리뷰 1차

판정: `설계 결함` (라운드 미소모)

- `DEFAULT_CONFIG`를 등록하면 기존 설정 파일에 신규 기본 키가 추가되는 실제
  저장소 동작과 “재작성 없음” 문구가 충돌했다. 제품 계약과 M1 DoD를 “기존 값
  보존 + 신규 기본 키 추가”로 정정했다.
- 전역 scheduler generation이 무관한 예약 변경까지 취소할 수 있어 예약 ID별
  fingerprint/token reconciliation로 설계를 정정했다.
- 완료 후 실행보다 다음 큐가 먼저 시작될 수 있어 후속 실행 완료를 queue
  barrier 앞에 두고, dequeue에서 대상 상태와 감지 버전을 다시 확인한다.
- game/service만 보던 로그 terminal 이벤트는 PID별 attempt `runId`가 정확히
  일치할 때만 수용하도록 정정한다. 재시도는 정책을 복사하되 새 `runId`를 쓴다.
- 신규 Renderer 명령은 typed EventBus handler를 거쳐 서비스에 위임하고,
  invoke 결과를 Main 수락 여부로 Renderer에 돌려준다.
- 초 단위 시각이 제출 직전에 과거가 되는 경계는 Renderer `Date.now()`와 Main
  validator에서 각각 재검증한다.

### 리뷰 라운드 1

판정: `반려` (라운드 1 소모)

- 프로세스 종료 명령의 실패를 흡수한 채 완료 후 게임 실행으로 이어질 수 있었다.
  종료 명령 후 PID와 프로세스명을 다시 조회해 잔존 시 후속 실행을 차단하고 실패
  알림을 표시하도록 수정했다. 대상 프로세스가 이미 없는 경우는 정상 종료로
  구분한다.
- 신규 create IPC가 validator 전에 payload 필드를 읽을 수 있었다. create/delete
  요청을 `unknown`으로 받아 타입 가드를 통과한 뒤에만 로깅과 typed EventBus
  명령을 수행하는 Main 헬퍼로 분리했다.
- `stop()` 뒤에도 영구 config handler가 scheduler를 다시 만들 수 있었다.
  서비스 lifecycle 상태를 추가해 refresh/retry/add/queue를 모두 차단하고,
  진행 중 fresh 조회도 예약 token과 함께 무효화한다.
- DST, service stop의 늦은 조회, `onlyNewVersion=false`, 실제 알림 억제,
  조건부 UI·숨은 payload·180/181·키보드 focus 테스트를 추가했다.
- 리뉴얼 삭제 결과를 Renderer까지 전달하고 실패 시 토스트로 알리도록 수정했다.

### 리뷰 라운드 2

판정: `반려` (라운드 2 소모)

- 반복 예약이 실행 대기열에 들어간 뒤 삭제되면 목록에서는 사라져도 나중에 실행될
  수 있었다. recurring execution task에 예약별 schedule token을 보존하고
  dequeue 시 현재 token과 다시 비교해, 삭제·변경된 예약의 미시작 작업을
  취소하도록 수정했다. 내부적으로 설정에서 제거되는 한 번 예약은 이 live
  reservation 조건을 적용하지 않는다.
- create validator가 빈 문자열 ID를 허용해 delete IPC의 계약과 달랐다. 생성
  단계에서 빈 문자열과 공백뿐인 ID를 모두 거부하고 Main IPC 회귀 테스트를
  추가했다.

### 리뷰 라운드 3

판정: `반려` (라운드 3 소모, 사용자 에스컬레이션)

- 반복 예약 재시도 task가 schedule token은 복사하면서 예약 ID를 synthetic
  retry ID로 바꿔, 원본 예약이 유효해도 dequeue에서 stale로 판정되는 문제가
  남아 있었다.
- 리뷰 후 execution task에 `renewedReservationId`를 별도로 보존하고 token
  검증은 원본 예약 ID로 수행하도록 수정했다.
- 원본 daily 예약이 유효하면 새 `runId`로 두 번째 실행을 시작하고, 원본 예약을
  삭제하면 queued retry를 취소하는 양방향 회귀 테스트를 추가했다.
- 위 수정은 최신 전체 자동 gate를 통과했지만 3회 리뷰 한도를 모두 소모했으므로
  분리 리뷰 통과로 기록하지 않는다. 추가 리뷰 예외 또는 현 상태 수용은 사용자
  결정이 필요하다.

### 추가 리뷰 예외

사용자가 3회 제한을 넘겨서라도 통과할 때까지 분리 리뷰를 계속하도록 승인했다.
라운드 4부터 동일한 판정 기준으로 지적 수정, 자동 검증, 재리뷰를 반복한다.

### 리뷰 라운드 4

판정: `통과 — 지적 없음`

- 라운드 3에서 수정한 반복 예약 재시도 경로가 원본
  `renewedReservationId`, schedule token, live 조건과 실행 정책을 보존한다.
- dequeue는 synthetic retry ID가 아니라 원본 예약 ID로 token을 검증한다.
- 유효한 반복 예약의 재시도 실행과 원본 예약 삭제 후 재시도 취소를 양방향
  테스트가 확인한다.
- 라운드 1~2의 cleanup, lifecycle, IPC 검증, queued 예약 취소 수정도
  유지되는 것을 읽기 전용 분리 리뷰로 확인했다.
- 리뷰어는 자동 gate를 재실행하지 않았으며, 아래 최신 Windows 검증 기록을
  근거로 판정했다.

### 사용자 UI 검증 피드백

- 예약 방식 선택을 폼 내부의 큰 segmented control에서 `새로운 예약 추가`
  제목 오른쪽의 작은 pill switch로 이동했다.
- 모달을 열면 리뉴얼을 기본으로 선택한다. 레거시는 switch에서 명시적으로
  선택하며 기존 입력과 실행 의미는 변경하지 않는다.
- 레거시와 리뉴얼 예약 목록은 선택 모드와 무관하게 하나의 목록에서 함께
  표시한다.
- 왼쪽 설정과 오른쪽 예약 목록 비율을 실제 콘텐츠 폭으로 비교했다.
  - `3:1`은 오른쪽이 220~250px 수준이라 예약 상세가 자주 잘렸다.
  - `2:1`은 설정 648px, 목록 323px로 기능상 충분했으나 설정 폼이 필요 이상으로
    가로로 늘어났다.
  - 최종 `1:1`, 모달 1024px에서 설정 468px, 목록 477px로 기존 설정 폼의
    밀도를 유지하면서 목록 가독성을 확보했다.
- 왼쪽 설정만 독립적으로 스크롤하고 오른쪽 목록과 footer는 고정한다.
- 예약 상세는 한 줄 말줄임 대신 필요한 만큼 줄바꿈하며, 840px 이하에서는
  기존과 유사한 세로 배치로 전환한다.
- `한 번 · 지정 시각`은 입력이 하나뿐이므로 설정 pane 전체 폭을 사용한다.
  `시간 범위`를 선택했을 때만 시작·종료 입력을 2열로 표시한다.
- 날짜와 시각을 별도 필드로 분리했던 중간 해석은 폐기했다. 최종 UI는 하나의
  날짜·시각 트리거와 하나의 팝업을 유지하며, 팝업 왼쪽의 달력과 오른쪽의
  시·분·초 가로 선택을 함께 표시한다.
- 브라우저 기본 `datetime-local` 팝업은 내부 시각 UI를 스타일링할 수 없어
  제거했다. 저장 형식은 기존 계획대로 `YYYY-MM-DDTHH:mm:ss`를 유지한다.
- 시 선택값 자체가 `00~23`이므로 별도 `24H` 배지는 표시하지 않는다.

### 리뷰 라운드 5

판정: `통과 — 지적 없음`

- 리뉴얼 기본 선택과 modal open 시 입력 초기화가 일관되게 적용된다.
- compact switch는 native button, `role="group"`, `aria-label`,
  `aria-pressed`로 키보드 접근성을 유지한다.
- 선택 모드와 무관한 공유 목록, 1024px `1:1` grid, 왼쪽 독립 스크롤,
  오른쪽 목록 스크롤, 고정 footer 구조를 확인했다.
- 목록 줄바꿈, `min-width: 0`, 고정 삭제 버튼 및 840px 이하 세로 fallback이
  가로 넘침과 스크롤 소유권을 적절히 처리한다.
- 기존 조건부 payload, 삭제 처리, 레거시 종료 설정과 리뉴얼 실행 의미에는
  변경이 없다.
- 리뷰어는 자동 gate를 재실행하지 않았으며, 아래 최신 Windows 검증 기록을
  근거로 판정했다.

### 리뷰 라운드 6

판정: `통과 — 지적 없음`

- `한 번 · 지정 시각`에서만 `renewed-time-fields single`을 적용해 1열 전체
  폭을 사용한다.
- `시간 범위` 전환 시 `single`을 제거해 기존 시작·종료 2열을 유지하며,
  daily/weekly의 recurring grid에는 영향을 주지 않는다.
- UI 테스트가 지정 시각의 `single` 존재와 범위 전환 후 부재를 양방향으로
  확인한다.
- 일정 데이터, 조건부 payload, IPC와 서비스 동작에는 변경이 없다.
- 리뷰어는 자동 gate를 재실행하지 않았으며, 아래 최신 Windows 검증 기록을
  근거로 판정했다.

### 리뷰 라운드 7

판정: `반려`

- 커스텀 달력 팝업의 작은 viewport 높이 처리, portal 포커스 이동·복귀,
  시작 시각 이후로 종료 시각을 보정하는 경로가 부족하다는 지적을 받았다.
- 위 지적 수정 중 소유자가 커스텀 달력 팝업 자체를 폐기하고 기존 레거시
  `TimeSelect` 형식을 공용화하도록 제품 결정을 변경했다.
- 따라서 라운드 7의 팝업 지적은 폐기된 구현에 대한 기록으로 보존하며,
  대체된 TimeSelect 구현을 별도 라운드에서 다시 검토한다.

### 소유자 결정 변경 — TimeSelect 공용화

이 절은 앞선 커스텀 달력 팝업 결정을 대체한다. 이전 팝업 관련 항목과 검증
기록은 의사결정 이력일 뿐 현재 제품 계약이 아니다.

- 리뉴얼 한 번 예약은 커스텀 달력이나 portal을 사용하지 않는다.
- 기존 레거시 `예약 시간`과 같은 가로 `TimeSelect` 스타일을 공용으로
  재사용한다.
- 지정 시각과 범위의 시작·종료는
  `YYYY / MM / DD | HH:mm:ss` 순서로 표시한다.
- 설정 pane 폭 안에서 각 행의 가로 포맷을 보존하기 위해 범위의 시작·종료는
  위아래 두 행으로 배치한다.
- 매일·매주는 같은 시각부 `HH:mm:ss` 스타일을 사용한다.
- 리뉴얼 계약에 필요한 초 선택만 공용 `TimeSelect`에 최소 확장한다.
- 커스텀 달력 팝업 코드·CSS·전용 테스트는 제거한다.
- 저장 계약은 한 번 `YYYY-MM-DDTHH:mm:ss`, 반복 `HH:mm:ss`를 그대로
  유지하며 scheduler·IPC에는 변경을 가하지 않는다.

### 리뷰 라운드 8

판정: `반려`

- 키보드로 TimeSelect 목록을 연 뒤 `Tab`으로 다음 선택부로 이동하면 목록이
  남는 문제를 지적받았다.
- trigger의 고정 ARIA 이름이 현재 값을 덮고, 열린 listbox의 선택 option과
  trigger가 연결되지 않는 문제를 지적받았다.
- 공용 TimeSelect에 idempotent `onClose`를 추가해 `Tab`, `Escape`, blur,
  외부 클릭과 항목 선택에서 목록을 닫도록 수정했다.
- trigger를 select-only `combobox`로 표현하고 접근 가능한 이름에 현재 값을
  포함했다. `aria-controls`와 `aria-activedescendant`가 열린 listbox와 현재
  선택 option을 가리키도록 수정했다.
- 레거시 예약 시간에도 `예약 시간 연도/월/일/시/분`의 의미 있는 ARIA 이름과
  현재 값을 제공한다.
- 처음에는 blur만으로 `Tab` 닫기를 처리했으나 실제 숨김 Electron에서 목록이
  남는 것을 확인해 키보드 핸들러의 명시적 `Tab` 닫기로 보강했다.

### 리뷰 라운드 9

판정: `통과 — 지적 없음`

- `onClose`가 토글과 분리된 멱등 동작이며 `Tab`, `Escape`, blur, 외부 클릭,
  항목 선택에서 일관되게 목록을 닫는다.
- `Tab`의 기본 동작을 막지 않아 다음 선택부로 포커스가 이동하고, option
  `mousedown`에서 trigger 포커스를 보존해 클릭 선택이 blur로 소실되지 않는다.
- select-only `combobox`의 현재 값 포함 이름, 고유 listbox 연결, 선택 option
  연결이 여러 TimeSelect 인스턴스에서 충돌 없이 유지된다.
- 레거시 5개 선택부의 한국어 의미·현재 값 라벨과 기존 옵션 필터링·보정 동작이
  함께 유지된다.
- custom popup·portal 잔재, TimeSelect 레이아웃, 범위 종료 보정, 저장 문자열,
  scheduler·IPC 계약에서 추가 지적이 없었다.
- 리뷰어는 자동 gate를 재실행하지 않았으며 아래 최신 Windows 검증 기록과
  현재 소스를 근거로 판정했다.

### 사용자 UI 검증 피드백 — 한 번 예약의 과거 시각

- 리뉴얼 `한 번`의 지정 시각 또는 범위 시작 시각에서 현재보다 과거인
  시·분·초를 선택하면 과거 값은 기존처럼 반영하지 않는다.
- 조용히 최소 시각으로 보정하던 동작에
  `현재보다 과거로 설정할 수 없습니다.` 토스트를 추가한다.
- 범위 종료 시각의 최소값은 현재가 아니라 시작 시각이므로 이번 토스트 대상에
  포함하지 않고 기존 시작·종료 보정 규칙을 유지한다.
- 매일·매주는 날짜가 없는 반복 시각 계약이므로 과거 시각 토스트 대상이 아니다.

### 리뷰 라운드 10

판정: `반려`

- 처음 구현은 30초마다 갱신되는 Renderer `currentTime`을 최소 시각으로
  사용해, 갱신 사이에 새로 과거가 된 초 단위 값이 토스트 없이 반영될 수
  있다는 지적을 받았다.
- 선택 순간의 `Date.now()`를 초 단위 UI에서 표현 가능한 다음 유효 초로
  올림하고, 이 fresh minimum을 과거 판정과 값 보정에 함께 사용하도록
  수정했다.
- 회귀 테스트는 화면 시각 스냅샷 뒤로 실제 시각만 진행시킨 다음 두 시각
  사이의 값을 다시 선택해, 토스트와 6개 날짜·시각 선택부 전체가 다음 유효
  초로 보정되는지 확인한다.

### 리뷰 라운드 11

판정: `통과 — 지적 없음`

- 선택 순간의 `Date.now()`를 다음 표현 가능한 초로 올려 30초 화면 스냅샷과
  밀리초 절삭 경계를 모두 해소한다.
- 같은 fresh minimum을 토스트 판정과 실제 clamp에 사용해 안내와 보정값이
  어긋나지 않는다.
- resolver와 토스트 콜백은 한 번 예약의 공용 시작 선택부에만 연결되어
  지정 시각·범위 시작에 적용되고 범위 종료·매일·매주에는 적용되지 않는다.
- 보정값이 기존 시작 변경 경로를 통과해 범위 종료 자동 보정과 저장 형식을
  유지한다.
- 경계 회귀 테스트가 라운드 10의 실패 조건과 전체 6개 날짜·시각 보정값을
  직접 검증한다.
- 리뷰어는 자동 gate를 재실행하지 않았으며 아래 최신 Windows 검증 기록과
  현재 소스를 근거로 판정했다.

### 소유자 결정 변경 — 레거시와 같은 분 단위 현재 시각 추적

이 절은 앞선 리뉴얼 초 단위 선택과 “다음 유효 초” 보정 결정을 대체한다.
이전 초 단위 관련 구현·검증 기록은 의사결정 이력일 뿐 현재 제품 계약이 아니다.

- 리뉴얼 한 번의 지정 시각과 범위 시작·종료는 레거시와 같은
  `YYYY / MM / DD | HH:mm` 형식을 사용하고 초 선택부를 표시하지 않는다.
- 매일·매주도 `HH:mm`만 표시한다.
- 내부 저장 계약은 기존 scheduler·validator 호환을 위해 초 자리를 유지하되
  UI에서 생성하는 값은 항상 `:00`으로 정규화한다.
- 한 번 예약의 기본 시작 시각은 모달을 연 현재 분으로 설정한다.
- 레거시의 reactive auto-correction과 같이, 모달을 열어둔 사이 선택한 시작
  시각이 과거가 되면 30초 시계 갱신 때 현재 분으로 이동한다.
- 사용자가 미래 시작 시각을 선택한 경우 그 시각이 지나기 전에는 유지하고,
  지난 뒤에만 현재 분으로 이동한다.
- 자동 이동에는 토스트를 띄우지 않는다. 사용자가 과거 분을 직접 선택하면
  `현재보다 과거로 설정할 수 없습니다.` 토스트를 표시하고 현재 분으로
  보정한다.
- 범위 종료는 시작이 종료 이상으로 이동할 때 시작+30분으로 맞추는 기존
  보정 규칙을 유지한다.
- 매일·매주는 반복 벽시계 시각이므로 현재 시각을 따라 이동하지 않는다.

### 리뷰 라운드 12

판정: `반려`

- 모달이 닫힌 동안 마지막 30초 `currentTime` 갱신 직후 분 경계가 지나고
  다음 갱신 전에 모달을 열면, 열기 초기화가 낡은 시각을 사용해 기본 시작이
  잠시 이전 분으로 표시될 수 있다는 지적을 받았다.
- 모달 열기 순간의 단일 `new Date()`를 `currentTime`, 레거시 시간 선택부,
  리뉴얼 시작·종료·반복 시각 초기값에 함께 사용하도록 수정했다.
- 닫힌 상태 `12:30:50`에서 마운트한 뒤 interval을 실행하지 않고 실제 시각만
  `12:31:05`로 옮겨 모달을 열었을 때 기본 시작이 `12:31`인지 확인하는 회귀
  테스트를 추가했다.
- 미래 `12:32` 선택은 현재 분이 `12:32`인 동안 유지되고 다음 분
  `12:33`부터 현재 분을 따라가는 조건도 회귀 테스트로 고정했다.

### 리뷰 라운드 13

판정: `통과 — 지적 없음`

- closed→open 전환에서 열기 시각을 한 번만 읽어 `currentTime`과 레거시·
  리뉴얼 초기값에 함께 사용하므로 라운드 12의 stale minute 경로가 제거됐다.
- 초기화 effect가 `currentTime`에 의존하지 않아 fresh 시각 반영에 따른
  재렌더에서도 입력값을 반복 초기화하지 않는다.
- 닫힌 상태 분 경계 회귀 테스트와 미래 분 유지·경과 후 이동 테스트가 각각
  실패 조건을 직접 검증한다.
- 수동 과거 선택의 토스트·현재 분 보정, 초 제거, `:00` 저장 호환, 범위 종료
  보정, 반복 벽시계 비추적, 레거시 TimeSelect 레이아웃·접근성에서 추가
  blocker가 없었다.
- Windows QA 터미널 숨김 규칙은 기존 격리 프로필·숨김 Electron 원칙을
  보강하며 제품 런타임 계약에는 영향을 주지 않는다.
- 리뷰어는 자동 gate를 재실행하지 않았으며 아래 최신 Windows 검증 기록과
  현재 소스·테스트·작업 문서를 근거로 판정했다.

### 사용자 UI 추가 — 범위 종료 방식

- 리뉴얼 `한 번 → 시간 범위`의 종료 라벨 오른쪽에 compact switch
  `시간 단위 | 사용자 지정`을 배치한다.
- 기본값은 `시간 단위`이며 시작 시각부터 몇 시간 동안 확인할지 양의 정수
  숫자 입력으로 받는다. 기본 입력값은 1시간이다.
- 시간 단위의 실제 `endsAt`은 시작 시각 + 입력 시간으로 Renderer에서
  계산한다. 기존 `once-range` 저장·IPC·scheduler 계약은 변경하지 않는다.
- `사용자 지정`으로 전환하면 계산된 종료 시각을 이어받아 기존
  `YYYY / MM / DD | HH:mm` 종료 선택부를 표시한다.
- 예상 확인 수, 180회 초과 경고, 폼 유효성, 최종 저장은 현재 선택한 종료
  방식의 유효 종료 시각을 같은 기준으로 사용한다.
- 시간 단위에서 시작 시각이 현재 분을 따라 이동하면 종료 시각도 같은 기간을
  유지하며 함께 이동한다.

### 리뷰 라운드 14

판정: `통과 — blocker 없음`

- 파생 종료 시각이 예상 확인 수, 180회 경고, 폼 유효성, 최종 `endsAt`
  저장의 단일 기준으로 사용된다.
- 빈값·0·음수·소수·NaN과 날짜 범위를 넘는 값은 fail-closed로 차단되며
  `toISOString()`은 유효성 통과 뒤에만 실행된다.
- 시간 단위 종료는 시작값에서 매번 파생되므로 자동 현재 분 이동과 수동 시작
  변경에도 같은 시간 길이를 유지한다.
- 사용자 지정 전환은 유효 파생 종료값을 picker에 이어받고, 시간 단위로
  돌아가면 보존된 숫자 입력으로 다시 파생한다.
- 기존 `once-range` 저장·shared scheduler·IPC·레거시 계약에는 변경이 없다.
- switch의 명명된 group·`aria-pressed`·button semantics와 숫자 입력의
  `min=1`·`step=1`·접근성 이름이 적절하며 compact 실측 폭과 일치한다.
- 리뷰어는 자동 gate를 재실행하지 않았으며 아래 최신 Windows 검증 기록과
  현재 소스·테스트·작업 문서를 근거로 판정했다.

### 사용자 UI 추가 — 예약 추가 불가 사유

- 리뉴얼 예약의 정상 추가 경로는 Main 저장 후 config 변경 이벤트를 통해
  `renewedPatchReservations`를 갱신하고, 오른쪽 공용 목록이 해당 배열을 함께
  렌더링한다. 숨김 Electron에서 정상 추가 시 저장값과 목록 수가 함께 증가함을
  확인했으므로 별도 optimistic 목록 상태는 추가하지 않는다.
- 사용자가 관찰한 현상은 기존 예약이 없는 상태에서 리뉴얼 예약을 추가한 뒤
  목록에 보이지 않은 경우다. 이 현상을 레거시 항목 아래로 밀린 경우나 기본
  한 번 예약의 비활성 버튼 문제로 단정하지 않는다.
- 동일 조건을 새 격리 프로필에서 `예약 0개 → 리뉴얼 → 한 번 → 10분 뒤 지정
  시각 → 추가` 순서로 다시 검증했다. Main 저장 결과, config 변경 이벤트,
  공용 목록이 모두 `0개 → 1개`로 갱신됐고 런타임 오류는 없었다. 따라서 목록
  렌더링 코드는 별도로 변경하지 않았으며, 이전 인스턴스에서 관찰된 원인은 당시
  로그가 없어 확정하지 않는다.
- 아래 추가 불가 사유 개선은 정상 등록 후 목록 갱신과 별개의 UX 보완이다.
  기본 한 번 예약은 현재 분을 표시하므로 즉시 추가하려 할 때 시작 시각이
  유효하지 않고, 기존 native `disabled`는 클릭·키보드 이벤트를 모두 막아
  사용자에게 원인을 알릴 수 없었다.
- 추가 버튼의 비활성 시각 표현은 유지하되 native `disabled`를 사용하지 않고
  `aria-disabled`와 `.is-disabled`로 상태를 표시한다. 클릭 또는 키보드 실행 시
  현재 실패 조건에 맞는 토스트를 표시하며, invalid payload는 제출하지 않는다.
- 한 번 시작 시각, 시간 단위 예약 시간, 사용자 지정 종료 시각, 확인 간격,
  매일·매주 시각·요일과 레거시 누락·잘못된 시각에 각각 구체적인 불가 사유를
  제공한다.
- 한 번 예약의 실제 제출 순간에도 시각을 다시 읽어, 렌더 뒤 시간이 경과한
  경계에서는 기존 `이미 지난 시각에는 리뉴얼 예약을 추가할 수 없습니다.`
  방어를 유지한다.

### 리뷰 라운드 15

판정: `반려`

- 버튼의 `.is-disabled`·`aria-disabled`·title이 폼 유효성만 기준으로 계산되어,
  실제 제출을 차단하는 `hasError`와 레거시 현재 분에서는 활성 상태로 노출되는
  불일치가 지적됐다.
- 제출 차단 사유를 `hasError → 리뉴얼 폼 사유 또는 레거시 폼 사유` 순서로 한
  번만 계산하고, `handleAdd`, `.is-disabled`, `aria-disabled`, title이 모두 같은
  값을 사용하도록 수정했다.
- 레거시 누락·현재 분·잘못된 시각도 같은 사유 계산에 포함하고 native
  `disabled`는 계속 사용하지 않아 클릭·키보드 토스트 경로를 유지한다.
- `hasError`와 레거시 현재 분에서 `aria-disabled=true`, 정확한 title·토스트,
  각 추가 콜백 미호출을 검증하는 회귀 테스트를 추가했다.

### 리뷰 라운드 16

판정: `통과 — 지적 없음`

- `addUnavailableReason`을 `handleAdd`, `.is-disabled`, `aria-disabled`, title이
  함께 사용하므로 라운드 15의 실제 guard·표시 상태 불일치가 해소됐다.
- native `disabled` 없이도 사유가 있으면 첫 guard에서 반환하므로 클릭·키보드
  토스트 경로와 invalid payload 미제출을 동시에 유지한다.
- 리뉴얼 한 번의 렌더 후 시각 경계는 별도 fresh `Date.now()` guard가 계속
  차단한다.
- 신규 `hasError`·레거시 현재 분 테스트가 정확한 사유·ARIA·콜백 미호출을
  검증하며, 정전 후 복원한 기존 8개 테스트도 직전 계약과 일치함을 확인했다.
- 리뷰어는 자동 gate를 재실행하지 않았으며 아래 최신 Windows 검증 기록과 현재
  소스·테스트·작업 문서를 근거로 판정했다.

## 구현 검증 기록

- `[Windows-pwsh]` 전체 테스트: 58개 파일, 312개 테스트 통과
- `[Windows-pwsh]` ESLint 전체 `src`: 통과
- `[Windows-pwsh]` TypeScript `--noEmit`: 통과
- `[Windows-pwsh]` `build:check` 상당의 TypeScript + Vite renderer/main/preload
  빌드: 통과
- `[Windows hidden Electron]` 실제 Electron을
  `ELECTRON_START_HIDDEN=true`와 전용 임시 user-data 프로필로 실행했다.
  - Main 로그에서 `Starting hidden (minimized to tray)` 확인
  - 실제 CDP renderer target `http://localhost:54321/` 확인
  - 리뉴얼 한 번·시간 범위에서 예상 최대 181회, 빨간 경고 아이콘, 합의 문구,
    클릭 툴팁, body 내부 스크롤 확인
  - fatal 화면 없음 확인
  - QA 종료 후 9222/54321 포트와 임시 user-data 프로필 정리
- `[Windows hidden Electron]` UI 피드백 반영 후 별도 임시 프로필로
  `1:1 / 1024px` 레이아웃을 다시 검증했다.
  - 설정 468px, 목록 477px, 모달 client width 1024px 확인
  - 리뉴얼 기본 선택과 header 우측 compact switch 확인
  - 레거시·리뉴얼 예약이 같은 목록에 함께 표시되는 것 확인
  - 설정은 독립 스크롤, 예약 상세는 가로 넘침 없이 표시되는 것 확인
  - fatal 화면 없음, QA 종료 후 9333/54321 포트와 임시 프로필 정리
- `[Windows hidden Electron]` 날짜·시각 팝업을 별도 54322/9333 인스턴스와
  임시 user-data 프로필로 다시 검증했다.
  - 단일 트리거에 `YYYY-MM-DD HH시 mm분 ss초` 표시 확인
  - 같은 팝업 안에서 달력과 시·분·초 가로 배치 확인
  - 팝업 560×355px, viewport 내부 배치, 달력 표시 확인
  - 시 24개(`00~23`), 분·초 각 60개(`00~59`) 및 `24H` 문구 없음 확인
  - native `datetime-local`/`time` 입력 없음, fatal/console 오류 없음 확인
  - QA 종료 후 9333/54322 포트와 임시 user-data 프로필 정리
- 위 날짜·시각 팝업 검증은 이후 소유자 결정으로 폐기된 구현의 이력이며 현재
  제품 검증 근거로 사용하지 않는다.
- `[Windows hidden Electron]` 최종 TimeSelect 공용화 UI를 전용 CDP 9333과
  임시 user-data 프로필로 다시 검증했다.
  - 한 번·지정 시각이 `YYYY / MM / DD | HH:mm:ss`의 6개 선택부로 표시되고
    설정 pane 폭 안에 들어가는 것 확인
  - 한 번·시간 범위의 시작·종료가 위아래 두 행으로 배치되며 두 행 모두
    client/scroll width 420px로 가로 넘침 없는 것 확인
  - 초 목록 60개(`00~59`), 매일·매주 시각부 `HH:mm:ss` 3개 선택부 확인
  - native `datetime-local`/`time` 입력과 별도 popup/dialog 없음 확인
  - fatal 화면과 console 오류 없음 확인
  - QA 종료 후 전용 PID·9333 포트·임시 user-data 프로필을 정리하고 사용자
    확인용 9222/54321 앱이 유지되는 것 확인
- `[Windows hidden Electron]` 리뷰 라운드 8 접근성 보강을 별도 숨김
  인스턴스에서 확인했다.
  - trigger가 현재 값 포함 ARIA 이름과 `combobox` 역할을 제공하는 것 확인
  - `aria-controls`가 실제 열린 listbox를, `aria-activedescendant`가 현재
    `aria-selected` option을 가리키는 것 확인
  - 실제 `Tab` 입력이 다음 분 선택부로 포커스를 이동하면서 목록을 닫고,
    `Escape`가 trigger 포커스를 유지한 채 목록을 닫는 것 확인
  - 레거시 연도 선택부도 현재 값 포함 ARIA 이름을 제공하는 것 확인
  - fatal 화면과 console 오류 없음, 전용 PID·9333·임시 프로필 정리 후
    사용자 확인용 9222/54321 앱 유지 확인
- `[Windows hidden Electron]` 한 번·지정 시각에서 현재 19시보다 과거인
  18시를 실제 TimeSelect로 선택해 토스트 동작을 확인했다.
  - `현재보다 과거로 설정할 수 없습니다.` warning 토스트 표시 확인
  - 선택값은 19시로 유지되고 18시가 반영되지 않는 것 확인
  - 목록이 닫히고 fatal 화면·console 오류가 없는 것 확인
  - 전용 PID·9333·임시 프로필 정리 후 사용자 확인용 9222/54321 앱 유지 확인
- `[Windows hidden Electron]` 리뷰 라운드 10의 fresh clock 경계를 별도
  격리 인스턴스에서 검증했다.
  - 화면 선택값 `19:55:05`에서 선택 순간만 `19:55:05.250`으로 진행시킨 뒤
    같은 초를 다시 선택해 30초 화면 스냅샷과 실제 현재 시각 사이를 재현
  - warning 토스트가 표시되고 전체 날짜·시각 선택값이 다음 유효 초인
    `2026/07/25 19:55:06`으로 보정되는 것 확인
  - 목록이 닫히고 fatal 화면·console 오류가 없는 것 확인
  - WSL 자식 환경의 `npm run dev`는 `chcp`를 찾지 못해 앱 진입 전에
    종료되어, 같은 Windows Vite/Electron 진입점을 Windows Node로 직접 실행
  - QA Vite/Electron 프로세스 트리, 9333/54321 포트와 임시 프로필 정리 확인
- `[Windows hidden Electron]` 소유자 결정에 따른 분 단위 선택부와 레거시식
  시작 시각 추적을 별도 격리 인스턴스에서 다시 검증했다.
  - 한 번·지정 시각이 `YYYY / MM / DD | HH:mm`의 5개 선택부로 표시되고 초
    선택부가 없는 것 확인
  - 모달을 연 시각 `20:04`가 기본 시작 시각에 반영되고 CDP 가상 시각을
    61초 진행하자 시작 시각이 `20:05`로 이동하는 것 확인
  - 한 번·시간 범위의 시작·종료가 각각 5개 선택부로 표시되고 설정 pane
    안에서 가로 넘침이 없는 것 확인
  - 매일 시각부가 `HH:mm`의 2개 선택부로 표시되고 초 선택부가 없는 것 확인
  - 현재보다 과거인 19시를 직접 선택하면
    `현재보다 과거로 설정할 수 없습니다.` 토스트가 표시되고 현재 20시로
    보정되며 목록이 닫히는 것 확인
  - fatal 화면과 console 오류 없음, 전용 PID·9333·임시 프로필 정리 확인
- `[Windows hidden Electron]` 리뷰 라운드 12의 모달 열기 경계를 콘솔
  창까지 숨긴 별도 인스턴스에서 다시 검증했다.
  - 기존 renderer timer를 멈춘 닫힌 모달에서 `Date`만 60초 앞으로 이동한 뒤
    예약 모달을 열어, 낡은 시계 스냅샷 대신 fresh open minute `20:17`이
    5개 선택부에 표시되는 것 확인
  - 초 선택부 없음, fatal 화면과 runtime exception 없음 확인
  - Vite/Electron은 `Start-Process -WindowStyle Hidden`과 파일 로그로 실행해
    PowerShell·cmd·console 창도 표시하지 않았고, QA 종료 후 전용 프로세스
    트리·54321/9333 포트·임시 프로필 정리 확인
- `[WSL]` `AGENTS.md`의 숨김 Electron QA 규칙에 agent가 시작한 Windows
  터미널·console host도 숨기고 장기 프로세스 로그를 파일로 남기도록 추가했다.
- `[Windows-pwsh]` 위 분 단위 변경 후 전체 테스트 58개 파일·312개 테스트,
  전체 ESLint, TypeScript `--noEmit`, Vite renderer/main/preload 빌드를 다시
  통과했다. `[WSL]` `git diff --check`도 통과했다.
- `[Windows-pwsh]` 리뷰 라운드 12 수정 후 전체 테스트 58개 파일·313개
  테스트, 전체 ESLint, TypeScript `--noEmit`, Vite renderer/main/preload
  빌드를 다시 통과했다. `[WSL]` `git diff --check`도 통과했다.
- `[Windows hidden Electron]` 시간 단위 범위 종료 UI를 사용자 앱과 분리된
  54322/9333 인스턴스 및 임시 프로필에서 검증했다.
  - `종료` 라벨 오른쪽 같은 행에 144px compact
    `시간 단위 | 사용자 지정` switch가 표시되고 기본 선택이 `시간 단위`인 것
    확인
  - 기본 숫자 입력값 1, 시작 시각 선택부 1행, 종료 영역과 switch 모두 가로
    넘침이 없는 것 확인
  - 숫자 입력을 3으로 바꾸고 `사용자 지정`으로 전환하자 종료 선택부가
    시작 `20:39`에서 정확히 3시간 뒤인 `23:39`를 이어받는 것 확인
  - 같은 3시간·1분 간격에서 예상 최대 181회와 경고 아이콘이 유지되는 것 확인
  - 숫자 입력을 72px compact 필드로 보정한 뒤 실제 Electron screenshot에서
    `시작 시각부터 [3] 시간 동안` 배치 확인
  - fatal 화면과 runtime exception 없음, 숨김 terminal/file log 사용, QA
    프로세스 트리·54322/9333·임시 프로필 정리 후 사용자 앱
    54321/9222 PID가 그대로 유지되는 것 확인
- `[Windows-pwsh]` 시간 단위 범위 종료 UI 반영 후 전체 테스트 58개 파일·
  313개 테스트, 전체 ESLint, TypeScript `--noEmit`, Vite
  renderer/main/preload 빌드를 통과했다. `[WSL]` `git diff --check`도 통과했다.
- `[Windows hidden Electron]` 추가 불가 사유와 정상 목록 갱신을 사용자 앱과
  분리된 54322/9333 인스턴스 및 임시 프로필에서 확인했다.
  - 기본 한 번 예약 버튼은 비활성 스타일·`aria-disabled=true`를 유지하면서
    native `disabled=false`이고, 클릭 시
    `확인 시각을 현재보다 이후로 설정해주세요.` 토스트가 표시되는 것 확인
  - 시간 범위의 예약 시간을 0으로 입력한 뒤 클릭하면
    `예약 시간을 1시간 이상의 정수로 입력해주세요.` 토스트가 표시되고, 두
    invalid 경로 모두 예약 목록과 저장값이 변하지 않는 것 확인
  - 매일로 전환해 정상 추가하자 저장된 리뉴얼 예약과 공용 목록이 모두
    `1개 → 2개`로 갱신되고 성공 토스트가 표시되는 것 확인
  - fatal 화면과 runtime exception 없음, 전용 프로세스 트리·54322/9333·임시
    프로필 정리 확인
- `[Windows-pwsh]` 추가 불가 사유 반영 후 대상 모달 테스트 8개와 전체 테스트
  58개 파일·313개 테스트, 전체 ESLint, TypeScript `--noEmit`, Vite
  renderer/main/preload 빌드를 통과했다.
- 정전 후 아직 untracked였던 모달 테스트 파일이 전체 NUL로 손상된 것을 대상
  테스트의 parse error로 발견했다. 분리 리뷰어가 직전 읽은 8개 테스트 계약과
  fixture·assertion을 대조해 복원하고, 다른 TypeScript·CSS·문서 파일에는 NUL
  손상이 없음을 전수 검사했다.
- `[Windows-pwsh]` 리뷰 라운드 15 수정·복원 후 대상 모달 테스트 10개와 전체
  테스트 58개 파일·315개 테스트, 전체 ESLint, TypeScript `--noEmit`, Vite
  renderer/main/preload 빌드를 통과했다. `[WSL]` `git diff --check`도 통과했다.
- `[사용자]` 레거시 실제 예약, 새 버전 감지 후 실제 패치·게임 실행,
  매일·매주 실행 후 프로세스 정리는 아직 확인 전이다.

### 2026-07-30 드래프트 PR 준비

- 사용자가 현재 변경사항의 커밋 정리와 PR 생성을 요청했다.
- `[Windows-pwsh]` 예약 리뉴얼 관련 테스트를 포함한 57개 파일·314개
  테스트와 전체 ESLint, TypeScript, Vite renderer/main/preload 빌드가
  통과했다.
- 전체 테스트에서는 외부 GGG POE1 공지
  `https://www.pathofexile.com/forum/view-thread/3990635` 본문이 현재 32자로
  짧아, 라이브 통합 테스트의 `50자 초과` 가정 1건만 실패했다. 같은 테스트를
  단독 재시도해 동일 외부 데이터로 재현했으며 예약 리뉴얼 코드 실패는 없었다.
- `[WSL]` `git diff --check`가 통과했다.
- 실제 패치·게임 실행과 매일·매주 후속 프로세스 정리는 위 `[사용자]` 검증
  항목으로 유지하며, PR에서는 완료로 주장하지 않는다.

### 리뷰 라운드 17

판정: `통과 — blocker 없음`

- DoD, 레거시 호환, AppConfig 등록, reserve/delete IPC → typed EventBus →
  service 위임, scheduler lifecycle, per-reservation token/fingerprint,
  `runId` 상관관계, queue/FSM 재검증, UI 조건부 payload와 접근성 계약에서
  blocker가 없었다.
- `origin/master`의 추가 2개 커밋은 workflow와 `package-lock.json`만 변경해
  직접 소스 충돌 가능성은 낮다. 리베이스 후 Windows 게이트를 다시 실행한다.
- 외부 GGG 공지 본문 길이 변화로 재현된 기존 라이브 테스트 1건은 예약 리뉴얼
  blocker가 아니며, PR에서 전체 테스트 통과로 표현하지 않는다.
- 실제 패치·게임 실행과 매일·매주 프로세스 정리는 `[사용자]` 검증 잔여로
  유지한다.
- 리뷰어는 파일 수정·커밋·테스트 실행 없이 현재 diff, 작업 문서와 최신 검증
  기록만으로 판정했다.

## Blast radius

- 신규 additive AppConfig 키와 config.json 영속성
- Renderer → preload → Main의 신규 리뉴얼 예약 reserve/delete 경계
- 서비스 init/stop/config refresh 타이머 수명
- `RemoteVersionResolver` 캐시와 inflight 동시성
- 기존 PatchReservationService 큐/FSM/retry/watchdog
- `AutoPatchHandler` expectation 및 내부 EventBus payload
- 전역 `activeGame/serviceChannel` 변경과 게임 상태
- 프로세스 정리, 카카오 UAC/로그인 자동화, 실제 게임 실행
- PatchReservationModal 높이, dropdown z-index, footer 의미

## 진행 게이트

이 계획 승인은 다음 경계 변경을 포함한다.

1. 신규 additive 설정 키 `renewedPatchReservations`
2. 리뉴얼 예약 전용 reserve/delete IPC
3. 내부 patch reservation 이벤트의 선택적 `runId` 상관관계

계획 승인 후 `master`에서 `feat/patch-reservation-renewal` 브랜치를 만들고
M1부터 순서대로 구현한다. 각 마일스톤 DoD 자체 확인 후 분리 리뷰를 거치며,
실제 게임 패치·실행은 사용자 확인 전까지 완료로 주장하지 않는다.

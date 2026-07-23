# 진단 로그 보관·내보내기 강화

## 상태

- 단계: 구현 통합 완료, 자동 검증 대기
- 기준 브랜치: `master`
- 구현 브랜치: `feat/diagnostic-log-retention`
- 전달 단위: 기존 핫픽스와 분리된 별도 PR
- 구현 권한: 2026-07-24 사용자 승인
- stop-and-ask: 신규 renderer→main IPC 2개 및 fatal IPC payload 변경 승인
- 남은 장벽: Windows gate, 분리 리뷰, 사용자 실동작 확인, 핫픽스 선행 merge
  후 rebase·재검증

구현은 별도 worktree 세 개에서 병렬로 진행해 integration branch에
통합했다. 로그 기능 브랜치는 기존 핫픽스가 `master`에 먼저 반영되기 전에는
push하거나 PR을 만들지 않는다.

## 배경

현재 오류 보고서의 `보고서 복사`는 생성한 Markdown 문자열 전체를
`navigator.clipboard.writeText()`에 전달한다. 첨부 화면처럼 긴 URL이 여러 줄로
보이는 것은 메일 화면의 자동 줄바꿈이며 복사 단계의 문자 절단은 아니다.

다만 복사되는 원본은 전체 런처 로그가 아니다.

- 메인 프로세스 메모리에는 최신 로그 200개만 남는다.
- 오류 보고서에는 그중 오류 로그를 최대 20개만 포함한다.
- renderer/preload에서 `debug-log:send`로 전달한 로그는 현재 메인
  `logHistory`에 합류하지 않는다.
- 오류 보고서의 `발생 시간`은 선택한 오류의 원점 시각이 아니라 모달을 연
  시각이다.

따라서 현재의 짧은 오류 요약·복사 기능은 유지하면서, 런처 Logger 흐름 전체를
파일로 보관하고 사용자가 오류 발생 날짜의 로그를 직접 저장할 수 있는 별도
진단 경로를 추가한다.

## 목표

1. 런처의 main/renderer/preload Logger 메시지를 Electron 앱 로그 경로에
   일자·용량 단위로 보관한다.
2. 기간과 전체 용량 상한을 모두 적용해 로그 저장소가 무한히 커지지 않게 한다.
3. 오류 보고서가 실제 오류 시각을 보존하고 해당 로컬 날짜의 로그가 존재할 때만
   다운로드 버튼을 활성화한다.
4. 같은 날짜의 회전 파일을 사용자가 고른 위치에 ZIP 하나로 저장한다.
5. `정보 → 경로 정보`에서 실제 로그 폴더 경로를 표시하고 복사할 수 있게 한다.
   폴더 열기 동작은 추가하지 않는다.

## 비목표

- 기존 `보고서 복사`의 오류 최대 20개 정책 변경
- 디버그 콘솔의 기존 `report:save` 동작 변경
- 게임 클라이언트 `Client.txt` 또는 카카오 페이지 덤프의 보관 정책 변경
- 로그 자동 업로드 또는 외부 전송
- 로그 폴더 열기 버튼
- 보관 정책을 사용자 설정으로 노출
- `SettingText.copyable` 공통 UI 계약 복구
- 기존 `app:get-path` IPC의 allowlist 보안 정리
- AppConfig schema, migration, `CONFIG_METADATA`, `CONFIG_KEYS`,
  `DEFAULT_CONFIG` 변경
- dependency 추가 또는 major bump

## 현행 근거

### 로그 흐름

- `src/shared/logger-base.ts`는 모든 Logger 메시지를 문자열로 직렬화하고 각
  프로세스의 `emit()`으로 보낸다.
- `src/main/utils/logger.ts`는 메인 로그를 최신 200개 메모리 버퍼에 저장하고,
  AppContext 준비 후 `DEBUG_LOG` EventBus 이벤트를 발생시킨다.
- `src/renderer/utils/logger.ts`와 `src/main/utils/preload-logger.ts`는
  `debug-log:send` IPC로 메인에 전달한다.
- `src/main/events/handlers/DebugLogHandler.ts`는 오류 알림과 개발자 디버그
  콘솔 전송을 담당한다.

파일 기록을 `DebugLogHandler`에 추가하면 bootstrap 로그를 놓치거나 같은 메인
로그를 이중 기록할 수 있다. 파일 sink는 메인 프로세스의 단일 소유로 두고,
메인 Logger와 `debug-log:send` 입구가 하나의 기록 함수를 통과하게 한다.
`DebugLogHandler`는 기존 알림·UI 전달 책임만 유지한다.

### 오류 보고

- `src/shared/debug-log-policy.ts`의 `MAX_RECENT_ERROR_LOGS`는 20이다.
- `src/renderer/components/WindowControls.tsx`가 선택한 오류에는 정확한
  `DebugLogPayload.timestamp`가 있지만 `SHOW_REPORT_MODAL`에 별도 원점 시각을
  전달하지 않는다.
- `src/renderer/components/modals/FatalErrorModal.tsx`는 모달 mount 시각을
  `발생 시간`으로 표시한다.
- fatal 전달은 현재 `app:fatal-error` 문자열 payload이다.
- 기존 `report:save`는 renderer가 보낸 `{ name, content }`를 저장하는 디버그
  콘솔용 경계이다. 디스크 로그 전체를 renderer로 올리지 않도록 이번 기능에는
  재사용하지 않는다.

### 로그 경로

- Electron 43의 `app.getPath("logs")`는 정식 경로 이름이다.
- Windows에서는 별도 `setAppLogsPath()` 지정이 없으면 `userData` 내부에 기본
  로그 폴더가 만들어진다.
- `src/main/store.ts`가 `userData`를
  `%APPDATA%\POE2 Unofficial Launcher`로 고정한다.
- preload의 기존 `getPath(name)`과 메인의 `app:get-path`가 이미
  `app.getPath()`를 renderer에 노출한다.

실제 저장소와 설정 표시 모두 `app.getPath("logs")`를 canonical 경로로
사용한다. 별도 경로를 조합하거나 AppConfig에 복제하지 않는다.

## 권장 기본값

| 항목 | 값 | 이유 |
| --- | ---: | --- |
| 보관 기간 | 14일 | 최근 재현·지원에 충분하면서 개인정보 장기 보관을 제한 |
| 파일당 상한 | 10 MiB | 활성 파일 읽기·첨부 부담과 지나친 segment 생성을 균형화 |
| 전체 상한 | 100 MiB | 비정상 로그 폭주 시에도 디스크 사용량을 제한 |
| 단일 항목 상한 | 512 KiB | 거대한 Error 객체 한 건이 회전·전체 상한을 무력화하지 않게 함 |
| 내보내기 형식 | 날짜별 ZIP 하나 | segment 수와 무관하게 저장·첨부 UX를 일정하게 유지 |

단일 항목을 제한하면 저장 파일에 절단 표시와 원래 byte 크기를 남긴다. 전체
메시지를 자동 업로드하거나 숨겨서 성공으로 표시하지 않는다.

## 설계 원칙

### 소유권과 lifecycle

- 상태 소유자: 메인 프로세스의 진단 로그 저장소 한 곳
- 초기화 phase: `app.whenReady()` 이후, `app.getPath("logs")` 사용이 가능하고
  main window·background service가 본격 시작되기 전
- bootstrap 보강: 초기화 전에 기존 main `logHistory`에 쌓인 항목을 한 번만
  replay
- runtime 유입:
  - main Logger가 만든 payload
  - renderer/preload에서 `debug-log:send`로 들어온 payload
- `DebugLogHandler`에서는 파일을 쓰지 않는다.
- 파일 I/O 실패는 일반 앱 동작, 오류 알림, EventBus 흐름을 실패시키지 않는다.
- 실패 보고에 Logger를 다시 쓰지 않아 재귀를 막고 제한된 terminal
  `console.error`만 사용한다.

### 파일명과 날짜

- 내부 파일명: `launcher-YYYY-MM-DD.NNN.log`
- `YYYY-MM-DD`는 로그 payload의 유효한 timestamp를 런처가 실행 중인 Windows의
  로컬 달력 날짜로 변환한다.
- timestamp가 유한한 숫자가 아니면 ingestion 시각으로 대체한다.
- UTC 날짜와 로컬 날짜를 혼용하지 않는다.
- `NNN`은 같은 날짜의 용량 회전 순번이며 고정 폭으로 정렬 가능해야 한다.
- 파일 크기는 UTF-8 byte 기준으로 `현재 크기 + 새 항목 크기`가 10 MiB를
  초과하기 전에 다음 segment로 회전한다.

### 보관 정리

- 초기화 시 한 번, 날짜 변경 또는 용량 회전 시 다시 수행한다.
- 먼저 14일을 초과한 자체 로그 segment를 정리한다.
- 남은 자체 로그 합계가 100 MiB를 넘으면 가장 오래된 segment부터 제거한다.
- 활성 날짜의 최신 segment는 가능한 한 유지하되 전체 상한을 거짓으로
  보장하지 않는다.
- 정확한 자체 파일명 정규식과 `lstat()`의 일반 파일 조건을 모두 통과한
  항목만 대상으로 한다.
- symlink, directory, 이름 위장 파일, 로그 루트 밖 경로는 읽거나 삭제하지
  않는다.
- 정리는 재귀 탐색을 하지 않는다.

### 비밀·개인정보

디스크 저장 전에 다음 credential류를 보수적으로 치환한다.

- `Authorization` 헤더
- `Cookie` / `Set-Cookie`
- password, access token, refresh token, ID token, client secret
- URL query 또는 직렬화된 객체 안의 인증 code·token·session 계열 값

로컬 설치 경로, Windows 사용자명이 포함될 수 있는 경로, Kakao 계정 ID,
페이지 URL 등은 진단에 필요해 남을 수 있다. 다운로드 UI에는 자동 업로드가
아니며 공유 전에 개인정보를 확인하라는 안내를 표시한다.

## 마일스톤

### M1 — 파일 sink, 회전·보관, 비밀 치환

#### 범위

1. 메인 프로세스 단일 소유 진단 로그 저장소를 추가한다.
2. `app.getPath("logs")` 아래 디렉터리를 만들고 bootstrap history를 한 번
   기록한다.
3. main Logger와 renderer/preload `debug-log:send` 입구를 공통 기록 경로에
   연결한다.
4. 로컬 날짜와 10 MiB 기준의 파일 회전을 구현한다.
5. 14일 및 전체 100 MiB 보관 정리를 구현한다.
6. 단일 항목 512 KiB 제한과 credential redaction을 구현한다.
7. 파일 실패를 앱 기능과 격리하고 중복·재귀를 막는다.

#### DoD

- `[Windows-pwsh]` main/renderer/preload에서 각각 발생시킨 Logger 메시지가
  같은 canonical 로그 폴더에 한 번씩만 기록된다.
- `[Windows-pwsh]` AppContext/EventBus 설정 전 main 로그도 bootstrap
  replay로 보존된다.
- `[Windows-pwsh]` 로컬 자정 직전·직후 timestamp가 서로 다른 날짜 파일에
  기록된다.
- `[Windows-pwsh]` 정확한 UTF-8 byte 경계에서 10 MiB 회전이 발생하고 항목이
  중간에 분할되지 않는다.
- `[Windows-pwsh]` 14일 초과 정리와 100 MiB 전체 상한 정리가 오래된 파일
  순으로 동작한다.
- `[Windows-pwsh]` 자체 패턴 외 파일, symlink, directory는 유지된다.
- `[Windows-pwsh]` credential류는 파일에 원문으로 남지 않고, 로컬 경로와
  진단 문맥은 보존된다.
- `[Windows-pwsh]` 512 KiB 초과 항목에 절단 표시와 원래 크기가 기록된다.
- `[Windows-pwsh]` mkdir/stat/append/read/delete 실패를 주입해도 앱 로깅과
  EventBus가 throw하지 않고 이후 정상 쓰기가 복구된다.

### M2 — 정확한 `occurredAt`, typed IPC, 날짜별 ZIP 저장

#### 범위

1. 공유 오류 보고 타입에 `occurredAt?: number`를 추가한다.
2. 오류 알림에서 선택한 `DebugLogPayload.timestamp`를 modal까지 보존한다.
3. 수동 버그 제보는 최근 오류의 최신 timestamp를 사용한다. 오류가 없으면
   `occurredAt`을 만들지 않는다.
4. fatal payload를 `{ errorDetails, occurredAt }` 형태로 타입화하고 buffer도
   첫 fatal 발생 시각을 보존한다.
5. 다음 두 요청/응답 IPC를 추가한다.
   - `launcher-log:get-export-availability`
   - `launcher-log:save-for-timestamp`
6. renderer는 timestamp만 전달하고 메인 저장소가 로컬 date key와 source
   segment를 결정한다.
7. 같은 날짜의 모든 segment를 결정적 순서로 snapshot한 뒤 기존 `JSZip`으로
   `poe2-unofficial-launcher-logs-YYYY-MM-DD.zip` 하나를 만든다.
8. 사용자가 고른 경로에만 저장하며, 취소·missing·failed·saved를 구분한다.
9. 오류 보고 모달에 availability/저장 상태를 반영한 `로그 다운로드` 버튼과
   공유 전 개인정보 확인 안내를 추가한다.

#### IPC 계약

응답은 boolean 대신 판별 가능한 union을 사용한다.

```ts
type LauncherLogAvailability =
  | {
      status: "available";
      dateKey: string;
      segmentCount: number;
      totalBytes: number;
    }
  | { status: "missing"; dateKey: string }
  | { status: "invalid" | "unavailable" };

type LauncherLogSaveResult =
  | { status: "saved" }
  | { status: "canceled" }
  | { status: "missing" }
  | { status: "failed" };
```

IPC 등록부는 입력 검증과 service 위임만 담당하고, 날짜 계산·파일 탐색·snapshot
생성은 저장소가 소유한다. 요청/응답과 native save dialog가 필요한 경로이므로
새 EventBus broadcast는 추가하지 않는다.

#### snapshot·TOCTOU 규칙

1. 메인에서 timestamp가 유한한 숫자인지 검증한다.
2. native save dialog로 목적지를 먼저 선택한다.
3. 사용자가 취소하면 로그 파일을 읽거나 ZIP을 생성하지 않는다.
4. 저장 직전에 availability를 다시 확인한다.
5. 저장소가 인정한 같은 날짜의 regular segment만 정렬해 immutable snapshot을
   만든다.
6. snapshot 이후 runtime logging은 계속될 수 있으며 ZIP은 snapshot 내용만
   포함한다.
7. availability 확인 뒤 retention이나 외부 삭제로 파일이 사라지면
   `missing`으로 반환한다.
8. renderer 입력으로 source path, filename, date string을 받지 않는다.
9. 원본 segment는 읽기만 하고 손상·이동·이름 변경하지 않는다.

#### UI 상태

- 조회 중: 비활성 `로그 확인 중…`
- 해당 오류 날짜 파일 존재: 활성 `로그 다운로드`
- `occurredAt` 없음: 비활성, 정확한 오류 시점 없음 안내
- 파일 없음: 비활성, 보관된 로그 없음 안내
- 저장 중: 버튼 비활성 및 중복 실행 차단
- saved: 성공 toast
- canceled: 실패 toast를 표시하지 않음
- missing/failed: 사실에 맞는 warning/error toast
- 기능 건의처럼 `showLogs`가 false인 modal에는 버튼을 표시하지 않음

#### DoD

- `[Windows-pwsh]` 선택 오류, 최근 오류 기반 수동 제보, fatal의 원점
  timestamp가 보고서 표시·복사·다운로드 조회에 동일하게 쓰인다.
- `[Windows-pwsh]` 최근 오류가 없는 수동 제보는 모달 시각을 오류 시각으로
  가장하지 않고 버튼이 비활성이다.
- `[Windows-pwsh]` 로컬 자정 직전·직후 오류가 각각 정확한 date key를
  조회한다.
- `[Windows-pwsh]` 같은 날짜의 모든 회전 segment가 결정적 순서와 원래
  파일명으로 ZIP에 포함된다.
- `[Windows-pwsh]` 진행 중인 현재 날짜 파일도 snapshot 시점까지 기록된 마지막
  항목을 포함하고 이후 logging이 계속된다.
- `[Windows-pwsh]` invalid timestamp, 이름 위장, symlink, 다른 날짜 파일,
  로그 루트 밖 경로가 제외된다.
- `[Windows-pwsh]` availability 이후 파일 삭제, 저장 취소, 목적지 쓰기
  실패를 성공으로 표시하지 않는다.
- `[Windows-pwsh]` 기존 보고서 복사, 디버그 콘솔 `report:save`, fatal 재시작
  흐름이 회귀하지 않는다.
- `[사용자]` 실제 Electron 오류 보고서에서 버튼 활성 상태, 원하는 저장 경로
  선택, 취소, ZIP 내부 파일과 오류 날짜를 확인한다.

### M3 — 정보 탭 로그 폴더 경로 표시·복사

#### 범위

`src/renderer/settings/settings-config.ts`의 `정보 → 경로 정보`에 기존
button + description 패턴으로 UI-only 항목을 추가한다.

- id: `btn_copy_logs`
- label: `로그 폴더 경로`
- buttonText: `경로 복사`
- `defaultValue: false`
- `onInit`: `getPath("logs")` 결과를 info description으로 표시
- `onClickListener`: 같은 경로를 Clipboard API로 복사하고 toast 표시
- `openPath()` 호출 없음

AppConfig 또는 새 IPC는 추가하지 않는다. 기존 `app:get-path`의 광범위한
string 계약을 이번 작업에서 축소하면 별도 IPC 호환성 변경이 되므로 범위에
섞지 않는다.

#### DoD

- `[Windows-pwsh]` 설정 callback 테스트에서 `getPath("logs")`를 요청하고
  실제 반환 경로를 description으로 표시한다.
- `[Windows-pwsh]` `경로 복사`가 같은 문자열을 clipboard에 전달한다.
- `[Windows-pwsh]` 성공·실패에 맞는 toast를 표시한다.
- `[Windows-pwsh]` `openPath()`를 호출하지 않는다.
- `[Windows-pwsh]` `config-integrity.test.ts`가 통과한다.
- `[사용자]` 실제 Electron의 `정보 → 경로 정보`에서 표시된 경로와 복사한
  경로가 실제 파일 sink 폴더와 일치한다.
- `[사용자]` 버튼을 눌러도 탐색기나 다른 창이 열리지 않는다.

## 구현·worktree 계획

사용자 승인 뒤 최신 `master`에서 `feat/diagnostic-log-retention`을 만들고
별도 integration worktree를 둔다. 고정된 service/API 계약을 먼저 공유한 뒤
다음 writer worktree를 병렬 배치한다.

| writer | 소유 범위 | 주요 책임 |
| --- | --- | --- |
| persistence writer | 새 파일 sink/service, logger ingress, 저장소 단위 테스트 | M1 |
| report writer | shared report/IPC 타입, preload, IPC 등록, 오류 report UI, 관련 테스트 | M2 |
| settings writer | `settings-config.ts`, 설정 callback 테스트 | M3 |

규칙:

- worktree 하나당 writer 한 명만 제품 파일을 수정한다.
- 공용 계약의 이름·입출력 타입·파일 소유권을 dispatch 전에 고정한다.
- persistence writer는 report writer가 import할 저장소 API를 임의 변경하지
  않는다.
- `main.ts`처럼 충돌 가능성이 높은 공유 파일은 report writer 한 명만
  최종 연결부를 수정한다.
- 각 writer는 자신의 worktree에서만 커밋하고 integration writer가 feature
  브랜치에 순차 반영한다.
- 통합 전에는 다른 writer의 파일을 임의로 수정하지 않는다.

## 구현 진행 기록

### 2026-07-24 — 승인 및 병렬 구현

- 사용자가 신규 typed IPC 2개, fatal payload 변경, 14일/10 MiB/100 MiB/
  512 KiB 기본값, 날짜별 ZIP, credential 치환 정책을 승인했다.
- integration worktree:
  `/mnt/d/project_poe2/poe2-launcher.worktrees/diagnostic-log-retention`
- M1 persistence slice를 `7988f9d`로 통합했다.
- M2 report/export slice를 `11e4c3d`로 통합했다.
- M3 settings slice를 `bbbe085`로 통합했다.
- integration 점검에서 Date 표현 범위를 벗어난 timestamp를 거부하고 내부
  managed logs 경로를 ZIP 저장 대상으로 사용할 수 없도록 IPC 경계를
  보강했다.
- AppConfig schema/default/metadata, migration, dependency와 lockfile은
  변경하지 않았다.

### 남은 검증

- `[Windows-pwsh]` `npm test`
- `[Windows-pwsh]` `npm run lint`
- `[Windows-pwsh]` `npm run build:check`
- 분리 리뷰 최대 3라운드
- `[사용자]` 오류 보고서 ZIP 저장과 정보 탭 경로 복사 실동작 확인
- 핫픽스 선행 merge 후 rebase·전체 gate·분리 리뷰 재실행

## Dependency barrier

1. 사용자 계획 승인 및 stop-and-ask owner decision 확정
2. 별도 feature branch/integration worktree 생성
3. 파일명, date key, 보관 상수, 저장소 API, typed IPC 응답 계약 고정
4. M1/M2/M3 writer 병렬 구현
5. persistence 저장소와 report IPC/UI 통합
6. Windows 단위·정적·build gate
7. 분리 리뷰
8. 실제 Windows 사용자 검증
9. 커밋·별도 PR 생성

M2는 M1의 저장소 API에 의존한다. 소스 구현은 고정된 계약에 맞춰 병렬화할 수
있지만, M2의 완료 판정과 runtime 검증은 M1 통합 이후에만 한다. M3는 canonical
경로가 `app.getPath("logs")`로 확정된 뒤 독립적으로 구현할 수 있다.

## 기존 핫픽스와의 병합 barrier

카카오 로그인 navigation 및 오류 보고 버전 핫픽스도 `main.ts`와 `main.tsx`를
수정하므로 별도 worktree에서의 개발은 병렬 가능하지만 최종 통합 순서가
필요하다.

1. 핫픽스 PR을 먼저 리뷰·사용자 검증한다.
2. 사용자 승인 후 핫픽스가 master에 반영된 다음 로그 기능 브랜치를 최신
   master에 rebase한다.
3. `main.ts`에서는 카카오 navigation 분류와 fatal/log IPC 변경을 모두
   보존한다.
4. `main.tsx`에서는 동기 버전 소스와 `occurredAt` 전달을 모두 보존한다.
5. rebase 후 전체 Windows gate와 분리 리뷰를 다시 수행한다.

로그 기능 PR은 별도로 만들며, rebase 전 검증 결과만으로 최종 통과를 선언하지
않는다.

## 검증 계획

### 자동·정적 검증

- `[WSL]` 변경 파일과 소유 범위 확인
- `[WSL]` `git diff --check`
- `[WSL]` AppConfig schema/default/metadata, migration, dependency 무변경 확인
- `[Windows-pwsh]` 저장소·회전·보관·redaction 단위 테스트
- `[Windows-pwsh]` IPC 입력/응답·snapshot·ZIP 단위 테스트
- `[Windows-pwsh]` 오류 report timestamp 정책 테스트
- `[Windows-pwsh]` 설정 경로 callback 및 config integrity 테스트
- `[Windows-pwsh]` `npm test`
- `[Windows-pwsh]` `npm run lint`
- `[Windows-pwsh]` `npm run build:check`

WSL의 공유 `node_modules`에는 eslint/vitest native Linux binding이 없으므로
lint/test/build를 WSL에서 실행하지 않는다.

### 실제 Windows Electron 검증

`windows-electron-debugging` 절차에 따라 Windows PowerShell에서 런처를
실행하고 terminal log를 먼저 확인한다. 실제 Electron main page를 CDP로
확인하며 WSL mock browser로 대체하지 않는다.

- main/renderer/preload 로그가 실제 `app.getPath("logs")` 폴더에 저장됨
- 현재 날짜 파일과 회전된 segment의 파일명·크기 확인
- 오류 알림에서 보고서를 열 때 실제 오류 시각 표시 확인
- 해당 날짜 로그가 있으면 다운로드 활성, 없으면 비활성 확인
- 사용자가 고른 경로에 ZIP 저장 및 내부 segment·내용 확인
- 저장 취소 시 파일 생성 및 성공 toast 없음
- 설정 정보 탭의 경로 표시·복사 확인
- 경로 복사 시 탐색기·외부 창이 열리지 않음
- fatal 재시작, 기존 보고서 복사, 디버그 콘솔 저장 회귀 없음

## 리뷰 계획

구현자와 분리된 리뷰어가 다음 범위로 최대 3라운드 리뷰한다.

- 각 마일스톤 DoD
- main 프로세스 단일 소유와 bootstrap/runtime ordering
- 중복 기록·Logger 재귀·파일 실패 격리
- 보관 정리의 대상 제한과 비파괴성
- credential redaction 및 개인정보 안내
- timestamp의 local date 일관성
- IPC 입력 검증, path traversal, symlink, TOCTOU, Windows 파일 잠금
- snapshot 이후 logging 지속
- AppConfig/dependency 무변경
- 기존 report/fatal/debug 흐름 회귀
- 실제 Windows Electron 증거

판정과 지적은 이 문서에 라운드별로 누적한다. `통과` 또는 허용 가능한
`조건부 통과` 전에는 사용자 검증 단계로 넘기지 않는다.

## Blast radius

### 변경되는 범위

- 모든 런처 Logger 메시지의 로컬 디스크 보관
- 앱 시작 시 로그 저장소 초기화
- renderer/preload 로그의 메인 기록 입구
- 오류 report의 실제 발생 시각 전달
- 신규 로그 availability/save IPC 2개
- fatal IPC payload
- 오류 report 다운로드 UI
- 정보 탭의 로그 경로 표시·복사

### 변경하지 않는 범위

- AppConfig와 사용자 config 파일
- config migration
- updater/release 흐름
- Kakao DOM selector·자동화 동작
- 게임 로그 watcher와 패치 판정
- dependency와 lockfile
- 기존 `report:save`
- 자동 외부 전송

로컬 로그에는 경로·계정 ID·페이지 URL 같은 개인정보가 포함될 수 있다.
credential류는 자동 치환하고, 사용자가 다운로드를 명시적으로 선택한 경우에만
ZIP을 만든다.

## Owner decision gate

구현 전 사용자가 다음 권장안을 한 배치로 명시적으로 승인해야 한다.

1. 신규 typed IPC 2개
   - `launcher-log:get-export-availability`
   - `launcher-log:save-for-timestamp`
2. fatal IPC payload를 문자열에서 `{ errorDetails, occurredAt }`으로 변경
3. 보관 기본값
   - 14일
   - 파일당 10 MiB
   - 전체 100 MiB
   - 단일 항목 512 KiB
4. 날짜별 내보내기는 segment 수와 무관하게 ZIP 하나
5. credential류는 자동 치환하고, 그 외 진단 정보는 보존하며 공유 전 확인
   안내 표시

1·2는 IPC 경계 변경이므로 프로젝트 `AGENTS.md`의 stop-and-ask 대상이다.
사용자의 계획 승인은 위 경계와 기본값을 포함한다는 점이 명확해야 한다.

## PR·마무리

- 브랜치: `feat/diagnostic-log-retention`
- PR: 핫픽스와 분리된 별도 PR
- PR 본문: `Summary`, `Motivation`만 작성
- 커밋 제목은 사용자 관점 결과를 나타내는 `feat` 사용
- 실제 Windows 사용자 검증 전 완료 선언 금지
- master 병합은 자동 릴리스 후보가 되므로 별도 사용자 머지 승인 전 실행 금지
- 핫픽스 선행 merge 뒤 rebase·전체 재검증·분리 리뷰를 거친 증거만 최종
  PR 상태로 인정

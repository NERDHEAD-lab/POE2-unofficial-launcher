# 카카오 인증·창 표시 진단 로그 보강

> 작성일: 2026-09-05 · 갱신: 2026-09-05 · 상태: 구현·자동 검증·분리 리뷰 통과, 실동작 미검증 상태로 PR 제출 승인 · 브랜치: fix/kakao-automation-diagnostics

## 승인과 기준점

사용자가 release-please 완료 후 master pull, 브랜치 생성, 추후 로그 반출로 원인을 분석할 수 있는 로그 개선 구현을 승인했다. 앞선 대화에서 제시한 표시 요청 거절 사유, 페이지 이동 전후 상태, 실제 창 표시 결과를 구현한다. 추가 구현 승인을 반복 요청하지 않는다.

release-please `33968016387` 성공을 확인한 뒤 master를 `b627976`에서 `ec8be1d`(1.7.1)로 fast-forward했다. 기존 비추적 `2026-09-04-event-notification-ui.md`의 SHA256 `76256EE114AB15C3B9EFC1E44F06D0ADBDC5BBD32BEE520E987116CDE2DAB426`을 보존한다.

## 설계와 범위

목표는 기존 `launcher-YYYY-MM-DD.NNN.log` 반출만으로 한 번의 실행에서 표시 요청이 생성·전송·거절·적용된 지점을 구분하는 것이다. 구조화된 `[KakaoDiag]` 레코드를 기존 logger/저장소로 전달한다. 별도 로그 파일이나 설정은 추가하지 않는다.

- main은 실행 ID, task, webContents, 창, 현재 문서/확정 문서/request 상태를 소유한다. preload의 원래 문서 ID와 main의 수신 시점 문서 ID를 구분한다.
- 기존 `debug-log:send`로 전송된 새 진단 레코드만 main에서 정규화하고 sender 연결 정보를 보강한다. IPC 채널·인자·타입 계약은 그대로 유지한다.
- gate snapshot은 읽기 전용이다. 기존 허용/거절 판단·페이지 이동·5초 Cloudflare 노출 지연·보안센터 무제한 대기·10초 observer 종료·DOM 셀렉터를 바꾸지 않는다.
- navigation 시작/완료/실패/종료, HTTP 요청 실패 복구 여부, 창 show/hide/close, 표시 요청 정책, 보안센터 state 변화와 observer 종료를 기록한다.
- URL은 알려진 호스트/경로와 프로토콜 종류로 분류한다. 사용자정보, 임의 경로, 쿼리, fragment, DOM, input, HTTP header, raw error는 기록하지 않는다. 숫자/boolean/고정 식별자만 허용하고 반복 기록은 제한한다.
- 런타임 진단만 추가한다. AppConfig, 서비스 lifecycle, 이벤트/IPC 경계, 의존성, 사용자 데이터, 업데이트/배포 동작 변경은 없다. 기존 전체 로그 마스킹을 재설계하지 않는다.

대안인 모든 이벤트 원문 기록은 개인정보와 로그 용량 문제가 있고, 실패 결과 한 줄만 추가하면 전송 전 억제와 페이지 복구를 구별하지 못하므로 위 구조화된 경계 진단을 선택한다.

## M1 구현과 DoD

대상: `src/shared/kakao-diagnostics.ts`, `src/main/kakao/{cloudflare-challenge,session,preload}.ts`, `src/main/main.ts`, 집중 테스트. main과 preload는 작은 진단 호출만 추가한다.

1. [x] [Windows-pwsh] 먼저 실패하는 테스트로 URL/필드 허용 목록, 반복 억제, 기존 로그 저장·반출 보존을 검증한다.
2. [x] [Windows-pwsh] gate의 문서 미확정/이전 문서/작업 challenge/retired 상태와 request 실패 복구·무시를 연결 ID로 구별한다.
3. [x] [Windows-pwsh] preload의 pause/validation 억제, 보안센터 state 전환, observer 실제 종료와 표시 요청을 고정 fixture로 확인한다.
4. [x] [Windows-pwsh] 기존 카카오 관련 테스트, 집중 진단 테스트, lint, build:check 통과. 기존 동작·타이밍과 IPC 인자 유지.
5. [x] [Windows-pwsh] 실제 Windows Electron의 숨김·격리 fixture에서 navigation/요청 거절/창 상태 진단이 로그로 연결되는지 확인한다. 실제 사이트 장애 재현과 구별한다.
6. [x] [Windows-pwsh] 구현과 분리된 리뷰 통과, 기존 사용자 변경 보존.
7. [ ] [사용자] 실제 카카오 로그인·게임 실행·필요한 인증창 처리가 종전대로 동작하는지 확인. 자연 장애 재현이나 과거 원인 확정을 자동 테스트로 대체하지 않는다.

구현 순서: 포맷/보존 실패 테스트 → 최소 helper → gate/main/session 계측 → preload 계측과 fixture → 자동 검증 → 분리 리뷰. writer는 현 세션 하나다. master 머지·릴리스는 별도 사용자 승인 대상이다.

## 사전 분리 설계 검토

`kakao_log_design_review`: 진행 가능. owner 추가 결정 없음. 기존 webRequest listener를 추가 등록해 교체하지 말 것, main 진단에서 preload 원래 문서와 현재 문서를 혼동하지 말 것, 표시 결과는 비동기 resize 이후에만 기록하지 말 것, paused 상태의 전송 누락도 남길 것을 반영한다.

## 검증 결과

- Windows Vitest: 진단 3개 파일, challenge/reveal-delay/preload/login-observer/visibility-policy/game-status-ipc 및 DiagnosticLogStore 선택 실행으로 총 28개 파일 262개 테스트 통과. 필터가 관련 파일도 선택한 실제 결과다.
- 전체 `eslint src`, `npm run build:check`, `git diff --check` 통과. Vite의 기존 설정/청크 크기 경고는 유지된다.
- 실제 빌드 산출물을 Electron 44.1.0으로 실행하고, 임시 프로필과 로컬 HTTPS 보안센터 fixture를 사용했다. 사용자에게 창이 보이지 않도록 QA 주입에서 show/focus를 억제하고 실제 `isVisible()` 값은 유지했다. 실제 인증창 표시 성공 검증과는 구분한다.
- 1차 통과 QA: `C:\Users\nerdl\AppData\Local\Temp\kakao-diagnostics-qa-7GYQqG\result.json`, `diagnostics.jsonl`. 기존 launcher 로그 파일에 54개 구조화 레코드 저장, observer 종료 `timeout` 사유 보존, 이동 중 문서 요청 `document-uncommitted` 거절, 취소 후 `restored`, 표시 적용 요청, 실행/창/문서 연결 정보 및 fixture 민감 값 제외 확인. 소유 Electron PID 84124 정상 종료(code 0), visible 위반 0. 아래 2차 리뷰에서 실제 closed 관측 검증을 추가했다.
- 최초 QA `kakao-diagnostics-qa-XABXtX`는 감시 종료 사유 검사만 실패했다. 실행 중 게임 감지로 첫 시험 창이 about:blank로 정리되었고 두 번째 창도 감시 종료 전 닫은 fixture 문제였다. 두 번째 창을 10초 감시 종료까지 유지하도록 수정한 뒤 위 최종 QA가 통과했다. 제품 감시 시간은 변경하지 않았다.
- 최종 보완 QA: `C:\Users\nerdl\AppData\Local\Temp\kakao-diagnostics-qa-CqdPjq\result.json`, `diagnostics.jsonl`. 56개 진단 레코드와 두 창의 실제 `visibility.observed/closed` 기록을 확인했다. 위 observer/거절/복구/표시 요청/연결/민감 값 제외 검사도 모두 통과했다. PID 84448 정상 종료(code 0), visible 위반 0. 최종 변경 후 main lint/format, build:check, diff 검사도 통과했다.
- QA 스크립트는 ignored `.tmp/kakao-diagnostics-qa/runtime.cjs`에 보존한다. 실사이트 계정 인증과 게임 실행 회귀는 사용자 DoD로 남는다. 과거 제보의 원인은 여전히 가설이며 이 작업은 원인 수정이 아닌 진단 개선이다.

## 분리 리뷰 이력

### 1차 — 반려 (P2 2건)

1. 반복 제한기가 같은 상태의 누적 횟수로 판단해 A → B → A 복귀 전환을 빠뜨릴 수 있음. 직전 동일 상태의 연속 횟수만 제한하도록 수정하고, 복귀 전환 테스트 실패 → 통과를 확인했다.
2. main context의 `reason: undefined`가 preload의 종료/억제 사유를 덮어씀. context에서 reason 키를 제거하도록 수정했다. 실제 저장된 QA 로그에서 `observer.stopped`의 `timeout` 사유 보존을 확인했다.

### 2차 — 창 이벤트 관측 보완 후 통과

1차 두 지적은 해소됐으나 실제 로그의 `visibility.observed`가 0건임을 리뷰어가 발견했다. QA를 강화한 `kakao-diagnostics-qa-8ZDOHU`에서 `getWebPreferences`가 undefined이고 `partition`을 얻지 못하는 반면 공개 `webContents.session`은 카카오 세션과 일치함을 확인했다. 이 실행에서 `closedObserved`만 실패했고, 소유 PID 6880은 정상 종료했다.

새 진단 listener 등록 조건만 공개 session identity 비교로 수정했다. 닫힌 창도 window ID를 보존하도록 생성 시 ID를 캡처한다. 기존 코드의 다른 partition 사용은 범위 밖 발견으로 남기고 변경하지 않는다. 변경 후 main lint/format, build:check, diff 검사 통과. `kakao-diagnostics-qa-CqdPjq`에서 두 시험 창의 실제 closed 레코드 확인을 포함한 QA가 통과했다.

리뷰어 `kakao_log_design_review`가 최종 diff, QA 결과와 반출 레코드를 직접 확인하고 **통과** 판정했다. 남은 코드 blocker 없음. 설정·IPC 인자·상태 전환·셀렉터·시간 제한 변경 없음, 최초 두 지적과 창 관측 지적 해소, 사용자 비추적 문서 SHA256 보존 확인. 이 판정은 구현·자동 검증 범위이며 사용자 실동작 검증이나 master 머지 승인을 대신하지 않는다.

사용자는 실사이트 로그인·게임 실행 검증 미실시 설명을 들은 뒤 PR 제출을 명시적으로 승인했다. 사용자 DoD를 통과로 바꾸지 않고 현재 검증 범위를 명시해 PR을 제출한다. master 머지·릴리스 승인은 포함하지 않는다. 제품 커밋은 `3fbba9d`이며 기존 사용자 비추적 문서는 커밋에서 제외했다.

## 사용자 검증용 설치 파일

사용자 요청으로 `npm run build -- --publish never`를 실행해 Windows x64 NSIS 빌드를 완료했다(exit 0). 버전 표기는 1.7.1이며 현 브랜치의 미커밋 진단 개선을 포함한다.

- 경로: `D:\project_poe2\POE2-unofficial-launcher\dist\POE2 Unofficial Launcher Setup 1.7.1.exe`
- 크기: 259,298,289 bytes
- SHA256: `e272b2cea2cb0618e7f15a7e2b97c63f0161a0dfb2877e3fad846344fe87e930`
- 빌드 로그와 영수증: `.tmp/kakao-diagnostics-qa/installer-20260905-225430/`
- 패키지 내부 main/preload가 현재 빌드 산출물과 바이트 단위로 일치함을 확인했다. 최초 ASAR 확인은 Windows 경로 구분자 때문에 실패했으며 `path.normalize()` 적용 후 일치 확인했다.
- 기존 Vite 청크 크기, duplicate dependency references, `src/main/assets` 부재 경고가 있었으나 패키징은 성공했다. 실사이트 사용자 검증은 계속 미실시다.

PR 제목: `fix: 특정 상황에서 게임이 실행되지 않을 때 진단 로그 보강`. 본문에서 재발 시 반출 로그를 통한 분석 목적이며 실행 불가 원인 조치는 포함하지 않음을 명시한다.

## 마무리 기록

위키 raw 노트는 실제 WSL 위키의 `/home/nerdhead/project_llm_wiki/raw/projects/poe2-launcher/2026-09-05-kakao-automation-diagnostics.md`에 신규 보존한다. 위키는 기존 네 파일에 사용자 변경이 있고, 해당 저장소의 ingest 규칙은 영향 페이지 승인 후 갱신하도록 요구한다. 이번에는 raw 보존까지 수행하고 기존 wiki 변경은 건드리지 않는다. ingest와 사용자 실동작 검증이 미완료이므로 작업 문서도 `docs/work/`에 유지한다. 이 후속 기록은 승인된 PR 제출을 차단하지 않는다.

## 추후 반출 로그 분석 순서

기존 로그의 `content`가 `[KakaoDiag] `로 시작하는 레코드를 추출하고, 외부 `timestamp`와 내부 `runId` → `taskId` → `webContentsId`로 흐름을 연결한다. 문서가 바뀌므로 preload의 `documentId`/main의 `receivedDocumentId`와 main 현재 상태 `gateDocumentId`/`committedDocumentId`를 구별한다.

1. `page.dispatch`, `security.state`, `security.reveal-*`, `observer.stopped`로 어떤 페이지 처리와 감시가 진행됐는지 확인한다.
2. `ipc.suppressed`/`visibility.suppressed`는 보내기 전 또는 검증 정책에 의한 억제다. `ipc.sent`와 `visibility.request`는 전송/수신, `ipc.rejected`는 main의 거절 사유다.
3. `navigation.start/commit/failed/stopped`와 `request.sent/response/failed`를 연결한다. `no-request`/`request-mismatch`는 복구하지 못한 실패, `restored`는 기존 확정 문서로 복구한 결과다. 복구된 문서 ID가 null인지도 함께 본다.
4. `visibility.applied`는 표시 정책 처리 지점을 뜻한다. 실제 표시 여부는 같은 레코드의 `visible`과 `visibility.observed`를 확인한다. 요청값만으로 창이 실제 보였다고 판단하지 않는다.

`occurrences`는 같은 이벤트/handler/channel에서 직전 동일 상태가 연속된 횟수다. 1, 2, 4, 8…회만 기록하고 상태 변경 시 다시 1부터 남긴다. 따라서 레코드 개수는 실제 발생 횟수가 아니며, 레코드 부재만으로 특정 원인을 확정하지 않는다.

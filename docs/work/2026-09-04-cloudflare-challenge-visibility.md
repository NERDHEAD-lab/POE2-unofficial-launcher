# Cloudflare 보안 확인 창 표시

> 작성일: 2026-09-04 · 갱신: 2026-09-04 · 상태: PR 제출 승인, 실제 사이트 검증 미실시 · 브랜치: fix/cloudflare-challenge-visibility

## 승인과 범위

사용자가 게임 실행·계정 확인에서 Cloudflare 확인 창 표시, 확인 중 자동화와
제한시간 정지, 확인 후 원래 작업 재개 및 이를 위한 IPC 변경을 승인했다(“ㅇㅇ”).
기준 master: 320f88be222d4b57978bbd86ef25f3b2127782f9. PR #292는 이미 사용자 머지 완료.
다른 세션의 `2026-09-04-event-notification-ui.md`는 수정하지 않는다.

영향: 카카오 PoE 사이트의 최상위 문서가 공식 `cf-mitigated: challenge` 헤더를
보낼 때만 사용자 입력을 기다린다. UA, 쿠키, 설정 스키마, 스타터/UAC, 업데이트
절차는 변경하지 않는다. 자동 CAPTCHA 풀이를 하지 않는다.

## 원인과 설계

현재 preload는 URL로 일반 핸들러를 선택한다. 같은 URL의 보안 확인 문서에서
게임 시작 버튼 탐색 실패 또는 계정 로그인 필요 처리가 실행될 수 있다.
main의 반복 표시 정책과 10초 제한도 창을 숨기거나 닫을 수 있다.

런타임 상태의 소유자는 main이다. 카카오 세션의 읽기 전용 응답 관찰로 판정하고,
webContents·작업·탐색 세대에 묶는다. 창 표시 사유는 기존 forced visibility와
독립적으로 보존한다. 확인 중에는 기존 validation mode를 바꾸지 않는다.
정상 최상위 문서가 commit된 뒤 preload가 새 문서의 핸들러를 실행하며, 핸들러의
기존 제한시간(-1 포함)을 적용한다. 이전 문서의 지연 IPC는 재개시키지 않는다.
기존 passkey 차단 리스너를 덮어쓰지 않는다. 서드파티 DOM 셀렉터는 추가하지 않는다.

## 구현 순서와 DoD

1. `src/main/kakao/cloudflare-challenge.ts`와 집중 테스트: 헤더 판정, 문서 commit,
   오래된 응답·문서 IPC 무시, 팝업 소유권, 종료 정리.
   - [x] [Windows-pwsh] 실패 테스트 확인 후 구현, 정상/403/iframe/XHR 음성 사례 통과.
2. `session.ts`, `main.ts`, `preload.ts`: 읽기 전용 세션 관찰, 표시 사유, 제한시간
   일시정지, 핸들러 실행 전 문서 확인, 중복 계정 확인 방지.
   - [x] [Windows-pwsh] 격리한 실제 Electron에서 10초 이상 유지 및 정상 문서 재개.
   - [x] [Windows-pwsh] 집중 테스트·lint·타입 검사·빌드 통과.
3. 분리 리뷰 및 사용자 검증.
   - [x] 리뷰어에게 변경 diff와 이 문서를 전달해 판정 기록.
   - [ ] [사용자] Windows PoE1/PoE2 게임 실행·계정 확인에서 실제 Cloudflare 확인 후 재개.
   - [ ] [사용자] 일반 로그인/MOTP 표시, 취소·창 닫기 정상 동작.

검증 명령: `node node_modules/vitest/vitest.mjs run src/main/tests/kakao-cloudflare-challenge.test.ts src/main/tests/kakao-cloudflare-preload.test.ts src/main/tests/kakao-login-observer.test.ts src/main/tests/kakao-visibility-policy.test.ts src/main/tests/game-status-ipc.test.ts src/main/tests/kakao-account-validation-dom.test.ts`, 대상 ESLint, `npm.cmd run build:check`.
실제 사이트 검증은 유닛/빌드 또는 로컬 모의 문서로 대체하지 않는다.
사용자는 Cloudflare 확인을 임의로 발생시킬 수 없음을 설명한 뒤 “PR 상신해”로
커밋/PR 진행을 명시적으로 승인했다. 미실시 사용자 검증은 위에 그대로 남기며
master 머지는 별도 승인 대상이다.

## 분리 설계 리뷰

- `/root/update_shutdown_review`: 응답 헤더·main 표시 상태·preload 실행 보류를 함께
  구현할 것. 일반 hide IPC가 확인 창을 숨기지 못하게 하고 원래 작업/타이머 정책을
  유지할 것. 팝업과 늦은 응답을 구분하며 중복 계정 확인이 확인 창을 reload하지
  못하게 할 것. 실제 Windows 사용자 플로우를 최종 검증으로 유지.

## 근거

- [Cloudflare 공식 감지 문서](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)
- preload의 URL 분기: git blame 37faf215 / bb6853bd. 최근 계정 확인 변경 7db1c86.
- Electron 43 설치 타입의 webRequest 응답·탐색 이벤트 계약.

## 구현 및 검증 결과

- main의 별도 challenge 상태와 문서 ID로 hide/result/status/timeout IPC의 오래된
  요청을 거부한다. 새 작업으로 교체된 팝업 문서는 무효화한다.
- `automation-clock.ts`는 preload 지연 시간에서 수동 확인 시간을 제외한다.
  이미 관찰 중인 부모 문서도 pause/resume하며 해제 시 DOM을 다시 확인한다.
  일반/QR 로그인 핸들러가 동적 UI 관찰을 유지하는 기존 disconnect 계약은 보존한다.
- opener를 닫으면 재사용할 자식도 닫히는 Electron 기본 동작을 실제로 재현했다.
  이전 문서는 pause → stop → about:blank → 숨김 처리하고 successor 종료 후 닫는다.
  전역 `outlivesOpener` 설정은 바꾸지 않았다. 명시적 새 작업 창의 참조가 우선하며
  폐기된 창으로 fallback하지 않는다. 이전 정리가 새 작업 상태를 초기화하지 않는다.
- 집중 테스트 6파일 48개 통과. 대상 ESLint, `git diff --check`, `build:check` 통과.
  빌드의 기존 번들 크기 경고는 남아 있다.
- Windows Electron 43.4.1, 격리 프로필과 로컬 HTTPS fixture로 실제 webRequest →
  commit → preload 순서를 검증했다. 창의 show/hide/focus는 계측으로 대체하여
  모든 실제 창은 숨김 유지했다. 따라서 화면 노출/실제 CAPTCHA 해결 검증은 아니다.
- 실행 증거 루트: `%TEMP%/poe2-unofficial-launcher-codex-qa/`.
  - `cloudflare-1788531200001`: PoE1/PoE2 실행 및 계정 확인 11초 이상 유지·정상
    문서 재개. 정상 캐시 응답(`fromCache: true`)에서 확인 상태 해제.
  - `cloudflare-1788531569777`: 기존 부모 observer 11초 이상 대기 후 계정 DOM
    감지 재개. 이 실행의 팝업 보존 검사는 다음 항목에서 추가로 강화했다.
  - `cloudflare-1788531709432`: 이전 빈 opener로 새 계정 확인이 향하는 실패 재현.
  - `cloudflare-1788531743798`: 수정 후 동일 successor popup에서 계정 확인하고
    이전 opener까지 정상 정리. PID 89148 정상 종료.
  - 초기 helper의 `passed.cases`는 모드별 실행 수를 반영하지 못했다. 위 경로의
    개별 scenario 이벤트를 근거로 삼는다. 최신 retire 실행은 1개 시나리오이며
    전체 실행들에서 검증한 서로 다른 시나리오는 6개다.
- 모의 UI는 기존 selector에 맞춘 테스트 문서이며 실제 사이트 selector를 추가하거나
  교체하지 않았다. 개인 계정/프로필/쿠키는 사용하지 않았다.
- 다른 작업 문서 SHA256은 최초 값 그대로 보존:
  `76256EE114AB15C3B9EFC1E44F06D0ADBDC5BBD32BEE520E987116CDE2DAB426`.

## 코드 리뷰 기록

1. 반려: sibling 보류 문서 재개 누락, 이전 task popup 유효성, 트레이 복귀 표시,
   첫 challenge 응답 취소 복구. 해제 알림·문서/작업 무효화·복귀 표시·committed
   상태 복원으로 보완했다.
2. 반려: ensureGameWindow closed의 전역 참조와 기존 부모 observer 타이머 만료.
   생성 창 캡처/참조 동일성 검사와 AutomationClock으로 보완했다.
3. 통과: 동적 로그인 UI의 관찰 종료 소유권을 회귀 테스트로 복원했다. native QA에서
   발견한 opener 생존과 명시적 작업 창 소유권까지 보완 후 분리 리뷰어가 최종 통과.
   잔여 코드 blocker 없음. 실제 Windows 사용자 확인은 미실시 상태로 기록한다.

## 전달 상태

초기 검증용 패키징에서 무시된 로컬 설정 `.tmp/cloudflare-qa/builder.cjs`의
`files` 목록을 별도로 제한하여 `dist/icon.ico`와 `dist/icon.png`가 누락되었다.
사용자가 23:32 KST 트레이 아이콘 오류를 보고했고, 이는 제품 코드 변경이 아닌
잘못 만든 로컬 설치 파일의 문제로 확인했다. 해당 파일 목록 재정의를 제거했다.

사용자의 기본 빌드 요청에 따라 저장소의 기본 패키징 설정과 출력 경로로 다시
빌드했다. 최종 설치 파일은
`D:/project_poe2/POE2-unofficial-launcher/dist/POE2 Unofficial Launcher Setup 1.6.5.exe`이며
2026-09-04 23:36:09 KST, 244824959 bytes다. 로컬 Electron 버전 불일치를 피하기
위해 패키징 실행 시 43.4.1 캐시 런타임만 지정했다. app.asar 안의 두 아이콘이
빌드 원본과 바이트 단위로 일치함을 확인했다. 설치 후 실제 트레이 생성까지
확인한 것은 아니다. 제품 패키징 설정 및 `.tmp` 도구는 PR 변경에 포함하지 않는다.

사용자 요청에 따라 이 변경의 PR을 제출한다. 실제 사이트에서의 Cloudflare 확인,
이후 게임 실행/계정 확인, 일반 로그인/MOTP, 트레이 복귀·취소는 미실시다.
따라서 작업 문서는 `docs/work/`에 유지하고 검증 완료로 표시하지 않는다.
위키 raw 노트는 `/home/nerdhead/project_llm_wiki/raw/projects/poe2-launcher/2026-09-04-cloudflare-challenge-visibility.md`에 보존한다.
위키 AGENTS.md는 영향 페이지 승인 후 ingest를 요구하므로 이번 PR에서는 위키
페이지를 수정하지 않는다.

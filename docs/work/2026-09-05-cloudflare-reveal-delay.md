# Cloudflare 보안 확인 창의 5초 표시 유예

> 작성일: 2026-09-05 · 상태: 구현·분리 리뷰 완료, PR 제출 · 브랜치: fix/cloudflare-reveal-delay

## 승인과 근거

사용자가 앞선 분석의 5초 유예 방안을 바탕으로 최신 master pull, fix 브랜치 수정 및 PR 상신을 명시 승인했다. 기준 master는 `b627976`(1.7.0)이다. master 머지·릴리스는 이번 범위에 포함하지 않는다.

설치 앱의 2026-09-05 로그에서 보안 확인 감지/표시 00:55:22.097 → 정상 문서 복귀/숨김 00:55:26.845(4.748초) → 계정 확인 성공 00:55:28.426을 확인했다. 클릭 여부 자체는 로그에 없다. 기존 `e375084`는 challenge 헤더 수신과 창 표시를 동일 상태로 처리했다.

## 설계와 영향 범위

- Main의 `KakaoChallengeGate`가 challenge와 표시 자격을 각각 소유한다. 감지 즉시 기존 자동화·제한시간을 일시정지하고, 동일 challenge가 5초 유지될 때 표시 콜백을 호출한다.
- `isVisible()`은 지연 후 표시 자격만 반환한다. 탐색 완료·트레이 복귀·설정 변경 등 기존 표시 경로가 같은 판정을 사용한다. 사용자가 요청한 일반 로그인/MOTP/디버그 표시 정책은 유지한다.
- 정상 문서 commit, 첫 challenge 응답 취소, 창 제거, 작업 교체는 타이머를 취소한다. 반복 challenge/redirect와 기존 challenge 문서로의 실패 복원은 최초 대기시간을 유지한다. 정상 복귀 후 새 challenge는 다시 5초 기다린다.
- 창 상태 객체 동일성으로 오래된 콜백을 막는다. 형제 창별 표시는 독립이며 task 전체의 pause/resume 계약은 보존한다.
- DOM 셀렉터, IPC payload, AppConfig, UA/쿠키, 의존성 및 배포 흐름은 변경하지 않는다. 수동 확인이 필요한 경우에는 화면 표시가 최대 약 5초 늦어진다.

## M1 — 구현과 검증

대상: `src/main/kakao/cloudflare-challenge.ts`, `src/main/main.ts`, 기존 gate 테스트와 새 지연 테스트.

- [x] [Windows-pwsh] 지연 테스트를 먼저 작성하고 현재 구현에서 실패함을 확인한다.
- [x] [Windows-pwsh] 4.748초 자동 통과 시 미노출, 4,999/5,000ms 경계, 최초 타이머 유지, 정상 복귀 후 재도전, 취소/닫힘/작업 교체 및 형제 작업 격리를 검증한다.
- [x] [Windows-pwsh] 감지 즉시 page/task 차단과 기존 preload pause/resume·로그인 observer 회귀 검사를 통과한다.
- [x] [Windows-pwsh] lint, build:check 및 숨김 실제 Electron에서 표시 호출 시점과 정상 문서 재개를 확인한다. 로컬 모의 문서 검증은 실제 사이트 확인을 대체하지 않는다.
- [x] 분리 리뷰 통과.
- [ ] 커밋·push·PR 제출 및 최종 head CI 확인.
- [ ] [사용자] 설치 앱에서 자동 확인 시 창 미노출, 5초 이상 확인 시 창 표시와 수동 확인 후 재개, 일반 로그인/MOTP 동작 확인.

명령: `npm test -- --run src/main/tests/kakao-cloudflare-reveal-delay.test.ts src/main/tests/kakao-cloudflare-challenge.test.ts src/main/tests/kakao-cloudflare-preload.test.ts src/main/tests/kakao-login-observer.test.ts src/main/tests/kakao-visibility-policy.test.ts src/main/tests/game-status-ipc.test.ts src/main/tests/kakao-account-validation-dom.test.ts`, `npm run lint`, `npm run build:check`.

## 분리 설계 검토

`cloudflare_delay_review`: 통과. 상태 객체 타이머 guard, 취소·교체·실패 복원, 형제 창 격리 및 표시 직전 생존/자격 재검사를 요구했다. 추가 owner 결정 없음. 부모 세션이 유일한 구현자다.

## 검증 결과와 코드 리뷰

- RED: 새 13개 테스트 중 9개 실패·4개 통과. 기존 즉시 표시와 지연 콜백 부재를 확인했다.
- GREEN: 위 집중 명령에서 25개 파일·205개 테스트 통과. `npm run lint`, `npm run build:check`, `git diff --check` 통과. 기존 Vite 설정/번들 크기 경고는 유지했다.
- Windows Node 24.18.0, Electron 44.1.0. 최신 lockfile로 `npm ci` 후 Electron 공식 설치 스크립트로 실행 바이너리를 준비했다. 첫 런타임 시도는 바이너리 미설치로 ENOENT였으며 앱 프로세스는 시작하지 못했다. 제품 변경 없이 의존성 설치를 완료한 후 재검증했다.
- 로컬 HTTPS 모의 문서를 사용하는 실제 Main/webRequest/preload 런타임 4사례 통과: PoE1 빠른 자동 확인 시 show/focus 미호출, PoE2 확인이 지속되면 5,016ms에 표시 호출하고 정상 문서에서 게임 핸들러 재개, 계정 확인 자동 통과·정상 결과 수신, 닫힌 창의 지연 표시 미호출.
- 실행 `cloudflare-delay-1788538341957`, Electron PID 77500, 종료 코드 0. 격리 프로필을 사용하고 실제 show/focus는 계측으로 대체했다. 초기·최종 실제 Electron 창 가시성은 false였다. 원시 OS 창/포커스 연속 샘플 검사는 하지 않았으며 실제 화면 표시·실사이트 CAPTCHA 검증으로 간주하지 않는다. 종료 뒤 해당 PID/직계 자식 및 실행 프로필에 속한 Electron 프로세스 없음 확인.
- 로그와 런타임 스크립트: `.tmp/cloudflare-reveal-delay/`. 네이티브 Windows PowerShell 세션에서 실행했으며 WSL 전용 runner는 사용하지 않았다. 기존 QA 원본은 수정하지 않았다.
- R1 `cloudflare_delay_review`: **통과**. 타이머 상태 객체 guard, 정상 복귀/취소/교체 정리, committed challenge 실패 복원, 형제 작업 격리, 모든 기존 표시 경로와 즉시 pause 경로 분리 및 테스트/런타임 로그를 확인했다. 코드 지적 없음.
- 사용자 실사이트 검증은 미실시다. 해당 DoD와 원래 Cloudflare 작업 문서는 유지하며 완료 아카이브로 옮기지 않는다. 기존 이벤트 작업 문서의 SHA256 `76256EE114AB15C3B9EFC1E44F06D0ADBDC5BBD32BEE520E987116CDE2DAB426`을 보존했다.

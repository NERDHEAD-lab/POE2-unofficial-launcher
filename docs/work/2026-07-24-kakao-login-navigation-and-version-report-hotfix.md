# 카카오 로그인 navigation·오류 보고 버전 핫픽스

> 작성일: 2026-07-24 · 갱신: 2026-07-24 · 상태: 진행 · 브랜치: `hotfix/kakao-login-navigation-and-version-report`

## 목표와 전제

현재 기준점은 깨끗한 `master`
`b333b8afacdd354c57b9d2cef9ae5a273af9a30c`이며 `origin/master`와
일치한다.

이번 핫픽스는 다음 두 사용자 증상을 하나의 PR에서 수정한다.

1. 카카오 수동 로그인 중 정상적인 후속 페이지 이동이 선행
   `BrowserWindow.loadURL()`을 `ERR_ABORTED(-3)`로 끝낼 때, 이를 실제 오류로
   기록하고 “런처 오류” 제보 대상으로 승격하는 문제
2. 오류·버그제보·기능제안 모달이 현재 실행 버전 대신 지연 갱신되는
   `launcherVersion` 설정을 최초 한 번만 읽어 `Unknown` 또는 이전 버전을
   계속 표시하는 문제

첫 번째 원인은 첨부 보고서와 현재 소스 흐름을 바탕으로 한 신뢰도 높은
가설이다. 아직 상세 로그는 받지 않았으며, 아래 폐기 조건을 충족하면 이
가설과 PR을 유지하지 않는다.

## 구현 현황

- 사용자 계획 승인: 완료
- 통합 기준점: `master` `b333b8a`
- M1 로그인 navigation 오류 분류: 완료
  - slice: `61149da`
  - integration: `f4ee947`
- M2 오류 보고서 현재 빌드 버전 표시: 완료
  - slice: `a9721c2`
  - integration: `f9f1f37`
- 통합 `git diff --check`: 통과
- `[Windows-pwsh]` 결합 gate: 통과
- 분리 리뷰: 라운드 1 조건부 통과
- `[사용자]` 실제 카카오 로그인·실행 직후 보고서 버전 검증: 대기

## 현재 근거

### 수동 로그인 오류 오탐

- `src/main/main.ts:1420-1434`의 보관 URL·기본 URL 두 호출은 모든
  `loadURL()` 거부를 `logger.error`로 보낸다.
- `src/main/kakao/preload.ts:863-898`의
  `KakaoGamesMemberLoginHandler`는 `ACCOUNT_MANUAL_LOGIN`에서도 카카오 로그인
  버튼을 클릭해 새 navigation을 시작할 수 있다.
- 동일 계정 검증의 백그라운드 경로는 `src/main/main.ts:1370-1385`에서 이미
  `ERR_ABORTED/-3`을 예상 가능한 navigation 중단으로 처리한다.
- `src/shared/logger-base.ts:114-131`은 `Error`의 stack·code·errno를
  직렬화한다. `src/shared/debug-log-policy.ts:8-24`와
  `src/main/events/handlers/DebugLogHandler.ts:15-24`는 stack 포함 error 로그를
  사용자 오류 알림으로 승격한다.
- 회귀 형성 이력:
  - `bb6853bd`: 수동 로그인 무조건 error catch와 백그라운드 예외 처리를 함께
    도입
  - `f4644f59`: Error stack/code/errno 직렬화 도입
  - `6a75e654`: stack 포함 오류 로그의 사용자 알림·제보 승격 도입

### 보고서 버전 초기화

- `src/renderer/main.tsx:27-36`은 `Unknown`으로 시작해
  `launcherVersion` config를 한 번만 조회한다.
- `src/main/main.ts:2057-2074`는 `ready-to-show` 이후에도 1초 기다린 뒤
  `checkLauncherVersionUpdate()`를 실행한다.
- 이후 `setConfigWithEvent()`와 기존 `ConfigChangeSyncHandler`가
  `config-changed`를 정상 전송하지만 `Root`는 이를 소비하지 않는다.
- 오류 보고서가 필요한 값은 마지막 저장 버전이 아니라 현재 실행 중인 빌드
  버전이다. `__APP_VERSION__`은 `vite.config.mts:22-23,37-42`에서
  `package.json`으로부터 주입되고 TitleBar, UpdateModal, 설정의 현재 버전
  표시가 이미 같은 값을 사용한다.
- 회귀 형성 이력:
  - `3fcb382f`: `launcherVersion` config와 빌드 버전 주입 도입
  - `e423da19`: changelog 수신 준비를 위해 config 갱신을 창 준비 후로 지연
  - `a80b28e9`: 갱신을 `setConfigWithEvent()` 경로로 통합
  - `e6249aea`: 오류 보고용 `Root`가 `Unknown` + config 1회 조회를 도입

## 변경하지 않는 경계

- 카카오 DOM, URL matcher, 셀렉터, 클릭 자동화, visibility policy
- pending 로그인 URL의 저장·소비 시점과 창 show/focus 순서
- `AppConfig`, `CONFIG_METADATA`, `CONFIG_KEYS`, `DEFAULT_CONFIG`
- 사용자 config와 데이터 마이그레이션
- 새 IPC/EventBus 이벤트 또는 기존 채널 계약
- 서비스 lifecycle, updater/release 흐름, 의존성
- 전역 `debug-log-policy`의 예외 판정 규칙
- changelog용 `launcherVersion` 저장과 `ready-to-show` 이후 갱신 순서

따라서 config schema·사용자 데이터·IPC/EventBus·서비스 lifecycle의
stop-and-ask 항목에는 진입하지 않는다.

## 병렬 마일스톤

### M1 — 수동 로그인 `ERR_ABORTED(-3)` 원천 분류

담당 writer는 전용 worktree/브랜치에서 다음 파일만 맡는다.

- `src/main/kakao/navigation-error.ts` (신규)
- `src/main/main.ts`의 `account:show-login-window` catch 두 곳
- `src/main/tests/kakao-navigation-error.test.ts` (신규)

구현:

1. 순수 판정 함수는 object의 `code === "ERR_ABORTED"`,
   `code === -3`, `errno === -3`만 예상 가능한 navigation abort로 분류한다.
2. 보관 URL과 기본 URL의 catch를 같은 처리기로 통일한다.
3. 예상 abort는 오류 객체를 `logger.error`에 넘기지 않고 문맥을 포함한
   일반 로그로 남긴다.
4. 그 밖의 오류는 URL 종류를 식별할 수 있는 문맥과 원본 Error를
   `logger.error`로 보존한다.
5. `ERR_FAILED/-2`는 수동 로그인에서 숨기지 않는다. 백그라운드 검증의 기존
   `ERR_FAILED/-2` 처리는 이번 범위 밖이므로 바꾸지 않는다.

DoD:

- `[WSL]` 순수 단위 테스트가 문자열 code, 숫자 code, errno의 `-3`을 true로,
  `ERR_FAILED/-2`, 일반 Error, null·원시값을 false로 고정한다.
- `[WSL]` 보관 URL과 기본 URL 두 호출 모두 같은 분류기를 사용하며,
  selector·preload·visibility·URL 캐시 소비 순서에는 diff가 없다.
- `[Windows-pwsh]`
  `npm test -- --run src/main/tests/kakao-navigation-error.test.ts`가 통과한다.
- `[사용자]` 로그아웃 상태에서 `설정 → 계정 → 로그인`을 실행하면 로그인
  창이 다음 카카오 화면으로 진행하고, 그 과정의 `ERR_ABORTED(-3)` 때문에
  새 “런처 오류” 알림이 생기지 않는다.
- `[사용자]` 로그인을 완료하면 창이 정상 정리되고 계정 정보가 다시
  표시된다.
- `[사용자]` 실제 네트워크·페이지 로딩 실패는 오류 로그·제보 경로에 남는다.

### M2 — 오류 보고서가 현재 빌드 버전을 동기 사용

담당 writer는 별도 전용 worktree/브랜치에서
`src/renderer/main.tsx`만 수정한다.

구현:

1. `Unknown` state와 `getConfig("launcherVersion")` 1회 조회 effect를 제거한다.
2. 오류 보고용 `launcherVersion`은 기존 빌드 상수 `__APP_VERSION__`을 직접
   사용한다.
3. `FatalErrorModal`의 fatal·bug·suggestion prop 연결은 그대로 유지한다.

저장 config 변경 구독을 추가하지 않는 이유는 현재 실행 버전의 owner가 빌드
상수이기 때문이다. 이 방식은 창 표시 후 1초 이내 발생한 오류도 정확히
표시하며 초기 조회·config 변경 이벤트 간 경합과 listener cleanup을 만들지
않는다.

DoD:

- `[WSL]` `src/renderer/main.tsx`의 보고서 버전은 `__APP_VERSION__`을
  동기적으로 사용하고 `Unknown` fallback과 `launcherVersion` config 조회가
  없다.
- `[WSL]` main의 버전 확인·changelog 순서와 config/IPC/EventBus 파일에는
  제품 코드 diff가 없다.
- `[Windows-pwsh]` `npm run build:check`가 빌드 상수 주입과 타입 검사를
  통과한다.
- `[사용자]` Windows 실제 Electron에서 실행 직후 1초 이내 버그제보 모달을
  열어도 `런처 버전`이 `Unknown`이 아니며 설정 화면의 현재 버전과 일치한다.
- `[사용자]` 복사한 보고서의 `런처 버전` 값도 화면과 동일하다.

## 병렬화와 dependency barrier

1. 계획 승인 뒤 통합 브랜치
   `hotfix/kakao-login-navigation-and-version-report`를 최신 `master`에서
   만든다.
2. M1과 M2는 통합 브랜치의 같은 기준점에서 서로 다른 브랜치와 worktree로
   분기한다.
3. worktree마다 정확히 한 writer만 둔다. M1과 M2의 제품 코드 파일은
   겹치지 않으므로 병렬 구현한다.
4. 이 문서와 통합 브랜치는 조정자 한 명만 수정한다. 병렬 writer는
   `docs/work/**`, package/lockfile, config/IPC/EventBus 파일을 만지지 않는다.
5. 각 마일스톤의 자체 DoD와 독립 커밋이 준비되기 전에는 통합하지 않는다.
6. 두 결과를 통합 브랜치에 직렬로 반영한 뒤에만 전체 diff, 결합 gate,
   분리 리뷰를 시작한다.
7. 리뷰 지적 수정도 해당 소유 worktree의 writer 한 명에게 되돌리고,
   재통합한다. 같은 worktree에 동시 writer를 두지 않는다.

## 통합 검증

- `[WSL]` `git diff --check`
- `[WSL]` `git diff master...HEAD`가 위 변경 경계와 계획·리뷰 기록으로만
  구성됐는지 확인
- `[Windows-pwsh]`
  `npm test -- --run src/main/tests/kakao-navigation-error.test.ts`
- `[Windows-pwsh]` `npm run lint`
- `[Windows-pwsh]` `npm run build:check`
- `[사용자]` M1의 실제 카카오 로그인 흐름과 M2의 실행 직후 보고서 버전 확인

WSL 공유 `node_modules`에서는 eslint/vitest/build를 실행하지 않는다. 모든
Node 패키지 gate는 Windows PowerShell에서 수행하며 의존성을 재설치하지
않는다.

### 통합 검증 결과

`hotfix-test`가 Windows PowerShell의
`D:\project_poe2\poe2-launcher.worktrees\hotfix-kakao-version`에서 검증했다.

- `[WSL]` `git diff --check`: 통과
- `[WSL]` `git diff --check master...HEAD`: 통과
- `[WSL]` 제품 변경 경계: 계획된 4파일만 확인
- `[Windows-pwsh]`
  `npm test -- --run src/main/tests/kakao-navigation-error.test.ts`:
  exit 0, 1파일 11테스트 통과
- `[Windows-pwsh]` `npm run lint`: exit 0
- `[Windows-pwsh]` `npm run build:check`: exit 0, TypeScript와 모든 Vite
  대상 빌드 완료

환경 편차:

- WSL에서 전달된 최초 PowerShell 환경의 `PATHEXT`가 비어 있어 첫
  `npm.ps1` 호출은 실제 테스트를 실행하지 못했고, 이어진 `npm.cmd` 호출은
  `vitest` shim 미인식으로 exit 1이었다.
- worktree node_modules junction과 Windows `.cmd` wrapper를 확인한 뒤, 해당
  PowerShell 프로세스에만 기본 `PATHEXT`를 설정해 위 원래 npm 명령들을
  재실행했고 모두 통과했다. 검증용 junction은 제거했다.
- `build:check` 중 Windows Git이 WSL 형식 `.git` 포인터를 읽지 못해
  `fatal: not a git repository` 경고가 한 번 있었으나 빌드는 중단되지
  않았고 exit 0이었다. Vite의 개발용 commit hash는 fallback을 사용했으며
  TypeScript·renderer·preload·main 빌드 산출은 모두 생성됐다.
- `[사용자]` 실제 Electron 및 카카오 로그인 검증은 이 gate에서 수행하지
  않았다.

## 분리 리뷰 계획

구현자와 다른 컨텍스트의 리뷰어가 통합 diff와 이 문서를 함께 검토한다.
최대 3라운드이며 판정과 지적·해결은 이 문서에 누적한다.

리뷰 체크리스트:

- M1이 두 수동 로그인 URL 호출을 모두 다루고 `ERR_ABORTED/-3`만 낮추는가
- 예상 밖 오류의 원본 Error와 보고 경로가 유지되는가
- 카카오 selector/DOM/visibility/pending URL 순서가 변하지 않았는가
- M2가 저장된 config가 아니라 현재 빌드 버전을 사용하는가
- fatal·bug·suggestion과 보고서 복사가 같은 버전을 쓰는가
- config schema/default/metadata, migration, IPC/EventBus, lifecycle,
  updater, dependency 변경이 없는가
- Windows 실제 카카오 흐름과 실제 Electron 버전 확인을 정적·빌드 gate로
  대체해 완료 선언하지 않았는가

### 리뷰 라운드 1

판정: `조건부 통과`

- 제품 코드 지적 없음
- 낮음: 문서의 기존 `남은 owner gate`가 계획 승인 전 문구를 유지해 현재
  구현 상태와 모순됨
- 조치: 아래 owner gate를 실제 남은 `[사용자]` Windows Electron·카카오
  실동작 검증과 사용자 OK로 갱신
- 조건부 통과의 문서 수정이므로 재리뷰 불필요

통과 후 `[사용자]` DoD 확인과 사용자 OK를 받은 다음 마무리 체크리스트,
커밋, push, PR 생성으로 진행한다. PR 본문은 `Summary`와 `Motivation`만
사용하며 `github-cli-token` 절차를 따른다. `master` 머지는 이 작업 범위에
포함하지 않으며 별도 사용자 승인이 필요하다.

## Blast radius와 롤백

- M1 영향: 카카오 수동 로그인 창의 `loadURL()` Promise 오류 분류만 변경한다.
  예상 중단은 알림 소음에서 제외되지만 navigation·DOM 자동화 자체는 그대로다.
- M2 영향: 오류·버그제보·기능제안 모달의 화면·복사본 버전 값만 현재 빌드
  버전으로 바뀐다.
- 영속 데이터, 스키마, 마이그레이션, 외부 API 계약은 바뀌지 않는다.
- 병합 전 롤백은 해당 마일스톤 커밋을 통합 브랜치에서 제외하는 것으로
  충분하다.

## 상세 로그에 따른 PR 폐기 조건

향후 상세 로그에서 아래 중 하나가 확인되면 현재 가설은 뒤집힌 것으로
판정한다.

- `ACCOUNT_MANUAL_LOGIN → KakaoGamesMemberLoginHandler → 카카오 로그인 버튼
  클릭 → 후속 URL 이동` 시퀀스가 없다.
- `ERR_ABORTED(-3)` 뒤 로그인 창이 다음 페이지로 진행하지 않고 빈 화면,
  정지, 닫힘 등 실제 기능 실패 상태에 남는다.
- 같은 시각의 선행 원인이 인증서, DNS, 네트워크, 렌더러 crash, 잘못된
  navigation/visibility 처리 등 다른 오류로 확인된다.

이 경우 결합 PR은 병합하지 않고 닫는다. 기존 브랜치에서 가설을 덧대거나
수정 범위를 넓히지 않으며, 당시 최신 `master`에서 새 hotfix 브랜치를
만들어 로그 기반 원인 분석·계획·분리 리뷰를 다시 수행한다. 닫힌 PR과
브랜치는 비교 증거로 보존하며 삭제는 별도 승인 없이는 하지 않는다.

## 남은 owner gate

계획 승인은 완료됐고 구현·Windows 자동 gate·분리 리뷰도 완료됐다. 남은
게이트는 `[사용자]` Windows 실제 Electron에서 다음을 확인하고 OK를 주는
것이다.

1. 실제 카카오 수동 로그인에서 정상 후속 페이지 이동의
   `ERR_ABORTED(-3)`이 새 “런처 오류” 알림을 만들지 않으며 로그인 완료와
   계정 표시가 정상이다.
2. 실행 직후 1초 이내 연 오류·버그제보 모달과 복사 보고서의 런처 버전이
   `Unknown`이 아니고 설정 화면의 현재 버전과 일치한다.
3. 실제 네트워크·페이지 로딩 실패는 여전히 오류 로그·제보 경로에 남는다.

이 사용자 검증과 OK 전에는 마무리 체크리스트, push, PR 생성을 진행하지
않는다. 추가 설계·scope·권한 선택지는 현재 없다.

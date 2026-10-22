# 서버 버전 목표와 실제 표시 공지 NEW 수명

> 작성일: 2026-10-22 · 상태: 진행 · 브랜치: fix/server-version-news-visibility · 갱신: 2026-10-22

## 승인과 작업 경계

- 2026-10-22 사용자: “순차적으로 쭉-진행하고 PR까지 최종적으로 상신해줘”. 아래 4단계의 구현·검증·커밋·push·PR 승인. 머지·릴리스 승인 없음.
- 브랜치 `fix/server-version-news-visibility`, 기준 `df12d03487cc96c8f3acd8d1cb443cf643d98ce9` (`origin/master`, 1.7.3). 로컬 master 포인터는 변경하지 않는다.
- 실행 모드 `local_serial`, 계약 COMPATIBLE, noticeRecommended=false (root receipt, fingerprint D52E212BF75FC7C0E6EBD75557BCA2AF2E4C917137639B1C47A3C146924282CD).
- writer: `/root/version_news_delivery` 한 명. root는 조율·최종 QA·원격 상신 소유, 설계/리뷰 leaf는 읽기 전용.
- 기존 dirty `AGENTS.md`, `docs/README.md`, 미추적 `.codex/`와 9월 work 문서 2개를 보존하고 이 작업에 포함하지 않는다.
- 사용자 프로필·게임 파일·실행 중 제품 프로세스는 접근/변경 대상이 아니다. 개인 로그는 복사하거나 출력하지 않는다. 통제 fixture로 검증한다.
- `desktop-busy-ui-20261021-02 rev2` (root 2026-10-22 평가, NERDHEAD): 명시적 재허용 전 공유 화면/입력/포커스/캡처/보이는 앱 실행 금지. Windows 실동작/게임 사용자 QA는 보류이며 PASS가 아니다.

## 승인된 계약

게임 버전은 불투명한 식별자다. 숫자의 대소·서열·4.x/0.x 변환 없이 서버가 직접 주는 버전과 주소를 목표로 사용한다. 관측한 WebRoot는 설치 완료 증거가 아니다. 실패한 직접 조회를 큰 로컬 값이나 오래된 보조 자료로 덮지 않는다. 앱 자체 업데이트의 semver 처리는 변경하지 않는다.

버전 소비자는 게임/서비스/설치 경로가 같은 서버 목표와 로컬 관측/완료 증거를 구분한다. 진행 중인 작업은 시작 시점의 context/runId/목표를 고정한다. 명시적 수동 override는 선택한 작업에만 적용한다. 새 예약 조회 실패는 “업데이트 없음”으로 소모하지 않는다. 구 예약의 사전 조회 동작을 새로 설계하지 않는다.

공지 NEW는 Main의 `visible && focused && !minimized` 활성화 세대가 소유한다. 현재 선택 게임/서비스에서 로딩/모달 뒤가 아니고 실제 스크롤 영역에 나타난 제목행만 확인한다. 확인 이력을 즉시 저장해도 해당 활성화 동안 NEW를 유지하고, 다음 활성화에서만 자동 해제한다. 같은 활성화의 새 글·새로고침·게임 전환 후 복귀에도 유지한다. 글 직접 열기는 즉시 읽음 처리한다. 숨김 시작/백그라운드/다른 context/화면 밖/모달 뒤의 글은 확인하지 않는다. Renderer reload는 Main 세대 유지, 프로세스 재시작은 저장 이력을 사용한다. 기존 unscoped lastReadIds를 호환 읽기하고 새 기록은 게임/서비스/게시판 scope로 충돌을 막는다. 현재 캐시의 고정글 확인 기록을 보존하며 개발자 공지는 기존대로 NEW 없음.

## 마일스톤과 DoD

의존 순서: **M1 → M2 → M3 → M4** (논리 의존 M1→M2→M4, M3→M4; 파일/실행 모드 때문에 순차 작업).

1. **M1 버전 계약**
   - [Windows-pwsh] 서버 직접 목표, 보조자료 원본/조회 시각, 로컬 관측/완료 증거, 게임/서비스/경로 context를 타입·저장·조회로 구분한다.
   - [Windows-pwsh] 직접 조회 성공은 0.x도 그대로 채택하며 실패/unknown/불일치를 동일 버전과 혼동하지 않는다.
2. **M2 버전 소비자 통일**
   - [Windows-pwsh] App 버튼, 강제 복구 UI/Main, 자동 진단, 새 예약이 동일한 identity 정책을 사용한다. 캐시 갱신은 UI에도 전파한다.
   - [Windows-pwsh] 조회 실패 단발 예약을 남기고 과도한 반복 없이 오류를 알린다. 작업 중 context/목표가 바뀌지 않는다.
   - [사용자] Windows에서 서버 0.x/관측 4.x 상황의 버튼/복구/예약과 서비스·경로 전환 동작을 확인한다 (보류).
3. **M3 공지 NEW**
   - [Windows-pwsh] 실제 표시→동일 활성화 유지→다음 활성화 해제, 직접 열기 즉시 해제를 구현한다. 숨김/스크롤 밖/모달/다른 context/늦은 세대 보고/조회 역순/reload/restart를 보호한다.
   - [사용자] 실제 창/스크롤/모달/트레이 복귀의 제목행 NEW 동작 확인 (보류).
4. **M4 통합 검증·독립 리뷰**
   - [Windows-pwsh] 의미 있는 기존 tests를 우선 보완하고 lint/build:check 및 영향 회귀를 통과한다. 새 테스트는 실제 잘못된 사용자 동작을 구별하는 경우만 추가한다.
   - [Windows-pwsh] Astra xhigh 별도 컨텍스트 reviewer가 실제 작업 diff와 본 문서를 판정하고 필요한 수정·재검토를 수행한다. root 별도 final QA는 별도 게이트다.

## 영향 범위와 보존

버전 추적 저장값에 context/증거 메타데이터를 추가하되 구 값을 제거하거나 완료로 승격하지 않는다. NEW는 news-cache 전용 store를 사용한다. 필요한 IPC 변경은 승인 범위이며 새 사용자 설정/의존성/릴리스 흐름 변경은 없다.

작업 scratch/검증·실행 receipt는 ignored `.tmp/server-version-news-visibility/` 아래에 보존한다. 장기 main checkout은 기존 사용자 dirty·실행 중 제품·PR 이후 검증 때문에 preserve한다. 사용자 QA 미완료 동안 본 문서를 work에 유지한다. 위키는 지정 Windows 경로가 없어 WSL 실행을 추가하지 않고 raw 노트를 scratch에 보존하며 미-ingest로 남긴다.

## 진행·검증·리뷰

- 시작: 필수 skills/현행 소스와 Git 상태 확인. 독립 설계 leaf에 M1 저장/완료 증거의 최소 계약 확인 요청 (요청 Astra xhigh, 실제 variant 미확인). 나머지 승인 계약은 root의 `/root/version_news_design` 설계 브리핑 재사용.
- 검증/리뷰 결과는 진행 시 누적한다.
- M1/M2 통합 경계: 기존 필드에 경로·관측 출처·별도 완료 증거를 추가했다. 로그 재생/신규 줄 provenance만 전달하고 PID 추정은 변경하지 않았다. 직접 서버 목표만 자동 선택하고 보조자료 실패 snapshot도 UI에 전달한다. 강제 복구 모달은 열린 context/목표를 보관하며 실제 파일 변경은 완료 증거를 무효화한다.
- 최소 저장/완료 설계: `/root/version_news_delivery/version_contract_design` (Astra xhigh 요청, 실제 variant 미확인), 기존 knownGameVersions의 additive 확장으로 충분하다는 결론. 새 설정·의존성 없음.
- [Windows-pwsh] `npm ls --depth=0 --json`: 통과, Node 24.18.0 / npm 11.16.0. 기존 설치 유지. `.tmp/server-version-news-visibility/dependencies.json`.
- [Windows-pwsh] 변경 전 관련 baseline: 16파일/196검사 통과. 이후 변경의 DoD 증거와 분리한다. `baseline-tests.log`.
- [Windows-pwsh] `npx tsc --noEmit`: M1/M2 소비자 연결 후 통과. `m1-m2-typecheck.log` (성공 시 출력 없음).
- [Windows-pwsh] `npm test -- --run src/main/tests/RemoteVersionResolver.test.ts src/main/tests/ghPagesLatest.test.ts src/main/tests/PatchReservationService.test.ts src/main/tests/AutoPatchRunCorrelation.test.ts src/main/tests/GameVersionPolicy.test.ts`: 17파일/177검사 통과. `m1-m2-tests.log`. 처음 실패는 일반 세션에 예약 runId를 잘못 부여한 회귀(수정)와 추가 await에 대한 테스트의 불완전 대기(같은 통제입력의 비동기 완료 대기로 수정)였으며 영향 회귀를 재실행했다.
- 다음: M3 실제 표시/활성화 세대 NEW 구현 → 추가 행동 회귀/전체 검증/독립 리뷰. 사용자 QA는 계속 보류.
- M3 구현: Main의 활성화 세대·선택 revision·scoped 확인기록으로 NEW를 계산한다. Renderer는 모달/로딩/비선택뷰를 제외하고 실제 scrollport에 교차한 제목행만 보고한다. 기존 네 뷰의 mounted 상태와 본문 캐시는 유지한다. 직접 열기는 내용 fetch 전에 scoped 즉시 읽음 처리한다.
- [Windows-pwsh] M3 `npx tsc --noEmit` 통과 및 `npm test -- --run src/main/tests/NewsService.test.ts src/main/tests/NewsService.integration.test.ts` 8파일/67검사 통과 (`m3-typecheck.log`, `m3-tests.log`). 통제 store의 활성화 수명·scoped 충돌·과거 ID 호환·저장 실패를 확인한다.
- M4 추가 행동 회귀: 서버 0.x 주소의 실제 임시 fixture 파일 복구, 직접 조회 실패 시 파일 미변경, await 중 경로 변경 시 미변경, 제목행 IO 보고/차단/늦은 callback, snapshot 역순, 실제 startup 대 재생 로그, 단발 예약 실패/unknown/대상불일치/같은 관측 유지와 완료증거 no-update를 검증했다. 관련 회귀와 tsc 통과 (`m4-regression-tests.log`, `m4-typecheck.log`). 임시 fixture만 사용하고 실사용 프로필/로그/게임 파일은 읽거나 변경하지 않았다.
- 서식·import 정리 후 전체 `npm test -- --run`, `npm run lint`, `npm run build:check` 통합 검증 및 Astra xhigh 독립 리뷰를 진행한다. 모든 jsdom/IO fixture 검사는 기능 근거이며 실제 창/스크롤 픽셀·게임 QA를 대체하지 않는다.
- 통합 검증 1차: `npm run lint` PASS (`lint.log`), `npm run build:check` PASS (`build.log`). 기존 ignored `dist`, `dist-electron` 산출물은 덮어쓰기 전에 `.tmp/server-version-news-visibility/prebuild-artifacts/`에 보존했다. 설치된 실행 파일/사용자 프로필은 건드리지 않았다.
- 무필터 `npm test -- --run`은 기존 `.tmp`의 보존 체크아웃들과 Node `node:test` 전용 스크립트까지 Vitest가 수집해 26개 수집 오류를 냈고, 추가 CORE handler 2개를 기존 등록목록 기대값에 누락한 1개 테스트가 실패했다 (`full-tests.log`). 보존 경로를 삭제하거나 테스트 설정을 바꾸지 않았다. 등록목록 기대값에 승인된 handler 2개를 반영했다.
- 정규 전체 Vitest는 `npm test -- --run --exclude '.tmp/**' --exclude 'scripts/**'`: **95파일/773검사 PASS** (`full-src-tests.log`). 부분문자열 `src` 필터가 아닌 CLI exclude로 보존 체크아웃과 별도 러너를 배제했다. Node 전용은 CI 명령 `node --test scripts/promotions/*.test.mjs`: **59검사 PASS** (`node-promotions-tests.log`). 무필터 실패와 분리 실행 결과는 별도 근거다.
- 독립 리뷰 1차 `/root/version_news_delivery/version_news_review` (요청 Astra xhigh, 실제 variant 미확인), base df12d03에 대한 working diff와 신규 파일을 입력했다. 제품은 리뷰 중 동결. 재생 startup이 완료 저장에서는 거부돼도 구 예약 FSM을 종료할 수 있는 연결 결함 후보를 확인 중이며, 실제 live provenance/run/path 검토 뒤 수정·영향 재검증할 예정이다. root 별도 final QA는 아직 진행 중이다.
- **독립 리뷰 R1: 반려.** P1 완료 저장의 거부가 예약 startup/Done 종료를 막지 못함, P2 enqueue 직후 삭제된 단발 예약의 대기 중 경로 오류 시 보존 누락, P2 경로 A의 늦은 push가 B의 UI snapshot을 덮음, P2 수동 override에 숫자 regex 잔존. 불필요한 테스트 DELETE/MERGE 지적은 없었다. root final QA의 독립 소스 검토에서도 완료/FSM과 경로 snapshot 문제가 일치했다.
- R1 수정: 완료 함수의 boolean을 startup/Done terminal 전이 조건으로 공유한다. 구 예약은 서버 조회 없이 시작 경로만 고정한다. 모니터의 기존 PID 추론/필터는 유지하고 명시적 로그줄 PID 메타데이터를 보존한다. 과거 WebRoot는 명시 PID가 현재 PID와 같고 새 startup의 PID/path/run이 확인될 때만 증거로 사용하며, 추정만 있는 과거 줄은 unknown으로 남긴다. 다른 target/path/run이면 완료와 후속 정리를 모두 거부한다.
- R1 수정: 모든 UI snapshot 저장·조회 key에 설치 경로를 포함한다. 새 단발 자동예약은 실제 실행 시작 때만 소모하고 대기 중 실패/mismatch에서는 남긴다. 수동 override는 불투명 버전 segment 전체를 문자 그대로 교체한다. 실패 snapshot은 성공 TTL로 묶지 않아 다음 정상 조회에서 회복할 수 있다.
- [Windows-pwsh] R1 영향 `npx tsc --noEmit`와 완료/FSM·단발 대기/경로·역순 push·수동 override 통제 회귀 PASS (`r1-typecheck.log`, `r1-regression-tests.log`). 전체 src/lint/build 재검증 후 같은 독립 reviewer에 R2 요청 예정. 사용자 QA는 보류다.
- R1 수정 후 전체 src 95파일/779검사 및 build:check PASS (`r1-full-src-tests.log`, `r1-build.log`). lint는 새 테스트 import 순서 6건을 지적하여 해당 테스트 파일의 import만 정리했다. 최종 lint/전체 검증은 아래 R2 후보에서 다시 실행한다.
- root final QA 추가 P2: 마지막 조회 실패로 남긴 once-range가 종료 시각 뒤 재시작하면 기존 만료 분기에서 삭제되는 지속성 누락. 기존 예약에 선택적 `lastCheckFailure`(일정 fingerprint·조회 시각·이유)만 추가해 실패 원인과 알림중복 억제를 재시작에도 유지한다. 과거 범위에 확인완료 근거가 없으면 보존하며, 일정 변경 또는 다음 정상 판정 시 실패 상태를 해제한다. 구 기록은 마이그레이션/삭제하지 않는다.
- [Windows-pwsh] 실패 범위의 마지막 회차→stop/new service/init→보존/중복알림 없음→일정 변경 해제와, 반복 예약 다음 정상 조회 시 실패 해제 회귀: 1파일/39검사 PASS (`r1-restart-tests.log`). 최신 후보 `npx tsc --noEmit` PASS (`r2-typecheck.log`).
- **R2 후보 동결**: 위 P1/P2 수정과 지속성 회귀를 포함한 최신 working diff. 전체 src/lint/build 및 동일 독립 reviewer의 R2를 진행한다. 원격·커밋은 아직 하지 않았다.
- [Windows-pwsh] **최신 R2 후보** `npm test -- --run --exclude '.tmp/**' --exclude 'scripts/**'`: 95파일/780검사 PASS (`r2-full-src-tests.log`). `npm run lint` PASS (`r2-lint.log`), `npm run build:check` PASS (`r2-build.log`), `npx tsc --noEmit` PASS (`r2-typecheck.log`), `git diff --check -- src` PASS. Node 전용 59검사 근거는 관련 scripts/promotions·src/shared/promotions.ts·입력·의존성 변경이 없어 재사용한다.
- **독립 리뷰 R2: 통과 (코드 리뷰 범위).** `/root/version_news_delivery/version_news_review`가 R1 네 지적과 추가 restart 보존의 해소, 새 blocking 없음, 새 테스트 DELETE/MERGE/REWRITE 지적 없음을 판정했다. 요청 Astra xhigh, actual runtime variant 미확인. reviewer가 R2 전체 95/780·lint/build·diff check 및 Node 근거 재사용을 확인했다.
- 로컬 구현/자동 검증/독립 리뷰 완료. root 별도 final QA 결론·커밋·push·draft PR 상신은 별도 단계다. 사용자 Windows/game/실제 창·스크롤 QA는 계속 보류(PASS 아님), 머지·릴리스 미승인. work 문서는 유지하며 위키 raw는 scratch `wiki-raw.md`에 보존(미-ingest).
- **root 최종 QA** `/root/version_news_final_qa`: 동일 R2 후보의 비간섭 통합 검증 PASS, blocking 없음. 사용자 Windows/game/실제 창·스크롤 QA는 보류이므로 전체 제품 완료 판정은 보류한다. 해당 상태를 명시한 draft PR 상신까지만 진행하며 머지·릴리스 승인은 없다. root 지시에 따라 이번 source 37개와 본 문서만 로컬 커밋하고, 원격 push/PR/CI/첨부는 root가 수행한다.

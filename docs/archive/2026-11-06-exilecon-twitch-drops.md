# Twitch Drops의 행사별 시청 주소 지원

> 작성일: 2026-11-06 · 상태: 로컬 구현·검증 완료, 원격 전달 진행 · 브랜치: feat/twitch-watch-url-app · 갱신: 2026-11-06

## 현재 승인 범위 — feat 확장

사용자가 `feat`으로 배포하고, JSON에 시청 URL을 추가해 Twitch 도메인만 검증한 뒤 앱에서 그 URL을 열도록 명시했다. 향후 새 카테고리는 수집기의 데이터 갱신으로 지원하고 앱에 ExileCon 특수 처리를 넣지 않는 방향이다. 후속 “순차적으로 진행하고 release-please PR merge 직전인 CI까지 진행시키고 브리핑해줘”에 따라 **수집기 PR/CI/master 반영 → 공개 JSON 확인 → 그 실제 JSON으로 로컬 앱 검증 → 앱 PR/master 반영 → release-please PR의 최신 CI 확인**까지 승인됐다. 커밋·push·PR·검증 후 master 병합·정상 피드 발행은 승인 범위다. **릴리스 PR 병합·태그·앱 바이너리 배포 직전에서 정지한다.**

writer는 `/root/exilecon_drops_update` 단독이며 기존 collector 후보를 확장한다. 초기 수집기 코드의 검증/리뷰는 아래 역사 기록으로 보존하고, 변경된 입력에는 새 검증을 수행한다. 증거 경로는 `.tmp/exilecon-drops-update-20261106/watch-url/`다. 임시 지시 `poe-kakao-desktop-busy-20261105` rev11의 격리 dev QA 허용에 따라 root가 할당한 actor가 검증을 완료했다. rev12로 그 예외가 종료돼 현재 native/UI 실행은 다시 보류다. 게임 실행·사용자 프로필 변경·기존 Vite 서버/다른 소유 작업은 허용 범위 밖이며 registry·desktop 예약은 root가 관리한다.

### 계약·소유·갱신 설계

- schema 1의 optional `watchUrl`은 Twitch Drops 시청 목적지다. 공식 GGG 공지 `sourceUrl`은 출처로 유지한다. `game`, 이벤트 ID, 일정 키, `both` 금지와 공통 행사 두 이벤트 발행은 유지한다. 이전 피드에 필드가 없으면 기존 게임별 Twitch 카테고리로 fallback한다. 구 소비자는 추가 필드를 무시하고 계속 읽는다.
- producer/consumer 모두 URL 파서로 HTTPS, `twitch.tv` 및 정상 하위 도메인만 수용한다. 사용자정보, 비기본 포트, 공백/제어문자/역슬래시, 비 URL/다른 스킴/위장 호스트는 거부한다. 경로는 앱에서 행사명으로 제한하지 않는다. present-but-invalid 필드는 전체 피드를 거부하여 기존 last-good 정책을 따른다. `watchUrl`은 드롭스에만 허용한다.
- `promotionWatchUrl` 공유 함수가 `watchUrl` 우선·기본 카테고리 fallback을 결정한다. 앱 내 드롭스 행, 활성 상태 아이콘, Windows 액션과 드롭스 토스트 본문에 일관 적용한다. 시청 CTA는 `Twitch에서 시청`으로 표현한다. 보관함 클릭 및 예정/만료 비링크 동작은 유지한다. 앱 코드에 ExileCon 이름/경로 분기는 없다.
- 수집기는 FAQ/제외 섹션을 제거한 원문의 행사 시간 섹션 안에서 실제 HTTPS Twitch anchor를 읽는다. 명시 category/directory 링크를 공식 시청 채널 링크보다 우선한다. 동일 후보는 합치며 같은 우선순위에서 서로 다른 목적지가 있으면 원문을 거부한다. 계정/재고/설정/Creator Dashboard/도움말 링크는 목적지 후보가 아니다. 명확한 링크가 없는 기존 기사에는 필드를 생략해 기존 fallback을 유지한다. HTTP URL을 추측으로 HTTPS로 바꾸지 않는다.
- runtime/refresh 소유자는 `PromotionController`다. HTTP → `parsePromotionFeed` → 저장 성공 → cache 교체 → snapshot revision → 기존 `PROMOTIONS_UPDATED` handler/preload/hook으로 전달한다. 새 설정·IPC·service·migration·dependency는 추가하지 않는다. URL만 바뀌면 전체 이벤트 비교가 revision을 갱신하고 읽음/숨김/Windows 중복방지 기록은 URL 없는 일정 키로 보존한다. 이미 전달한 Windows 토스트는 중복 발행하지 않으며 이후 생성되는 알림은 최신 URL을 사용한다.
- 공식 사이트가 CST 등 지역 표기를 반환할 때, 명시 GMT offset을 우선하는 기존 날짜 파서에 원문의 `window.momentTimezone` IANA를 fallback으로 전달하는 최소 보완을 검토한다. `at` PST 문구 지원/우선순위를 바꿔 기존 종료 시각을 한 시간 이동시키지 않는다. 게시 환경 차이에 대한 구체 증거와 검증을 별도 기록한다.

### M2 — 행사별 watchUrl DoD와 테스트 필요성

- [x] [Windows-pwsh] 새/기존 피드 양방향 호환과 producer/consumer 검증 일치. 실제 채널/카테고리/향후 임의 Twitch 경로를 수용하고 위장 도메인·userinfo·scheme·port 등을 거부한다. 기존 계약 대조 fixture/테스트를 확장해 validator 드리프트와 unsafe link를 구별한다.
- [x] [Windows-pwsh] 공식 anchor 기반 URL 선택이 계정/FAQ/Creator 링크를 선택하지 않는다. 공통 기사 두 이벤트는 동일 실제 ExileCon 카테고리 URL을 갖고 ID·기간을 유지한다. 원문 지역 표기 변형도 동일 UTC를 산출한다.
- [x] [Windows-pwsh] 렌더된 앱 행/상태 아이콘 href 및 Windows XML body/action 목적지가 새 URL과 legacy fallback에 일치한다. 같은 일정의 URL 교체가 화면에 반영돼도 읽음/숨김/중복 알림 기록을 초기화하지 않는다. 기존 테스트에 실제 href/상태 결과를 추가하며 구현 문자열 매칭은 사용하지 않는다.
- [x] [Windows-pwsh] 전체 collector Node suite, `npm test -- --run --dir src`, `npm run lint`, 소유 격리 build input copy에서 `npm run build:check` 통과. 기존 dist/dist-electron/dev 서버를 보존한다. 의존성 재설치와 Electron 시작 없이 실행한다.
- [x] [Windows-pwsh] 실제 공식 HTTP → 새 후보 JSON → 실제 소비자 검증, 기존 일정/상점 상태 보존 증거와 정확 입력 manifest를 기록한다.
- [x] [Windows-pwsh] 확장 diff·계약·위험 URL·테스트 필요성을 독립 Astra xhigh 리뷰에서 확인하고 root 최종 QA에 전달한다.
- [x] [Windows-pwsh·사용자 승인 dev QA] 공개 JSON 갱신 후 root가 배정한 격리 dev 앱에서 실제 예정 일정·watchUrl 연동을 확인했다. 07:38:39Z snapshot의 두 게임 upcoming/ID/기간/URL이 실제 공개 피드와 일치하고, 독립 screen-QA가 예정 표시와 비활성 아이콘을 확인했다. 실제 활성 행/토스트 클릭과 외부 브라우저 이동은 미관찰이며 DOM/XML 검사와 구분한다. 시각·피드를 조작하지 않았다.
- [ ] [Windows-pwsh, 승인됨] 수집기 PR/CI/master/공개 JSON을 먼저 완료하고 실제 게시 피드로 앱 검증 후 앱 PR/master를 반영한다. release-please PR의 최신 CI까지만 확인하고 병합·바이너리 배포는 하지 않는다.

### M2 생산자 단계 진행

- producer 코드/fixture/README와 새 계약 검사 준비. Node suite **65 PASS, fail/skip 0** (`watch-url/producer-tests.log`). 6개 정상 Twitch URL과 25개 malformed/unsafe 입력 및 stash 오용을 검증한다. 고정 legacy 소비자는 새 필드를 제거해도 동일 이벤트를 읽는다. 실제 consumer의 기존 계약 비교는 유지하고 새 watchUrl 보존 비교는 앱 단계에서 추가한다.
- 공식 저장 HTML의 실제 IANA는 `Asia/Seoul`이다. root의 다른 네트워크 뷰에서 CST가 관측됐으나 그 응답의 IANA는 확인하지 못했다. Chicago/Shanghai 변형은 **합성 회귀**이며 실제 CST 응답의 지역을 주장하지 않는다. labelled/range 날짜에 기존 source IANA fallback만 전달하며 GMT+9의 우선순위와 UTC 경계는 유지한다.
- 앱 4개 구현 파일은 미커밋으로 보존하고 producer 파일만 선택 stage/commit한다. 수집기 PR에 앱 변경을 섞지 않는다.
- producer 독립 리뷰 1라운드에서 공백 정규식이 NUL/backspace/DEL 제어문자를 놓치는 결함을 발견했다. 원문 제어문자 범위를 명시 거부하고 빈 userinfo도 거부하도록 수정했으며 대표 입력을 기존 URL fixture에 추가했다. 재리뷰에서 URL 파서가 여분 slash를 정규화하는 빈 userinfo 경계도 발견해 원문에 정상 nonempty authority를 요구하도록 보완했다. 대표 1개 회귀를 추가하고 수정 후 재검증·재리뷰한다.
- 최종 producer 독립 리뷰 **통과**: 모든 지적 해소, 새 테스트 KEEP. 최종 65 PASS/fail·skip 0 및 11개 SHA256 일치, 실제 구 consumer/공식 원문/기존 10기사 11일정 무변경을 독립 확인했다. receipt `watch-url/producer-review.md`, `producer-verification.json`(확인 2026-11-06T07:02:42.636Z). source 분리 커밋/PR 및 공개 피드 적용 단계로 진행한다.
- producer 정상 hooks 커밋 `c8c2735`, [PR #328](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/pull/328)의 두 CI 성공 후 master `c0fe5af547b2db5000c28a58b74e35c88299cb6e`에 squash 병합했다(2026-11-06T07:09:48Z). [수집/발행 run 42179054682](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/actions/runs/42179054682)는 테스트·공식 수집·gh-pages push·Pages build·공개 내용 검증 모두 SUCCESS다. 수동 중복 실행은 하지 않았다.
- [공개 JSON](https://nerdhead-lab.github.io/POE2-unofficial-launcher/promotions.json) 직접 GET HTTP 200, `generatedAt: 2026-11-06T07:10:37.052Z`. 두 이벤트 watchUrl은 `https://www.twitch.tv/directory/category/exilecon`, ID/기간 유지. root도 저장 본문과 공개 응답의 일치를 독립 확인했다. `watch-url/published-promotions.json`, `producer-workflow.log` 보존.

### M2 앱 단계 진행

- producer master에서 `feat/twitch-watch-url-app` 분기했다. `watchUrl`은 parser/cache/snapshot에서 보존되며 네 클릭 경로가 공유 resolver를 사용한다. 드롭스 토스트 본문도 시청 URL로 이동하며 보관함은 기존 동작을 유지한다. `sourceUrl`은 계속 공지 출처다.
- 앱 `\p{Cc}` 검증은 producer의 C0/C1/DEL 범위와 같은 문자 집합이다. `no-control-regex` lint 오류를 문자 집합의 동등 표기로 해결했으며 rule을 끄지 않았다. C1 대표 입력을 추가한 26개 invalid URL과 정상 6개를 실제 TS/MJS parser 양쪽에 대조한다.
- 최종 Node **65 PASS**, 전체 Vitest **96 files / 786 PASS**, lint PASS. 초기 병렬 검사 중 무관한 FontMutatorWorker integration 1건이 30초 timeout(785 PASS)으로 실패해 로그를 `app-tests-concurrent-failure.log`로 보존했고, timeout/조건을 바꾸지 않은 단독 full 재실행은 통과했다. 병렬 부하를 확정 원인으로 주장하지 않는다.
- 기존 dist/dist-electron·사용자 Vite를 보존하기 위해 package/config/index.html/src/public/build의 정확 **360개 입력**을 task build-input에 복사해 `ELECTRON_STARTUP_PREVENT=true`로 `npm run build:check`를 실행, tsc/Vite 성공. `.env`·node_modules·사용자 프로필은 복사하지 않았다. `build-input-manifest.json`, `app-build-check.log`.
- 실제 게시 JSON을 새 소비자에 입력해 양 게임의 URL 보존/공유 resolver/action/Windows XML 목적지를 확인했다. 현재 시각에는 두 이벤트 모두 예정이며 native 활성 알림이 관찰됐다는 뜻이 아니다. `app-verification.json`은 13개 source와 9개 evidence hash를 연결한다.
- dev QA의 승인된 격리 수단: 359개 입력은 그대로, 복사본 package.main만 scratch bootstrap으로 변경하고 실제 product main을 로드한다. bootstrap은 import 전 appData/userData/sessionData/logs를 소유 프로필로 설정하며, `font:check-migration` 한 채널만 `{prompt:false}`로 대체한다. 폰트 migration/시스템 폰트 정리는 QA 범위에서 제외하고 Promotions network/controller/cache/IPC/renderer는 변경하지 않는다. source 입력 manifest와 `dev-harness-manifest.json`의 harness 차이를 구분한다.
- `native-handoff.md`, `Launch-DevQa.ps1`, `qa-bootstrap.cjs`를 root에 전달했다. 앱/격리 수단 독립 리뷰 **통과**, 미해결 지적 없음. reviewer는 13개 source/9개 evidence/360개 build 입력 일치와 URL validator 문자 판정 동등성, 실제 게시 피드 목적지 및 좁은 bootstrap 경계를 확인했다. 새 행동 테스트는 모두 KEEP이다. 요청 Astra xhigh/dispatch PASS이며 실제 runtime identity는 별도 미노출이다. `watch-url/app-review.md`.
- root 독립 final-QA는 **native 전 사전점검 PASS**로 차단 결함 없음을 확인했다. 최종 acceptance는 실제 예정 상태 관찰과 앱/source 및 release PR 최신 CI 후 별도로 판단한다. source/test/fixture/QA 입력은 동결하고 root actor가 생성하는 native runtime 증거만 추가한다.
- root actor의 실제 dev QA: `native-snapshot.json`(2026-11-06T07:38:39.023Z, Asia/Seoul)은 activeEvents 0, 두 게임 upcoming 및 실제 공개 피드의 정확 ID/기간/sourceUrl/watchUrl을 확인했다. `native-receipt.json`은 소유 build cwd/4개 격리 경로, font 등록 1·차단 호출 4·Promotions override false를 기록한다. 활성 이벤트를 만들기 위한 시계/피드 변경은 없다.
- 독립 Astra xhigh screen-QA **PASS**, findings 0. `native-tooltip.png` 실제 픽셀에서 전체 앱과 예정 중립 아이콘, **다음 이벤트 / 11. 7. 05:30 ~ 11. 8. 15:59** 표시를 확인했다. PNG SHA256 `1b0434a4157c4570fe7effe279a7a3a334960660d231568c62b7e0a3f27e2633`. focus 상태의 tooltip이며 실제 mouse hover, 활성 클릭, 외부 Twitch, Windows toast runtime은 미관찰이다. font migration도 QA 제외다.
- root는 actor stopped/drained 및 정확 PID·생성 시각·parent/exe/command를 대조한 뒤 소유 dev tree 10 targets만 종료했다. 해당 프로세스/descendant 0, renderer 54431/CDP 56402 LISTEN 0을 확인했고 기존 사용자 프로세스는 보존했다. 프로필/증거를 보존하고 lease를 반환했다. source freeze 해제 후 정상 hooks·선별 커밋과 승인된 source 원격 전달만 진행한다.
- 위키 경로가 없어 `watch-url/wiki-raw-app.md`를 로컬 raw로 보존했다. `/ingest`는 실행하지 않았다. 이 문서는 로컬 구현·검증 이력으로 archive에 보존하고, 이후 실제 PR/CI/master 및 릴리스 PR 결과는 task owner checkpoint와 handoff에 기록한다.

## 초기 수집기 단계 기록 — 범위 확장 전 증거

다음은 `fix/exilecon-twitch-drops`에서 완료한 collector-only 단계의 기록이다. 앱 CTA 보류 및 계약 무변경 설명은 이 초기 단계에 한정되며 현재 범위는 위 M2가 대체한다.

### 승인·범위·원인

사용자의 “ㅇㅇ 갱신해줘”는 수집기 보완과 검증된 공개 피드 갱신 목표의 승인이다. 이 단계는 로컬 구현·검증·분리 리뷰·게시 준비까지다. 커밋, push, PR, master 머지, 수집 workflow 실행은 root의 후속 승인 receipt 전까지 보류한다. master 머지는 release-please와 피드 발행 workflow를 실행할 수 있다.

- 기준 master: `a6c11217056ad2c1307339f7b37a09ca8ab58e34`. 단일 writer: `exilecon_drops_update`. 소유 범위는 `scripts/promotions/` 최소 변경, 이 문서, `.tmp/exilecon-drops-update-20261106/`이다.
- 타 소유 dirty `AGENTS.md`, `docs/README.md`, untracked `.codex/` 및 기존 work 문서는 보존한다. 초기 호환성 receipt는 root의 `COMPATIBLE`, notice false, fingerprint `AFDB3C00F00ECC4D71690E7A2CAF0E559443A3F613712F39A7C9BA3609631245`를 재사용한다. 분기 시 제품/정책 HEAD 변화 없음.
- `afba18e`에서 도입된 `twitchGame`은 PoE1/PoE2 시청 category/directory/stream만 허용한다. 공식 [4012689](https://www.pathofexile.com/forum/view-thread/4012689)는 `Exilecon directory`를 요구해 `Ambiguous Twitch game category`로 거부된다. 발견/HTTP 실패가 아니다.
- root가 보존한 `.tmp/twitch-drops-probe-20261106/`의 공식 원문·진단을 읽기 전용으로 재사용한다. 오래된 4007691/4006108의 미지원 날짜 표현은 별도 범위이며 변경하지 않는다.
- 임시 지시 `poe-kakao-desktop-busy-20261105` rev9(rev8 대체): 화면/focus/input/display 및 로컬 런처·게임·Electron·브라우저 실행 금지. 기존 사용자 작업/Vite dev 서버를 보존하며 명시 desktop/app 허용까지 유효하다. 비간섭 PowerShell/Node/HTTP만 수행한다. 다른 저장소의 원격 배포 승인은 이 작업에 적용하지 않는다. registry는 root 관리다.

## 설계·영향 범위

- 명시적인 `Exilecon directory`를 가진 드롭스 시청 섹션을 공통 행사로 지원한다. 제목의 ExileCon, 일반적인 양 게임 보상 문구, FAQ만으로 공통 일정을 추측하지 않는다. 상충하는 게임 카테고리는 계속 거부한다.
- schema 1의 드롭스 `game: both` 금지를 유지하며 같은 기간을 `poe1`, `poe2` 두 이벤트로 발행한다. 공통 일정에만 ID의 `-poe1`/`-poe2` 접미사를 사용한다. 기존 단일 게임의 ID는 유지한다.
- `scheduleKey`는 게임을 포함하므로 두 게임을 합치지 않는다. 기존 원문 교체·재공지 중복 제거·기간 정정·만료 제거·수동 제어를 유지한다.
- 날짜 코드는 변경하지 않는다. 기존 파서는 `November 6 at ...`를 건너뛰고 명시 GMT+9 병기 시각을 읽는다. 날짜만 검증하기 위해 메모리에서 카테고리 텍스트를 치환한 baseline 결과는 UTC `2026-11-06T20:30:00.000Z`–`2026-11-08T06:59:00.000Z`(KST 11/7 05:30–11/8 15:59)였다. 이는 실제 원문의 GMT+9 시간이다. 종료 PST 문구를 산술 변환한 KST 16:59와 한 시간 불일치하므로 임의로 보정하지 않는다. `.tmp/.../baseline-date.log`는 이 기존 해석의 증거다.
- AppConfig·IPC·서비스·의존성·소비자 계약·발행 workflow 변경 없음. 기존 런처의 Twitch 버튼은 게임별 디렉터리로 이동하므로 ExileCon 전용 바로가기는 제공하지 않는다. 아래 CTA 제한은 root가 별도 범위 결정을 받을 사항이며 앱 수정은 보류한다. 앱 UI·게임 실동작 확인을 주장하지 않는다.

### 기존 런처의 시청 링크 제한 (소스 확인, 런타임 미검증)

- `src/shared/promotions.ts:59`의 `TWITCH_LINKS`는 `https://www.twitch.tv/directory/category/path-of-exile` 및 `https://www.twitch.tv/directory/category/path-of-exile-2`다. `:275`–`:276`의 액션 이름은 `PoE 1 Twitch`/`PoE 2 Twitch`이며 같은 URL을 사용한다.
- `src/renderer/components/PromotionStatus.tsx:160`–`:165`의 진행 중 드롭스 아이콘도 같은 URL을 사용한다. 접근성 이름은 `:64`에 따라 `트위치 드롭스 진행 중 · PoE 1 Twitch` 또는 `PoE 2 Twitch`다. 예정 중에는 비링크 상태다(`:69`–`:78`).
- `src/renderer/components/PromotionRow.tsx:76`–`:88`의 `PoE 1/2 트위치 드롭스 진행 중` 앱 내 알림 행도 같은 고정 URL을 사용한다. 이 드롭스 아이콘/행에는 별도 원문 보기 CTA가 없다.
- `src/main/services/promotion-toast.ts:23`–`:25`, `:32`에서 Windows 토스트 **본문** 클릭은 드롭스의 `sourceUrl`, 즉 `https://www.pathofexile.com/forum/view-thread/4012689`로 이동한다. 토스트의 `PoE 1/2 Twitch` **버튼**은 위 고정 게임 카테고리다. 따라서 Windows 알림을 사용하지 않는 사용자는 해당 이벤트 UI 안에서 공지로 바로 가는 수단도 없다.
- 공식 공지의 실제 참여 목적지는 `https://www.twitch.tv/directory/category/exilecon` 또는 공식 `www.twitch.tv/pathofexile` 방송이다. 단순 게임 카테고리 시청으로 이번 Drops가 충족된다고 안내하면 안 된다. 피드 일정 갱신과 이 앱 CTA 지원은 별개의 결과다.

## M1 — 구현·검증·리뷰 DoD

- [x] [Windows-pwsh] 공식 4012689의 정제 fixture에서 동일 기간의 PoE1/PoE2 이벤트와 서로 다른 안정 ID가 생성된다. 원문의 GMT+9 날짜를 유지한다.
- [x] [Windows-pwsh] 기존 단일 게임/FAQ 보호와 새 공통 판정의 부정 사례를 검증한다. 재수집·재공지·원문 교체·정정·만료 경계가 두 게임에서도 유지된다.
- [x] [Windows-pwsh] `node --test scripts/promotions/*.test.mjs`, 변경 파일 형식/문법 및 `git diff --check` 통과. 실제 소비자 계약과 후보 JSON의 대상 게임/일정 키 호환 확인.
- [x] [Windows-pwsh] 실제 공식 HTTP 수집으로 공개 이전 피드 기반 후보를 생성한다. 4012689 두 게임 일정, 기존 단일 일정 무변경, 만료 제거, `stashSales` 실패/보존 정책을 확인한다. 원격 게시 결과와 구분한다.
- [x] [Windows-pwsh] 독립 Astra xhigh 리뷰에서 실제 diff·공식 원문·검증 증거·테스트 필요성을 확인한다.
- [ ] [사용자, 후속 승인 후] 소스 전달/머지 및 공개 수집·Pages JSON 검증. 현재 단계의 완료 게이트에는 포함하지 않으며 별도로 남긴다.

### 테스트 필요성

기존 테스트는 단일 게임 카테고리와 일반 중복/만료만 다룬다. 새 fixture는 실제 공통 시청 디렉터리가 거부되거나 `both`/중복 ID로 발행되는 오류와 GMT+9 경계 손상을 구별한다. 부정 사례는 ExileCon 제목·FAQ·양 게임 보상만으로 잘못 분류하는 오류를 막는다. 두 게임 재공지/재수집·한 게임으로 정정·종료 경계 사례는 공통 일정 확장 후 남는 잘못된 게임/중복·유령 일정을 구별한다. 일반 계약·상점·발행 회귀는 기존 suite를 재사용한다. collector 전용 변경이라 전체 Electron build/실행은 필요하지 않으며 PR의 선언된 필수 검사는 동일 Node suite다.

## 진행·검증·리뷰

- 구현 전: 공식 원문 거부 및 날짜 기존 해석 확인. `.tmp/exilecon-drops-update-20261106/baseline-date.log`.
- 새 회귀 3개는 수정 전 실패했다(`tests-before-fix.log`). 첫 전체 실행 때 fixture 자동 서식이 날짜 행을 나눠 입력이 변형됐으므로 해당 정제 원문에 `prettier-ignore`를 적용하고 실제 한 줄 날짜를 복구했다. 날짜 파서는 확장하지 않았다.
- 최종 Node 24.18.0 / Windows x64: `node --test scripts/promotions/*.test.mjs` **62 PASS, fail/skip 0** (`tests-final.log`). 변경 파일 Prettier check, Node syntax, `git diff --check` 통과. 실제 TS 소비자 import의 기존 MODULE_TYPELESS_PACKAGE_JSON 경고만 있으며 프로젝트 모듈 설정은 변경하지 않았다.
- 실제 수집: `node scripts/promotions/collect.mjs --previous .tmp/exilecon-drops-update-20261106/previous-public.json --output .tmp/exilecon-drops-update-20261106/candidate.json` 성공. `generatedAt: 2026-11-06T05:30:57.949Z`, schema 1, ExileCon 두 게임 각 1건. ID는 `ggg-4012689-twitch-591814b46c-poe1`, `ggg-4012689-twitch-591814b46c-poe2`. 두 기간은 UTC `2026-11-06T20:30:00.000Z`–`2026-11-08T06:59:00.000Z`이고 수집 시점 예정 상태다.
- `verify-candidate.mjs`는 실제/legacy 소비자 계약, 서로 다른 게임별 일정 키, 시작/종료 활성 경계, 보존 공식 HTML과 후보의 동일성을 확인했다. 기존 공식 10기사의 11일정은 이전 probe의 ID/게임/기간 전체와 동일하다. 모든 과거 일정은 후보에서 제거됐다.
- 네 상점 API는 이번 수집에서 모두 `ok`, 할인 확정 기간 `null`이다. 이전 API anchor(10/23–10/27) 및 11/13–11/17 KST 예상은 정확히 보존됐다. 예상은 신규 할인 확정이 아니다. API 실패 보존 회귀는 기존 전체 suite에서 통과했다.
- `live-collect.log`에는 범위 밖 9월 공지 4007691/4006108의 미지원 날짜 경고 2개만 남는다. `.tmp/exilecon-drops-update-20261106/verification.json`에는 환경·원본/코드/입력/후보/테스트 로그 SHA256 receipt가 있다. 원문 전체 HTML은 추적 파일에 넣지 않았다.
- 독립 리뷰 1라운드 **통과**: `/root/exilecon_drops_update/exilecon_review`가 명시 디렉터리 판정·ID 분리·날짜/계약/발행 무변경을 확인했고 코드 결함 또는 범위 밖 변경 지적 없음. 새 회귀 3개는 각각 고유 실패를 보호하므로 모두 KEEP, 삭제·통합·재작성 지적 없음. 독립 새 회귀 3 PASS, 공식 원문/fixture/후보 동일, 기존 10기사/11일정 동일, 12개 evidence hash 일치 및 형식·문법·diff 통과. 전체 62-test 로그는 동일 상태 증거로 재사용했다. 요청 프로필은 exact Astra xhigh, checker PASS이며 실제 런타임 모델/effort는 별도 확인 불가. 전체 판정은 `.tmp/exilecon-drops-update-20261106/review.md`.
- 로컬 collector DoD 완료. root의 독립 최종 QA는 별도 진행하며, 제품 소스/테스트/fixture/README를 동결해 전달한다. 이후 수정 시 영향받는 검사·리뷰 증거를 갱신한다.
- 통합·커밋·원격·공개 배포: 아직 실행하지 않음.

## 보존·소유권

- 진행: 로컬 구현·검증·독립 리뷰 완료. integration: 미적용. current use: 수정 종료, writer lease를 root에 반환하고 후속 지시 대기.
- 데이터 disposition: 소스/fixture/검증 후보와 로그는 리뷰·후속 게시 증거로 보존한다. root의 기존 probe 및 다른 소유자 파일은 읽기 전용이다.
- cleanup decision: **PRESERVE**. 이 공유 기본 checkout과 브랜치/증거 삭제 승인은 없다. lease 종료와 삭제 권한은 별개다.
- 권위 있는 worktree 결정 MD: `.tmp/exilecon-drops-update-20261106/owner-checkpoint.md`. 이 문서와 함께 진행·통합·현재 사용·보존 사유를 갱신한다.

## 원격 전달 준비

- 제안 제목: `fix: ExileCon 트위치 드롭스 일정이 표시되지 않는 문제 수정`
- 게시 준비 본문: `.tmp/exilecon-drops-update-20261106/pr-body.md` (`Summary`/`Motivation`만). 수집기만 적용하는 현재 범위 기준이며 앱 시청 링크 추가 승인이 오면 최종 변경에 맞게 다시 작성한다.
- 후속 순서: 독립 리뷰·root 최종 QA → 사용자 범위/전달 승인 → 승인된 로컬 커밋·push·PR·master 병합 → 피드 수집/발행·Pages 공개 JSON 확인. master 관련 push는 기존 자동 workflow를 실행할 수 있어 수동 workflow 실행과 별도로 중복 게시하지 않는다. release-please 릴리스 PR 결정도 root가 받은 승인 범위에 따른다.
- 현재 공개 피드를 직접 수정하거나 override하지 않았다. 후보 JSON 생성은 공개 갱신 완료가 아니다.

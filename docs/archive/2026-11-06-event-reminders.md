# 이벤트 미리 알림과 주요 소식 예정 상태

## 앱 통합·릴리스 준비 인계

사용자가 실제 normal dev를 살펴본 뒤 앱 기능의 commit/PR/CI/master 반영과 release-please PR 본문 검토 직전까지 진행하도록 명시 승인했다. 최종 release PR merge·태그·바이너리 배포는 별도 사용자 결정이며 이 작업에서는 실행하지 않는다.

현재 기능은 복수 미리 알림, 늦은 일정의 최신 도달 시점 한 번 안내, 실제 남은 시간, 행사명/선택 게임/기간/시작·종료 countdown 및 24시간 이내 노란 드롭스의 시청 링크를 포함한다. 기존 설정의 미리 알림·Windows 기본 OFF와 기존 일정/읽음/숨김/전달 이력을 보존한다.

fresh master 기반 분리 checkout에서 원본 src24파일과 byte 동등하게 통합했고 전체 앱826/Node73/0skip/lint/build를 통과했다. 원본 실행 중 dev와 해당 문서·설정·profile은 수정하지 않았다. 원본의 계획·검증 이력은 그대로 보존하고 이 통합 checkout의 작업 문서만 archive한다.

사용자 다음 단계 진행 승인은 확보됐지만 실제 노란 링크 클릭/외부 브라우저 열기, 최신 화면 픽셀·Native 전달 검증을 새 PASS로 주장하지 않는다. 기존 단계의 Native/화면 기록과 마지막 DOM href·계산 색 관찰은 각자의 입력/범위로만 사용한다. 외부 wiki 경로 부재로 raw/ingest는 NOT_RUN이며 로컬 원본/인계 근거는 보존한다.

아래 내용은 단계별 역사적 계획·검증·권한 기록이다. 그 시점의 PENDING/미실행 표기는 현재의 앱 통합 승인과 최종 릴리스 결정 경계를 대신하지 않는다.

> 작성일: 2026-11-06 · 상태: 진행 · 브랜치: feat/event-reminders · 갱신: 2026-11-07

## v2.1 — 행사명·적용 게임·남은 시간 표시 개선 (로컬 완료·root finalQA 대기)

사용자가 행사명을 수집기에서 제공하고 `game`을 표시 대상 기준으로 사용하도록 개선을 승인했다. root DESIGN v2가 확정되어 기존 v1.3 worktree에서 단일 writer로 구현한다. 사용자가 기존 dev를 종료했고 root가 해당 process/54321·9222 listener 부재를 확인했다. 아래 v1.3 기록은 기준 이력으로 보존한다.

- schemaVersion1 `PromotionEvent.title?: string`을 JS/TS parser에서 보존한다. title이 없으면 기존 fallback, 있으면 문자열·한줄·공백정리·비어있지 않음·최대200자·제어문자 없음 검증을 적용한다.
- producer는 첫 staff 본문/채택한 drops 구간의 행사·보상 이름을 제공한다. ExileCon은 본문의 행사/공식방송/전용 directory 근거로 두 게임 모두 `ExileCon 트위치 드롭스`다. 일반 보상·주차 이름은 유지하고 참여/출시/FAQ/계정연결 heading이나 공지 전체 제목을 행사명으로 오인하지 않는다.
- ID hash 입력인 raw heading/section은 변경하지 않는다. 기존 watchUrl/sourceUrl/game/precision/schedule/read/dismiss/native ledger/reminder watermark와 v1.3 알림 단계를 보존한다.
- 공용 promotionTitle은 title을 우선해 toolbar/앱 행/삭제창/native에 적용한다. toolbar drops active/upcoming은 선택 게임을 먼저 필터링하고 그 결과에서만 link를 선택한다. 다른 게임 fallback은 없고 전역 알림 구독·stash 범위는 그대로다.
- 사용자 추가 요청과 root/designer v2.1 확정: drops tooltip의 첫줄은 실제 제목이며 다음줄은 적용 게임, 그다음은 시작~종료와 실시간 남은 시간이다. 예정은 시작까지, 진행 중은 종료까지 ceil초로 계산하며 기존 now/timer를 공유한다. stash tooltip은 이 변경에 확장하지 않는다.
- 공통 행사 적용 게임은 표시용으로만 엄격하게 집계한다. 기존 `^(ggg-\d+-twitch-[a-f0-9]{10})-(poe1|poe2)$` ID의 같은 stem과 suffix=game, 같은 canonical source thread/UTC 시작·종료/kind/title 값/watchUrl 값을 가진 반대 게임 쌍만 `PoE1 · PoE2`로 표시한다. 제목만 같음/다른 섹션/출처/기간/목적지/임의 manual ID는 집계하지 않는다. 선택 게임 행·href와 전역 알림·ID·ledger·snapshot은 병합하지 않는다.
- terminal은 로컬 producer+consumer 개선, 실제 TS parser의 생성 JSON 소비, 자동검사/독립 리뷰/root finalQA 및 **일반 npm run dev 실행 직전 준비**다. 지금 앱/dev/GUI/native/profile/OS 조작이나 commit/push/PR/merge/publish는 하지 않는다. 새 QA launcher/임시 profile/온보딩 우회는 만들지 않는다.

### v2 마일스톤·DoD

1. [Windows-pwsh] 실제 ExileCon fixture → producer 생성 JSON → 실제 TS parser → 공용 title이 이어지고 두 게임의 동일 행사명이 보존된다. 일반 보상/주차·안내 heading 배제와 old/invalid title, XML escape를 기존 coverage에 의미 있게 보강한다.
2. [Windows-pwsh] title-only 변경이 표시를 갱신해도 ID/이력/watermark는 유지된다. 동시 두 게임에서 선택 게임 전환 시 title/watchUrl/24h/countdown 대상이 바뀌고 해당 게임이 없으면 active/upcoming/link가 없다. 전역 알림 및 stash 제한은 보존한다.
3. [Windows-pwsh] 로컬 수집 출력/소비 검증, focused→전체 앱/producer·consumer 검사→lint/build를 수행하고 독립 Astra 리뷰의 지적을 수정한다. root finalQA에 정확 후보와 증거를 인계한다. 기존 중복 사례·상수 복제는 추가하지 않는다.
4. [사용자] 새 표시의 실제 dev/UI 확인은 실행 요청 뒤 남는 게이트다. 이번 terminal에서는 dev 실행을 하지 않고 일반 실행 경로·현재 포트 충돌 처리 인계만 준비한다. 이전 v1.3 화면 PASS를 변경된 v2 픽셀 PASS로 재사용하지 않는다.

v2 review: 독립 Astra/xhigh Round1과 v2.1 changed-input 최종 리뷰 **통과**, 미해결 지적0. 제품 소스는 freeze하며 coordinator writer lease는 root에 반환한다. primary/다른 owner/이전 QA 고정 입력은 보존한다. 생성했던 새 sibling worktree는 overlay 없이 unused/PRESERVE로 중단했고 실제 제품 작업에는 사용하지 않는다.

### v2 검증 진행

증거는 ignored `.tmp/event-reminders-20261106/presentation-v2/`에 보존한다. 기존 의존성과 fonts fixture를 읽기 재사용하고 캐시는 작업 경로에 격리한 native Windows PowerShell/Node24.18.0 환경이다. 실제 앱 실행은 하지 않는다.

- producer/consumer focused `30 PASS`, app focused 최종 `221 PASS`. 최초 app 실행은 `220 PASS/1 FAIL`로, 테스트에서 시계를 1초 전진시킨 뒤에도 정확히24시간으로 기대한 oracle만 실제23:59:59로 교정했다. 제품 countdown 계산은 수정하지 않았다.
- 전체 앱 `npm test -- --run --dir src`: `96 files / 811 PASS / 0 skip`.
- 실제 공식 read24건으로 로컬 `promotions.local.json`을 재수집하고 실제 `src/shared/promotions.ts` parser/helper로 소비했다. 두 게임 모두 `ExileCon 트위치 드롭스`, 기존 `ggg-4012689-twitch-591814b46c-poe1/poe2` ID와 ExileCon watchUrl을 유지한다. 상점 네 소스 성공, 무관 공지2건의 미지원 날짜 경고는 `collection-summary.json`에 보존한다. 최초 scratch import 경로 오류는 모듈 로딩 전 실패했고 경로 교정 후 성공했으며 실패 로그도 보존했다.
- 공개 feed는 읽기만 했고 관측 시 `title`이0건이다. **공개 JSON은 미게시/미변경**이다. 앱은 `SUPPORT_URLS.PROMOTIONS_JSON`의 고정 공개 URL을 읽으며 기존 지원 local-feed override가 없다. 따라서 로컬 source/소비 검증 완료와 다음 일반 dev에서 새 행사명 노출은 별개다. 공개 feed에 `title`이 공급되기 전에는 기존 fallback을 표시한다. 사용자 config/cache/profile이나 QA 우회 경로를 만들지 않는다.
- title-only refresh는 실제 controller snapshot과 renderer 읽음 행에 새 이름을 전달한다. 기존 일정 숨김·active delivery ledger·reminder watermark와 native 재전달 횟수는 유지된다는 기존 경로 검증을 확장했다. 제목 자체를 identity에 넣지 않는다.
- 테스트 필요성: 기존 fixture/수집/JS↔TS/상태/읽음/toast 사례에 새 필드 검증과 이름 갱신을 합쳤다. 추가 사례는 일반 보상 heading과 안내 heading 구분, 표시명 우선/legacy fallback, 다른 게임만 있는 toolbar를 구별한다. 기존 전체 범위 테스트를 중복해서 늘리지 않는다.
- v2 Node 전체 `67 PASS/0 skip`, lint/build:check 모두 exit0. 이 증거는 v2 후보 이력이며 v2.1 소스의 최종 검사로 바꾸어 부르지 않는다.
- v2.1 focused `80 PASS`: 제목/게임/기간/countdown 순서, 두 선택 게임에서 공통 행사 한행 표시, canonical source와 동등 UTC 표현의 같은 쌍, start에서 종료 countdown 전환과 end 제거를 확인했다. 다른 섹션/출처/시작/종료/제목/목적지/suffix/manual ID의 오집계를 구분하는 최소 조건 사례를 추가했다. 이 조건들은 전역 알림 병합을 검증하는 테스트가 아니라 잘못된 적용 게임 표시를 막는 UI 의무다.
- v2.1 최종 순차 실행: 앱 `96 files / 820 PASS / 0 skip`, Node producer/consumer `67 PASS / 0 skip`, `npm run lint`·`npm run build:check` 모두 exit0. 조건·timeout·skip·의존성을 변경하지 않았다. Vite의 기존 native-config/chunk 크기 경고와 Node의 TS module-type 경고는 성공과 구분해 로그에 보존했다.
- `local-consumer-proof-v21.json`: 불변 로컬 수집 JSON을 최종 TS parser/helper와 JS parser로 재소비해 동등성과 두 게임 title/ID/watchUrl을 확인했다. consumer/source SHA를 기록했다. `candidate-v21.json`은 변경 tracked 입력과 package/config 입력의 로컬 QA binding이며 cleanup seal이나 삭제 권한이 아니다.
- v2.1 실제 dev/UI/Native/픽셀 검증은 **NOT_RUN**, [사용자] 실제 화면 최종 수용은 pending이다. 이전 v1.3 화면 PASS를 재사용하지 않는다. 일반 실행 준비까지만 완료했고 root finalQA/integration/commit/원격/게시도 별도다.

### v2.1 독립 리뷰 Round1 — 통과

- reviewer `/root/event_reminder_update/event_reminders_review`, requested exact Astra/xhigh. dispatch checker는 allowed/static policy PASS이며 실제 runtime metadata는 미노출이다. read-only 리뷰로 파일·테스트·앱·GUI·외부 조작0.
- 실제 v2/v2.1 diff와 계약, 최종820/67/lint/build 로그, 현재 TS consumer SHA와 로컬 JSON 소비 영수증을 대조했다. 행사명 추출/JS↔TS 거부조건/XML escape/raw hash 불변/title-only snapshot·읽음·숨김·watermark 보존을 확인했다.
- 엄격한 split 쌍 판정은 tooltip의 적용 게임 문구에만 적용되며 선택 게임 행·href와 전역 알림을 병합하지 않는다고 판정했다. 첫줄 제목→게임→기간→시작/종료 countdown과 만료 전환이 v2.1 계약과 일치한다. 추가·수정 테스트는 test-design 기준 **KEEP**, 미해결 지적0이다.
- root finalQA와 사용자 live 검증은 리뷰 PASS에 포함하지 않는다. 정확한 일반 dev 인계는 ignored `presentation-v2/final-handoff.md`에 있으며 이 단계에서 앱 실행·공개 피드 반영을 수행하지 않았다.
- 일반 dev는 새 QA profile 없이 기존 `appData/POE2 Unofficial Launcher` userData 경로를 사용한다(`src/main/store.ts`). root가 이후 사용자 실행 요청 시 당시 task process/54321·9222 소유를 다시 확인한 뒤 같은 worktree에서 `npm.cmd run dev`를 실행한다. 지금 실행/종료나 사용자 profile/config 조작은 없다.

## 승인 범위와 환경 — v1.3 기준 이력

사용자의 이벤트 미리 알림 구현 및 복수 시점 선택 승인에 따른 root 전달 설계 계약 v1을 구현한다. 30분·1시간·하루 전을 복수 선택하고, 숫자와 일·시간·분·초 단위로 직접 입력하는 항목 하나를 제공한다. 기존 알림 종류/방식과 Windows 기본 OFF를 보존한다. 주요 소식은 시작 24시간 이내를 노란 예정 상태로 표시하고 실제 남은 시간을 매초 갱신한다.

- 유일 writer: `/root/event_reminder_update`; root는 orchestration 담당.
- 작업 경로: `D:\project_poe2\POE2-unofficial-launcher-worktrees\event-reminders-20261106`.
- 기준: `origin/master` `95bb5fe70d129e0a48d1855800448df3b96e5d5e`.
- primary checkout, 기존 사용자 dev 앱/54321 포트, 다른 소유자의 파일과 worktree는 보존한다. 설치·의존성 변경·새 서비스·IPC 채널·수집기·릴리스 변경은 범위 밖이다.
- 새 경로의 checker는 NOT_CONFIGURED(기존 tracked AGENTS marker와 contract 없음), fingerprint `4EF32E07681337D7256F9BCB52070D9E488A00F7B1BBDC398CBC20E214F57DFF`, noticeRecommended=true. root가 사용자에게 gap과 별도 migration review 가능성을 공지했다. migration 승인/deferral은 없으며 정책 복사/수정 없이 현재 지시와 기존 local_serial 단일 writer 및 프로젝트 게이트를 적용한다. primary owning-root COMPATIBLE receipt는 sibling 경로 검증을 대신하지 않는다. primary ProjectRoot/sibling ActivePath 시도는 checker의 경계 제한으로 거부됐다.
- 의존성은 primary의 433개 설치 디렉터리를 junction으로 읽기 재사용한다. worktree의 node_modules root/.vite/.vite-temp/.cache는 실제 격리 디렉터리이며 install/ci는 하지 않았다. Node 24.18.0, native PowerShell에서 Vite resolveConfig(build)의 root/cacheDir/realCache가 새 경로임을 확인했다.
- v1.3 당시 사용자 허용 아래 root가 분리된 실제 Windows QA와 task 소유 프로세스 정리를 완료했다. 현재 v2의 제품/검증 권한과 실행 hold는 위의 새 계약을 따른다. 사용자 설정/profile·게임·무관 앱은 보존한다. push·PR·merge·release 승인은 없다.

## 설계 계약 v1.3

v1.3 root/보호된 designer 확정: 저장된 number의 `toString()` canonical decimal/exponent를 정수 비율로 환산해 정수초 여부와 safe milliseconds를 BigInt 영역에서 검사한 뒤 Number로 반환한다. 입력 원문 정밀도를 복구하는 방식은 아니며 BigInt를 JSON에 저장하지 않는다. 고정 오차 cap이나 큰 허용 오차로 유효값을 거부/부분초를 허용하지 않는다. 의존성·범용 추상화는 추가하지 않는다.

v1.2 root/보호된 designer 명확화: custom 입력값 자체는 정수로 제한하지 않는다. finite > 0인 값이 선택 단위로 환산된 뒤 양의 정수초가 되고 milliseconds가 safe이면 허용한다(1.5시간=5400초, 0.1분=6초, 0.5초 거부). 매우 작은 float 오차만 보정하고 같은 helper를 normalize/UI/offset dedupe에 사용하며 원래 value/unit을 재오픈 시 유지한다. 대상은 기존 parser가 채택하는 UTC startsAt/endsAt 일정 전체(exact/derived-start/manual)이며 exact-only 필터는 추가하지 않는다. 별도 StashEstimate만 제외하며 derived-start를 실제 확정 시작 시각으로 주장하지 않는다.

v1.1 사용자 보강: 최초 feed가 없었다가 공지가 늦게 공급되는 경우도 포함한다. 예를 들어 24시간 전을 선택했어도 6시간 23분이 남았을 때 처음 전달되면 실제 전달 시각 기준의 남은 시간을 표시한다. 이미 지난 선택 시점은 최신 단계 하나로 합치고, 이후 도달하는 선택 시점은 유지한다. Windows body는 native 호출 시점의 now를 사용하고 generatedAt/선택 offset을 남은 시간으로 재사용하지 않는다. 앱 내 행·삭제창도 실제 남은 시간을 함께 표시한다.

1. `eventNotifications.reminders`에 preset 목록과 custom 하나를 additive 저장한다. 누락된 구설정은 미리 알림 모두 OFF. 초 단위의 유효 양의 정수/안전 변환으로 정규화하고 중복 offset을 제거한다. 최상위 metadata 설명과 DEFAULT_CONFIG normalizer를 유지하고 nested update는 불변으로 한다. 전용 modal이므로 settings-config는 추가하지 않는다.
2. 일정별 선택 시점 중 현재 도달한 가장 최근 단계 하나만 후보로 삼는다. T-20분 복귀 시 24h/1h/30m 중 30m 한 번이며 과거 단계로 fallback하지 않는다. 시작 후에는 사전 알림 없이 기존 진행 중 정책을 적용한다. 앱 실행 중의 정확한 PromotionEvent만 대상이며 StashEstimate는 분리한다.
3. feed/parser와 schedule key는 보존한다. 앱 알림 타입은 PromotionEvent + optional reminderSeconds이며 snapshot.events/notify에만 사용한다. 알림 identity는 사전 단계에 schedule+offset, 진행 중에는 기존 schedule key다. read/native map은 알림 identity, 앱 행은 일정당 최신 단계 하나다. 일정 숨김은 전체 일정, session 삭제는 해당 단계만 숨긴다. 기존 dismiss payload에 optional notificationId를 추가하고 Main에서 현재 단계를 검증한다.
4. 기존 Windows active ledger는 유지한다. 미리 알림은 일정별 마지막 전달 dueAt watermark를 별도 optional 저장하여 재시작·설정 변경으로 과거 단계가 재발송되지 않게 한다. 저장 후 native 전달, 불확실한 전달은 재발송하지 않고 확실한 실패는 기존 backoff 재시도 정책을 유지한다. 다음 단계/시작/설정 OFF/철회 시 이전 native 객체를 정리한다. 만료와 유효성 검증은 기존 cache의 신뢰 경계에 맞춘다.
5. 사전 행·삭제창·toast에는 시작 예정과 실제 시작 시각/남은 시간을 표시한다. 선택한 30분을 늦은 복귀 후 실제 남은 시간으로 주장하지 않는다. watchUrl/출처/legacy fallback을 보존하고 hook/service의 active-only 부분만 국소 확장한다.
6. 주요 소식은 `0 < delta <= 24h` 노란 예정, 24h 초과는 기존 비활성, 시작 순간 기존 활성 상태다. 활성 일정이 우선이며 예정은 비링크 span이다. tooltip은 `N시간 N분 N초 뒤부터 시작합니다`, 미래 초는 ceil을 사용한다. 기존 hook의 now/timer를 공유하고 색상은 미리 알림 설정과 독립이다.

## 마일스톤과 DoD

### M1 — 설정·단계·전달 일관성

- [Windows-pwsh] 구설정/종류/채널 기본값을 보존하고 preset/custom 저장·입력 검증·중복 제거가 동작한다.
- [Windows-pwsh] 임계점, 복귀, 시작/만료, 재시작, 설정 변경에서 최신 단계만 나타나고 Windows는 저장 선행/역방향 재전달 방지/기존 실패 backoff를 보존한다.
- [Windows-pwsh] 읽음·단계 session 삭제·일정 숨김을 구분하고 전달 대기 중 철회/단계 변경이 오래된 native 객체를 남기지 않는다.

### M2 — 표시와 회귀

- [Windows-pwsh] 설정 확인/취소/실패 후 재시도, 사전/진행 중 문구, watchUrl 목적지 보존을 관련 기존 테스트로 확인한다.
- [Windows-pwsh] 주요 소식의 24h/초/시작/끝 경계를 검증하고 StashEstimate는 countdown/native 대상에 섞이지 않는다.
- [Windows-pwsh] focused 관련 tests → 전체 vitest → lint → build:check → config 필드 계약 확인을 순차 수행한다. 제품 회귀와 환경 실패를 구분하고 조건을 완화하지 않는다.
- [Windows-pwsh] 별도 Astra xhigh reviewer에게 실제 diff/본 계약/증거를 제공하고 필요한 수정 및 영향 checks를 수행한다. 최종 QA는 별도 판정한다.
- [사용자] 최종 수용 OK는 **PENDING**이다. root/actor가 실제 Windows modal·예정 상태·남은 시간·Native 전달을 확인했고 독립 화면 QA가 통과했다. 실제 live start/restart/후속 phase와 native popup pixels는 미관찰로 남기며 제어 테스트와 구분한다.

## 테스트 필요성

기존 promotions/controller/service/modal/status/window-controls/toast/IPC 테스트를 확장한다. 새 보호 대상은 구설정 호환, 초 변환과 잘못된 입력, 최신 단계 선택 및 지속 watermark, 단계 identity와 삭제 범위, 실제 남은 시간과 24h 색 경계다. 단순 상수 복제·내부 helper 호출 확인·기존 시나리오 중복은 추가하지 않는다. focused 검사 통과 뒤 필수 전체 checks를 순차 실행하고 변경/지적이 영향을 준 증거만 재실행한다.

## 진행과 리뷰

- phase0: worktree/캐시 격리 완료, GUI/server 실행 0. 실제 active-path checker 결과와 root 공지 receipt를 기록했고 root가 제품 구현 hold를 해제했다.
- 독립 코드·테스트 리뷰: Round3 통과, 미해결0.
- 실제 runtime/Native 기능과 독립 화면 QA: 통과. [사용자] 최종 OK와 root 최종 acceptance는 별도 pending.
- integration/commit/push/PR/merge/release: 미실행.
- worktree 처분: active writer, PRESERVE. 상세 owner 기록은 `.tmp/event-reminders-20261106/owner-checkpoint.md`.

### 로컬 검증 — candidate v1.1

작업 증거 위치: `.tmp/event-reminders-20261106/`. 제품 소스는 아래 검증 후 독립 리뷰 동안 freeze한다. Node 24.18.0 / Vite 8.2.2 / Vitest 4.1.11, native PowerShell, Electron guard/격리 cache를 사용했으며 GUI/server 실행은 없다.

- `focused-2.log`: 관련 8 files / 85 tests PASS(v1). 초기 pending-withdrawal fixture는 기존 cached generatedAt보다 과거여서 refresh가 정당하게 거부되었다. fixture 시간을 일치시킨 뒤 철회/시작/Windows OFF 동안 대기한 알림을 검증했다.
- `full-tests-1.log`: `npm test -- --run`은 앱 797 PASS/9 skip이나 node:test용 scripts/promotions 6 files를 Vitest가 잘못 수집해 command FAIL. test-discovery 설정은 변경하지 않는다.
- `full-app-tests-1.log`: `npm test -- --run src`, 앱 797 PASS/9 skip. skip은 변경 없는 FontMutatorWorker integration 4개(OTF/TTF 파싱·변환), OtfMutator integration 4개(이름/메트릭/거부/scale), TtfMutator integration 1개(보조 테이블)이며, 기존 상대 SAMPLE_DIR이 새 worktree 옆을 가리켜 sample 경로가 없었던 것이 원인이다. 새 기능 skip은 없다.
- root가 정확 helper 경로 `D:\project_poe2\POE2-unofficial-launcher-worktrees\POE2-unofficial-launcher-gh-pages\fonts`를 기존 `D:\project_poe2\POE2-unofficial-launcher-gh-pages\fonts`로 읽기 공유하는 junction 생성을 승인했다. 실제 source/root와 target 부재/경계를 확인하고 생성했다. source/root gh-pages 쓰기·복사 0, helper parent는 task-owned PRESERVE이며 삭제 권한이 없다.
- `font-fixture-recovery-1.log`: 누락 3 files / 9 tests PASS, timeout 변경 없음.
- `promotions-node-tests-1.log`: 공식 workflow와 같은 Node runner, 65 PASS/0 skip. feed/parser/watchUrl 호환 포함.
- `full-app-tests-v11.log`: v1.1 + fixture를 적용한 원래 앱 runner `npm test -- --run --dir src`: 806 PASS/0 skip, 기존 ChangelogService real-GitHub integration 1개가 5초 deadline에서 timeout하여 command FAIL(총 807). 이 파일/서비스는 diff 0이며 axios/test 모두 기존 5초다. 네트워크/스케줄링 중 원인은 확정하지 않는다.
- `changelog-isolated-1.log`: 해당 unchanged network test만 같은 timeout/조건으로 격리 실행, 1 PASS(709ms). 원래 full 실패 이력은 보존하며 단일 full run 전체 PASS로 표현하지 않는다.
- `lint-1.log`, `build-check-1.log`: v1 lint/build:check PASS. v1.1 영향 lint/build 검증 진행 중.
- config 필드 계약: `AppConfig.eventNotifications`는 확장된 Preferences 타입 참조를 보존한다. top metadata 설명을 확장했고 DEFAULT_CONFIG는 기존 normalizer를 통해 미리 알림 OFF를 채운다. 새 top key/CONFIG_KEYS/settings-screen 항목은 없다. nested update는 새 객체를 만든다.
- 독립 reviewer 입력: 이 계약 v1.1, base `95bb5fe`와 현재 working diff, 위 증거 및 기존 코드. 채널 독립·단계 대기/철회·실제 남은 시간·test-design 증분 가치·범위 누락/추가를 포함한다.

- v1.1 `lint-v11.log`, `build-check-v11.log` 모두 실제 exit0 PASS. 독립 reviewer `/root/event_reminder_update/event_reminders_review`는 exact Astra/xhigh 요청, independent-review checker allowed=true(static only)로 dispatch했다. 실제 runtime identity는 별도 확인 가능한 metadata가 없어 검증했다고 주장하지 않는다.
- 실제 Windows/visual 확인용 bounded 상태와 격리 주의사항은 `.tmp/event-reminders-20261106/native-qa-handoff.md`에 인계했다. 이 문서는 grant/실행/시각 증거가 아니다.

### 독립 리뷰 Round 1 — 반려 및 수정

- reviewer `/root/event_reminder_update/event_reminders_review`, requested Astra/xhigh, actual runtime metadata 미노출. 제품/테스트 파일 변경이나 GUI 조작 없이 실제 diff를 검토했다.
- P2: 이전 알림 단계의 삭제창을 연 채 다음 단계/start로 바뀌면 오래된 notificationId로 영구 실패하며 시작 예정 0초가 남는다. 해당 선택 identity가 현재 목록에서 사라지면 삭제창을 닫고 새 단계를 자동 삭제 대상으로 바꾸지 않도록 수정했다. 기존 WindowControls의 단계/읽음 case에 열린 삭제창의 다음 단계/start 전환을 합쳤다.
- P2 REWRITE: 기존 pending matrix에 next-reminder를 합쳐 오래된 queued 단계가 발송되지 않고 새 단계가 후속 전달됨을 확인했다. 기존 service pending case도 철회/다음 단계로 확장해 pending native 객체 정리를 확인했다.
- custom 정수값 제약은 root/designer v1.2로 명확화하여 제거했다. 소수 value/unit의 저장·재오픈, float 오차 및 초 미만 거부를 기존 대표 사례에 합쳤다. precision 정책은 그대로 유지한다.
- reviewer는 그 밖의 확정된 전달/중복/채널 회귀나 승인 밖 변경을 발견하지 못했으며, 위 보강 외 새 tests는 증분 가치가 있어 KEEP으로 판단했다.
- `focused-v12-review-fixes.log`: 관련 8 files / 88 tests PASS. 현재 소스는 v1.2+Round1 수정 후 다시 freeze하며 full/lint/build와 변경분 독립 재리뷰를 수행한다.

### Candidate v1.2 최종 로컬 검사 이력

- `full-app-tests-v12-final.log`: 96 files, 808 PASS/0 skip + 기존 unchanged PatchReservationModal `keeps the range end at or after a moved start` 1 FAIL(총809). 이 실행에서 앞선 network 및 font cases는 통과했다.
- `unrelated-range-isolated.log`: 같은 예약창 case만 변경 없는 실시간 조건으로 단독 재현, 23:42에 HHmm=12라서 `>1500` 기대에 실패했다(full 23:40에는10). 해당 modal 초기 끝은 now+30분이고 test는 end 날짜를 빼고 HHmm만 비교한다. 밤 시간 초기 종료가 0시대로 넘어간 영향이라는 source-backed 추론이며 최종 DOM의 날짜를 추가 계측하지 않았다. 이 file/제품 code는 모두 diff0이다. full gate는 PASS로 바꾸지 않으며 root 판단 대기, 시스템 시각/timeout/skip/무관 source 수정은 없다.
- 현재 신규 기능에 영향을 주는 88 focused tests는 PASS이고, 별도 pending-next-reminder 및 stale dialog 수정 증거를 포함한다. 해당 source를 다시 freeze하여 reviewer에게 변경분 재리뷰한다.

### QA oracle 진단과 root 승인 수정

- root가 승인한 일시 diagnostic log만 예약창 test에 삽입해 같은 동작/조건의 실제 DOM을 확인했다: startDate=2026-11-07/startTime=15:00, endDate=2026-11-08/endTime=00:15, wallClock=2026-11-06T14:45:08.958Z. 종료는 시작의 다음날이므로 제품 범위는 유효하고 HHmm-only oracle이 잘못되었다. `range-dom-diagnostic.log` 및 `range-diagnostic-restore.json`에 기록했다. 진단 직후 exact original byte 복원과 SHA256 before/after 일치(6860C126E61C70D3D404BE176CBD20141E2FDC744EE37E3EB7694D5813B71856)를 확인했다.
- 이 근거로 root가 기존 case의 end>start 의도를 유지하는 전체 UI 날짜+시각 timestamp 비교를 최소 QA 수단으로 승인했다. 제품 PatchReservationModal source/timeout/skip은 변경하지 않는다. 기존 case 하나만 고치고 Date-only fake anchor23:45로 자정 경계를 재현 가능하게 했다(타이머/OS 시계는 변경하지 않음). 새 test 증식은 없다.
- stale dialog 최초 수정의 동기 effect setState는 lint가 거부했다. 규칙을 끄거나 timer를 추가하지 않고 해당 component의 조건부 render 상태 조정으로 바꾸어 만료 선택을 해제한다. `stale-dialog-lint-fix.log` PASS, `stale-dialog-render-recheck.log` 10 PASS.
- `focused-v12-final.log`: 승인된 oracle 교정과 모든 관련 feature 검사 9 files / 99 tests PASS. source는 이 후보에서 다시 freeze했다. 최종 full/lint/build와 Node consumer contract 및 독립 변경분 리뷰를 갱신한다.

### 독립 리뷰 Round 2 — 반려 및 v1.3 수정

- 이전 stale dialog/pending-next-reminder P2 두 건은 CLOSED. 승인된 예약창 oracle 교정도 기존 관찰 의도를 보존한다고 판단했다.
- 새 P2: 1e-9초 절대 오차 cap이 365.00125일(정수31,536,108초)의 곱셈 표현 오차를 거부했다. root/designer v1.3의 canonical decimal 정수 비율 helper로 교체했다. 기존 변환 case에 365.00125/10000.13일 허용, 365.001251일/6000000000.0001초 및 exponent 표현의 부분초 거부를 합쳤다. custom0.5시간과 preset30분의 dedupe도 같은 case에서 확인한다.
- P3 REWRITE: `dismissPromotion === undefined` fixture assertion은 실제 spy를 설치하고 자동 호출이 없음을 검사하도록 교체했다. dialog 닫힘 assertion은 유지한다.
- v1.2의 `full-app-tests-v12-oracle-fix.log`는96files/809tests 전부PASS(0skip/0fail), `lint-v12-final2.log`/`build-check-v12-final2.log` 모두exit0, `node-contract-v12.log`6PASS였다. 이 증거와 이전 실패는 보존하고 v1.3의 영향 검사를 갱신한다.
- `focused-v13.log`: 9 files / 99 tests PASS. source를 v1.3에서 다시 freeze하고 최종 전체 앱/lint/build/Node 소비자 검사와 독립 변경분 재리뷰를 수행한다.

### 독립 리뷰 Round 3 / 로컬 구현 완료

- Round3 판정 **통과**, 미해결 코드·테스트 지적 0. v1.3 정수 비율 helper와 실제 spy 검사로 Round2 P2/P3를 해결했다. 요청 Astra/xhigh, 실제 runtime metadata는 미노출이며 reviewer는 파일 변경/제품·테스트 실행/GUI 조작 없이 변경분을 독립 검토했다.
- 최종 exact candidate: `focused-v13.log` 9 files/99 PASS; `full-app-tests-v13.log` 96 files/809 PASS,0 skip/0 fail(35.14s); `lint-v13.log` exit0; `build-check-v13.log` exit0; `node-contract-v13.log` 실제 launcher consumer 6 PASS. 기존 collector Node65 PASS 결과 중 변경 없는 범위는 재사용하고 shared consumer 영향6개를 새 후보에서 재검증했다. diff whitespace check도 통과했다.
- 최종 build는 이 worktree의 dist/dist-electron에만 있다. renderer `index-mSyJDOQT.js`, `index-BK5ylCaw.css`; package version은 기존1.7.5인 dev 후보이며 새 release가 아니다.
- primary dirty 상태는 처음의 AGENTS.md/docs README/.codex/기존 work 문서2개 그대로다. primary source/유저 dev/HMR/프로필/의존성 설치/OS notification 초기화·probe·GUI·capture 작업은 하지 않았다.
- 정확 인계: `.tmp/event-reminders-20261106/local-handoff.md`와 `native-qa-handoff.md`. 실제 native/visual/사용자 검증과 final QA는 root가 담당할 별도 남은 게이트이며 현재 coordinator 실행 증거는 NOT_RUN이다. rev15 사용자 허용은 있지만 이 coordinator에게 actor receipt는 없다.
- 로컬 구현·자동 검사·독립 리뷰 완료와 integration/commit/push/PR/merge/release/cleanup은 구분한다. 후자들은 미실행이다. feature source는 아직 uncommitted이며 이 worktree에 보존되어야 한다. worktree와 task-owned fixture helper parent는 **PRESERVE**, 삭제 승인/실행 없음.

### 현재 인계 상태 — 실제 QA 완료 / 사용자 최종 수용 대기

- 동일한 frozen v1.3 제품 입력360개를 사용해 실제 공개 feed의 두 게임 future 일정을 검증했다. 이전 전체809/focused99/lint/build/consumer6 및 독립 Round3 PASS 증거를 그대로 재사용하며 추가 테스트는 실행하지 않았다.
- root가 전달한 실제 관찰: presets3개와 custom1.5시간 저장·재오픈,0.5초 검증 오류와 취소 복원, 노란 예정 icon/매초 남은 시간, 각 게임 일정당 future1행을 확인했다. Native는 이미 도달한 하루+12시간 중 최신12시간 단계 하나를 게임별로 전달했고 실제 남은 시간과 시청 URL, OSHistory 일치를 확인했다. Windows OFF 정리와 다시 ON 후 재발송 방지도 확인했다.
- root가 전달한 독립 Astra 화면 QA는 실제7PNG에서 **PASS, 차단0/비차단1**이다. 열린 알림 panel이 뒤 tooltip 일부를 가리는 관찰은 비차단이며 단독 tooltip은 완전했다. 이 작업 문서는 reviewer의 실제 픽셀 판정을 요약하며 coordinator의 새 시각 판정이 아니다.
- 재오픈/취소 복원/unit options는 기능 JSON으로 확인했으며 해당 상태별 PNG visual PASS는 없다. native popup pixels, 실제 외부 링크 클릭, live start·restart·후속 phase는 NOT_OBSERVED로 남긴다. 제어 테스트의 전환/경계 증거와 구분한다.
- root가 task 소유 QA process/접속만 정리하고 종료 후 OS 등록 baseline 일치를 확인했다. 표준 native API의 동일값 재쓰기가 있었으므로 시스템 쓰기0으로 표현하지 않는다. 기존 사용자 앱·설정/profile·primary source는 보존했다.
- 원본 runtime/registry/token은 private QA 보관 영역에 유지한다. 이 tracked 문서에 raw 내용을 복사하지 않았다. 최소 ignored 인계는 `.tmp/event-reminders-20261106/native-qa-receipt.md`, `screen-qa.md`, `final-handoff.md`이며 root 전달 provenance와 관찰 범위를 기록한다.
- **[사용자] 최종 OK는 PENDING**이며 root 최종 QA 대조도 별도다. 문서는 진행 상태로 유지하고 archive로 이동하지 않는다. commit/integration/push/PR/master/release는 미실행이고 새 원격 승인은 없다.
- 지정된 `~/project_llm_wiki` 경로가 없어 외부 raw/ingest는 NOT_RUN이다. 로컬 work 문서와 인계 자료를 보존한다. unique uncommitted source와 retained QA evidence가 있어 worktree/helper/profiles/runtime/old·new prepared 입력은 **PRESERVE**이며 파일 삭제 승인·실행은 없다.

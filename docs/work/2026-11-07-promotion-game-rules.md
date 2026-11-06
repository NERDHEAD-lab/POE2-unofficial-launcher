# 드롭스 게임 판정 규칙과 알 수 없음 표시

> 작성일: 2026-11-07 · 상태: 진행 · 브랜치: 앱 feat/event-reminders / 수집기 feat/promotion-game-rules

사용자가 감지 조건을 명확히 한 뒤 기존 PoE1/PoE2 필터를 rules로 통합하고 선언 순서 priority를 적용하는 방안을 채택했다. root가 개발 hold를 종료했고 Astra 최종 DESIGN v3를 확정해 제품 write를 해제했다. 아래 확정 계약으로 M1~M5를 진행하며 추가 형식 승인 질문 없이 로컬 구현/검증/분리 리뷰와 수집기 전달/공개 갱신까지 수행한다.

## 승인 범위와 보존

- 수집기 rules 목록에서 기존 정규식과 custom keyword를 함께 사용하고 선언 순서의 첫 일치만 적용한다. 게임별 on/off를 사용하며 두 게임 모두 OFF는 확정 미노출, 미일치만 unknown으로 양 게임에 표시한다.
- 기존 RSS 후보 조건, first-staff 원문, 유효한 필수 날짜/watchUrl 검증은 유지한다. RSS에 별도 게임 분류를 추가하거나 제목만으로 행사/게임을 추측하지 않는다. ExileCon 게임 판정 hardcode는 rules로 이동하며 v2.1 행사명 추출은 보존한다.
- `game-rules.json`은 `{rules:[{type:'regex'|'keyword',value:string,games:{poe1:boolean,poe2:boolean}}]}`다. regex는 고정i, keyword는 literal/case-insensitive이며 현재 drops chunk에만 적용한다. 기본 목록은 기존 PoE1/PoE2 regex와 Exilecon directory keyword 순서다. 잘못된 JSON/regex/빈값/누락·비boolean games는 fetch/발행 전에 실패한다.
- schema1/기존 game enum의 하위 호환성을 유지한다. `gameUnknown?:boolean`을 JS/TS가 같은 형 검증으로 보존하고 producer는 미일치일 때만 true를 출력한다. unknown은 기존 poe1/poe2 두 compatibility copies다. 앱은 marker 우선으로 적용 게임을 `알 수 없음`, title 없는 unknown fallback은 `트위치 드롭스`로 표시한다. ID/raw section hash/schedule/읽음/숨김/native ledger/reminder watermark/global 알림 범위는 불필요하게 바꾸지 않는다.
- 두 게임 OFF도 날짜·watchUrl 등 유효한 drops 검증을 마친 성공 원문이다. collect가 성공 source 목록을 빈 결과 포함 merge로 전달해 그 원문의 기존 일정만 교체한다. 무효/무관/실패 원문은 기존 일정을 보존하며 manual override/기존 dedupe 우선순위는 유지한다. 게임 수 변경에서 살아남는 ID를 보존하고 bare+suffix 공통 쌍도 정확한 source/기간/title/watchUrl 조건으로 tooltip 표시만 집계한다.
- 앱 tooltip의 제목→적용 게임→기간→시작/종료 countdown을 유지하며 unknown에는 알 수 없음 정보를 제공한다. 게임간 전역 알림 병합이나 source 간 최신 제목 병합은 이번에 채택하지 않았다.
- 원본 앱 checkout의 uncommitted v1.3+v2.1은 보존한다. 수집기는 master f4552b0 기반 새 branch에서 분리 전달하고 앱 src 전체/앱 release-please PR329 merge·배포는 하지 않는다. 두 checkout을 coordinator 한 명이 순차 작성하며 primary dirty/기타 owner/기존 증거·fixtures·branches를 보존한다.
- host PC busy/실행 defer가 유효하다. dev/GUI/capture/native/profile/앱 조작 없이 일반 dev 실행 직전 상태까지 준비한다. 실제 실행·화면 사용자 검증은 root의 후속 단계다.

## 마일스톤과 DoD

1. [Windows-pwsh] 최종 v3 계약으로 rules 입력·첫 일치/게임 on-off/suppressed/unknown 판정을 구현한다. 잘못된 규칙은 실패하고 정식 suppressed 원문은 과거 일정이 다시 살아나지 않으며 무효/네트워크 실패 원문은 기존 보존 정책을 유지한다. 구체 성공/빈 결과 전달 방식은 설계 확정 후 명시한다.
2. [Windows-pwsh] JS/TS parser의 하위 호환과 unknown 표시를 연결하고 ID/이력/기존 watchUrl/표시명/countdown을 보존한다. 구 TS와 현재 앱 TS에서 동일 실제 JSON을 소비하고 title/unknown 의미 차이는 명확하게 검증한다.
3. [Windows-pwsh] 대표 규칙·빈 성공/실패·unknown/명시 매칭·old payload·UI game 전환을 기존 unit에 의미 있게 확장한다. 관련 focused→full app/Node→lint/build를 순차 수행하고 실제 diff를 독립 Astra/xhigh 리뷰 및 수정 loop로 통과한다. 변경 없는 증거만 정확히 재사용한다.
4. [Windows-pwsh] 수집기만 정상 hooks commit/push/PR하고 실제 required CI 성공 뒤 master merge한다. 실제 collector/Pages와 query override 없는 canonical public HTTP의 일치·실제 소비까지 확인한다. publisher 성공만으로 공개 검증을 통과시키지 않는다.
5. [Windows-pwsh] 앱 로컬 최종 QA/root finalQA와 source freeze/dev-ready 인계를 준비한다. [사용자] 실제 dev/화면/Native 검증은 **PENDING/NOT_RUN**이며 자동검사나 이전 v1.3 화면 QA로 대체하지 않는다. 수집기 전달 권한과 앱 원격/릴리스 권한을 분리한다.

## phase0 근거

- 원본 앱: feat/event-reminders/base95bb5fe, 기존29 tracked modifications+v1.3/v2.1 workdoc 보존. tracked patch를 owned ignored `game-rules-v3/app-before-v3.patch`로 보존했다. baseline QA는 v2.1 앱820/Node67/lint/build/분리 리뷰이며 v3 PASS가 아니다.
- 수집기: 이전 PR331은 CI 두 개 SUCCESS 뒤 master f4552b06902f59581175249d8bbbae32d2bbbb1f로 통합됐다. clean 원격 master를 확인해 새 feat/promotion-game-rules branch를 분기했고 이전 feat/promotion-titles-producer branch를 삭제하지 않았다.
- 두 self-root checker는 기존 NOT_CONFIGURED/fingerprint4EF32E.../9951DBF...와 동일해 root의 같은 task 공지 receipt를 재사용한다. policy/migration/copy는 없다.433 dependency junction/local caches 및 공개 fonts fixture를 재사용하고 install/ci는 하지 않는다.
- PR331 자동 수집42266653983은 수집/validated feed publish 성공 뒤 Pages build 완료 확인이5분 내 안 되어 FAIL, canonical HTTP step은 SKIPPED다. 재개 후 Pages API latest는 published commit7c8cc441637353deb5aef630f069a2c0151c4a71의 building/error.message null을 반환했다. canonical HTTP200은 여전히 기존 SHA d1a9b592.../title0이며 새 앱 소비는 fallback이므로 ExileCon 기대 검증 FAIL을 보존했다. source 반영·feed commit·Pages·public 응답은 각각 별도 상태다. 수동 추가 게시/재실행/설정 변경은 하지 않았다.
- phase0는 plan/owner/baseline/read-only 확인까지이며 최종 계약 전 제품 변경/추가 테스트/앱 실행은 없다. 새 test 필요성은 최종 계약과 기존 coverage의 실제 미보호 동작을 기준으로 판단한다.

## 설계·구현·리뷰 결과

최종 v3 계약 수령·writer release 확인, M1/M2 구현 중. 이후 검증·리뷰 회차와 수집기 전달/public gate를 누적한다.

### v3.1 확정 — 최신 게시글 표시와 source group

사용자가 같은 종류/game/시작/종료로 dedupe되는 automatic 행사에는 최신 게시글의 title을 표시하기를 추가 승인했고 root/designer가 다음 계약을 확정해 write를 해제했다. 중복 key와 manual override 우선·기존 ID/이력은 유지한다.

- optional `sourcePublishedAt`은 실제 UTC 원천 게시시각이다. RSS publishedAt이 우선이며 없으면 첫 staff post_date의 명시 연도·원문 timezone을 사용한다. 확인할 수 없으면 생략한다. fetch/generatedAt/현재연도 추정값을 게시시각으로 기록하지 않고 게시일 없는 유효 drops도 유지한다. RSS 발견 뒤 forum 재발견이 게시시각을 지우지 않도록 기존 경로를 회귀 검증한다.
- automatic끼리는 known date가 missing보다 우선, 둘 다 있으면 더 늦은 값, 동률/둘 다 없으면 기존 stable first다. 기존 manual 우선과 manual끼리의 순서는 유지한다. 당선 event의 title/sourceUrl/watchUrl/gameUnknown/precision/게시시각을 통째로 선택하고 이전 다른 원문의 title을 이식하지 않는다. 마지막에 기존 schedule별 ID 보존을 적용한다.
- 최신 source와 보존 ID alias 때문에 현재 raw section 증거가 끊기는 문제를 최소 optional `sourceGroupId`로 해결한다. 원문 파싱 때 기존 game suffix 전 stem `ggg-{thread}-twitch-{10hex}`를 그대로 제공한다. 새 hash/ID 정책은 없고 winner metadata와 함께 이동하며 schedule/notification/read/dismiss/watermark key로 사용하지 않는다.
- group present는 string/정규식/twitch kind/sourceUrl thread 일치를 양 parser가 검증한다. 양쪽 group이 있으면 group+기존 kind/source/UTC기간/title/watchUrl이 일치해야 공통 게임 줄을 표시한다. 둘 다 없으면 기존 strict ID family, 한쪽만 있으면 추측 병합하지 않는다. unknown label은 항상 우선이다. manual 값에 group을 자동 유추해 만들지 않는다.

### 구현과 focused 검증

- rules/OFF/unknown와 JS·TS/표시 연결을 완료했다. v3 focused producer45/app218 PASS. 초기 OFF fixture가 서로 다른 두 source를 동일 schedule로 만들어 기존 dedupe가 작동한 문제는 두 번째 일정의 시작을 달리해 해당 의무를 독립시켰으며 제품 dedupe 정책은 바꾸지 않았다.
- v3.1 source metadata/최신 winner/retained alias 표시를 통합했다. 최종 focused producer48/app221 PASS. source publication timezone이 새 metadata에 반영되므로 기존 전체 object 동등 기대에 Chicago 게시시각의 독립 UTC oracle을 추가했다. 과거 DST 검사는 미지원 stash 본문과 publication 오류에 의존했으므로 실제 drops Start Time을 invalid local time으로 바꾸어 날짜 거부 의도를 유지했다. 최초46PASS/2FAIL도 원본 로그로 보존한다. timeout/skip/조건 완화는 없다.
- 기존 테스트에 보강한 보호는 rules 첫 일치와 OFF stop/nomatch, 잘못된 파일의 fetch·output 변경0, 성공 empty-source와 실패 source 보존, 게임 수 변경·최신 source의 생존 ID, 최신 whole metadata/manual/누락/tie/실패 보존, old/new schema roundtrip과 marker만 바뀐 실제 snapshot·읽음·native watermark, unknown/known/alias·다른 raw group의 UI 의무다. 상수 복제나 private helper 호출 자체를 보호 대상으로 삼지 않는다.
- 제품 source는 이 후보에서 freeze하고 full app/Node/lint/build와 독립 Astra review를 진행한다. public/platform Pages gate와 실제 dev 사용자 gate는 별도이며 GUI/앱 실행0을 유지한다.

### 독립 리뷰 Round1 — 반려/P2 수정

- Astra reviewer가 보존 ID alias 충돌을 찾았다. A→최신 B로 바꾸며 idA를 보존한 뒤 B 조회 실패/A 재수집 성공이면 byId 삽입이 최신 B를 게시일 비교 전에 덮었다. 기존 failure 테스트는 실제 alias 충돌을 만들지 못해 REWRITE 판정을 받았다. 그 외 v3/v3.1의 추가 지적은 없고 테스트는 KEEP이었다.
- 기존 수집 테스트를 실제 A 수집→B 당선/idA 보존→B 실패와 A 재발견 순서로 보강했다. A를 재발견하도록 discovery 입력까지 맞춘 재현에서 이전 title/source/watch/group으로 돌아가는 FAIL을 관찰했고 수정 후 같은 입력은 PASS했다. 최초 재현 시도에서 A가 후보에 없었던 PASS도 별도 로그로 남긴다.
- 동일 schedule에서 보존 alias와 raw ID가 충돌할 때만 최종 winner와 같은 comparator를 삽입 전에 사용한다. 서로 다른 그룹의 ID 정책, manual override/disabled/기존 ID 보존 순서는 확장하지 않는다. 근본 원인을 수정한 뒤 전체 앱/양 소비자 Node/lint/build와 changed-input 독립 재리뷰를 갱신한다. 최초826/73/73 통과는 수정 전 후보 이력으로 보존한다.

### 독립 리뷰 Round2 — 통과/전달 준비

- P2 수정 후 최종 순차 검사: 앱 `96 files/826 PASS`, 신·구 실제 TS 소비자를 각각 사용하는 Node 전체 `73 PASS/73 PASS`, 모두0skip. lint/build:check exit0. 원본 조건·timeout·의존성은 그대로다.
- 동일 Astra/xhigh reviewer는 predicate가 삽입·최종 winner 선택에 동일하게 적용되고 다른 일정/manual/disabled/ID 보존 정책은 유지된다고 확인했다. 수정 회귀 REWRITE는 KEEP, P2 해소/추가 지적0으로 **통과**했다. runtime identity는 미노출이며 리뷰어 파일·테스트·GUI·remote 조작0이다.
- 실제 공식 원문 재수집의 로컬 JSON도 구 TS에서 새 표시 metadata를 무시하며 같은 기존 필드를 유지하고 현재 앱 TS에서 title/sourcePublishedAt/sourceGroupId를 보존함을 확인했다. 합성 unknown feed는 로컬 회귀에만 사용하며 공개 게시하지 않는다.
- 수집기만 producer branch에서 정상 hooks commit/PR/실제 CI 후 merge/기존 workflow/Pages/canonical 응답 검증으로 전달한다. 앱 src는 별도 로컬 unique diff로 남고 root finalQA 및 실행 준비 인계는 공개 소비 proof 뒤 마무리한다. 전체 dev/화면/Native는 아직 NOT_RUN/PENDING이다.

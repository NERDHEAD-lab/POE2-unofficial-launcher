# 공개 이벤트 피드 행사명 제공

> 작성일: 2026-11-07 · 상태: 진행 · 브랜치: feat/promotion-titles-producer

사용자는 로컬에서 구현/검토한 행사명을 수집기에 반영하고 공개 피드를 갱신해 현재 dev가 소비할 수 있도록 명시 승인했다. root가 이 producer source의 commit→push→PR→CI 성공 후 master merge→기존 collector workflow/public JSON 게시를 승인 범위로 전달했다. 앱 release-please PR 최종 merge/앱 배포는 제외한다.

## 범위와 권한

- schema1 optional `title`을 공식 첫 staff 본문/채택한 drops 구간의 행사/보상 heading에서 제공한다. ExileCon 본문 행사·공식방송·전용 directory 근거가 있으면 두 게임에 `ExileCon 트위치 드롭스`를 제공한다. 일반 보상/주차는 구체 이름을 유지하고 안내/FAQ/계정 연결 heading·글ID/URL 추측은 사용하지 않는다.
- raw heading/section의 기존 ID hash 입력, game별 ID/기간/watchUrl/source/precision은 보존한다. title은 문자열·한줄·공백정리·비어있지 않음·최대200자·제어문자 없음 계약을 검증한다.
- product 변경은 `scripts/promotions`의 collector/contract/관련 tests/README다. 앱 `src`, 설정, 미리 알림, toolbar UI는 이 delivery에 포함하지 않는다. old actual TS consumer가 title을 무시하는 단계별 적용과 new dev가 보존/표시하는 별도 proof를 구분한다. schema/IPC/lifecycle/dependency 변경은 없다.
- 현재 dev가 실행 중인 원본 feature worktree와 primary는 읽기 전용이다. 별도 delivery checkout의 sole writer만 작업하며 기존433 dependency junction/local caches를 재사용한다. GUI/dev/native/profile/process 조작을 하지 않는다. 공개 확인 후 현재 dev 점검은 root가 맡는다.
- self-root checker NOT_CONFIGURED/marker·contract 없음/fingerprint9951DBF...를 root가 사용자에게 공지했고 기존 serial 단일 writer/project gate 아래 진행을 허용했다. 하네스 migration/copy는 하지 않는다.

## 마일스톤·DoD

1. [Windows-pwsh] 기존 검토된 producer5파일을 분리하고 기존 TS consumer가 optional title을 무시해도 실제 생성 JSON의 공통 필드를 읽음을 검증한다. producer의 title strict 검증은 유지한다. 새 앱의 title 보존/표시 proof는 원본 candidate의 검증과 readonly 재소비로 확인한다.
2. [Windows-pwsh] Node 전체 producer/consumer 검사, 관련 구앱 parser 검사, lint/build를 통과하고 실제 producer-only diff를 독립 Astra/xhigh reviewer가 검토한다. `src`/workflow/dependencies 변경이 없으므로 로컬 전체 앱 회귀 반복은 생략하고 PR의 필수 CI를 실제 확인한다. 이 판단이 누락된 필수 게이트를 PASS로 바꾸지 않는다.
3. [Windows-pwsh] 정상 hooks로 commit하고 push/PR 후 required CI가 실제 성공한 동일 SHA만 master merge한다. 기존 collector workflow가 성공하고 Pages/public JSON이 두 게임 title/기존 ID/watchUrl을 제공함을 검증한다. 앱 release-please PR은 merge하지 않는다.
4. [사용자] 공개 피드를 받은 현재 dev의 실제 화면/툴팁 확인은 root가 별도 수행한다. producer의 HTTP/소비 proof는 Windows 화면이나 앱 release 증거가 아니다.

## 테스트 필요성·리뷰

기존 collector fixture/general heading/week/contract 사례와 실제 TS 교차 검사를 확장한다. producer에는 invalid title 거부를 남기고, old TS consumer에는 새 title validation을 요구하지 않는다. 교차 검사는 공통 필드 유지라는 단계별 배포 의무를 확인하며, 앱 새 기능의 title 보존/표시는 원본 v2.1 앱 검증으로 따로 유지한다. 같은 원인의 중복 테스트나 테스트 조건 완화는 추가하지 않는다.

### 로컬 검증과 독립 리뷰 Round1 — 통과

- Node24.18.0/native Windows PowerShell, 기존 의존성 읽기 재사용과 작업별 캐시 환경에서 Node producer/consumer 전체 `67 PASS/0 skip`, 실제 구앱 parser `10 PASS`, lint/build:check exit0. 전체 앱 검사는 이번 producer-only 분리에서 `NOT_RUN`이며 src 변경 없음에 따른 비례 판단이다. 원본 앱 v2.1의820 PASS와 이 결과를 같은 후보로 혼용하지 않는다.
- 동일한 로컬 수집 JSON을 이 checkout의 실제 구 TS consumer와 원본 dev의 실제 신 TS consumer로 재소비했다. 구 소비자는 title을 무시하고 기존 필드를 유지하며 새 소비자는 두 게임의 ExileCon title/기존 ID/watchUrl을 보존한다. 원본 TS SHA는 기존 v2.1 proof와 일치한다. 앱/프로필 실행·수정 없이 Node 데이터 경로만 검증했다.
- 독립 reviewer는 실제 producer-only diff/이전 승인본/로그를 읽어 **통과·미해결0**, 변경 테스트 **KEEP**으로 판정했다. title만 제외한 공통 필드 비교는 단계별 배포에 타당하고 invalid 검증·producer strict title 검증은 유지되며 검사 우회 capability 탐지가 없다고 확인했다.
- reviewer requested exact Astra/xhigh, dispatch checker는 static PASS/actual runtime metadata 미노출이다. 리뷰어의 파일 변경·실행·GUI·원격 조작은 없었다.
- delivery checkout에는 ignored Husky launcher가 처음에 없어서 정상 Git commit에도 hook 진입이 없음을 발견했다. 기존 설치된 Husky의 `prepare`로 이 checkout의 launcher만 생성한 뒤 미게시한 자기 commit을 정상 hooks로 amend한다. 의존성 설치/원본 worktree 수정/검사 skip은 없다. 외부 wiki raw 경로가 없어 raw 작성·`/ingest`는 `NOT_RUN`이며 근거는 이 문서와 ignored delivery receipt에 보존한다.
- 원격 CI/merge/공개 JSON 검증은 별도이며 이후 기록한다. 공개 결과와 현재 dev 사용자 확인 전까지 work 문서를 진행 상태로 유지한다. 원본 앱 소스·dev·사용자 데이터는 변경하지 않는다. 이 worktree와 근거는 통합/보존 결정을 기록할 때까지 PRESERVE다.

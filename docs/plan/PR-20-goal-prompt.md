# PR-20 Goal Prompt

이 작업을 goal로 생성하고 PR-20 완료까지 진행해줘.

## 목표

`docs/pob-handoff.md`의 진행 커서 기준으로 `PR-20`을 이어서 진행하고, `docs/plan/PR-20.md`의 `Resume Cursor`와 체크리스트에 따라 PR-20 UI/번역/파서/상태 보존 follow-up을 완료한다.
Passive Tree AppData cache와 render layer architecture 최적화는 `docs/plan/PR-22.md`로 이관했으므로 PR-20에서는 구현하지 않는다.

## 반드시 사용할 지침

- `pob-integration-workflow` skill을 반드시 사용.
- RePoE/game-data/번역/cache 관련 작업은 `pob-repoe-data` skill도 사용.
- 설정 필드 추가/변경 시 `config-management` skill 사용.
- 이벤트/IPC 추가 시 `event-ipc-integration` skill 사용.
- repo의 `AGENTS.md`, `CLAUDE.md`, `docs/pob-handoff.md`, `docs/plan/PR-20.md` 지침 준수.

## 시작 절차

1. `docs/current-plan.md` 확인.
   - 잔여작업/백로그가 있으면 PR-20 문서로 먼저 reconcile.
2. `docs/pob-handoff.md` 확인.
   - PR-20이 `next`면 `in-progress`로 갱신.
3. `docs/plan/PR-20.md`의 `Resume Cursor` 확인.
4. `feat/next-release`에서 `work/pob-pr-20` 브랜치를 만들고 진행.

## 구현 순서

PR-20 문서의 순서를 따른다. 이미 완료된 sub-step은 재구현하지 않고 `Resume Cursor` 이후 남은 항목만 진행한다.

1. PR-20.1 Imported Build2 item tooltip/stat translation coverage
   - 먼저 Imported Build2 기반 coverage/멱등성 테스트를 고정.
   - 이후 tooltip/stat 번역 누락 수정.

2. PR-20.2 Skills/Items search result bilingual display
   - 기본 목록 표시는 설정 언어 단일 표기.
   - 영어 검색어가 source English에 매칭될 때만 `설정 언어명 (English)` 병행 표기.
   - English locale 또는 localized/source 동일 fallback에서는 중복 병행 표기 금지.

3. PR-20.3 Passive Tree latency instrumentation and bottleneck report
   - 먼저 계측/로그 분리만 진행.
   - renderer/main/Lua RPC 구간별 opt-in 로그를 남긴다.
   - cold-start / warm-return / build-switch 로그 수집 포맷을 고정.
   - 원인 확정 전 cache/shared contract/resource manifest 변경 금지.
   - 사용자 로그가 필요하면 debug instrumentation sub-step까지 완료하고 보고.

4. PR-20.4 Passive Tree AppData cache and invalidation policy
   - PR-22로 이관된 항목이다.
   - PR-20에서는 이관 문서화만 유지하고 cache/shared contract/resource manifest를 새로 바꾸지 않는다.

5. PR-20.5 Passive Tree static payload, allocation overlay, and keep-alive
   - PR-20에서 이미 적용한 Tree translation cache / keep-alive / session isolation은 유지한다.
   - static payload, allocation overlay, Canvas multi-layer renderer는 PR-22로 이관한다.
   - WebGL/shader rewrite는 1차 방향에서 제외하고 Canvas 2D layer 분리로 기록한다.

6. PR-20.6 Original PoB tooltip visual parity
   - 원본 PoB `Tooltip.lua`, `TooltipHost.lua`, `PassiveTreeView.lua`, `ItemsTab.lua`, `GemSelectControl.lua` 기준.
   - Tree / Item / Skill gem tooltip을 공통 PoB-themed tooltip renderer 또는 공통 line/header renderer로 정리.
   - tooltip metadata는 display-only로 처리.

7. PR-20.7 Non-tooltip UI translation coverage
   - build metadata class/ascendancy, main skill, composite socket group label, ConfigView 본문 번역 coverage.
   - ConfigView는 상단 wrapper chrome 제외 본문 전면 coverage 대상으로 본다.
   - PoB action payload domain은 유지.

8. PR-20.8 Disabled/unimplemented control affordance
   - 미구현/비활성 컨트롤에 공통 class/data attribute/reason code 적용.
   - 구현 예정 컨트롤 click/keyboard activation 시 toast/status 메시지 표시.
   - `UI 버전 : 레거시 [switch] 비공식` 구조로 UI mode switch 개선.
   - busy/invalid/source-disabled와 not-implemented 상태를 구분.

9. PR-20.9 Calcs section visual parity
   - 원본 PoB `CalcSectionControl.lua`, `CalcSections.lua` 기준.
   - Attributes/Resists compact stat box, section-colour border, header summary inline colour, label/value alignment 반영.
   - Life/Mana/ES/Armour/Evasion/Charges/Recoup/Cost/Main-hand/Off-hand/Ailment/Flask 등 원본 스타일 inventory 반영.
   - Calcs visual metadata는 display-only로 처리.

10. PR-20.10~PR-20.15 existing follow-up
   - Tree build switch session isolation, item tooltip asset header/separator, tab loading responsiveness, stale PR-6 copy cleanup, hidden tab hydration design, Calcs narrow-width overflow를 문서 cursor에 맞춰 진행한다.
   - PR-20.14 hidden tab hydration은 모든 탭 동시 full load가 아니라 active tab 우선 + idle/serial hidden preload 정책으로 설계한다.
   - PR-20.15는 `Skill Hit Damage` 같은 wide matrix table의 content-based column width와 horizontal overflow까지 포함한다.

11. PR-20.16 Persisted wrapper UI state
   - 마지막 빌드/탭은 기존 `pobWrapper.lastLocation`으로 처리되므로 중복 구현하지 않는다.
   - build explorer expanded folder paths, main skill panel collapsed state, main skill panel height ratio를 `PobSettings`에 추가한다.
   - AppConfig가 아니라 wrapper 전용 `pob.settings` IPC/config store를 확장한다.

12. PR-20.17 Items DB localized row projection follow-up
   - Unique/Rare template row는 장비명 위, category/base 아래 구조로 표시한다.
   - 장비명도 설정 언어로 표시하고, 영어 검색어가 source English에 매칭될 때만 `설정 언어명 (English)` 병행 표기와 bold highlight를 적용한다.
   - `Unique Name, Base Name`으로 합쳐진 DB row는 표시 projection에서 name/base를 분리한다.

13. PR-20.18 Active build delete dirty guard
   - active build/folder 삭제 성공 시 삭제된 target에 대해 unsaved prompt를 띄우지 않는다.
   - dirty/pending guard를 초기화하고 삭제 후 target으로 직접 navigate한다.

14. PR-20.19 Korean custom item equipment property parser
   - `물리 피해: 19-26`, `치명타 명중 확률: 5.00%`, `초당 공격 횟수: 1.16` 같은 equipment property line을 English item copy line으로 역변환한다.
   - 사용자가 전달한 `브린핸드의 징표` 샘플을 focused test로 고정한다.

15. PR-20.20 Item tooltip asset header overlay regression
   - asset-backed item tooltip header가 title/name/base text를 가리지 않게 한다.
   - title/name/base는 header overlay layer로 렌더링하고 body 중복 렌더링과 negative margin 의존을 제거한다.

## 작업 규칙

- 각 sub-step은 작게 쪼개서 진행.
- 코드/resource/test 변경만 work branch에 커밋.
- `docs/current-plan.md`, `docs/pob-handoff.md`, `docs/plan/PR-20.md`, `docs/check/**`는 unstaged/uncommitted 유지.
- Lua action/input domain에는 번역된 display text를 되돌려 보내지 말 것.
- 새 dependency 추가 전 반드시 사용자에게 확인.
- push하지 말 것.
- PR-20.3은 계측/병목 보고로 닫고, cache/keep-alive는 PR-20.4/20.5에서 진행.

## 검증 / 커밋

각 코드 sub-step마다 Windows PowerShell로 검증한다.

    cd D:\project_poe2\POE2-unofficial-launcher
    npm run lint
    npm test
    npm run build:check

git commit도 Windows PowerShell로 실행한다.

PR-20 완료 시:

1. 전체 Windows 검증 실행.
2. `feat/next-release`로 돌아감.
3. `work/pob-pr-20`을 PR 번호 단위로 squash commit.
4. squash 제목:
   - `feat(POB): POB 연동 기능 추가 20 (RePoE display coverage follow-up)`
5. squash body에는 실제 세부 작업과 검증 결과를 한글로 상세히 작성.
6. push는 하지 말 것.

## 종료 보고

마지막에 아래를 보고해줘.

- 수행한 코드 변경 요약
- 갱신한 문서 요약
- 통과한 검증 명령
- 생성한 work branch / sub-step commit / squash commit
- 남은 의사결정 또는 사용자 확인 필요 사항
- 현재 `git status -sb`

# PR-21 Goal Prompt

이 작업을 goal로 생성하고 PR-21 완료까지 진행해줘.

## 목표

`docs/pob-handoff.md`의 진행 커서 기준으로 `PR-21`을 시작하고, `docs/plan/PR-21.md`의 `Resume Cursor`, `Checklist`, `Issue Notes`, `Direct Agent Verification`에 따라 PR-20 이후 실제 wrapper 사용 중 확인된 visible bug / UX follow-up 11개 항목을 구현한다.

Passive Tree resource/cache/render 성능 최적화는 `docs/plan/PR-22.md` 범위이므로 PR-21에서는 구현하지 않는다. PR-21에서는 사용자에게 보이는 tooltip, 번역 coverage, 저장 semantics, layout, error banner, passive point budget, UI mode lock만 다룬다.

## 반드시 사용할 지침 / 스킬

- `pob-integration-workflow` skill을 반드시 사용.
- 실제 Electron/PoB wrapper 확인, Playwright/CDP attach, `npm run dev:agent`, `docs/check/pob-tree-agent-*.log` 분석이 필요한 sub-step에서는 `pob-agent-debugging` skill을 사용.
- RePoE/game-data/tooltip/stat 번역/cache/indexer 관련 작업은 `pob-repoe-data` skill도 사용.
- AppConfig 필드 추가/변경 시 `config-management` skill 사용.
- settings 화면 UI 항목 추가/변경 시 `settings-management` skill 사용. 단, wrapper 전용 `PobSettings`만 확장하고 설정 화면을 건드리지 않으면 사용하지 않는다.
- 이벤트/IPC/RPC channel 추가 또는 renderer sync pipeline 변경 시 `event-ipc-integration` skill 사용.
- repo의 `AGENTS.md`, `CLAUDE.md`, `docs/pob-handoff.md`, `docs/plan/PR-21.md` 지침 준수.

## 시작 절차

1. `docs/current-plan.md` 확인.
   - 잔여작업/백로그가 있으면 PR-21 문서 또는 적절한 후속 PR 문서로 먼저 reconcile.
2. `docs/pob-handoff.md` 확인.
   - PR-21이 `next`면 `in-progress`로 갱신.
3. `docs/plan/PR-21.md`의 `Resume Cursor`와 `Direct Agent Verification (2026-05-29)` 확인.
4. `feat/next-release`에서 `work/pob-pr-21` 브랜치를 만들고 진행.
5. 시작 전 현재 dirty 상태를 확인하되, 기존 계획 문서 변경은 unstaged 상태로 유지한다.

## 구현 순서

PR-21 문서의 순서를 따른다. 각 sub-step은 먼저 failing/focused test 또는 agent 재현을 고정하고, 그 다음 최소 구현으로 닫는다.

1. PR-21.1 Tree tooltip passive header title/recipe parity
   - Tree tooltip에서는 첫 non-empty title line만 asset header title로 사용한다.
   - `Killer Instinct` 등 recipe 보유 노드는 원본 PoB처럼 title 오른쪽에 recipe 이름/아이콘을 표시한다.
   - `treeNodeTooltip(56453)` direct verification 결과를 기준으로 bridge payload에 recipe field를 추가하고 renderer contract/test를 갱신한다.

2. PR-21.2 Skills gem tooltip translation coverage
   - gem name 외 `Support`, `Category`, `Tier`, multiplier, description, stat line, unsupported suffix를 display-only 번역한다.
   - RePoE description/family/tag/stat translation overlay를 보강한다.
   - PoB Lua action/input domain에는 localized display text를 절대 되돌려 보내지 않는다.

3. PR-21.3 Items tooltip item-name/stat/chrome translation parity
   - direct verification에서 확인한 `Chimeric Gorget`/`Amulet`/comparison/tip 영어 잔존을 focused fixture로 고정한다.
   - item source domain(custom/shared/db/static RePoE id)을 혼동하지 않는다.
   - tooltip title/base/category/modifier/comparison/tip line 번역 coverage를 보강한다.

4. PR-21.4 Existing build save overwrite semantics
   - 기존 build의 `saveCurrent()`는 overwrite mode로 저장한다.
   - 새 build/draft/Save As 성격의 저장은 기존 create-only 충돌 방지를 유지한다.
   - unsaved-change dialog의 `저장` 경로가 기존 build에서 `EEXIST`를 만들지 않게 한다.

5. PR-21.5 Skills gem tooltip asset header layout parity
   - title text 주변 wrapper CSS border/background 중복을 제거한다.
   - 원본 PoB `Tooltip.lua`의 GEM header 수치와 계층을 기준으로 Skills tooltip asset header를 맞춘다.
   - item/passive/tree tooltip header 회귀를 막는 test를 함께 둔다.

6. PR-21.6 Item detail tooltip full-height asset/background wrapping
   - embedded item detail tooltip의 border/background/header asset이 전체 content 높이를 감싸게 한다.
   - floating hover tooltip의 viewport 제한/스크롤 동작은 유지한다.

7. PR-21.7 Items catalog bottom tab bar loading layout stability
   - DB loading/empty/error/ready 상태 모두에서 catalog bottom tab bar 위치가 흔들리지 않게 한다.
   - Unique/Rare loading placeholder와 ready list가 같은 flex height 계약을 갖게 한다.

8. PR-21.8 Notes template manager modal layout polish
   - title/help와 본문 grid 사이 과도한 공백을 줄인다.
   - `새 템플릿`은 목록 하단 고정 `+` icon button으로 바꾸고, 목록만 스크롤되게 한다.

9. PR-21.9 Dismissible/copyable error banner actions
   - 공통 error banner 컴포넌트를 도입해 복사/닫기 icon button을 제공한다.
   - load-blocking error와 dismissible action error semantics를 섞지 않는다.
   - 사용자 경로가 포함될 수 있으므로 표시된 오류와 최소 컨텍스트만 복사한다.

10. PR-21.10 Passive point budget summary header parity
    - `buildMetadata()`에 renderer가 표시할 passive/weapon set/ascendancy point budget field를 추가한다.
    - 원본 PoB `Build.lua:EstimatePlayerProgress()`와 `PassiveSpec.lua:CountAllocNodes()` 기준으로 계산한다.
    - direct verification에서 현재 `passivePointBudget` field가 없음을 확인했으므로 shared contract/test부터 확장한다.

11. PR-21.11 UI mode lock and unimplemented-control inventory audit
    - `legacy` UI mode를 parity 완료 전까지 locked 처리한다.
    - switch click/keyboard activation은 mode를 바꾸지 않고 `pob-control-unimplemented`, `data-pob-unimplemented="ui-mode.switch"`, 공통 notice/status를 표시한다.
    - PR-20.8 inventory와 실제 DOM marker 적용 범위를 audit하고 busy/invalid/source-disabled와 unimplemented 상태를 구분한다.

## 작업 규칙

- 각 sub-step은 작게 쪼개서 진행.
- 코드/resource/test 변경만 work branch에 커밋.
- `docs/current-plan.md`, `docs/pob-handoff.md`, `docs/pob-completed-work.md`, `docs/plan/PR-*.md`, `docs/check/**`는 unstaged/uncommitted 유지.
- Lua action/input domain에는 번역된 display text를 되돌려 보내지 말 것.
- 새 dependency 추가 전 반드시 사용자에게 확인.
- push하지 말 것.
- PR-22로 분리된 Tree resource/cache/render optimization은 PR-21에서 구현하지 말 것.
- `docs/check/**` agent log는 검증 근거로만 사용하고 커밋하지 말 것.

## 검증 / 커밋

각 코드 sub-step마다 가능한 한 focused test를 먼저 실행하고, 필요한 경우 `pob-agent-debugging` skill 지침대로 Windows PowerShell에서 hidden agent를 실행한다.

    cd D:\project_poe2\POE2-unofficial-launcher
    npm run dev:agent

각 sub-step 또는 의미 있는 묶음 완료 후 Windows PowerShell로 검증한다.

    cd D:\project_poe2\POE2-unofficial-launcher
    npm run lint
    npm test
    npm run build:check

git commit도 Windows PowerShell로 실행한다.

PR-21 완료 시:

1. 전체 Windows 검증 실행.
2. 필요한 경우 `npm run dev:agent`와 추가 Playwright/CDP check로 실제 wrapper를 확인.
3. `feat/next-release`로 돌아감.
4. `work/pob-pr-21`을 PR 번호 단위로 squash commit.
5. squash 제목:
   - `feat(POB): POB 연동 기능 추가 21 (visible bug follow-up)`
6. squash body에는 실제 세부 작업과 검증 결과를 한글로 상세히 작성.
7. push는 하지 말 것.

## 종료 보고

마지막에 아래를 보고해줘.

- 수행한 코드 변경 요약
- 갱신한 문서 요약
- 통과한 검증 명령
- 실행한 agent/CDP 확인과 생성된 `docs/check/**` 로그 경로
- 생성한 work branch / sub-step commit / squash commit
- PR-22로 남긴 항목 또는 사용자 확인 필요 사항
- 현재 `git status -sb`

# PR-ELSE: PoB UI parity and current-plan feedback backlog

> 상위 문서: [../pob-handoff.md](../pob-handoff.md)
> 선행 PR: PR-6/PR-8 UX·계약 보정
> 후속 PR: 범위 확정 후 별도 PR 로 분리
> 상태: 과거 피드백 수집 문서. 활성 잔여 작업은 PR-11~PR-19 로 분리됨.

## 목표

`docs/current-plan.md` 에 추가된 사용자 피드백 중 PR-9/PR-10/PR-N 의 핵심 범위와 직접 맞지 않는 PoB UI parity 및 UX 보정 항목을 별도 트랙으로 관리한다.

계획 문서 관리 규칙에 따라 이 문서는 코드 커밋에 포함하지 않고 unstaged 상태로 둔다.

활성 작업 큐는 [PR-11](PR-11.md) 부터 시작한다. 본 문서는 중복 여부나 원천 맥락 확인이 필요할 때만 참조한다.

## 작업 항목

### Mode Navigation

- [x] PoB 원본 BUILD mode 의 탭 순서와 누락 항목을 재확인하고, launcher 상단 mode 내비게이션을 `Tree / Skills / Items / Calcs / Party` 기준으로 정리한다.
  - 커밋: `2320c58 feat(POB): POB 연동 기능 추가 ELSE-1`
  - `POB_ORIGINAL_BUILD_MODES` 공유 계약을 추가하고, 가능한 환경에서는 실제 `Modules/Build.lua` 버튼 정의와 순서를 비교하는 테스트를 추가했다.
  - `Notes` 는 PoB 원본에도 별도 mode 로 존재하므로, 누락 보정과 wrapper 고유 Markdown/template 확장은 아래 Notes 섹션에서 별도 sub-step 으로 추적한다.
- [x] 기존 `Config` 탭은 설정/Configuration 모달 이동 항목과 함께 노출 정책을 결정한다.
  - `Config` 는 mode 탭에서 제거하고 PoB 원본의 `Configuration` build action 성격에 맞춰 우상단 모달 진입점으로 분리했다.

### Tree

- [ ] 노드 hover 상세 설명창은 handoff §5.4 `노드 툴팁 (이름 + sd 라인 + mod 효과)` 항목에서 계속 추적한다. 중복 항목을 만들지 말고 PoB 원본 상세 설명창 기준으로 보강한다.

### Imported Build2 Screenshot Data Parity

- [ ] `docs/check/**` 에 추가된 `Imported Build2` 캡쳐를 기준으로 Tree / Skills / Items / Calcs / Party 탭의 출력 데이터와 텍스트 설명이 PoB 원본과 일치하는지 전수 비교한다.
  - UI/UX 레이아웃 차이는 허용하되, 렌더링되는 데이터·라벨·툴팁 텍스트·빈 값 표기는 PoB 원본과 일치해야 한다.
  - 특히 노드 hover tooltip 처럼 캡쳐에 포함된 hover 상태 텍스트는 실제 Lua/source snapshot 과 대조해 parser drift 를 방지한다.
  - 비교 결과는 수정이 필요한 항목과 원본 parity 가 확인된 항목으로 나눠 이 문서에 sub-step 으로 세분화한다.
- [x] Party 탭의 Imported Build2 empty state 를 PoB 원본 `PartyTab.lua` 기준 read-only snapshot + UI 로 노출한다.
  - 커밋: `08af32c feat(POB): POB 연동 기능 추가 ELSE-11`
  - `PobPartySnapshot` / `assertPobPartySnapshot` 계약과 `pob.party.snapshot` Lua RPC 를 추가하고, Party mode placeholder 를 `PartyView` 로 교체했다.
  - Imported Build2 회귀 테스트로 `destination=All`, `append=false`, `ShowAdvanceTools=false`, 빈 section buffers, 원본 section labels/options, color-code 제거를 실제 Lua snapshot 기준으로 검증했다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 58 files / 238 tests passed, 1 file / 2 tests skipped. 커밋 전 focused 검증 2 files / 9 tests passed.
- [x] Party 탭의 destination / append / Show Advanced / Clear / Disable / Rebuild / section text / Export Support 상태를 원본 `PartyTab.lua` 흐름 기준으로 action RPC 와 UI에 연결한다.
  - 커밋: `3406311 feat(POB): POB 연동 기능 추가 ELSE-12`
  - `PobPartyAction` 계약과 `pob.party.action` Lua RPC 를 추가하고, `PartyView` 의 원본 Party controls 를 실제 상태 변경으로 연결했다.
  - Imported Build2 회귀 테스트는 Lua action 으로 destination 변경, section text 편집/clear, append/show advanced, `partyTab.enableExportBuffs` 변경을 검증한다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 58 files / 238 tests passed, 1 file / 2 tests skipped. 커밋 전 focused 검증 1 file / 3 tests passed.
- [ ] Tree hover tooltip 은 현재 `name + statLines` 만 노출된다. 원본 hover 의 unallocating effects, dependent node deltas, Ctrl+D/Ctrl+C tips, points/gold required 를 `PassiveTreeView.lua` / `Build.lua` 기준으로 snapshot contract 에 추가한다.
- [ ] Skills gem hover tooltip 은 현재 없음. 원본 `GemSelectControl.lua` tooltip 의 gem type/tags/category/tier/description/requirements/stat lines 및 quality/enabled comparison tooltip 을 `SkillsView` 에서 같은 source snapshot 으로 렌더링한다.
- [ ] Items DB/list hover tooltip 과 selected item detail 은 원본 대비 단순화되어 있다. `ItemsTab.lua` 기준 Exclusive to/base type/requirements/flavour text/equipping stat differences 를 projection contract 로 추가한다.
- [ ] Import/Export modal 의 `Export Support` checkbox 를 원본 `ImportTab.lua` 의 Export controls 에 노출한다. `partyTab.enableExportBuffs` action 경계는 `3406311` 에서 준비됨.

### Items

- [x] Items 상세보기 탭을 PoB 원본/인게임 아이템 tooltip 형식으로 표시한다.
  - 커밋: `16404e7 feat(POB): POB 연동 기능 추가 ELSE-2`
  - `buildItemTooltipSections` 순수 helper 로 이름/베이스/속성/implicit/explicit/flag 섹션을 분리하고, `ItemsView` 선택 아이템 상세 패널을 PoB/인게임 tooltip 계층과 rarity 색상 기준으로 렌더링한다.
- [x] Items 상세보기 탭에 편집 모드와 뷰어 모드를 전환하는 스위치를 추가하고, PoB 원본 구조 분석 결과를 기준으로 기본 모드를 정한다.
  - 커밋: `3b1f41b feat(POB): POB 연동 기능 추가 ELSE-3`
  - PoB 원본 `ItemsTab.lua` 의 display item / edit text 흐름을 분석해 선택 상세 패널을 tooltip viewer 와 raw text editor 전환 구조로 정리했다.
  - `PobItemSummary.raw` 계약과 `saveCustom` Lua action 을 추가해 custom item 은 기존 항목을 교체하고, shared/db item 은 raw text 기반 custom item 으로 추가한다.
  - Imported Build2 기반 Lua 회귀 테스트로 item raw 계약과 `saveCustom` 교체 동작을 검증했다.

### Main Skill Summary

- [x] PoB 원본 `Build.lua` 의 Main Skill summary output 을 read RPC + typed contract 로 노출하고 Imported Build2 기준 회귀 테스트를 추가한다.
  - 커밋: `ef3ea2e feat(POB): POB 연동 기능 추가 ELSE-5`
  - `pob.mainSkillSummary.snapshot` Lua RPC 와 `PobMainSkillSummarySnapshot` 계약을 추가해 socket group/main skill label, stat/text/spacer rows, warnings 를 원본 statBox/warnings 기준으로 직렬화한다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 56 files / 229 tests passed, 1 file / 2 tests skipped. 커밋 후 focused 검증 2 files / 6 tests passed.
- [x] 좌측 Build Explorer 하단에 Main Skill 요약 패널을 추가해 PoB 원본의 Main Skill summary output 기준 주요 통계를 표시한다.
  - 커밋: `5e6af13 feat(POB): POB 연동 기능 추가 ELSE-6`
  - `BuildEditView` 가 `mainSkillSummary` RPC 결과를 App 상태로 올리고, `Sidebar` 하단에 stat/text/spacer rows 와 warnings 를 PoB `statBox` 순서 그대로 표시한다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 57 files / 231 tests passed, 1 file / 2 tests skipped. 커밋 후 focused 검증 3 files / 8 tests passed.
- [x] Build Explorer 와 Main Skill 요약 패널 사이에 드래그 리사이저를 추가하고, 요약 패널 접기/펼치기 상태를 지원한다.
  - 커밋: `2eda9d2 feat(POB): POB 연동 기능 추가 ELSE-7`
  - 요약 패널 높이를 120-360px 범위에서 마우스/키보드로 조절하고, 헤더 토글로 접기/펼치기 상태를 전환한다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 57 files / 232 tests passed, 1 file / 2 tests skipped. 커밋 후 focused 검증 1 file / 3 tests passed.
- [x] 주요 스킬 요약 패널 높이 제한을 고정 360px 에서 viewport 기반 상한으로 완화하고, Build Explorer 영역이 남은 높이에서 스크롤되도록 한다.
  - 커밋: `8c3ca40 feat(POB): POB 연동 기능 추가 ELSE-14`
  - `MAIN_SKILL_SUMMARY_MAX_HEIGHT=960` + viewport reserved height 계산으로 사용자가 패널을 더 크게 늘릴 수 있게 하고, Explorer body 는 남은 영역에서 자체 scroll 을 유지한다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 58 files / 240 tests passed, 1 file / 2 tests skipped. focused `mainSkillSummaryPanel.test.ts` 1 file / 4 tests passed.

### Notes

- [ ] PoB 원본 `Build.lua` / `Classes/NotesTab.lua` 기준으로 `Notes` mode 를 `Party` 오른쪽에 추가한다.
  - read sub-step: `notes.snapshot` RPC 로 원본 notes text, color-code buttons, show-color-codes 상태, zoom 안내 문구, dirty flag 를 노출한다.
  - contract/test sub-step: Imported Build2 fixture 의 `<Notes>` XML 과 실제 Lua `notesTab` state 가 일치하는지 검증한다.
  - read-only UI sub-step: 원본 Notes control 을 1:1 로 렌더링하되, launcher UI 에 맞춰 편집/보기 전환 구조를 준비한다.
  - interaction sub-step: notes text 편집, color insert, show color codes, dirty/save 흐름을 Lua action 으로 연결한다.
- [ ] Wrapper 고유 확장으로 Notes view mode 에 Markdown viewer 를 추가한다.
  - 이 기능은 PoB 원본의 notes 데이터를 훼손하지 않는 UI facade 로만 동작해야 한다.
  - edit/view 스위치, Markdown 공식 문서 링크, 빈 note 최초 진입 시 template 사용/빈 문서 선택 모달을 제공한다.
- [ ] 왼쪽 Build Explorer 의 `+ 새 문서` 아래에 `Note 템플릿 관리` 버튼과 관리 모달을 추가한다.
  - 템플릿은 PoB 원본이 아닌 PoB 2 Unofficial Wrapper 고유 기능임을 명시한다.
  - `{key}` 변수는 빌드에 템플릿을 적용할 때 별도 입력 모달로 값을 받아 일괄 치환한다.
  - 템플릿 저장 위치와 launcher 내장 모드 / 독립 wrapper namespace 분리는 PR-N.8 의 appdata/config namespace 원칙과 충돌하지 않게 정한다.

### Build Metadata

- [x] BuildEditView 상단의 클래스/전직/레벨 표시를 PoB 원본 기준으로 읽는 Lua RPC 와 typed contract 를 추가한다.
  - 커밋: `1b0df7a feat(POB): POB 연동 기능 추가 ELSE-8`
  - PoB 원본 `Build.lua` 의 `UpdateClassDropdowns()` / `classDrop` / `ascendDrop` / `characterLevel` / `characterLevelAutoMode` 값을 `pob.buildMetadata.snapshot` 으로 직렬화한다.
  - `PobBuildMetadataSnapshot` 계약과 exact-key 검증을 추가하고 Imported Build2 기준으로 level/class/ascendancy/options 가 실제 Lua snapshot 과 일치하는지 검증했다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 57 files / 233 tests passed, 1 file / 2 tests skipped. 커밋 후 focused 검증 2 files / 7 tests passed.
- [x] BuildEditView 상단 metadata 컨트롤 변경을 PoB 원본 동작 기준의 write RPC 로 연결한다.
  - 커밋: `dcd6eb6 feat(POB): POB 연동 기능 추가 ELSE-9`
  - `pob.buildMetadata.action` 은 레벨 Auto/Manual, 레벨 입력, 전직 선택, 클래스 선택을 원본 `Build.lua` 의 state field 와 flag 갱신 흐름으로 반영한다.
  - 할당 노드가 있고 새 클래스 시작점이 연결되지 않은 경우 원본 `OpenConfirmPopup("Class Change", ..., "Continue", ..., "Connect Path", ...)` 흐름을 `confirm` 결과로 반환해 UI가 확인을 표시할 수 있게 했다.
  - Imported Build2 회귀 테스트로 level clamp/manual 전환, Auto 모드, ascendancy 변경, class-change confirmation shape 와 비돌연변이 상태를 검증했다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 57 files / 234 tests passed, 1 file / 2 tests skipped. 커밋 후 focused 검증 2 files / 8 tests passed.
- [x] BuildEditView 상단의 클래스/전직/레벨 표시를 PoB 원본 기준의 편집 가능한 컨트롤로 전환하고, 변경 시 Lua 상태/dirty/save 흐름까지 연결한다.
  - 커밋: `c4c3706 feat(POB): POB 연동 기능 추가 ELSE-10`
  - 상단 summary 카드를 PoB 원본 top bar 성격의 Auto/Manual 버튼, Level edit, Class dropdown, Ascendancy dropdown 컨트롤로 전환하고, 주요 스킬/DPS 요약은 보조 카드로 유지했다.
  - `buildMetadataControls` helper 로 PoB 원본 level edit 의 숫자 필터/3자리 제한/1..100 clamp 와 선택 클래스 기준 ascendancy 목록을 고정했다.
  - 클래스 변경 confirmation 은 `pob.buildMetadata.action` 의 `confirm` 결과를 받아 원본 `Class Change` 메시지와 `Continue` / `Connect Path` 라벨을 그대로 표시한다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 58 files / 237 tests passed, 1 file / 2 tests skipped. 커밋 후 focused 검증 1 file / 3 tests passed.

### Legacy/Renewed UI Mode

- [ ] 비공식 PoB 화면 title 오른쪽에 `Legacy` / `Renewed` 전환 스위치를 추가한다.
  - Legacy 모드는 기존 PoB UI를 원본 분석 기준으로 최대한 동일하게 구현하는 것을 목표로 한다.
  - Renewed 모드는 현재 개선된 UI를 유지한다.
  - 선행 작업으로 각 탭에서 렌더링되는 데이터 projection / section builder / row builder 를 단위별 pure function 또는 facade 로 분리해 두 UI가 같은 source snapshot 을 소비하게 한다.
  - 전환 상태가 Lua 원본 값이나 action payload 를 번역/변형하지 않도록 UI facade 경계에서만 처리한다.

### Settings And Build Actions

- [x] 런처/PoB 설정 항목을 `Tree / Skills / Items / Calcs / Party` mode 탭에서 분리한다.
- [x] PoB `Import/Export Build` 와 `Configuration` 진입점을 build panel 우상단 액션으로 옮기고, 기존 tab panel 대신 모달로 연다.
  - [x] `Configuration` 은 build panel 우상단 액션 + 모달로 이동.
  - [x] `Import/Export Build` 는 원본 `Build.lua` action 순서를 계약화하고, 기존 direct build-code API 로 Generate / Copy / Import-to-current-build 모달을 연결했다.
  - 커밋: `a9e13ac feat(POB): POB 연동 기능 추가 ELSE-4`
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 커밋 후 focused 검증 `buildActions.test.ts` + `session.buildCode.test.ts` 2 files / 4 tests passed.
- [x] Build panel 우상단의 `Import/Export Build` 는 단일 버튼 대신 불러오기 / 내보내기 버튼으로 분리한다. 원본 `Build.lua` action 의미는 유지하되 UI 레이아웃만 launcher UX 에 맞게 조정한다.
  - 커밋: `6630d25 feat(POB): POB 연동 기능 추가 ELSE-13`
  - `POB_BUILD_ACTIONS` 원본 action 순서는 `importExport` / `configuration` 으로 유지하고, header 전용 `POB_BUILD_HEADER_ACTIONS` 로 불러오기/내보내기 버튼만 분리했다.
- [x] Build panel 우상단의 `Configuration` 진입점은 텍스트 버튼 대신 아이콘 버튼으로 대체한다. 버튼 의미와 원본 action mapping 은 바꾸지 않는다.
  - 커밋: `6630d25 feat(POB): POB 연동 기능 추가 ELSE-13`
- [ ] 원본 `ImportTab` 의 URL Share/Download, `Export Support`, `Import as comparison`, Character Import 는 현재 API 범위 밖이라 후속 sub-step 에서 별도 RPC/UX 범위를 확정한다.

### UI Hotfix Backlog

- [x] Calcs 카드 즐겨찾기 토글의 `star_outline` 이 아이콘으로 렌더링되지 않는 문제를 확인하고, `pob-ui` 독립 package 에도 launcher 와 동일한 아이콘 폰트/asset 경계가 포함되도록 보정한다.
  - 커밋: `6630d25 feat(POB): POB 연동 기능 추가 ELSE-13`
  - `packages/pob-ui/src/assets/fonts/MaterialSymbolsOutlined.woff2` 와 `@font-face` / `.material-symbols-outlined` 스타일을 추가했다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 58 files / 239 tests passed, 1 file / 2 tests skipped. focused `buildActions.test.ts` 1 file / 3 tests passed.
- [ ] Build Explorer row 우클릭도 현재 hover 옵션 버튼과 같은 컨텍스트 메뉴를 열도록 연결한다.
  - 현재 row hover 시 옵션 버튼으로 메뉴를 여는 흐름은 구현되어 있다.
  - 우클릭 추가는 같은 action menu 를 여는 UX 보강이며, 메뉴 순서/동작/단축키 의미는 바꾸지 않는다.
- [ ] BuildListView 정확 메타(DPS / PlayerStat) 표시 여부를 PoB 원본 parity 와 wrapper 확장으로 분리해 검토한다.
  - 현재 구현은 목록 row 에 `level + class/ascendancy` 만 표시한다.
  - PoB 원본 BuildListHelpers 도 기본 목록 표시에서는 level/class/ascendancy 중심이다.
  - `DPS` / `PlayerStat` 는 build XML 에 저장된 cached stat 이므로 표시한다면 원본 parity 가 아니라 wrapper 확장으로 다루고, stale 가능성과 갱신 시점을 계약에 명시한다.
- [ ] Build Explorer 컨텍스트 메뉴의 잘라내기, 이름변경, 삭제 action 에 복사와 구분되는 적절한 Material Symbols 아이콘을 적용한다.
  - `docs/current-plan.md` 에서 이관됨.
  - 컨텍스트 메뉴 action 의미/순서/동작은 바꾸지 않고 icon glyph 만 교체한다.

### Process Notes

- [x] `docs/current-plan.md` 에서 PR-ELSE 로 이관된 요구사항을 제거하고, 이관 후 삭제 규칙을 상단 지침에 반영한다.
- [ ] 이후 PoB 작업 커밋은 제목만 쓰지 말고 본문에 실제 작업 내용 요약을 포함한다. 기존 `023d543` 이후 본문 누락 커밋은 추후 squash/정리 시 한 커밋 body 로 보정한다.

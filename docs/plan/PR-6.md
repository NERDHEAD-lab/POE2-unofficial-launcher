# PR-6: PoB UI mode 순차 포팅 (sub-PR 5개)

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-5](PR-5.md) (BuildEditView shell + Lua 세션)
> 후속 PR: [PR-7](PR-7.md) (RePoE 캐시)

## 목표

PR-5 의 BuildEditView placeholder 를 채워서 PoB BUILD mode 의 **5개 탭 (Tree / Items / Skills / Calcs / Config) 을 1:1 포팅**. 각 탭은 별도 sub-PR.

🎯 **이 PR (5개 sub-PR 모두) 머지 후 마일스톤 M3 달성 — 사용자 알림 지점**.
사용자 명시: "PR-6까지 진행하면 한번 알려줘. 진행상황 캡쳐해서 공유할 커뮤니티가 있거든".

## 종료 기준

- [x] PR-6.1 Tree 탭 머지
- [x] PR-6.2 Items 탭 머지
- [x] PR-6.3 Skills 탭 머지
- [x] PR-6.4 Calcs 탭 머지
- [x] PR-6.5 Config 탭 머지
- [x] 5개 mode 가 한국어로 진입 가능, 각 mode 에 PoB 원본 컨트롤 모두 노출
- [x] 계산 결과는 PoB Lua 가 처리 (우리는 입력 전달 + 결과 표시만)
- [ ] 5개 mode 스크린샷 콜라주 + PoB GUI 원본 비교 첨부 (사용자 커뮤니티 공유용)
- [ ] **사용자에게 M3 도달 보고** (PR-6.5 머지 직후)

## 공통 작업 (모든 sub-PR 에 해당)

### 1. UI 1:1 포팅 원칙 (plan §4.5)

- PoB 원본의 모든 활성 컨트롤 (버튼/입력/드롭다운/체크박스/탭) 을 **개수·라벨·동작 동일**하게 React 로 포팅
- PoB 에 없는 버튼/메뉴/통계 추가 금지
- dead code (`if false then ...`) 는 포팅 안 함
- 절대좌표(`{0, 0, 60, 20}`) 는 Flex/Grid 로 변환하되 시각적 위치 관계 유지
- 각 sub-PR 마다 PoB 원본 스크린샷 + 포팅 화면 나란히 첨부

### 2. RPC 메서드 확장

각 mode 별로 필요한 RPC 추가. ipc_bridge.lua 의 `handle_method` 에 케이스 추가.
PR-5 의 `pob.loadBuildXml` 가 build 객체를 메모리에 보관 중 → 각 RPC 는 그 상태를 조회/변경.

### 3. i18n JSON 키 추가

각 mode 의 모든 UI 문자열을 `ko.json` / `en.json` 에 키로 추출.
**en.json 은 PoB 원본 영문 그대로** (Q5 결정).
예: `"buildTab.tree.search.placeholder": "검색" / "Search"`.

## sub-PR 분할

### PR-6.1: Tree 탭

- 원본: PoB `PassiveTab` (없으면 Modules 안에 분산), 본 PR 시점에 [Classes/PassiveTreeView.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/) 참고
- 본 PR 의 트리 렌더링: **plan §6 트리 = 옵션 C 확정** — RePoE 의 트리 데이터 + 스프라이트 사용, 패스/하이라이트 계산은 PoB Lua, 좌표만 받아 React Canvas 렌더
- 단 PR-7 (RePoE 캐시) 이 아직 머지 안 됨 → **임시로 PoB 의 TreeData/<version>/tree.json 을 vault 에서 fs 로 읽어 baseline 렌더**
- 사용자 인터랙션 (노드 클릭 → 할당) → RPC `pob.tree.allocate({ nodeId })` → PoB Lua 가 패스 계산 → 응답 좌표 갱신
- 컨트롤: 줌인/줌아웃 (Ctrl+휠), 트리 셀렉터 드롭다운, "Find Timeless Jewel" 버튼 등
- **이 sub-PR 의 트리 렌더링 정밀화(에셋 연동) 진행** — PoB 원본의 노드 아이콘, 배경, 커넥터 커브, 클러스터 주얼 등 에셋 표시를 PR-6.1 에 당겨서 선행 적용

### PR-6.2: Items 탭

- 원본: PoB [Classes/ItemDBControl.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/) + ItemsTab
- 컨트롤:
  - 좌측: 아이템 슬롯 (무기, 방어구, 장신구 ...) — 드래그 앤 드롭
  - 중앙: All items 리스트 + Shared items 리스트 (PoB 의 두 박스)
  - 우측: 선택 아이템 상세 + 편집
  - 상단: "Craft item...", "Create custom...", "Trade for these items"
  - 아이템 셋 매니저: "Manage..." 버튼
- RPC: `pob.items.list()`, `pob.items.equip({ slot, itemId })`, `pob.items.craft({ ... })`, ...
- Ctrl+C 파싱 (인게임 아이템 → PoB 아이템) 은 PR-8 — 여기서는 PoB 가 이미 알고 있는 아이템만

#### PR-6.2 세부 진행 단계

- [x] **PR-6.2.1** Lua bridge read RPC
  - `resources/lua/ipc_bridge.lua` 에 `pob.items.snapshot`, `pob.items.dbList` 추가
  - 현재 활성 빌드의 item set, slot, custom item, unique/rare DB 요약을 JSON-RPC 로 반환
  - 쓰기 동작(`equip`, `craft`, `create custom`, `delete`)은 아직 추가하지 않음
- [x] **PR-6.2.2** TypeScript Items API 연결
  - `src/shared/types.ts` 에 Items snapshot / DB list contract 추가
  - `src/main/pob-preload.ts` 에 `pobAPI.session.itemsSnapshot`, `itemsDbList` 노출
  - `src/main/services/pobSession.ts` 에 PoBSession 메서드와 IPC handler 연결
- [x] **PR-6.2.3** ItemsView read-only UI 포팅
  - 아이템 세트 셀렉터, 장착 슬롯, All items 리스트, 선택 아이템 상세, Unique/Rare DB 탭 렌더
  - 상단 버튼과 DB 필터 컨트롤은 PoB 원본 위치/라벨을 보존하되, 대응 RPC 전까지 disabled 처리
- [x] **PR-6.2.4** Items write RPC + 상호작용
  - `setActiveSet`, `setWeaponSet`, `equip`, `equipBest`, `sortItems`, `deleteItem`, `deleteUnused`, `deleteAll`, `addDbItem`, `addSharedItem`, `deleteSharedItem`, `createCustom` 을 PoB Lua RPC 로 연결
  - 슬롯 드롭다운/활성 토글, Ctrl+클릭 장착, DB/Shared 더블클릭 추가, raw text custom item 생성까지 연결
  - `Manage...`, `Craft item...`, `Trade for these items` 는 PoB 원본 컨트롤 위치/라벨을 유지하고 disabled tooltip 으로 표시. 실제 팝업/외부 거래 검색 UI 는 별도 후속에서 다룸.
- [x] **PR-6.2.5** 검증/정리
  - BuildEditView Items 탭 wiring, i18n 키, styles 정리
  - Windows `pwsh.exe` 로 lint/test/build 검증 후 코드 변경분만 커밋
  - PoB 원본 ItemsTab 과 launcher ItemsView 비교는 사용자 리뷰 시 화면 확인

### PR-6.3: Skills 탭

- 원본: PoB SkillsTab + [Modules/CalcActiveSkill.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/CalcActiveSkill.lua)
- 컨트롤:
  - Socket Group 리스트 (좌상)
  - Skill Set 셀렉터 + Manage 버튼
  - 선택 그룹의 상세 (우측): gem 슬롯, level, quality, count, Enabled 체크, Include in Full DPS
  - 하단: Gem Options 박스 (레벨 변경, DPS 정렬)
- RPC: `pob.skills.listGroups()`, `pob.skills.addGroup`, `pob.skills.setGemLevel({ groupId, gemIdx, level })`, ...

### PR-6.4: Calcs 탭

- 원본: PoB [Classes/CalcsTab.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/CalcsTab.lua) + [Modules/CalcSections.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/CalcSections.lua) + [Classes/CalcSectionControl.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/CalcSectionControl.lua) + [Classes/CalcBreakdownControl.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/CalcBreakdownControl.lua) + [Modules/CalcFormat.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/CalcFormat.lua) + [Modules/CalcBreakdown.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/CalcBreakdown.lua)
- 컨트롤 (PoB 원본 1:1 — 누락 0건):
  - **상단 검색**: `CalcsTab.controls.search` (EditControl) — 섹션/라벨 substring 매치
  - **SkillSelect 섹션** (`CalcsTab.lua:39-160`, `NewSection(3, "SkillSelect", ...)`)
    - Socket Group / Active Skill / Stat Set 드롭다운
    - Skill Part / Skill Stages / Active Mines 입력 (`playerFlag = "multiPart"/"multiStage"/"mine"`)
    - Show Minion Stats 체크박스, Minion / Spectre Library / Beast Library / Minion Skill / Minion Skill Stat Set
    - Calculation Mode 드롭다운: `Unbuffed | Buffed | In Combat | Effective DPS` (`CalcsTab.lua:11-17` buffModeDropList — `misc_buffMode` input)
    - Aura/Combat/Curse 리스트 표시 (`{output:BuffList} / CombatList / CurseList`)
  - **본문 섹션 그리드** (`Modules/CalcSections.lua` — 약 28개 섹션, group/colour 로 그룹화)
    - group 1 (Offence, `colorCodes.OFFENCE`): HitDamage, Warcries, Dot, Speed, Crit, Impale, SkillTypeStats, HitChance, Bleed, Poison, Ignite, Decay, LeechGain, EleAilments, MiscEffects, DamageTaken
    - group 2 (Life/Mana/Spirit/ES, 각 `colorCodes.LIFE/MANA/SPIRIT/ES`): Attributes, Life, Mana, Spirit, EnergyShield
    - group 3 (Defence, 각 `colorCodes.DEFENCE/ARMOUR/EVASION/ENCHANTED/RAGE`): Resist, Armour, Evasion, DamageAvoidance, Flasks, Rage, Charges, MiscDefences
    - 섹션 width: 1 또는 3 열 (`CalcsTab.lua:392-396` — `width * colWidth + 8 * (width-1)`, `colWidth = 230`)
    - 각 섹션은 subSection 배열 (defaultCollapsed/label/data) → 표 형태 row (`label` + 다중 `format` 셀, `colWidth = 95` 등)
    - row/subsection 표시 여부: `flag` (skillFlags), `notFlag`, `playerFlag`, `haveOutput` 등 (`CalcsTab.lua:264-329 CheckFlag`)
  - **Breakdown 모달** (`CalcBreakdownControl`, `CalcsTab.lua:402-414 SetDisplayStat/ClearDisplayStat`)
    - 셀 hover → `displayData` set, click → `displayPinned` toggle
    - breakdown 데이터: `actor.breakdown[stat]` (rows + modList), CalcBreakdown 모듈 결과
  - **하단/상단 (PoB 사이드바 — 본 탭에는 없지만 mainOutput 의존)**: 본 탭 자체는 사이드바를 그리지 않음. BuildEditView 상단 `stats` summary 가 이미 있음 — `mainOutput.CombinedDPS / TotalEHP / Life / ES` 정도가 PR-5 부터 표시됨
- RPC (read-only 위주, 마지막에 input write 추가):
  - `pob.calcs.snapshot()` → SkillSelect 컨트롤 상태, sectionList 메타 (id/group/colWidth/widthCols/subSection→{id,label,collapsed,enabled,rows[{label,cells[{text/colourTag/breakdownKey}]}]}), Aura/Combat/Curse 텍스트, ColorCodes 매핑
  - `pob.calcs.breakdown({ key })` → breakdown rows + modList for hovered cell
  - `pob.calcs.action({ type, ... })` → SkillSelect 드롭다운/체크/입력 변경 (action.type: `setSkillNumber`, `setMainActiveSkill`, `setStatSet`, `setSkillPart`, `setSkillStages`, `setMines`, `setShowMinion`, `setMinion`, `setMinionSkill`, `setMinionSkillStatSet`, `setBuffMode`, `toggleSubsection`)
  - `pob.calcs.setMode` 등 별도 분리 안 함 — 모두 `action` 으로 dispatch (Skills/Items 6.2.4 패턴과 일치)

#### PR-6.4 세부 진행 단계

- [x] **PR-6.4.1** Lua bridge read RPC — `calcs.snapshot` / `calcs.breakdown`
  - `resources/lua/ipc_bridge.lua` 의 `handle_method` 에 `pob.calcs.snapshot`, `pob.calcs.breakdown` 추가 (Items/Skills 와 동일한 elseif 체인)
  - 활성 build 의 `build.calcsTab` 을 가져와 SkillSelect 입력 (`tab.input.skill_number`, `tab.input.misc_buffMode`, `tab.input.showMinion`) + `tab.sectionList` 순회
  - 각 section 의 `subSection[i].data` 를 `CalcSectionControl.lua` 의 `UpdateSize/UpdatePos` 로직 그대로 평가 (`enabled`, `colData.format` 을 `formatCalcStr` 로 치환 — `CalcFormat.lua` 의 `{output:Key}` / `{p:output:Key}` / `{p:mod:n,m}` 토큰 모두 해석되어 텍스트로 내려옴)
  - colour 는 `colorCodes.OFFENCE/DEFENCE/LIFE/MANA/SPIRIT/ES/ARMOUR/EVASION/ENCHANTED/RAGE/NORMAL/LIGHTNING/COLD/FIRE/CHAOS` 를 그대로 문자열로 직렬화 (e.g. `"OFFENCE"`) — 색은 React 측 매핑
  - `colData.breakdown` 또는 `colData.modName` 이 있는 셀은 `breakdownKey` (안정적인 식별자: `section.id + ":" + rowIndex + ":" + colIndex`) 를 같이 내려서 hover 시 `pob.calcs.breakdown` 호출 키로 사용
  - `breakdown` RPC 는 `CalcBreakdownControl.lua` 의 `SetBreakdownData` + `Modules/CalcBreakdown.lua` 결과 그대로 평탄화 (rows: 텍스트 라인 배열, modList: source/value/source 라인). PoB 가 이미 생성한 breakdown 구조를 그대로 JSON 변환
  - SkillSelect 의 활성 dropdown 옵션 목록은 PoB Lua 가 `RefreshSkillSelectControls` 에서 매번 채우는 동적 값 → `tab.controls.mainSocketGroup.list`, `mainSkill.list`, `mainSkillPart.list` 등을 snapshot 에 동봉
  - 쓰기 (`action`) 는 본 단계 X
  - 참조: `Classes/CalcsTab.lua:21-160` (SkillSelect 정의), `CalcsTab.lua:264-329 CheckFlag`, `Classes/CalcSectionControl.lua:100-220 UpdateSize`, `Modules/CalcFormat.lua` 전체, `Modules/CalcBreakdown.lua`

- [x] **PR-6.4.2** TypeScript Calcs API 연결 + read RPC 단위 테스트
  - `src/shared/types.ts` 에 contract 추가: `PobCalcsSnapshot` (skillSelect, sections[]→subSections[]→rows[]→cells[], colorCodes), `PobCalcsBreakdown`, `PobCalcsAction`, `PobCalcsSnapshotResult`, `PobCalcsBreakdownResult`
    - cell shape: `{ text: string; colour: string | null; breakdownKey: string | null; align: "left"|"right" }` — `colour` 는 PoB colorCodes 키 (`"OFFENCE" | "FIRE" | ...`)
    - 참조 패턴: `PobSkillsSnapshot` ([src/shared/types.ts:624-744](file:///mnt/d/project_poe2/POE2-unofficial-launcher/src/shared/types.ts)) 와 동일 구조
  - `src/main/pob-preload.ts` 에 `pobAPI.session.calcsSnapshot / calcsBreakdown / calcsAction` 노출 (현 SkillsView 노출 패턴 — [src/main/pob-preload.ts:104-106](file:///mnt/d/project_poe2/POE2-unofficial-launcher/src/main/pob-preload.ts))
  - `src/main/services/pobSession.ts` 에 `PoBSession.calcsSnapshot / calcsBreakdown / calcsAction` + `ipcMain.handle("pob:calcs-snapshot"/"pob:calcs-breakdown"/"pob:calcs-action")` (현 skills wiring — [src/main/services/pobSession.ts:215-220, 656-685](file:///mnt/d/project_poe2/POE2-unofficial-launcher/src/main/services/pobSession.ts))
  - `src/main/services/pobSession.calcs.test.ts` 추가 — `calcsSnapshot`/`calcsBreakdown` 이 각각 `pob.calcs.snapshot` / `pob.calcs.breakdown` 으로 delegate 되는지 (현 [pobSession.skills.test.ts](file:///mnt/d/project_poe2/POE2-unofficial-launcher/src/main/services/pobSession.skills.test.ts) 와 동일 패턴 — 67 라인 짜리 unit test 구조 그대로)

- [x] **PR-6.4.3** CalcsView read-only 포팅 (가시성·UX 개선 — 레거시 절대좌표 그리드 따르지 않음)
  - `src/pob/views/CalcsView.tsx` 신규 — SkillsView/ItemsView 와 같이 `{ active, onMutated? }` 시그니처. **Calcs 는 mutating action 이 SkillSelect 입력뿐이라 `onMutated` 는 6.4.4 에서 활성화** (read-only 단계는 prop optional)
  - 레이아웃 (UX 개선, **PoB 원본 1:1 정렬 무시 — group 기반 자동 배치 대체**):
    - **상단 sticky bar**: 검색 input + Calculation Mode 드롭다운 + Show Minion 체크 + 상단 요약 (FullDPS, Combined DPS, TotalEHP) — PoB 사이드바 의 stat 일부를 본 탭 상단에 압축 표시 (가시성 ↑). 이는 ItemsView 의 슬롯 패널 위 toolbar 패턴 ([src/pob/views/ItemsView.tsx](file:///mnt/d/project_poe2/POE2-unofficial-launcher/src/pob/views/ItemsView.tsx)) 의 일관성 유지
    - **본문**: PoB 의 `group 1 / 2 / 3` 자동 배치(`CalcsTab.lua:182-280`) 를 따르지 않고 **CSS Grid (`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`) 로 반응형 카드** — group 은 색띠/탭 필터로만 표현. 좁은 폭에서도 가로 스크롤 없이 읽힘
    - 카드 헤더: section.label + colour 색띠 + collapse 토글 (PoB `toggle1/2` 동등)
    - 카드 본문: subSection rows → 첫 칼럼 = row.label, 나머지 = cells (right-align 숫자, colour tag 적용). `colWidth` 균등 분배
    - **그룹 필터 칩**: `Offence / Defence / Resources / All` (group 1 / 3 / 2 / 전체) — 사용자가 탭 내에서 빠르게 좁힐 수 있게 (PoB 원본엔 없는 UX 개선; 단 기존 컨트롤 누락 0건이므로 §4.5 충돌 없음. 단순 필터 추가는 §4.5 의 "버튼/메뉴/통계 추가 금지" 와 경계선 — **사용자 확인 필요 항목 (체크박스: PR-6.4.3 진입 직전 사용자 승인)**)
    - SkillSelect 섹션은 group 무관하게 본문 최상단 카드로 고정 — Stat Set/Active Skill/Buff Mode 변경이 모든 섹션에 영향이므로 항상 보이게
  - 셀 텍스트는 `formatCalcStr` 결과를 그대로 표시 (이미 Lua 측에서 토큰 치환 완료). colour 매핑 테이블은 `src/pob/styles.css` 에 추가 — PoB `colorCodes` 16색 (OFFENCE/DEFENCE/LIFE/MANA/ES/ARMOUR/EVASION/FIRE/COLD/LIGHTNING/CHAOS/POSITIVE/NEGATIVE/NORMAL/RAGE/ENCHANTED/SPIRIT)
  - `BuildEditView.tsx:230-240` 의 `activeMode === "calcs"` 분기에서 placeholder 제거, `<CalcsView active />` 마운트
  - i18n 키: `buildTab.calcs.search.placeholder`, `buildTab.calcs.skillSelect.*` (socketGroup/activeSkill/statSet/skillPart/skillStages/mines/showMinion/minion/spectreLibrary/beastLibrary/minionSkill/minionSkillStatSet/buffMode + buffMode.options.{unbuffed,buffed,combat,effective}), `buildTab.calcs.sections.<sectionId>` 28개 + subsection.label 들, `buildTab.calcs.groupFilter.{all,offence,defence,resources}`, `buildTab.calcs.empty/loading/error.*`
    - en.json 은 PoB 원본 영문 (e.g. `"Skill Hit Damage"`), ko.json 은 임의 번역 (Q5)
  - 인터랙션 없음 (드롭다운/체크/입력은 disabled, breakdown 패널도 placeholder) — 모두 PR-6.4.4 에서 활성화

- [x] **PR-6.4.4** Breakdown 모달 + SkillSelect 인터랙션 (`pob.calcs.action` + `pob.calcs.breakdown`)
  - **셀 hover/click → breakdown**: `breakdownKey` 있는 셀에 hover 시 200ms debounce 로 `calcsBreakdown({ key })` 호출, 결과를 우측 슬라이드인 패널 (또는 카드 아래 expand) 로 렌더. click 시 pin (PoB `displayPinned`) — 다른 셀 hover 해도 유지, X 버튼/Esc 로 unpin
    - 패널 내용: header(셀 라벨 + 최종 값), `rows[]` 평문 라인, `modList[]` 표 (source / value / mod name) — PoB `CalcBreakdownControl:Draw` 의 출력 항목과 동일
    - **UX 개선 (사용자 가시성 요구)**: PoB 의 breakdown 은 마우스 따라다니는 작은 popup 인데, 본 launcher 는 **우측 240~360px 고정 패널**로 가독성 ↑. 좁은 폭에서는 풀스크린 모달로 fallback
  - **SkillSelect 인터랙션**: 드롭다운/체크/입력 모두 `calcsAction` 으로 라우팅
    - dropdown change → `setSkillNumber({ index })` 등 → 응답 snapshot 으로 state 교체 → `onMutated()` 호출
    - PoB 의 `AddUndoState` + `build.buildFlag = true` 가 RPC 핸들러에서 호출되므로, snapshot 응답에 buildOutput 재실행 결과 (`mainOutput`/`calcsOutput`) 가 이미 반영됨
    - input 변화 시 `mark_calcs_changed` (Items/Skills 의 `mark_*_changed` 패턴) 으로 dirty 갱신 — `mark_calcs_changed(tab)` 는 `tab.build.buildFlag = true` + `tab:AddUndoState()` + `tab.modFlag = true`
  - **Subsection collapse 토글**: `action.type = "toggleSubsection"` ({ sectionId, subSectionId }) — PoB `CalcsTab:Save` 의 collapsed 상태가 XML 에 저장됨 → 빌드 저장 시 함께 보존
  - **검색 필터**: PoB `SearchMatch` 는 단순 substring → React 측에서 client-side 필터 (RPC 왕복 불필요, sectionList 자체에 label/row.label 가 다 있음). 매치 안 되는 section/row 는 흐리게 (PoB 원본 동작과 동일)
  - 참조: `Classes/CalcsTab.lua:402-414 SetDisplayStat`, `Classes/CalcBreakdownControl.lua` 전체, `Classes/CalcsTab.lua:472-549 ProcessControlsInput` (Ctrl+Z/Y/F)

- [x] **PR-6.4.5** 검증/정리 + 회귀 테스트
  - Items 의 [itemsViewSlots.test.ts](file:///mnt/d/project_poe2/POE2-unofficial-launcher/src/pob/views/itemsViewSlots.test.ts) 패턴으로 `src/pob/views/calcsViewSections.ts` + `.test.ts` 분리 — section group 필터링, collapse 상태 머지, search match 로직만 순수 함수로 추출해서 단위 테스트
  - `pob.calcs.snapshot` 응답이 sections 비어있을 때 / build 미로드 시 / displaySkillList 비어있는 socketGroup 일 때 의 graceful fallback (Skills 의 `error("No active skills tab")` 패턴)
  - i18n 키 누락 점검 — en/ko 양쪽
  - Windows `pwsh.exe` 로 `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (handoff §4.7)
  - 비교 화면 확인 (PoB 원본 CalcsTab vs launcher CalcsView) 은 사용자 리뷰 시 수기 확인

#### PR-6.4 진행 시 주의 (PR-6.3 동시 진행 대응)

- 본 PR 작업 시점에 PR-6.3 (Skills) 가 아직 머지 안 되었거나 동시 진행 중이면 `src/main/services/pobSession.ts` / `resources/lua/ipc_bridge.lua` / `src/shared/types.ts` 에서 **머지 충돌이 거의 확정**. 충돌 방지를 위해:
  - ipc_bridge.lua: skills 와 calcs RPC dispatcher 는 **별도 elseif 블록**으로 두고, helper 함수(`calcs_tab()`, `mark_calcs_changed()`, `format_section_cell()` 등) 는 skills helper 함수 정의 **이후**에 둔다 — 위쪽 helper 영역 충돌 회피
  - pobSession.ts: `skillsSnapshot/skillsAction` 메서드 바로 아래에 `calcsSnapshot/calcsBreakdown/calcsAction` 추가. ipc handler 등록도 `pob:skills-action` handler 다음 라인에 추가
  - shared/types.ts: PobSkills* 타입 그룹 **바로 아래** 에 PobCalcs* 그룹 추가 — 파일 끝의 `window.pobAPI` 인터페이스도 같은 위치에 추가
  - i18n 파일: `buildTab.calcs.*` 키는 `buildTab.skills.*` 마지막 키 **다음 줄** 부터. 정렬 깨지지 않게 사전순 유지
- PR-6.3 이 PR 머지된 후 본 PR 작업 시작이면 위 주의는 불필요

### PR-6.5: Config 탭

- 원본: PoB [Modules/ConfigOptions.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/ConfigOptions.lua) (226KB — 옵션이 매우 많음)
- 컨트롤:
  - 조건부 플래그 토글 (보스 상태, 전투 상황 ...)
  - 셀렉트 박스 (몹 종류, 환경 ...)
  - 슬라이더 / 숫자 입력
- RPC: `pob.config.list()`, `pob.config.set({ key, value })`
- 옵션이 매우 많으므로 **PoB 의 그룹 구조 (sectionList) 를 그대로** 사용해서 React 측 자동 생성 (모든 옵션 하드코딩 X)

## 결정 사항 (plan §6 에서 참조)

- **Q6**: A 순서 (Tree → Items → Skills → Calcs → Config). 각 mode 별 sub-PR
- **§4.5**: UI 1:1 포팅 원칙 (요소 보존/추가 금지/제거 금지)
- **트리 (plan §6)**: 옵션 C — RePoE 데이터 + PoB Lua 패스 계산. 본 PR 시점엔 RePoE 미통합이라 fs 로 PoB 의 tree.json 사용 임시 처리

## 검증 시나리오 (각 sub-PR)

1. BuildListView → 빌드 Open → BuildEditView 진입
2. 상단 탭 바: Tree / Items / Skills / Calcs / Config (한국어)
3. 각 탭 클릭 → 해당 mode 렌더
4. PoB 원본과 시각적 비교 — 컨트롤 누락 0건
5. 인터랙션 → RPC → 결과 반영 (DPS 값 변경, 노드 할당 등)
6. 언어 셀렉터 ko ↔ en 전환 → 모든 mode 의 UI 텍스트 변경 (게임 데이터는 영문 그대로 — RePoE 통합은 PR-7)

## 마일스톤 (사용자 요청 알림 지점)

🎯 **PR-6.5 머지 후 사용자에게 보고**:

- 진행 상황: 5개 mode 모두 한국어 포팅 완료
- 캡쳐 공유 자료:
  - 각 mode 스크린샷 (PoB 원본 vs 본 launcher 나란히)
  - 5개 mode 콜라주 1장
  - 한국어 셀렉터 전환 GIF (선택)
- 알림 채널: 사용자 명시 안 함 → handoff 문서의 "마일스톤 보고" 섹션 참조

## 추정 작업량

| sub-PR        | 추정 일수 | 비고                       |
| ------------- | --------- | -------------------------- |
| PR-6.1 Tree   | 5~10 일   | 트리 렌더링이 가장 복잡    |
| PR-6.2 Items  | 4~7 일    | 아이템 DB + 슬롯 + 편집    |
| PR-6.3 Skills | 3~5 일    | gem 그룹 구조              |
| PR-6.4 Calcs  | 2~4 일    | 표시 전용, 입력 없음       |
| PR-6.5 Config | 3~5 일    | 옵션 매우 많지만 자동 생성 |

총 17~31 일. 본 PR 가 전체 일정의 절반 이상 차지.

## 참고

- PoB Build.lua 의 mode 전환 로직: [Build.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/Build.lua) (93KB)
- 각 mode 의 Tab 클래스: `src/Classes/*Tab.lua`
- ConfigOptions 그룹 구조: [ConfigOptions.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/ConfigOptions.lua)

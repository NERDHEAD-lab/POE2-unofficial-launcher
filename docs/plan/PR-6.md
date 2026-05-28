# PR-6: PoB UI mode 순차 포팅 (sub-PR 5개)

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-5](PR-5.md) (BuildEditView shell + Lua 세션)
> 후속 PR: [PR-7](PR-7.md) (RePoE 캐시)

## 목표

PR-5 의 BuildEditView placeholder 를 채워서 PoB BUILD mode 의 **5개 탭 (Tree / Items / Skills / Calcs / Config) 을 1:1 포팅**. 각 탭은 별도 sub-PR.

🎯 **이 PR (5개 sub-PR 모두) 머지 후 마일스톤 M3 달성 — 사용자 알림 지점**.
사용자 명시: "PR-6까지 진행하면 한번 알려줘. 진행상황 캡쳐해서 공유할 커뮤니티가 있거든".

## 종료 기준

- [ ] PR-6.1 Tree 탭 머지
- [ ] PR-6.2 Items 탭 머지
- [ ] PR-6.3 Skills 탭 머지
- [ ] PR-6.4 Calcs 탭 머지
- [ ] PR-6.5 Config 탭 머지
- [ ] 5개 mode 가 한국어로 진입 가능, 각 mode 에 PoB 원본 컨트롤 모두 노출
- [ ] 계산 결과는 PoB Lua 가 처리 (우리는 입력 전달 + 결과 표시만)
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

### PR-6.3: Skills 탭

- 원본: PoB SkillsTab + [Modules/CalcActiveSkill.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/CalcActiveSkill.lua)
- 컨트롤:
  - Socket Group 리스트 (좌상)
  - Skill Set 셀렉터 + Manage 버튼
  - 선택 그룹의 상세 (우측): gem 슬롯, level, quality, count, Enabled 체크, Include in Full DPS
  - 하단: Gem Options 박스 (레벨 변경, DPS 정렬)
- RPC: `pob.skills.listGroups()`, `pob.skills.addGroup`, `pob.skills.setGemLevel({ groupId, gemIdx, level })`, ...

### PR-6.4: Calcs 탭

- 원본: PoB [Modules/CalcSections.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/CalcSections.lua) + CalcsTab
- 컨트롤:
  - 메인 스킬 / Full DPS 토글
  - 섹션별 계산 상세 (Offence, Defence, ...) — 트리/테이블 형식
  - "Show Stat" 토글 (DPS, EHP, ...)
- RPC: `pob.calcs.getSections()` → 모든 섹션의 계산 결과 트리 반환
- 표시 전용 (사용자 입력으로 변경되는 건 없음)

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

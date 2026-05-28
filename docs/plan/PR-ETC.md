# PR-ETC: PoB original contract and Calcs display correction

> 상위 문서: [../pob-handoff.md](../pob-handoff.md)
> 선행 PR: PR-6.5 / PR-8 build-code 호환 작업
> 후속 PR: PR-9+

## 목표

Tree / Items / Skills / Calcs 가 PoB 원본 Lua 자료구조를 잘못 참조하지 않도록 공유 계약을 강화하고, Imported Build2 를 기준으로 실제 Lua snapshot 이 TypeScript 계약과 일치하는지 검증한다.

계획 문서 관리 규칙에 따라 이 문서는 코드 커밋에 포함하지 않고 unstaged 상태로 둔다.

## 완료 항목

- [x] PoB 원본 enum/option 값을 `pobOriginalContract` 로 분리
  - 커밋: `5fcdad3 fix(POB): POB 원본 계약과 계산 표시 보정`
  - item rarity, item DB key, skill gem color/default level/support type/sort field, calcs colour/buff mode/group filter 값을 공유 계약으로 고정했다.
- [x] Tree / Items / Skills / Calcs snapshot runtime assertion 추가
  - `assertPobTreeSnapshot`, `assertPobItemsSnapshot`, `assertPobItemsDbList`, `assertPobSkillsSnapshot`, `assertPobCalcsSnapshot` 으로 Lua RPC 응답 shape 를 검증한다.
- [x] Imported Build2 기반 Lua 회귀 테스트 추가
  - 실제 PoB Lua source 와 Imported Build2 fixture 가 있을 때 Tree / Items / Skills / Calcs snapshot 을 모두 로드해 계약을 검증한다.
  - Skill Hit Damage 라벨이 `Cold:` / `Fire:` / `Chaos:` 로 유지되고 `old:` / `ire:` / `haos:` 로 밀리지 않는지 검증한다.
  - 의도적 빈 값과 PoB unavailable 값 표시가 `-%`, `- to -` 로 왜곡되지 않는지 검증한다.
  - 커밋: `1eae785 test(POB): POB 연동 기능 추가 ETC-1`
  - Hit Damage 행은 실제 damage range 값을 가져야 하며 standalone `-` 로 비어 있지 않아야 한다는 Imported Build2 회귀 검증을 추가했다.
- [x] Calcs 카드 UX 보정
  - SkillSelect 카드는 masonry 밖에서 상단 전체 폭을 차지하도록 배치했다.
  - 카드 분배는 source order 를 유지하는 contiguous column partition 방식으로 변경해 접힘 높이를 반영하면서 열 높이를 균등화한다.
  - 카드 즐겨찾기 helper 를 추가해 현재 필터/list 안에서 즐겨찾기 카드만 앞쪽으로 당긴다.
- [x] PoB projection contract strict shape + breakdown 검증 보강
  - 커밋: `447dd94 fix(POB): POB 연동 기능 추가 ETC-2`
  - Tree / Items / Skills / Calcs projection assertion 이 예상하지 않은 field 를 거부하도록 강화했다.
  - `assertPobCalcsBreakdown` 을 추가하고 Imported Build2 에서 실제 `calcs.breakdown` payload 를 Lua source 기준으로 검증한다.
  - Lua bridge 가 formatted cell 내부 child descriptor 의 `breakdown` / `modName` 을 탐지하도록 보정하고, nullable 필드는 JSON `null` 로 직렬화한다.
- [x] Calcs 카드 값 blank/artifact 표시 보정
  - 커밋: `40d76e4 fix(POB): POB 연동 기능 추가 ELSE-15`
  - PoB 원본 `CalcSectionControl.lua` 처럼 `formatCalcStr` 에 rowData 가 아니라 colData 를 전달하도록 Lua bridge 를 보정했다.
  - active vault/source 에 global `formatCalcStr` 가 없거나 값을 해석하지 못하는 경우 원본 control 이 쓰는 `section:FormatStr(str, actor, colData)` fallback 을 사용한다.
  - Imported Build2 회귀 테스트는 Attributes/Life/Mana/Resists/Other Effects/Attack/Cast Rate 카드 값이 blank, `-%`, `- to -` 같은 artifact 가 아니라 실제 Lua 계산값으로 직렬화되는지 검증한다.

## 검증 기록

- Windows `npm run lint`, `npm test`, `npm run build:check` 는 해당 코드 sub-step 커밋 시 통과.
- `447dd94` 커밋 후 focused 검증: Windows `npm test -- packages/shared/src/pobOriginalContract.test.ts packages/pob-bridge/src/session.importedBuild.test.ts` 통과 (2 files / 5 tests).
- `40d76e4` 커밋 전 focused 검증: Windows `npm test -- packages/pob-bridge/src/session.importedBuild.test.ts -t 'matches PoB Lua structures'` 통과 (1 file / 1 test). 전체 Windows `npm run lint`, `npm test`, `npm run build:check` 통과 (58 files / 240 tests passed, 1 file / 2 tests skipped).
- 현재 브랜치에서는 PR-N 이동 후 경로가 `packages/**` 로 바뀌었으므로, 후속 검증은 package 경로의 동일 테스트를 사용한다.

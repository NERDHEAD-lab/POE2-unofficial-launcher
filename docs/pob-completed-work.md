# PoB Unofficial Wrapper 통합 — 완료 작업 아카이브

> 이 문서는 `docs/pob-handoff.md` 를 짧게 유지하기 위해 완료된 작업 이력만 따로 모아 둔 아카이브다.
> 현재 작업 재개에는 `docs/pob-handoff.md`, `docs/current-plan.md`, 활성 PR 문서를 먼저 사용한다.

---

## 완료 마일스톤

- **M0 PoC 통과** (2026-05-26)
  - LuaJIT 2.1.1720049189 + `HeadlessWrapper.lua` 헤드리스 부팅 exit 0 확인
  - PoB exe 직접 헤드리스 실행 불가 확인
  - HKCU InstallLocation, 설치본 평탄화 구조, OneDrive Documents 리다이렉트 실측
- **M1 UI 첫 진입**
  - PR-1 좌측 `POB i18n (BETA)` 진입 버튼 + InstallerModal
  - PR-2 PoBLocator 실제 구현 + 통합
  - PR-3 BuildsScanner + BuildListView 1:1 포팅 + i18n 골격
  - PR-3-2 BuildListView Explorer 패널 + 자동 저장 흐름
- **M2 BUILD 진입 가능**
  - PR-4 PoBVault + LuaJIT 번들 + `ipc_bridge` + 최소 RPC
  - PR-5 BuildEditView + Lua 세션 lazy spawn + Deflate/Inflate IPC override
- **M3 PoB UI 골격 완성**
  - PR-6.1 Tree 탭
  - PR-6.2 Items 탭
  - PR-6.3 Skills 탭
  - PR-6.4 Calcs 탭
  - PR-6.5 Config 탭
- **M4 RePoE 통합**
  - PR-7.1 RePoE 데이터 매핑 분석 및 프로젝트 Skill 추가
  - PR-7.2 CDN baseline 검증 + opt-in 회귀 테스트
  - PR-7.3 fetcher 서비스
  - PR-7.4 cache manifest/resource manager
  - PR-7.5 Translator
  - PR-7.6 Tree/Items/Skills 번역 스냅샷 표시 통합
  - PR-7.7 GitHub Actions RePoE CDN 주기 검증 + 실패 Issue 자동 생성
  - PR-7.8 PoB UI i18n / RePoE 게임 데이터 도메인 분리 guard
- **M5 빌드 코드 호환**
  - PR-8.1 PoB 원본 분석 + RPC/계약 경계 확정
  - PR-8.2 build code pure utility + `Imported Build2.xml` fixture 테스트
  - PR-8.3 Ctrl+C item parser typed contract
  - PR-8.4 parse-and-add IPC/API + Lua compatibility 테스트
  - PR-8.5 BuildEditView Items 탭 paste UX
  - PR-8.6 build code import/export API + 회귀 검증
  - PR-8.7 Windows `npm run lint`, `npm test`, `npm run build:check` 통과
  - 외부 커뮤니티 build-code 3개 fixture 및 PoB GUI 상호 수동 검증은 source 확보/사용자 수동 검증 시 추가
- **M6 Fallback 검증**
  - PR-9.1 ContractValidator smoke test contract
  - PR-9.2 Vault stage/promote/generation API
  - PR-9.3 vault update flow orchestration
  - PR-9.4 vault status IPC + fallback/uninitialized titlebar badge
  - PR-9.5 vault settings contract
  - PR-9.6 vault generations read-only IPC
  - PR-9.7 vault settings read-only modal UI
  - PR-9.8 vault refresh IPC + `Imported Build2` smoke fixture + 강제 갱신 UI
- **M7 BETA 출시 후보**
  - PR-10.1 RePoE passive tree text override 분리 + fallback/toggle 테스트
  - PR-10.2 Tree node `statLines` contract + 상세 hover tooltip + Imported Build2 회귀 검증

---

## PR-ETC 완료 이력

- `5fcdad3 fix(POB): POB 원본 계약과 계산 표시 보정`
  - Tree / Items / Skills / Calcs snapshot runtime assertion
  - PoB 원본 enum/option 계약 추가
- `1eae785 test(POB): POB 연동 기능 추가 ETC-1`
  - Imported Build2 기반 Lua 회귀 테스트
  - Skill Hit Damage 라벨 밀림(`old:`/`ire:`/`haos:`)과 빈 값 표시 왜곡(`-%`, `- to -`) 검증
- `447dd94 fix(POB): POB 연동 기능 추가 ETC-2`
  - Calcs SkillSelect 상단 전체 폭 배치
  - source-order 보존 masonry 균등 분배
  - 현재 필터 내 카드 즐겨찾기 정렬 helper
  - Hit Damage standalone `-` 및 `calcs.breakdown` payload shape 검증
- `40d76e4 fix(POB): POB 연동 기능 추가 ELSE-15`
  - `CalcSectionControl.lua` 원본처럼 calcs cell formatter 에 `colData` 전달
  - `section:FormatStr` fallback 추가
  - Attributes/Life/Mana/Resists/Other Effects/Attack/Cast Rate blank 표시 보정

---

## PR-N 완료 이력

- PR-N.1 `044d9ae` workspace skeleton + `pob-ui` 독립 빌드 경로
- PR-N.2 `2bb3670` `pob-ui` renderer asset boundary cleanup
- PR-N.3 `13cb3d0` `pobVault` / `pobSession` cycle cleanup
- PR-N.4 `cde8966` `shared` package move
- PR-N.5a `bc3e6bb` `pob-repoe` package move
- PR-N.5b `3032f28` `pob-vault` package move
- PR-N.6 `bdda47f` `pob-bridge` package move
- PR-N.7 `396d9d8` `pob-ui` source move
- PR-N.8a `1bc5a63` wrapper package identity + namespace/state contract
- PR-N.8b `bbfee23` standalone Electron main/preload build pipeline
- PR-N.8c `f7302b7` wrapper install-location/config adapter wiring
- PR-N.8d `94c7e05` last build/component restore + unsaved navigation confirmation
- PR-N.9 `4c04e0d` `pob-headless-glue` resource package move
- PR-N.10a `dc3d40e` launcher package source move
- PR-N.10b `a1fa749` electron-builder `extraResources` path guard
- PR-N.11 `055d961` workspace package LICENSE files
- PR-N.12a `d7daa45` PR workflow test gate
  - `.github/workflows/pr-check.yml` 에 `npm test` 추가
  - `packages/shared/src/githubWorkflowCommands.test.ts` 로 PR workflow 명령 순서와 RePoE CDN workflow package path 검증
  - Windows 검증: focused test, `npm run lint`, `npm test`, `npm run build:check`
  - 추가 확인: `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run build`, `npm run dev` startup smoke
- PR-N.12b `d88c6f3` launcher menu label + 수동 검증 closeout
  - 런처 좌측 메뉴 라벨을 `PoB Unofficial Wrapper` 로 변경
  - 긴 라벨 overflow 경계 보정
  - `PobLaunchButton` label/click/visibility 회귀 테스트 추가
  - 사용자 수동 검증: wrapper window open, BuildListView, 빌드별 로드, 탭 전환 정상
  - Windows 검증: focused test, `npm run lint`, `npm test`, `npm run build:check`

`pob-ui-build.yml` artifact workflow 는 release 동봉 목적이 아니므로 PR-N 에서 보류하고, 향후 `pob-ui` 레포지토리 분리 시 별도 정의한다.

---

## PR-11~PR-20 완료 이력

- PR-11 `8fc34e9` Imported Build2 parity
  - Imported Build2 기준 Tree / Skills / Items / Calcs / Party 표시 데이터, 라벨, tooltip 계약을 점검하고 주요 parity gap을 보정했다.
  - Windows 검증: `npm run lint`, `npm test`, `npm run build:check`
- PR-12 `04f42b0` Import / Export parity
  - PoB build code import/export와 character import 관련 read/write 계약, UI 상태, 원본 domain 보존을 정리했다.
  - Windows 검증: `npm run lint`, `npm test`, `npm run build:check`
- PR-13 `67e8c1c` Notes Markdown templates
  - Notes tab과 template 관리 흐름, Markdown 표시/편집 UX를 확장했다.
  - Windows 검증: `npm run lint`, `npm test`, `npm run build:check`
- PR-14 `5d87431` Legacy / Renewed UI mode foundation
  - Legacy/Renewed UI mode 기반, UI mode switch, mode별 렌더링 경계를 정리했다.
  - Windows 검증: focused test, `npm run lint`, `npm test`, `npm run build:check`
- PR-15 `1bdffd9` RePoE data replacement
  - RePoE 데이터 대체 범위를 확장하고 item/gem/stat/tree 표시 번역과 다국어 검색 기반을 보강했다.
  - Windows 검증: focused test, `npm run lint`, `npm test`, `npm run build:check`
- PR-16 `b8ecef9` Passive tree precision
  - Passive Tree node/connector/path/allocation 표시 정밀도와 원본 PoB 계약 회귀를 보강했다.
  - Windows 검증: focused test, `npm run lint`, `npm test`, `npm run build:check`
- PR-17 `b246d9c` Tree resource caching
  - Tree resource manifest/cache, DDS/PNG resource load, warm-return 성능 기반을 정리했다.
  - Windows 검증: focused test, `npm run lint`, `npm test`, `npm run build:check`
- PR-18 `9466ec1` Build Explorer UX
  - Build Explorer metadata, folder/tree UX, side panel 상태와 빌드 선택 흐름 polish를 마감했다.
  - Windows 검증: focused test, `npm run lint`, `npm test`, `npm run build:check`
- PR-19 `b2092a1` Wrapper UI polish
  - current-plan 잔여작업을 PR-19로 승격해 wrapper layout, Tree/Items/Calcs/Notes UX, parser regression을 처리했다.
  - Windows 검증: PR-19.18 focused parser tests, `npm run lint`, `npm test`, `npm run build:check`
- PR-20 `826859e` RePoE display coverage follow-up
  - RePoE/display translation coverage, Skills/Items search bilingual display, Config/metadata/main skill/socket group 번역 coverage를 보강했다.
  - Tree 성능 계측과 hidden Electron agent harness를 추가하고 build switch session isolation, translation cache, hidden tab preload를 적용했다.
  - Tree/Skill/Item tooltip metadata와 asset-backed header/separator renderer, Item tooltip overlay 회귀를 보정했다.
  - Calcs visual/overflow, Items DB localized row projection, wrapper UI state persistence, active build delete guard, Korean item copy parser를 마감했다.
  - Windows 검증: `npm run dev:agent` with `POE2_AGENT_SECOND_BUILD_NAME="Unnamed build"`, `npm run lint`, `npm test`, `npm run build:check`

---

## PR-ELSE 완료 이력

- PR-ELSE.1 `2320c58` Build mode navigation + Configuration modal
- PR-ELSE.2 `16404e7` Items detail tooltip parity
- PR-ELSE.3 `3b1f41b` Items detail viewer/editor switch
- PR-ELSE.4 `a9e13ac` Import/Export Build modal
- PR-ELSE.5 `ef3ea2e` Main Skill Summary read RPC + contract
- PR-ELSE.6 `5e6af13` Main Skill Summary read-only UI
- PR-ELSE.7 `2eda9d2` Main Skill Summary resize/collapse
- PR-ELSE.8 `1b0df7a` Build Metadata read RPC + contract
- PR-ELSE.9 `dcd6eb6` Build Metadata write RPC + confirmation contract
- PR-ELSE.10 `c4c3706` Build Metadata editable top controls
- PR-ELSE.11 partial `08af32c` Party read-only snapshot + UI
- PR-ELSE.12 `3406311` Party interaction RPC + UI
- PR-ELSE.13 `6630d25` Build action split + icon asset hotfix
- PR-ELSE.14 `8c3ca40` Main Skill Summary height cap hotfix

PR-ELSE.11 의 tooltip/data parity 잔여 항목, PR-ELSE.15~17 은 아직 handoff 잔여 작업에 남아 있다.

---

## 공통 검증 패턴

완료된 각 코드 sub-step 은 Windows PowerShell 기준으로 아래 중 해당 범위를 검증한 뒤 코드 변경분만 커밋했다.

- `npm run lint`
- `npm test`
- `npm run build:check`
- 필요 시 focused `npm test -- <path>`
- PR-N 패키징/독립 빌드 단계: `npm run build`, `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run build --workspace=pob-unofficial-wrapper`

계획 문서(`docs/current-plan.md`, `docs/pob-handoff.md`, `docs/plan/PR-*.md`, `docs/check/**`)는 계속 unstaged 로 유지한다.

# PoB i18n 통합 — 핸드오프 문서

> 작성일: 2026-05-26 · 작성자: Claude (Opus 4.7)
>
> **본 문서를 읽는 당신에게**: 새 세션 / 다른 에이전트로 본 통합 작업을 이어받았다면, **이 문서부터 끝까지 읽으세요**. 30분 안에 작업 재개 가능하도록 설계됨.

---

## 0. 30초 컨텍스트

`POE2-unofficial-launcher` (Electron + React 19 + Vite, AGPL-3.0) 에 **POB i18n (BETA)** 기능을 추가하는 통합 작업. 사용자가 비공식 런처 좌측 메뉴에서 "POB i18n (BETA)" 클릭 → 별도 BrowserWindow → 한국어 PoB(Path of Building) UI 가 떠서 빌드 작업 가능.

핵심 메커니즘: launcher 가 LuaJIT 을 번들하고, 사용자 머신의 공식 PoB 설치본 Lua 코어를 헤드리스로 spawn 해서 JSON-RPC 로 호출. UI 는 React 로 PoB 의 모든 화면을 1:1 한국어 포팅.

**현재 상태 (2026-05-26)**: 계획 + PoC 완료. 코드 작업은 PR-1 부터 시작 대기.

---

## 1. 30분 안에 작업 재개하는 순서

1. **본 문서** 끝까지 (~10분)
2. **메인 계획서** [pob-integration-plan.md](pob-integration-plan.md) (~10분) — 개요/아키텍처/결정 사항
3. **사용자 미결정 항목** [pob-integration-review.md](pob-integration-review.md) (~3분) — 현재 모두 결정 완료, PoC 잔여 2건만 PR 진행 시점 처리
4. **다음 작업할 PR 파일** `plan/PR-N.md` (~7분) — 작업 항목/종료 기준/검증 시나리오
5. 작업 시작

각 PR 파일은 **self-contained** — 그 PR 만 보고 작업 가능하도록 설계됨. 단 처음 한 번은 본 문서 + plan 메인 + 해당 PR 3개를 같이 읽어야 컨텍스트가 잡힘.

---

## 2. 진행 상황 체크리스트

> PR 머지 시 `[ ]` → `[x]` 갱신. **🎯 M3 (PR-6) 완료 시 사용자에게 알림** (커뮤니티 캡쳐 공유 용).

### 완료

- [x] **M0 PoC 통과** (2026-05-26) — LuaJIT 2.1.1720049189 + HeadlessWrapper.lua 헤드리스 부팅 exit 0 확인
- [x] 사용자 결정 사항 16건 모두 확정 (plan §5 표)
- [x] 계획서 + PR 분할 + 핸드오프 문서 작성

### 진행 대기

- [x] **PR-1** 좌측 진입 버튼 + InstallerModal (UI only) → [plan/PR-1.md](plan/PR-1.md)
- [x] **PR-2** PoBLocator 실제 구현 + 통합 → [plan/PR-2.md](plan/PR-2.md)
- [x] **PR-3** BuildsScanner + BuildListView 1:1 포팅 + i18n 골격 → [plan/PR-3.md](plan/PR-3.md)
  - 🎯 머지 후 **M1: UI 첫 진입** 달성
- [x] **PR-3-2** BuildListView UI 개선 — Explorer 패널 + 자동 저장 흐름 → [plan/PR-3-2.md](plan/PR-3-2.md)
- [x] **PR-4** PoBVault + LuaJIT 번들 + ipc_bridge + 최소 RPC → [plan/PR-4.md](plan/PR-4.md)
- [x] **PR-5** BuildEditView + Lua 세션 lazy spawn + Deflate/Inflate IPC override → [plan/PR-5.md](plan/PR-5.md)
  - 🎯 머지 후 **M2: BUILD 진입 가능** 달성
- [ ] **PR-6** PoB UI mode 순차 포팅 (sub-PR 5개) → [plan/PR-6.md](plan/PR-6.md)
  - [x] PR-6.1 Tree 탭 (에셋 렌더링, 노드/선 표시)
  - [ ] PR-6.2 Items 탭
  - [ ] PR-6.3 Skills 탭
  - [ ] PR-6.4 Calcs 탭
  - [ ] PR-6.5 Config 탭
  - 🎯🎯🎯 **PR-6.5 머지 직후 사용자에게 알림** (M3: PoB UI 골격 완성). 5개 mode 콜라주 + PoB 원본 비교 스크린샷 첨부.
- [ ] **PR-7** RePoE 캐시 + GitHub Actions 주기 검증 → [plan/PR-7.md](plan/PR-7.md)
  - 🎯 머지 후 **M4: RePoE 통합** 달성
- [ ] **PR-8** Ctrl+C 파서 + 빌드 코드 라운드트립 검증 → [plan/PR-8.md](plan/PR-8.md)
  - 🎯 머지 후 **M5: 빌드 코드 호환** 달성
- [ ] **PR-9** ContractValidator + Vault 세대 관리 + UI 배너 → [plan/PR-9.md](plan/PR-9.md)
  - 🎯 머지 후 **M6: Fallback 검증** 달성
- [ ] **PR-10** Lua 데이터 점진 대체 #1 (트리 텍스트) → [plan/PR-10.md](plan/PR-10.md)
  - 🎯 머지 후 **M7: BETA 출시 후보** 달성
- [ ] **PR-N** Monorepo 분리 (npm workspaces) → [plan/PR-N.md](plan/PR-N.md)
  - 🎯 M7 이후 최종 PR. `pob-ui` 독립 빌드 가능 상태까지 검증

---

## 3. 핵심 결정 사항 (요약 — 상세는 plan §5)

| 결정              | 한 줄                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LuaJIT 호스트** | launcher 가 `resources/lua/luajit.exe` (~300KB, MIT) 번들. PoB 본체 exe 활용 불가 (PoC-0.1a 실증)                                                                         |
| **PoB Vault**     | launcher 가 사용자 InstallLocation 을 직접 spawn 안 함. 항상 `userData/pob-vault/<version>/` 사본만 spawn (D.2)                                                           |
| **레지스트리**    | 기존 [src/main/utils/registry.ts](../src/main/utils/registry.ts) 재사용 + `getPobInstallPath()` 추가. 의존성 0                                                            |
| **모노레포**      | 실제 `packages/` 이동은 PR-10(M7 BETA 출시 후보) 직후 최종 PR-N. 단, PR-3-2 ~ PR-10 은 아래 "패키지 분리 대비 규칙"을 지켜 결합도 상승을 막음. pnpm 마이그레이션은 후순위 |
| **다국어**        | ko + en. en 은 PoB 원본 그대로, ko 는 임의 번역                                                                                                                           |
| **i18n JSON**     | 평면 (`{"buildList.toolbar.new": "..."}`). 게임 데이터는 절대 넣지 않음 (RePoE 영역)                                                                                      |
| **UI 포팅**       | PoB Lua UI 1:1, 추가/제거 금지 (활성 컨트롤 모두 포팅). 디자인 톤만 launcher 와 일치                                                                                      |
| **우클릭**        | BuildListView 에 우클릭 메뉴 없음. PoB 의 RMB=Paste 도 안 가져옴                                                                                                          |
| **트리 렌더링**   | React Canvas 자체 렌더 (PR-6.1 에서 fzstd + 자체 DDS 디코더 구현). 패스 계산은 PoB Lua RPC. 트리 자산은 vault `TreeData/<version>/` fs 사용 — RePoE 완전 대체는 §5.3 후속 |
| **빌드 코드**     | ipc_bridge 가 Inflate/Deflate 를 Node zlib 으로 RPC redirect. PoB Lua 무변경                                                                                              |
| **Electron 보안** | 새 BrowserWindow: `contextIsolation: true / nodeIntegration: false / sandbox: true`                                                                                       |
| **텔레메트리**    | 없음. exception 만 launcher `logger.error()` 로 흘려 오류 보고서 표시                                                                                                     |
| **라이선스**      | launcher 본체 AGPL-3.0. PoB 래핑 모듈 (pob-bridge / pob-ui / pob-headless-glue / pob-vault / pob-repoe) 은 PoB MIT 상속                                                   |
| **대상 게임**     | **PoE2 만 먼저** (Q10). 좌측 메뉴 항목은 `activeGame === "POE2"` 일 때만 노출. PoE1 (PoB Community PoE1) 통합은 후순위                                                    |

---

## 4. 본 통합 특수 규칙 (CLAUDE.md 보강)

### 4.1 WSL/Windows 분기 (CLAUDE.md 기존 규칙)

- WSL: lint / type check / git / 문서 편집
- Windows pwsh: `npm install`, `npm run build`, `npm run dev`, `npm test`, **모든 spawn 작업** (PoB Lua, BuildEditView 통합 테스트)
- WSL 에서 `npm install` 절대 X — npm 이 POSIX 심볼릭만 만들고 Windows .cmd wrapper 누락 → 다음 빌드 깨짐

### 4.2 PoB 코어를 절대 패치하지 않는다

- 사용자 머신 InstallLocation 에 파일을 쓰지 않음 (vault 사본도 InstallLocation 의 무결성 복제만)
- launcher 의 ipc_bridge.lua / HeadlessWrapper.lua 는 `resources/lua/` 에서만 보관, 절대경로로 spawn 인자 전달
- 라이선스/사용자 PC 오염 회피 + D.2 격리 보장

### 4.3 1:1 포팅 원칙 (plan §4)

- 각 mode PR 마다 PoB 원본 스크린샷 + 포팅 화면 나란히 첨부
- 빠진 컨트롤 있으면 reject
- 새 버튼/기능 추가 금지 — 후순위 백로그로

### 4.4 i18n 도메인 분리

- `src/pob/i18n/{ko,en}.json` 에는 **UI 자체 문자열만** (버튼명/메뉴/탭 라벨)
- 게임 데이터 (아이템 이름, 스탯, 모드 텍스트, 노드 이름) 는 RePoE 캐시 (`pob-repoe`) 전용
- 두 도메인 혼합 시 ESLint 룰 또는 PR 리뷰 체크리스트로 잡음

### 4.5 패키지 분리 대비 규칙 (PR-3-2 ~ PR-10)

실제 npm workspaces 전환은 PR-N 이지만, 그 전 PR 들도 아래 경계를 지켜야 한다. 목표는 PR-N 을 "설계 변경"이 아니라 "파일 이동 + 빌드 설정" PR 로 만드는 것.

- 새 PoB 코드는 미래 package 소유권에 맞춰 둔다: `src/pob/` = `pob-ui`, `src/main/services/pob*` 및 PoB 전용 service 파일 = 각 PoB package 후보, `src/shared/` = 공유 타입/순수 유틸만.
- `src/pob/` 는 launcher main/renderer 내부 구현을 직접 import 하지 않는다. preload/IPC contract 와 `src/shared` 타입만 경계로 사용한다.
- PoB service 코드는 React/DOM/App UI 에 의존하지 않는다. Electron, filesystem, logger, path 처럼 환경 의존이 필요한 경우 launcher 쪽에서 주입 가능한 얇은 adapter 로 둔다.
- package 경계를 넘는 상대경로 import 를 늘리지 않는다. 새 공유 타입은 `src/shared` 로 올리고, 임시 상대경로가 필요하면 PR-N 이동 매핑에 남긴다.
- 라이선스 경계도 지금부터 지킨다. launcher 전용 AGPL 코드와 PoB MIT 상속 후보 코드를 같은 파일에 섞지 않는다.
- 각 PR 종료 전 새 PoB 파일을 PR-N 매핑에 넣을 수 있는지 확인한다. 애매한 파일은 handoff 에 "미래 package 후보"를 기록한다.

### 4.6 Fallback 우선

- PoB 가 깨지면 launcher 도 함께 망가지면 안 됨
- ContractValidator 가 smoke test 실패 → 직전 정상본 유지 + 노란 배너
- 사용자 옵트아웃 토글 제공 ("자동 vault 갱신")

### 4.7 계획 문서는 커밋 대상 외 (사용자 NERDHEAD 명시)

- `docs/pob-integration-plan.md`, `docs/pob-integration-review.md`, `docs/pob-handoff.md`, `docs/plan/PR-*.md` 는 **언스테이지 상태로 유지**. 사용자가 별도로 관리.
- 각 PR 작업 시 **코드 변경분만 커밋/푸시**. 본 PR 의 진행 중 계획서 수정이 있더라도 git add 하지 말 것 (사용자가 수동 관리).
- PR 진행 상황 체크리스트 (§2) 갱신은 본 문서를 직접 편집해서 표시하되, 커밋에는 포함시키지 않는다.
- 세션 종료 시 계획 문서들의 상태가 `M` (modified) 으로 남아있어야 정상 — 절대 stash/checkout 등 destructive 작업으로 되돌리지 말 것.

### 4.8 PR 종료 시 다음 세션 안내 문구 출력 (사용자 NERDHEAD 명시)

- 현재 PR 작업이 끝나면 (모든 종료 기준 통과 + Windows pwsh 검증 OK), 에이전트는 **다음 PR 을 다른 세션에서 이어가도록 사용자에게 복사·붙여넣기용 prompt** 를 출력한다.
- 출력 형식 (예시 — PR-1 완료 후 PR-2 안내):

  ```
  ## 다음 세션 시작 prompt (복사해서 새 세션에 붙여넣기)

  docs/pob-handoff.md + docs/plan/PR-2.md 읽고 PR-2 진행.
  PR-1 은 머지 완료 가정. handoff §2 체크리스트의 PR-1 을 [x] 로 갱신.
  (규칙: dep 추가 전 사용자에게 물어볼 것, Windows 검증 명령은 정리해서 사용자에게 넘길 것,
   plan §5 와 다른 판단 필요 시 작업 멈추고 사용자에게 물어볼 것,
   계획 문서들은 계속 unstage 유지 — handoff §4.7)
  ```

- 안내 출력은 코드 변경 + 검증 명령 정리 다음, 응답 마지막 부분에 둔다.
- 다음 PR 번호는 본 문서 §2 "진행 대기" 의 첫 [ ] 항목.

---

## 5. 후순위 백로그

본 통합 BETA 출시 후 또는 별도 트랙. 현재 PR 분할에 포함되지 않음.

### 5.1 UX 확장

- [ ] 트레이 메뉴에 POB i18n 진입 추가 (Q4 의 옵션 B)
- [ ] 글로벌 핫키로 POB i18n 진입 (Q4 의 옵션 C)
- [ ] BuildListView 의 Explorer 식 우클릭 컨텍스트 메뉴 (Q9 의 옵션 C) — 사용자 피드백 받아서 결정
- [ ] BuildListView 에 DPS / PlayerStat 메타 표시 (D.1 의 옵션 C — hover/select 시 정확 메타)

### 5.2 i18n 확장

- [ ] ja / ru 다국어 활성화 (Q5 의 ja/ru 키만 정의되어 있음 — 값 채우기)
- [ ] 한글 번역의 인게임 용어 정합 (현재 임의 번역) — Q5 사용자 명시: "나중에 후순위에서 인게임에서 쓰는 용어랑 일치시키면 될 것 같음"

### 5.3 데이터 점진 대체 (plan §5 Phase 5.5, PR-10 의 후속)

- [ ] #2 스탯 description 템플릿 — `Data/StatDescriptions/*` (영문) → RePoE `stat_translations.json`
- [ ] #3 유니크 아이템 이름/설명 — `Data/Uniques/*.lua` → RePoE 유니크 매핑
- [ ] #4 젬/스킬 설명 — `Data/Skills/*.lua` → RePoE 스킬 매핑
- [ ] #5 모드 텍스트 — `Data/ModX/*.lua` (구조 복잡, 영구 미대체 가능)

### 5.4 패시브 트리 정밀화

- [x] ~~옵션 A 마이그레이션 — React Canvas/SVG 로 완전 자체 구현~~ — PR-6.1 에서 [src/pob/utils/DdsDecoder.ts](../src/pob/utils/DdsDecoder.ts) (fzstd + BC1/BC3/BC7/RGBA8 자체 디코딩 + WebGL 업로드) + [src/pob/views/PassiveTreeView.tsx](../src/pob/views/PassiveTreeView.tsx) (React + Canvas 2D 렌더) 로 자체 렌더링 달성. 단 트리 데이터 소스는 여전히 vault 의 `TreeData/<version>/` 자산을 fs 로 읽음 — RePoE 로 완전 대체하는 작업은 §5.3 의 후속 트랙.
- [ ] PoB connector quad/bezier 1:1 포팅 — `spec.tree.connectors[].vert[state]` 의 4-vertex quad 데이터를 RPC 로 받아 곡선/Active·Intermediate·Normal 상태별 색까지 PoB 시각과 동일하게. PR-6.1 시점은 Orbit type 만 호 (arc) 보간, 그 외는 직선 연결.
- [ ] 노드 스프라이트/아이콘 (`spec.tree.assets`, `spec.tree.nodeOverlay`) — PR-6.1 시점은 DDS 디코딩으로 아이콘/프레임 표시까지 됨. 미커버: keystone/notable 의 `activeEffectImage` 후광, ascendancy 시작점 스프라이트 세부
- [ ] 노드 툴팁 (이름 + sd 라인 + mod 효과)
- [ ] 호버 시 할당 가능 경로 점선 표시 (PoB `node.path` 활용)
- [ ] Ctrl+클릭 줌, PAGE UP/DOWN, ALT+휠 allocMode 등 PoB 추가 단축키
- [ ] 검색 (PoB `DoesNodeMatchSearchParams`) + 마스터리 선택 모달
- [ ] Find Timeless Jewel 기능 포팅 (PoB 의 보조 도구)
- [ ] **트리 리소스 캐싱** — 현재 [src/pob/views/PassiveTreeView.tsx](../src/pob/views/PassiveTreeView.tsx) 의 DDS/PNG 로딩 effect 가 Tree 탭 재진입 / 다른 빌드 Open 시마다 전부 재디코딩됨 (cold start ~수 초). 같은 treeVersion / 같은 ddsCoords 면 디코딩 결과 (`Map<string, HTMLCanvasElement>`) 를 모듈 스코프 또는 IndexedDB 로 캐시. 빌드 전환 시 변하는 것은 노드 alloc 상태뿐이라 frame/icon/배경 자산은 재사용 가능. 무효화 키: `treeVersion` + `vaultPath`. 메모리 캐시는 LRU (마지막 2개 트리 버전) 권장.
- [ ] **DDS 디코딩 병렬화** — 현재 `ddsByFile.forEach(... fetch().then(decodeDdsZstLayers))` 는 Promise 가 동시에 시작되지만 [src/pob/utils/DdsDecoder.ts](../src/pob/utils/DdsDecoder.ts) 의 WebGL 컨텍스트 / `program` / `positionBuffer` 가 모듈 전역 단일 인스턴스 → 실제로는 직렬화됨. 옵션: (1) `decodeRgbaLayer` 처럼 CPU 디코더만 쓰는 경로는 Web Worker pool 로 분산, (2) WebGL 경로는 OffscreenCanvas + Worker 당 별도 GL 컨텍스트, (3) 가장 단순한 1차안: `setImages` 가 layer 단위로 들어오는 현재 패턴을 유지하되 `decodeDdsZstLayers` 가 `requestAnimationFrame` 사이에 layer 를 yield 해서 UI 블로킹만 제거. 측정 먼저: 실제 critical path 가 fetch 인지 zstd decompress 인지 BC7 GPU upload 인지 Chrome DevTools Performance 로 확인 후 우선순위 결정.

### 5.5 성능

- [ ] Cold start 측정 + 최적화 (C.3 결정에서 후순위로 미룸)
  - 참고치: BuildListView 첫 페인트 < 500ms / BuildEditView Lua ready < 3s
- [ ] 트리 탭 재진입 / 빌드 전환 시 리소스 재로드 비용 — 상세 항목은 §5.4 "트리 리소스 캐싱" / "DDS 디코딩 병렬화" 참조

### 5.6 인프라

- [ ] pnpm 마이그레이션 검토 (Q2 결정에서 후순위)
- [ ] PoBVault 의 압축 옵션 (현재 미압축 directory) — 디스크 사용 시 옵션
- [ ] PoB 의 자체 Update.exe 사용자 트리거 흐름 보강 (PR-9 5.6 항목)

### 5.7 외부 연동

- [ ] PoE2 거래소 도매인별 (Daum, GGG, ru) 검색 API 통합 — Gemini 초안 §3 의 후속
- [ ] PoB Archives 외부 빌드 공유 (PoB 의 dead code `showPublicBuilds` 활성화 검토)

### 5.8 PoE1 PoB 통합 (Q10 후순위)

- [ ] PoB Community (PoE1) 도 동일 아키텍처로 통합. 진입 가드를 `activeGame === "POE1" | "POE2"` 로 확장
- [ ] PoE1 전용 레지스트리 키 (`Path of Building Community`) + InstallLocation
- [ ] PoE1 PoB 의 데이터/Modules 구조 차이 점검 (PoE2 와 다를 수 있음)
- [ ] PoE2 통합 BETA 안정화 (M7 이후) 시점에 검토

---

## 6. 사용자 (NERDHEAD) 소통 채널

- 사용자 본업: 비공식 런처 단독 개발자, 패키지 분리 경험 적음
- 사용자가 명시한 알림 지점: **PR-6 (M3) 완료 시 진행 상황 캡쳐**해서 알리면 커뮤니티에 공유 예정
- 사용자가 사용하는 환경: WSL2 (Linux 6.6, 한국어) + Windows 11 (G:\ 에 PoB 설치, OneDrive 활성 — Documents 리다이렉트)

### 작업 중 사용자 확인이 필요한 시점

1. **dep 추가 전**: CLAUDE.md "Installing dependencies without listing them first" 금지 — 새 npm 패키지 추가 시 반드시 사용자 승인
2. **외부 행동 전**: `npm run build` 결과 패키징, git push, PR 생성 모두 사용자 승인
3. **vault 디스크 사용량 변경**: 세대 N 기본 2 가 ~630MB. 1~5 범위 외 변경 시 확인
4. **PoB 호환성 회귀 발생**: smoke test 실패 시 plan §5 결정 우선, 의심 시 사용자 알림

---

## 7. 자주 막힐 만한 문제 + 해결

### 7.1 "luajit 이 lcurl 로드 실패"

- 원인: cwd 가 InstallLocation (또는 vault active) 이 아니거나 `LUA_PATH` 미설정
- 해결: PR-4 의 spawn env 참고 — cwd 와 `LUA_PATH=.\?.lua;.\?\init.lua;.\lua\?.lua;.\lua\?\init.lua` 둘 다 필수

### 7.2 "HeadlessWrapper.lua 가 없다"

- PoB 설치본에는 NSIS 가 제외해서 안 들어있음 (PoC 확인)
- 해결: launcher 가 `resources/lua/HeadlessWrapper.lua` 에 source repo 사본 번들 (PR-4)

### 7.3 "사용자 Builds 폴더를 못 찾는다"

- OneDrive 리다이렉트 케이스. `os.homedir() + '/Documents'` 는 틀린 답
- 해결: Electron `app.getPath('documents')` 사용 (PR-3 BuildsScanner)

### 7.4 "InstallLocation 값이 따옴표 포함"

- 사용자 머신 실측: `"G:\..."` 형태로 따옴표 포함
- 해결: registry 값 trim — PR-2 의 `unquoted = raw.replace(/^"|"$/g, "")`

### 7.5 "Pastebin 빌드 코드가 import 안 된다"

- HeadlessWrapper 의 `Deflate`/`Inflate` 가 noop (빈 문자열만 반환)
- 해결: ipc_bridge 가 두 함수를 Node zlib 으로 redirect (PR-5)

### 7.6 "WSL 에서 vitest 가 실패한다"

- WSL 의 unrs-resolver / @rolldown/binding-linux-x64-gnu 가 Windows 빌드와 충돌
- 해결: vitest 는 Windows pwsh 에서만 (CLAUDE.md 규칙)

### 7.7 "Lua RPC 호출이 timeout"

- 30s 타임아웃 초과 → 보통 PoB Lua 가 에러 출력 후 멈춤
- 해결: ipc_bridge.lua 의 `pcall` + stderr 로 에러 메시지 출력 후 자동 재spawn (PR-4)

---

## 8. 참고 자료

### 8.1 본 통합 문서

- [pob-integration-plan.md](pob-integration-plan.md) — 메인 계획 (개요/아키텍처/결정/마일스톤)
- [pob-integration-review.md](pob-integration-review.md) — 미결정 / 사용자 확인 항목
- [plan/PR-1.md](plan/PR-1.md) ~ [plan/PR-N.md](plan/PR-N.md) — PR 별 self-contained 작업 명세

### 8.2 본 launcher 관련

- [../CLAUDE.md](../CLAUDE.md) — launcher 코딩 규칙 (WSL/Windows 분기 등)
- [../src/main/utils/registry.ts](../src/main/utils/registry.ts) — PR-2 에서 재사용
- [../src/main/main.ts](../src/main/main.ts) — 좌측 패널 진입 버튼 위치 (1191-1212 라인)

### 8.3 PoB 관련 (NERDHEAD-lab fork, D:\ clone)

- `D:\project_poe2\PathOfBuilding-PoE2-KR\src\HeadlessWrapper.lua` — launcher 가 번들 (PR-4)
- `D:\project_poe2\PathOfBuilding-PoE2-KR\src\Modules\BuildList.lua` — BuildListView 1:1 포팅 원본 (PR-3)
- `D:\project_poe2\PathOfBuilding-PoE2-KR\src\Modules\BuildListHelpers.lua:48-51` — 메타 추출 패턴 (PR-3)
- `D:\project_poe2\PathOfBuilding-PoE2-KR\src\Modules\` — PoB 의 각 mode 코드 (PR-6 sub-PR 들)
- `D:\project_poe2\PathOfBuilding-PoE2-KR\docs\pob_kr_i18n_spec.md` §2.A — LOCALE_HEADER_DICTIONARIES (PR-8)
- `D:\project_poe2\PathOfBuilding-PoE2-KR\.github\workflows\test.yml` — PoB CI 의 `luajit HeadlessWrapper.lua` 사용 예시

### 8.4 외부

- RePoE: https://repoe-fork.github.io/poe2/
- ggpk version: https://ggpk.exposed/version?poe=2
- LuaJIT release: https://github.com/LuaJIT/LuaJIT 또는 winget `DEVCOM.LuaJIT`
- Electron 보안 가이드: https://www.electronjs.org/docs/latest/tutorial/security

---

## 9. 본 문서 사용법

1. **세션 시작 시**: 본 문서 + plan 메인 + 현재 작업 PR 파일 3개를 같이 열어두기
2. **작업 도중**: 막힐 때 §7 의 "자주 막힐 만한 문제" 먼저 확인
3. **커밋 정책 (§4.7)**: 계획 문서 4종은 커밋하지 않음. 코드 변경만 커밋
4. **PR 머지 후**: §2 진행 상황 체크리스트 갱신. M3 (PR-6) 도달 시 사용자 알림 잊지 말 것
5. **PR 종료 시 (§4.8)**: 다음 세션용 복사·붙여넣기 prompt 를 응답 마지막에 출력
6. **새 결정 사항 발생 시**: review 에 항목 추가 → 사용자 답변 후 plan §5 표로 이동 + 본 문서 §3 갱신
7. **세션 종료 시**: 본 문서 §2 체크리스트 + 다음에 할 일 메모 (해당 PR 파일의 "진행 상태" 섹션 추가 가능)

---

> 본 문서는 v1.0. 본 통합이 진행됨에 따라 §2 체크리스트와 §5 백로그가 갱신됨.

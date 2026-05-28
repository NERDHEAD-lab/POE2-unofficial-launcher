# PoB i18n (BETA) — 비공식 런처 통합 작업 계획서

> 작성일: 2026-05-26 · 최종 갱신: 2026-05-26 (분할 슬림화) · 작성자: Claude (Opus 4.7)
> 검증 기준: `/mnt/d/project_poe2/PathOfBuilding-PoE2-KR` 실제 소스 + 본 launcher 소스
>
> **➡️ 미결정 / 사용자 확인 항목**: [pob-integration-review.md](pob-integration-review.md)
> **➡️ 다른 에이전트/세션이 작업 이어서 진행**: [pob-handoff.md](pob-handoff.md) 부터 읽기
> **➡️ PR 별 상세 작업 내용**: [plan/PR-1.md](plan/PR-1.md) ~ [plan/PR-N.md](plan/PR-N.md)
>
> 본 문서는 **개요 + 필수개념 + PR 인덱스** 만 유지. PR 별 작업 항목은 `plan/PR-*.md` 참조.

---

## 0. 한 줄 요약

비공식 런처 좌측 패널에 **POB i18n (BETA)** 진입 버튼 (활성 게임이 **POE2 일 때만 노출**, Q10) → 별도 BrowserWindow → **BuildListView** (사용자 PoB Builds 폴더 표시) → New 클릭 시 BuildEditView (PoB BUILD mode). PoB Lua UI 모든 요소를 **임의 추가·제거 없이 1:1 포팅**, 디자인 톤만 launcher 와 일치.

핵심 연산은 사용자 머신의 공식 PoB 설치본 Lua 코어를 **launcher 가 번들한 LuaJIT 으로 헤드리스 spawn**. PoB InstallLocation 을 직접 spawn 하지 않고 **검증된 사본(PoBVault) 만** cwd 로 사용 — PoB 업데이트로 IPC 가 깨져도 직전 정상본으로 자동 fallback.

UI 자체 문자열은 `i18n/{ko,en}.json` (평면 포맷). 게임 데이터 번역은 RePoE 캐시. 단계적으로 RePoE 가 커버 가능한 영역의 PoB Lua 데이터 스크립트만 점진 대체. 향후 launcher 를 monorepo 분리해 `pob-ui` 만 독립 빌드/배포 가능.

---

## 1. PoC 실측 결과 (2026-05-26 사용자 머신 `G:\Path of Building Community (PoE2)`)

본 세션에서 pwsh.exe 로 직접 실증:

### 1.1 PoB exe 헤드리스 진입 — **불가능** (PoC-0.1a)

- `Path of Building-PoE2.exe HeadlessWrapper.lua` → 메인 윈도우 GLFW 강제 실행
- 인자(아무 lua 파일, 인자 없음) 와 무관하게 **항상 동일하게 `Launch.lua` 실행**
- 임의 lua 스크립트 (`io.open` 트레이스) 를 인자로 넘겨도 PoB exe 가 읽지조차 않음
- 결론: PoB 본체 exe 활용 불가, **launcher 가 LuaJIT 외부 번들 필요**

### 1.2 레지스트리 (PoC-0.3)

- `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Path of Building Community (PoE2)`
- `InstallLocation` 값에 **따옴표 포함** (`"G:\..."`)
- `DisplayVersion = 0.15.0`
- HKLM 부재 (HKCU 우선 → HKLM fallback 순)

### 1.3 설치본 구조

- `src/`, `runtime/` 폴더 **없음** — 모든 Lua/DLL/Modules/Classes/Data 가 InstallLocation 루트에 평탄화
- `HeadlessWrapper.lua` **없음** (NSIS 인스톨러가 제외)
- 빌드 폴더는 OneDrive 리다이렉트일 경우 `C:\Users\<user>\OneDrive\문서\Path of Building (PoE2)\Builds\` → Node `os.homedir() + '/Documents'` 부적합, **Electron `app.getPath('documents')` 필수**

### 1.4 LuaJIT 호환성 — **통과** (PoC-0.1b)

LuaJIT 2.1.1720049189 (winget `DEVCOM.LuaJIT`, MIT) + cwd=InstallLocation + `LUA_PATH=.\?.lua;.\?\init.lua;.\lua\?.lua;.\lua\?\init.lua`:

- `require('lcurl.safe')`, `require('lua-utf8')`, `require('dkjson')` 모두 로드 OK
- D:\ source repo 의 `HeadlessWrapper.lua` 를 InstallLocation 에 복사 후 `luajit HeadlessWrapper.lua` 실행 → **exit code 0**
- stdout: `Loading main script... → Unicode support detected → Uniques loaded → Rares loaded → Startup time: 0 ms`
- "missing node <id>" 경고는 PoB 상위 버전과 사용자 설치본 트리 데이터 차이 — 런타임 영향 없음 (smoke test 통과 기준에서 무시)

### 1.5 빌드 XML 메타 분석 (D.1 근거)

사용자 머신 4개 빌드 (`Imported Build`, `Imported Build2`, `Unnamed build`, `Unnamed build2`) 첫 5줄 inspect:

- `<Build level="X" className="Y" ascendClassName="Z">` 형식 확인
- `<PlayerStat stat="AverageDamage" value="..."/>` 다수 노드가 XML 안에 캐싱됨 → DPS 도 fs 만으로 추출 가능 (Lua spawn 불필요)
- PoB [BuildListHelpers.lua:48-51](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/BuildListHelpers.lua#L48-L51) 가 실제 추출하는 메타는 `level + className + ascendClassName` 만 — DPS 는 BuildList 에 표시 안 함이 PoB 원본

### 1.6 PoB Deflate/Inflate 호출 패턴

`Inflate(common.base64.decode(code:gsub("-","+"):gsub("_","/")))` — 7군데 (CompareTab, ImportTab, PartyTab, Common, Main, Build, DataLegionLookUpTableHelper)

`base64` 는 Lua 내장 (`common.base64`), `Inflate`/`Deflate` 만 native 의존 → ipc_bridge 가 두 함수만 Node zlib 으로 redirect 하면 PoB 와 100% 동일 포맷 ([PR-5](plan/PR-5.md) 작업)

### 1.7 남은 검증

- **PoC-0.2** RePoE CDN 실재 ([PR-7](plan/PR-7.md) 시작 시 baseline)
- **PoC-0.4** 빌드 코드 라운드트립 ([PR-8](plan/PR-8.md) 시점)

---

## 2. 통합 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│ poe2-unofficial-launcher (Electron 메인창)                          │
│   좌측 패널 Section B 최상단 [POB i18n (BETA)] 버튼                 │
│   클릭 → IPC: pob:open                                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ BrowserWindow.create (보안 옵션 3종)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ POB i18n Window (별도 BrowserWindow, React UI)                      │
│   진입 화면: BuildListView (사용자 Builds 폴더의 리스트)            │
│   ┗━ New/Open → 라우팅: /build (BuildEditView)                       │
│   Renderer: i18next + React 19 + (launcher 스타일 재사용)           │
│   UI 자체 문자열은 i18n/{ko,en}.json (평면), RePoE 와 분리          │
│   Preload → ipcRenderer.invoke('pob:*')                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ IPC
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Main 프로세스 (packages/pob-bridge + pob-vault)                     │
│   PoBLocator     : 레지스트리 HKCU/HKLM InstallLocation 조회        │
│   PoBInstaller   : 미설치 시 모달                                   │
│   BuildsScanner  : userPath/Builds/ 의 *.xml + 폴더 트리 read       │
│                    (Lua spawn 없이 fs 만으로)                       │
│   PoBVault       : InstallLocation 의 검증된 스냅샷을 userData/     │
│                    pob-vault/<version>/ 에 보관                     │
│   PoBSession     : LuaJIT subprocess + JSON-RPC over stdio          │
│                    (BuildEditView 진입 시점에 lazy spawn)           │
│   ContractValidator : 버전 변경 감지 → smoke test → vault promote   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ child_process.spawn (stdin/stdout)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Headless Lua Host                                                   │
│   Process: <launcher>/resources/lua/luajit.exe (번들, MIT)          │
│   cwd:     userData/pob-vault/<version>/  (검증된 PoB 사본)         │
│   Bundled: <launcher>/resources/lua/HeadlessWrapper.lua             │
│            <launcher>/resources/lua/ipc_bridge.lua                  │
│            (PoB 설치본에는 HeadlessWrapper 없음 — 1.3 참조)         │
│   env:     LUA_PATH=.\?.lua;.\?\init.lua;.\lua\?.lua;.\lua\?\init.lua │
│   PoB src: vault 의 Modules/ Classes/ Data/ TreeData/               │
└─────────────────────────────────────────────────────────────────────┘
            ▲
            │ 단계적 대체 (RePoE 데이터 커버리지 확장 시)
            │
┌─────────────────────────────────────────────────────────────────────┐
│ RePoE Override Layer (점진적 추가)                                  │
│   PoB Lua 가 반환한 영문 ID/스탯 → RePoE 캐시의 다국어/최신 데이터  │
│   로 launcher 측에서 후처리 치환. 한 줄 toggle 로 비활성화 가능.    │
└─────────────────────────────────────────────────────────────────────┘
```

### 핵심 원칙 (D.2)

launcher 가 **사용자 InstallLocation 을 직접 spawn 하지 않는다**. 항상 vault 의 검증된 사본만 spawn. PoB 가 백그라운드에서 자체 Update.exe 로 업데이트되더라도 우리 세션은 영향받지 않음. 사용자가 명시적으로 trigger 한 경우에만 새 버전이 vault 로 promote.

### 모노레포 분리 (PR-N)

```
packages/
├── launcher/           ← 런처 본체 (AGPL-3.0)
├── pob-bridge/         ← PoBLocator, BuildsScanner, PoBSession (PoB MIT)
├── pob-ui/             ← React 앱 (PoB MIT, 독립 빌드 가능)
├── pob-headless-glue/  ← luajit.exe + HeadlessWrapper + ipc_bridge.lua (PoB MIT)
├── pob-vault/          ← PoBVault (PoB MIT)
├── pob-repoe/          ← RePoE 캐시 + Translator + overrides (PoB MIT)
└── shared/             ← 공통 타입 (AGPL/MIT 경계 신중)
```

### 패키지 분리 대비 원칙 (PR-3-2 ~ PR-10)

실제 `packages/` 이동은 PR-N 에서 한 번에 진행한다. 다만 그 전 PR 들은 미래 package 경계를 전제로 작성한다.

- `src/pob/` 는 미래 `pob-ui` 로 보고, launcher main/renderer 구현을 직접 import 하지 않는다. preload/IPC contract 와 `src/shared` 타입만 경계로 사용한다.
- `src/main/services/pob*` 계열은 미래 `pob-bridge`, `pob-vault`, `pob-repoe`, `pob-headless-glue` 로 보고 React/DOM/App UI 의존을 금지한다.
- 공유가 필요한 타입/순수 유틸은 `src/shared` 로 올린다. package 경계를 넘는 깊은 상대경로 import 를 늘리지 않는다.
- Electron/logger/fs/path 같은 환경 의존은 service 내부에 박지 말고, PR-N 때 adapter 로 분리 가능한 얇은 진입점에 둔다.
- 라이선스 경계도 지금부터 지킨다. launcher AGPL 코드와 PoB MIT 상속 후보 코드를 같은 파일에 섞지 않는다.

---

## 3. 좌측 패널 진입점 (사용자 명시)

- 파일: [src/renderer/App.tsx:1191-1212](src/renderer/App.tsx#L1191-L1212) `Section B: 메뉴 영역` 최상단
- 라벨: `POB i18n (BETA)` + 노란색 BETA 배지
- 스타일: 기존 `SupportLinks` 와 동일 톤
- **노출 조건 (Q10)**: `config.activeGame === "POE2"` 일 때만 렌더링. PoE1 활성 시 항목 자체 비표시 (트레이/핫키 진입도 같은 가드)
- 동작:
  1. 클릭 → `pob:open` IPC
  2. PoBLocator 호출 → 경로 OK 면 새 BrowserWindow 생성 후 BuildListView 진입
  3. 경로 NG → InstallerModal (수동 폴더 지정 흐름)

---

## 4. UI 1:1 포팅 원칙 (사용자 명시)

본 통합은 **PoB Lua UI 를 한국어/디자인 래핑한 결과물**이지 새 UI 발명이 아니다.

- **요소 보존**: PoB Lua 각 mode 의 컨트롤(버튼/입력/드롭다운/체크박스/탭) 을 개수·라벨·동작 동일하게 React 로 포팅
- **추가 금지**: PoB 에 없는 버튼·메뉴·통계 임의 추가 X
- **제거 금지**: dead code (`if false then ...`) 만 제외, 활성 코드는 모두 포팅
- **레이아웃 변경 허용 범위**: PoB 의 절대좌표 → Flex/Grid 로 옮기되 시각적 위치 관계 유지
- **검증 방법**: 각 mode PR 마다 PoB 원본 스크린샷과 본 launcher 화면을 나란히 첨부
- **i18n 키 추출 규칙**: PoB 원본 영문을 그대로 en 값으로 사용. ko 값은 임의 번역 (인게임 용어 정합은 후순위)

---

## 5. 결정 사항 (2026-05-26 사용자 NERDHEAD 확정)

| #        | 항목                   | 결정                                                                                                                    | 비고                                                                                        |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Q1       | LuaJIT 호스트 방식     | **외부 번들** (~300KB, MIT). cwd=vault, LUA_PATH 설정                                                                   | PoC-0.1b 통과. PoB 본체 헤드리스 불가 (1.1)                                                 |
| Q2       | 모노레포 매니저        | **실제 packages 이동은 PR-N, 패키지 경계 준수는 PR-3-2 부터 시작**. 안정화 후 pnpm 검토                                | 기존 lockfile 유지, PR-N 전까지 package-ready 규칙으로 결합도 억제                           |
| Q3       | 레지스트리 조회        | **기존 [src/main/utils/registry.ts](src/main/utils/registry.ts) 재사용** + `getPobInstallPath()` 추가                   | 의존성 0 추가                                                                               |
| Q4       | 단축 진입              | **좌측 메뉴 버튼만**. 트레이/핫키 후순위                                                                                | BETA 단계 단순화                                                                            |
| Q5       | 다국어 우선순위        | **ko + en**. en 은 PoB 원본 그대로, ko 임의 번역                                                                        | ja/ru 키만 정의, i18next fallback → en                                                      |
| Q6       | UI mode 포팅 순서      | **A**: List → Build → Tree → Items → Skills → Calcs → Config                                                            | 각 mode 별 sub-PR                                                                           |
| Q7       | Vault 저장 위치        | **A**: `app.getPath('userData')/pob-vault/<version>/`                                                                   | 세대 N=2 기본 (~630MB)                                                                      |
| Q8       | i18n JSON 포맷         | **A**: 평면 (`{"buildList.toolbar.new": "..."}`)                                                                        | 도구 호환성, grep 추적 쉬움                                                                 |
| Q9       | 우클릭 메뉴            | **추가 안 함**. PoB 의 RMB=Paste 동작도 안 가져옴                                                                       | 사용자 "불편하더라"                                                                         |
| D.1      | BuildListView 메타     | **A**: XML 헤더 attribute (level/className/ascendClassName) 만 fs 추출                                                  | PoB 원본 동작 + 사용자 머신 4개 빌드 실증 (1.5)                                             |
| D.2      | PoB Update.exe 와 충돌 | launcher 는 InstallLocation 직접 spawn 안 함, 항상 vault active. Update.exe 실행은 사용자 명시 트리거                   | 사용자 명시                                                                                 |
| B        | 라이선스               | launcher 본체 **AGPL-3.0**. PoB 래핑 모듈 (pob-bridge/pob-ui/pob-headless-glue/pob-vault/pob-repoe) 은 **PoB MIT 상속** | README/라이선스 페이지에 LuaJIT MIT + PoB MIT 표기                                          |
| 트리     | 패시브 트리 렌더링     | **C (옵션 C)**: RePoE 데이터 + PoB Lua 패스 계산 + React Canvas 렌더. A 마이그레이션은 후순위                           | 사용자 "최종적으로 A로 갈 것 같긴 한데 일단 C"                                              |
| 빌드코드 | Deflate/Inflate 우회   | **A**: ipc_bridge 가 두 함수를 Node zlib 으로 redirect (base64 RPC). PoB Lua 무변경                                     | PoB Deflate/Inflate 호출 패턴 분석 (1.6) + PR-8 라운드트립 검증                             |
| C.2      | Electron 보안 옵션     | **`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`**                                               | launcher 의 [src/main/main.ts:1287-1298](src/main/main.ts#L1287-L1298) gameWindow 동일 정책 |
| C.3      | Cold start 목표        | **후순위로 미룸**. 프로토타입 결과물 우선                                                                               | 참고치: BuildListView 첫 페인트 < 500ms / BuildEditView Lua ready < 3s                      |
| C.4      | 텔레메트리 / 오류 보고 | 텔레메트리 X. exception 은 launcher `logger.error()` 로 흘려 오류 보고서에 표시                                         | 사용자 명시                                                                                 |
| Q10      | 대상 게임 우선순위     | **POE2 만 먼저**. POB i18n 진입 버튼은 `config.activeGame === "POE2"` 일 때만 노출. POE1 (PoB Community PoE1) 은 후순위 | 사용자 명시 (2026-05-26). PR 분할/아키텍처 모두 PoE2 단일 가정 유지                         |

---

## 6. PR 분할 + 마일스톤

> **PR 용어**: GitHub **Pull Request** 단위. "PR-1", "PR-2" 식 번호는 작업 순서.

### 6.1 PR 인덱스

| PR    | 제목                                                               | 상세                           |
| ----- | ------------------------------------------------------------------ | ------------------------------ |
| PR-1  | 좌측 진입 버튼 + InstallerModal (UI only)                          | [plan/PR-1.md](plan/PR-1.md)   |
| PR-2  | PoBLocator 실제 구현 + 통합                                        | [plan/PR-2.md](plan/PR-2.md)   |
| PR-3  | BuildsScanner + BuildListView 1:1 포팅 + i18n 골격                 | [plan/PR-3.md](plan/PR-3.md)   |
| PR-4  | PoBVault + LuaJIT 번들 + ipc_bridge + 최소 RPC                     | [plan/PR-4.md](plan/PR-4.md)   |
| PR-5  | BuildEditView + Lua 세션 lazy spawn + Deflate/Inflate IPC override | [plan/PR-5.md](plan/PR-5.md)   |
| PR-6  | PoB UI mode 순차 포팅 (5 sub-PR)                                   | [plan/PR-6.md](plan/PR-6.md)   |
| PR-7  | RePoE 캐시 + GitHub Actions 주기 검증                              | [plan/PR-7.md](plan/PR-7.md)   |
| PR-8  | Ctrl+C 파서 + 빌드 코드 라운드트립 검증                            | [plan/PR-8.md](plan/PR-8.md)   |
| PR-9  | ContractValidator + Vault 세대 관리 + UI 배너                      | [plan/PR-9.md](plan/PR-9.md)   |
| PR-10 | Lua 데이터 점진 대체 #1 (트리 텍스트)                              | [plan/PR-10.md](plan/PR-10.md) |
| PR-N  | Monorepo 분리 (npm workspaces, M7 이후 최종 PR)                    | [plan/PR-N.md](plan/PR-N.md)   |

### 6.2 체크포인트 마일스톤

사용자 명시: **PR-6 (M3) 완료 시점에 알림** — 진행 상황 캡쳐해서 커뮤니티 공유 예정.

| 마일스톤                   | 시점                    | 사용자가 보이는 결과물                                    | 캡쳐 거리                                           |
| -------------------------- | ----------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| M0 PoC 통과                | 본 세션 (✅ 2026-05-26) | LuaJIT + HeadlessWrapper exit 0                           | pwsh 콘솔 로그                                      |
| M1 UI 첫 진입              | PR-1 ~ PR-3 머지        | 런처에서 POB i18n 버튼 → 한국어 BuildList                 | 메인 + 새 창 나란히                                 |
| M2 BUILD 진입 가능         | PR-4 ~ PR-5 머지        | New → BuildEditView + Lua 세션 spawn                      | 전환 GIF                                            |
| **🎯 M3 PoB UI 골격 완성** | **PR-6 모두 머지**      | **5개 mode (Tree/Items/Skills/Calcs/Config) 한국어 진입** | **5개 mode 콜라주 + PoB 원본 비교** ← **알림 지점** |
| M4 RePoE 통합              | PR-7 머지               | 트리/스탯 한국어 치환                                     | 영문 vs 한글                                        |
| M5 빌드 코드 호환          | PR-8 머지               | 한국 커뮤니티 빌드코드 import OK                          | round-trip 검증                                     |
| M6 Fallback 검증           | PR-9 머지               | PoB 강제 손상 → 자동 복구                                 | fallback 영상                                       |
| M7 BETA 출시 후보          | PR-10 머지              | 모든 핵심 흐름 + 트리 옵션 C 임시 구현                    | 데모 영상                                           |
| M8 독립 빌드 가능          | PR-N 머지               | `pob-ui` 패키지 독립 빌드 + npm workspaces 구조            | 빌드 로그                                           |

---

## 7. 위험 매트릭스

| 위험                                            | 확률  | 영향  | 완화                                                                           |
| ----------------------------------------------- | ----- | ----- | ------------------------------------------------------------------------------ |
| PoB Lua 헤드리스 실행 불가                      | ~~M~~ | ~~H~~ | ✅ PoC-0.1b 통과 (1.4)                                                         |
| `Deflate`/`Inflate` noop 으로 빌드코드 비호환   | H     | H     | ipc_bridge 의 Node zlib RPC override (PR-5)                                    |
| RePoE PoE2 다국어 CDN 미존재 / 경로 상이        | M     | M     | PR-7 PoC-0.2 baseline. 미존재 시 자체 사전 구축 트랙                           |
| 공식 PoB 메이저 업데이트로 IPC 깨짐             | M     | H     | PoBVault + ContractValidator (vault active 는 항상 검증된 사본)                |
| 모노레포 전환 중 빌드 깨짐                      | M     | M     | PR-10/M7 이후 마지막 PR-N 단일 PR 로 진행                                      |
| WSL/Windows native binding 분기로 dev 속도 저하 | H     | L     | `npm ci` 는 Windows 에서만 (CLAUDE.md 규칙)                                    |
| UI 1:1 포팅 중 PoB 컨트롤 누락                  | M     | M     | 각 mode PR 마다 원본·포팅 스크린샷 나란히 첨부 (§4)                            |
| i18n JSON 에 게임 데이터 텍스트 혼입            | M     | M     | ESLint 룰 또는 리뷰 체크리스트로 도메인 분리                                   |
| PoBVault 폴더 복제가 디스크 압박 (~315MB × N)   | M     | L     | 세대 N=2 기본 (~630MB), 1~5 범위 사용자 설정                                   |
| PoB 의 `userPath` 가 비표준 위치                | L     | M     | PR-3 BuildsScanner 의 우선순위 해석 (Electron `app.getPath('documents')` 우선) |

---

## 8. 테스트 전략 (요약)

- **단위**: vitest. PoBLocator, BuildsScanner, validator, Deflate/Inflate IPC override 등 fs/registry mock
- **통합**: 사용자 머신에서 `POB_INSTALL_LOCATION` env 지정 후 vitest 실행. CI 에서는 vault fixture 또는 skip
- **회귀 (RePoE CDN)**: GitHub Actions cron `0 9 * * *` (KST 18:00) — `.github/workflows/pob-repoe-cdn-check.yml` (PR-7)
- **수동**: Windows pwsh 에서 실제 spawn 검증. WSL 은 lint/type check 만 (CLAUDE.md)
- **회귀 (PoB 호환)**: PR-8 의 한국 PoB 커뮤니티 빌드 코드 3개 fixture 로 라운드트립 검증

---

## 9. 참고 — Gemini 초안에서 보존 / 폐기

본 계획서 분할 전 (Gemini 3.5 Flash 가 작성한 PoB-KR repo 의 `docs/pob_kr_rebuild_plan.md` + `pob_kr_i18n_spec.md`) 의 채택/폐기:

### 채택

- 3-layer 아키텍처 (Frontend / Bridge / Headless)
- `pob_kr_i18n_spec.md` §2.A `LOCALE_HEADER_DICTIONARIES` — Ctrl+C 파싱 사전 (PR-8)
- `pob_kr_i18n_spec.md` §5.B `cache_manifest.json` 스키마 (PR-7)
- `pob_kr_rebuild_plan.md` §5.C "Validation + Fallback" 컨셉 (PR-9)

### 폐기

- PoB 코어에 신규 Lua 파일 추가 (`LanguageSelector.lua`, `UniversalItemParser.lua`) — 침습적, launcher 측 TS 로 대체
- `src/Classes/ItemDBControl.lua` 패치 — 동일 이유
- WOW6432Node 32-bit 레지스트리 탐색 — PoB-PoE2 는 64-bit 전용
- `sync-upstream.sh` 로 PoB 핵심 연산 파일 복사 — launcher 가 사용자 InstallLocation 만 참조하면 됨
- `pob-hybrid-prototype/` 디렉토리 — 실재 미확인, 본 통합은 launcher 측 처음부터 작성

---

> 본 문서는 v1.0 (분할 슬림화 완료). 향후 결정 사항은 §5 에 추가, PR 별 변경은 `plan/PR-*.md` 에 자체 변경 이력.

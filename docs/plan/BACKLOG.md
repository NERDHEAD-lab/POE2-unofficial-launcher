# PoB Long-term Backlog

> 상위 문서: [../pob-handoff.md](../pob-handoff.md)
> 원천 항목: handoff 후순위 백로그
> 후속 작업: 범위 확정 시 새 PR 문서로 분리

## 목표

현재 PoB wrapper 안정화와 시즌 전 필수 작업 범위 밖에 있는 장기 과제를 한곳에 보관한다.

이 문서는 PR 진행 커서가 아니며, 코드 커밋이나 squash commit 대상도 아니다. 실제 구현이 필요해지면 여기의 항목 하나를 착수 가능한 크기로 쪼개 새 PR 문서로 승격한다.

## 백로그 항목

### 원본 PoB 의존성 제거 / 모든 로직 직접 구현

- 가장 후순위 장기 목표로 유지한다.
- Tree / Items / Skills / Calcs / Config / ImportExport / Notes 의 원본 계약화가 충분히 끝난 뒤 착수한다.
- 계산 로직, 데이터 로딩, 트리 경로 계산, 아이템 파서, 스킬 선택, config option 의 대체 범위를 분리한다.
- PoB 원본과 결과가 일치하는 fixture/test corpus 를 먼저 확보한다.

### 다국어 확장

- ja / ru 다국어 활성화 범위를 정한다.
- UI 문자열과 RePoE 게임 데이터 번역 domain 을 분리한다.
- 한글 번역의 인게임 용어 정합 작업을 별도 glossary/test 로 분리한다.

### Package manager / workspace 운영

- pnpm 마이그레이션 필요성을 검토한다.
- Windows/WSL shared `node_modules` 규칙과 충돌하지 않는지 확인한다.
- lockfile churn, workspace script, CI cache 정책을 사전 문서화한다.

### PoBVault advanced operations

- PoBVault 압축 옵션을 검토한다.
- PoB `Update.exe` 사용자 트리거 흐름을 설계한다.
- vault generation / rollback / disk usage 정책 변경이 필요하면 사용자 확인을 받는다.

### External service integrations

- PoE2 거래소 도메인별 검색 API 범위를 조사한다.
- PoB Archives 외부 빌드 공유 범위를 조사한다.
- PoB Community (PoE1) 통합은 PoE2 wrapper 안정화 후 별도 PR 로 분리한다.

## Triage Details

### 조사 범위

- 로컬 repo/docs 기준으로 triage 했다. 외부 서비스 API 의 최신 사양 확인은 네트워크 product surface 를 여는 별도 PR 의 첫 단계로 남긴다.
- 확인한 근거:
  - root `package.json`: 현재 package manager 는 npm workspaces, `package-lock.json` 사용, Node engine 은 `>=24`.
  - `packages/pob-ui/src/i18n.ts`: UI 문자열 resource 는 현재 `ko`, `en` 만 등록.
  - `packages/pob-repoe/src/fetcher.ts`, `cache.ts`, `translations.ts`: RePoE 게임 데이터 cache/translation pipeline 은 locale 별 resource 를 다루지만 현재 기본 fetch locale 은 `en`, `ko`.
  - `packages/pob-vault/src/vault.ts`, `packages/pob-ui/src/components/VaultSettingsModal.tsx`: vault 는 stage/promote/rollback/list/prune 와 generation size 표시를 이미 갖고 있고, UI 는 auto refresh / generation limit / force refresh 까지만 제공.
  - `packages/shared/src/urls.ts`, `packages/pob-ui/src/views/BuildEditView.tsx`: trade URL 은 launcher external link 용이고, PoB Import/Export 의 URL share 는 아직 unsupported 상태다.
  - `packages/pob-bridge/src/session.ts`, `packages/pob-headless-glue/resources/lua/ipc_bridge.lua`: 핵심 build 계산/파싱/상태 mutation 은 여전히 vault 의 PoB Lua core 를 spawn 해서 처리한다.

### 원본 PoB 의존성 제거

| 항목 | 내용 |
| --- | --- |
| 현재 사실 | TypeScript 쪽에는 Tree / Items / Skills / Calcs / Config / ImportExport / Notes typed contract 와 일부 runtime assertion/test 가 생겼지만, 계산 엔진/데이터 로딩/아이템 파서/스킬 계산은 아직 PoB Lua core 의 결과를 소비한다. |
| 결정 | 원본 PoB 의존성 제거는 즉시 구현하지 않는다. 먼저 "동일 입력 -> 동일 snapshot/result" 를 보장하는 fixture corpus 와 diff harness 를 만든 뒤 domain 별로 교체한다. |
| 후보 PR | snapshot fixture corpus + Lua/TS result diff harness, tree data loader ownership, item parser/stat translation ownership, skills/calcs engine boundary, config/import-export/notes mutation contract hardening. |
| 착수 조건 | Imported Build2 외 추가 fixture, blank/`-`/`-%`/`- to -` 표시 회귀 테스트, PoB Lua 원본 source mapping, 실패 시 wrapper fallback 정책. |
| 리스크 | 계산 parity 는 데이터와 공식 게임 로직 변화에 직접 묶인다. 부분 교체가 build 결과를 어긋나게 만들 수 있으므로 feature flag 와 snapshot diff 가 선행되어야 한다. |

### 다국어 확장

| 항목 | 내용 |
| --- | --- |
| 현재 사실 | UI i18n 은 `ko`/`en` resource 만 등록되어 있고, RePoE fetch 기본 locale 도 `en`/`ko` 이다. item copy parser 와 번역 overlay 도 현재 ko/en 중심이다. |
| 결정 | ja/ru 를 한 번에 켜지 않는다. UI 문자열 locale 추가와 RePoE 게임 데이터 locale 추가를 분리하고, ko 인게임 용어 정합은 별도 glossary/test 로 관리한다. |
| 후보 PR | UI locale registry 확장, RePoE locale availability/probe + cache manifest 확장, Korean in-game glossary + translation snapshot tests. |
| 착수 조건 | RePoE fork 의 ja/ru resource 경로/coverage 확인, missing translation fallback 문구, UI locale selector 표시 정책, item copy parser locale detection 확장 여부. |
| 리스크 | UI 번역과 게임 데이터 번역을 섞으면 PoB Lua 에 원본 ID/영문 identifier 대신 표시 문자열을 되돌려 보내는 회귀가 생긴다. domain 분리는 유지한다. |

### Package manager / workspace 운영

| 항목 | 내용 |
| --- | --- |
| 현재 사실 | root 는 npm workspaces 와 `package-lock.json` 을 사용한다. Windows PowerShell 검증/commit hook 기준으로 워크플로가 정착되어 있고, WSL 에서 `npm install` 금지 규칙이 있다. |
| 결정 | pnpm migration 은 현 release scope 에 넣지 않는다. lockfile 교체와 workspace install 방식 변경은 PoB wrapper 코드 PR 과 섞지 않는 infra PR 로 분리한다. |
| 후보 PR | pnpm feasibility doc + CI/cache matrix, package manager migration branch with clean lockfile churn, Windows/WSL install guard documentation. |
| 착수 조건 | electron-builder/vite/vitest/husky/lint-staged 호환성 확인, Windows/WSL shared `node_modules` 정책, CI cache key, rollback plan. |
| 리스크 | package manager 변경은 모든 workspace 와 lockfile 을 흔든다. PoB 기능 코드와 같은 PR 에 넣으면 회귀 원인 분리가 어렵다. |

### PoBVault advanced operations

| 항목 | 내용 |
| --- | --- |
| 현재 사실 | vault 는 active generation 을 검증된 사본으로 유지하고 stage/promote/rollback/prune 를 제공한다. settings UI 는 auto vault update, generation limit, force refresh, generation size/read-only list 를 제공한다. |
| 결정 | 압축 저장, `Update.exe` 직접 실행, generation/rollback UX 변경은 사용자 확인 전 구현하지 않는다. 현재 원칙인 "InstallLocation 직접 spawn 금지, 검증된 vault 만 spawn" 을 유지한다. |
| 후보 PR | vault compression PoC + perf/disk measurement, explicit PoB `Update.exe` trigger UX, manual rollback/delete generation UI with confirmation. |
| 착수 조건 | 압축 포맷/해제 시점, TreeData asset cache 와의 충돌 여부, `Update.exe` 실행 권한/경로 검증, 디스크 사용 상한, 실패 시 active vault 보존 정책. |
| 리스크 | 압축은 시작 시간과 tree asset 로딩을 늦출 수 있고, updater trigger 는 외부 executable 실행 UX/보안 경계가 된다. 기본 동작 변경 전 사용자 결정을 받아야 한다. |

### External service integrations

| 항목 | 내용 |
| --- | --- |
| 현재 사실 | launcher 에는 공식 trade 페이지를 여는 URL 상수만 있고, PoB Import/Export 의 URL share 는 `shareUnsupported` 로 남아 있다. external URL build import 는 downloader 가 raw code 를 공급하기 전까지 거부하는 테스트가 있다. PoE1 PoB registry/install key 는 아직 미실증 주석으로 남아 있다. |
| 결정 | PoE2 trade API, PoB Archives, PoB Community (PoE1) 는 각각 별도 product/API PR 로 분리한다. renderer 에서 임의 URL 을 직접 호출하지 않고 main/bridge 쪽 allowlist 와 사용자 동의를 둔다. |
| 후보 PR | PoE2 trade domain/API source audit, PoB Archives import/export contract, PoE1 PoB install detection + game guard + smoke fixture. |
| 착수 조건 | 2026년 현재 endpoint/source 확인, rate limit/terms 확인, service 별 auth/privacy 정책, allowed domain list, external link 와 API request 의 책임 경계. |
| 리스크 | 외부 서비스는 API/정책 변동성이 크다. 현재 repo 에 있는 trade URL 은 브라우저 링크 용이며 검색 API 클라이언트로 간주하면 안 된다. |

## Decisions / Risks

- 원본 PoB 의존성 제거는 가장 후순위 목표로 유지한다.
- PR-18 에서 보류한 tray menu / global hotkey / empty-area context menu 는 사용자 확인 후 별도 backlog 로 승격한다.
- 이 문서의 후보 PR 이름은 확정 번호가 아니다. 실제 착수 시 handoff 진행 커서에 새 PR 번호/문서를 만들고 범위를 다시 확정한다.

# PR-N: Monorepo 분리 (npm workspaces)

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-10](PR-10.md) 머지로 M7 BETA 출시 후보 달성 후
> 후속: 본 PR 이 마지막. 이후는 별도 트랙 (Phase 5.5 점진 대체, 패시브 트리 옵션 A 마이그레이션, 트레이/핫키 등)

## 목표

본 통합 작업 동안 `src/main/services/pobRepoe/`, `src/main/services/pobVault/`, `src/pob/` 등에 흩어진 코드를 **npm workspaces 모노레포로 분리** — 향후 `pob-ui` 만 독립 빌드/배포 가능.

**중요**: PR-10 머지 시점에 **M7: BETA 출시 후보**를 달성하고, 본 PR 은 그 직후 진행하는 **마지막 단계**다. 중간에 분리하면 PR 충돌이 폭발 (plan §3 Phase 6 명시)하므로 PR-3-2 ~ PR-10 머지 완료 후 단일 PR 로 진행.

단, PR-3-2 ~ PR-10 은 handoff §4.5 의 "패키지 분리 대비 규칙"을 지킨 상태여야 한다. PR-N 은 새 경계 설계 PR 이 아니라, 이미 지켜 온 경계를 npm workspaces 구조로 옮기고 독립 빌드를 검증하는 PR 이다.

## 종료 기준

- [x] `package.json` 의 `"workspaces": ["packages/*"]` 동작
- [x] 모든 코드가 `packages/<name>/src/` 구조로 이동
- [x] 각 package 의 `package.json` 에 scoped name 부여 (`@poe2-launcher/...`)
- [x] launcher 본체 빌드 정상 (`npm run build`)
- [x] `packages/pob-ui` 만 별도 빌드 가능 (`npm run build --workspace=@poe2-launcher/pob-ui`)
- [x] 모든 vitest 통과
- [x] eslint / prettier 통과
- [x] Windows 에서 `npm run dev` 수동 검증 + electron-builder 패키징 통과
  - 패키징은 PR-N.10b 와 PR-N.12a 이후 Windows `npm run build` 로 통과 재확인.
  - Windows `npm run dev` startup smoke 는 Vite `http://localhost:54321/`, Electron main/renderer ready, launcher focus 로그까지 확인.
  - 사용자 수동 검증으로 런처 `PoB Unofficial Wrapper` 버튼 클릭, wrapper window open, BuildListView 진입/표시, 빌드별 로드, Tree/Skills 등 탭 전환 정상 확인.

## 진행 상태

- [x] **PR-N.1** workspace skeleton + `pob-ui` 독립 빌드 경로
  - 커밋: `044d9ae feat(POB): POB 연동 기능 추가 N-1`
  - `package.json` workspaces 활성화 후 Windows `npm install` 로 `package-lock.json` 갱신
  - `packages/{launcher,pob-bridge,pob-headless-glue,pob-repoe,pob-ui,pob-vault,shared}/package.json` scoped package skeleton 추가
  - `packages/pob-ui` workspace build script / tsconfig / Vite entry 추가. 현 단계는 실제 `src/pob/**` 이동 전이므로 `packages/pob-ui/entry.tsx` 가 기존 `src/pob/main.tsx` 를 로드
  - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. `build:check` 의 Vite alias deprecation, `freeze` output option, fzstd PURE annotation 경고는 기존 경고.

- [x] **PR-N.2** `pob-ui` renderer asset boundary cleanup
  - 커밋: `2bb3670 feat(POB): POB 연동 기능 추가 N-2`
  - `src/pob/App.tsx` 의 `../renderer/assets/icon.ico` 직접 참조를 제거하고 `src/pob/assets/icon.ico` 로 PoB UI 내부 asset 경계를 분리
  - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. 기존 Vite/fzstd 경고만 유지.

- [x] **PR-N.3** `pobVault` ↔ `pobSession` cycle cleanup, no source moves
  - 커밋: `13cb3d0 feat(POB): POB 연동 기능 추가 N-3`
  - `pobVault/validator.ts` 의 `PoBSession` 직접 import 제거. smoke session 은 `PobVaultSmokeSession` 구조적 인터페이스와 필수 `sessionFactory` 로 주입
  - `refreshPobVault` 는 validator 를 호출자가 주입하도록 변경하고, `pobSession.ts` 의 IPC handler 쪽에서 `PoBSession` 기반 validator 를 조립
  - `src/main/services/pobVault/packageBoundary.test.ts` 추가: `pobVault` non-test source 가 `pobSession` 을 import 하지 못하도록 회귀 가드
  - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. 전체 테스트는 48 files / 207 tests 통과로 증가.

- [x] **PR-N.4** `shared` package move
  - `src/shared/**` 를 `packages/shared/src/**` 로 이동하고, import alias / tsconfig / Vite / Vitest 경계를 먼저 정리한다.
  - 커밋: `cde8966 feat(POB): POB 연동 기능 추가 N-4`
  - `src/shared/**` 를 `packages/shared/src/**` 로 이동하고 전체 `src/**` / `packages/**` import 를 `@poe2-launcher/shared/*` 로 정리
  - root / `pob-ui` Vite alias, root / `pob-ui` tsconfig, Vitest alias, lint 범위를 shared package 경계에 맞춤
  - `packages/shared/src/packageBoundary.test.ts` 추가: legacy relative shared import 와 shared package 의 launcher/renderer/pob-ui 역참조 회귀 방지
  - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. 전체 테스트는 49 files / 209 tests 통과로 증가.

- [x] **PR-N.5** PoB service package move
  - [x] **PR-N.5a** `pob-repoe` package move
    - 커밋: `bc3e6bb feat(POB): POB 연동 기능 추가 N-5a`
    - `src/main/services/pobRepoe/**` 를 `packages/pob-repoe/src/**` 로 이동하고 호출부를 `@poe2-launcher/pob-repoe/*` alias 로 정리
    - root Vite / Vitest / tsconfig / eslint import order / lint 범위에 `pob-repoe` package alias 추가
    - `packages/pob-repoe/src/packageBoundary.test.ts` 추가: legacy `pobRepoe` service path 와 renderer/pob-ui 역참조 회귀 방지
    - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. 전체 테스트는 50 files / 211 tests 통과로 증가.
  - [x] **PR-N.5b** `pob-vault` package move
    - 커밋: `3032f28 feat(POB): POB 연동 기능 추가 N-5b`
    - `src/main/services/pobVault/**` 를 `packages/pob-vault/src/**` 로 이동하고 호출부를 `@poe2-launcher/pob-vault/*` alias 로 정리
    - root Vite / Vitest / tsconfig / eslint import order / lint 범위에 `pob-vault` package alias 추가
    - `packages/pob-vault/src/packageBoundary.test.ts` 추가: legacy `pobVault` service path, `-launcher/pob-vault` 오타, session/bridge/launcher 역참조, renderer/pob-ui 역참조 회귀 방지
    - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. 전체 테스트는 50 files / 213 tests 통과, 1 file / 2 tests skipped.

- [x] **PR-N.6** `pob-bridge` package move
  - 커밋: `bdda47f feat(POB): POB 연동 기능 추가 N-6`
  - `src/main/services/pobSession.ts`, `pobInstallVerifier.ts`, `buildsScanner.ts` 와 관련 테스트를 `packages/pob-bridge/src/**` 로 이동하고 launcher main IPC wiring 을 `@poe2-launcher/pob-bridge` alias 로 정리
  - `logger` / `locator` adapter 를 추가해 launcher logger 와 registry PoB install lookup 은 주입받고, bridge package 는 launcher 구현을 직접 역참조하지 않게 분리
  - root Vite / Vitest / tsconfig / eslint import order / lint 범위에 `pob-bridge` package alias 추가
  - `packages/pob-bridge/src/packageBoundary.test.ts` 추가: legacy `pobSession`/`buildsScanner`/`pobInstallVerifier` service path, launcher/renderer/pob-ui/headless-glue 역참조 회귀 방지
  - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. 전체 테스트는 51 files / 216 tests 통과, 1 file / 2 tests skipped.

- [x] **PR-N.7** `pob-ui` source move
  - 커밋: `396d9d8 feat(POB): POB 연동 기능 추가 N-7`
  - `src/pob/**` 를 `packages/pob-ui/src/**` 로 이동하고 root `pob.html` / package `index.html` entry 를 새 source path 로 정리
  - root Vite / Vitest / tsconfig / eslint import order / lint 범위에 `pob-ui` package alias 추가
  - PoB i18n domain guard 기본 경로를 `packages/pob-ui/src/i18n` 으로 이동하고 관련 테스트를 갱신
  - bridge/vault boundary test 의 UI source root 를 `packages/pob-ui/src` 로 갱신
  - 검증: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run lint`, `npm test`, `npm run build:check` 모두 커밋 전/후 통과. 전체 테스트는 51 files / 216 tests 통과, 1 file / 2 tests skipped.

### 추가 요구사항: `pob-unofficial-wrapper` 독립 앱

`docs/current-plan.md` 에서 이관된 사용자 요구사항이다. PR-N 이후에도 PoB 2 Unofficial Wrapper 를 런처 내장 모드와 독립 실행 앱 양쪽에서 사용할 수 있게 확장한다.

- [x] 실제 실행 가능한 workspace package 이름은 `pob-unofficial-wrapper` 로 정한다. 기존 임시 명칭 `pob-app` 은 사용하지 않는다.
- [x] `pob-unofficial-wrapper` 는 비공식 런처 안에서 열려도 독립 실행 앱과 분리된 appdata/config namespace 를 사용한다.
- [x] PoB 원본 설치 경로 탐색/검증/저장은 launcher main 이 아니라 wrapper 경계에서 처리할 수 있게 책임을 재검토한다. 단, Windows registry 접근이나 Electron main 권한이 필요한 부분은 adapter 로 주입한다.
- [x] 독립 앱 단독 빌드/실행 파이프라인을 추가한다. 향후 별도 repo 분리 및 `packages/` git submodule 참조를 고려해 launcher 내부 경로에 강하게 묶지 않는다.
- [x] 마지막으로 진입한 빌드와 마지막으로 확인한 컴포넌트 위치를 저장/복원한다.
- [x] 빌드 내 Tree / Skills / Items 등 수정 상태에서 다른 빌드로 이동할 때 자동 저장이 아니라면 저장 확인 모달을 표시한다.

- [x] **PR-N.8a** wrapper package identity + namespace/state contract
  - 커밋: `1bc5a63 feat(POB): POB 연동 기능 추가 N-8a`
  - `packages/pob-unofficial-wrapper` workspace package 를 추가하고 package name 을 `pob-unofficial-wrapper` 로 고정했다.
  - standalone / launcher-embedded appdata namespace 를 분리하는 순수 계약과 마지막 build/component 위치 state 계약을 추가했다. 실제 Electron main wiring, standalone 실행/패키징, restore/save-confirm UI 는 후속 sub-step.
  - RePoE CDN GitHub Actions 경로를 monorepo 이동 후 실제 테스트 위치 `packages/pob-repoe/src/__tests__/cdn-baseline.spec.ts` 로 보정했다.
  - 검증: Windows `npm run build --workspace=pob-unofficial-wrapper`, `npm test -- packages/pob-unofficial-wrapper/src`, `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 60 files / 245 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.8b** standalone Electron main/preload build pipeline
  - 커밋: `bbfee23 feat(POB): POB 연동 기능 추가 N-8b`
  - `pob-unofficial-wrapper` standalone Electron main/preload entry 와 전용 Vite CJS build pipeline 을 추가했다.
  - standalone main 은 wrapper 전용 `userData` namespace 를 설정하고 `packages/pob-ui/dist/index.html` 또는 `POB_WRAPPER_RENDERER_URL` 을 `#game=POE2&host=standalone` 로 로드한다.
  - 현 단계는 실행 빌드 경계만 고정하며 PoB session/config/install-location adapter wiring 은 PR-N.8c 로 남긴다.
  - 검증: Windows `npm run build --workspace=pob-unofficial-wrapper`, `npm test -- packages/pob-unofficial-wrapper/src`, `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 60 files / 245 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.8c** wrapper install-location/config adapter wiring
  - 커밋: `f7302b7 feat(POB): POB 연동 기능 추가 N-8c`
  - wrapper-local JSON config store 를 추가하고 PoB settings / POE1·POE2 설치 경로를 wrapper namespace 의 `config.json` 에 정규화 저장한다.
  - install-location service 는 저장 경로 검증, 무효 저장 경로 정리, Windows registry 탐색, 수동 선택 검증, detected 경로 confirm 을 wrapper 경계에서 처리한다.
  - standalone main 은 `@poe2-launcher/pob-bridge` 의 builds/session IPC handler 를 등록하고, session `installLocator` 는 wrapper install-location service 로 주입한다.
  - standalone preload 는 `pob-ui` 가 기대하는 `window.pobAPI` surface 를 노출하고, wrapper 전용 설치 경로 기능은 `window.pobWrapper.installLocation` 로 분리한다.
  - package boundary test 로 wrapper source 가 launcher/renderer/pob-ui 구현을 직접 import 하지 못하게 고정했다.
  - 검증: Windows `npm run build --workspace=pob-unofficial-wrapper`, `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 63 files / 252 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.8d** last build/component restore + unsaved navigation confirmation
  - 커밋: `94c7e05 feat(POB): POB 연동 기능 추가 N-8d`
  - wrapper-local `pobWrapper.lastLocation` get/set IPC 를 추가하고 standalone preload 의 `window.pobWrapper.state` facade 로 노출했다.
  - `pob-ui` 는 standalone wrapper 에서 마지막 빌드와 mode 탭 위치를 복원/저장하고, unsupported `NOTES` 위치는 현재 UI mode 가 준비될 때까지 복원하지 않는다.
  - `BuildEditView` 의 active mode 를 App 상태로 승격하고, 기존 빌드 변경 상태에서도 다른 빌드/닫기 이동 시 autosave 또는 저장 확인 모달을 거치게 했다.
  - 검증: Windows `npm run build --workspace=pob-unofficial-wrapper`, `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 65 files / 258 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.9** `pob-headless-glue` resource package move
  - 커밋: `4c04e0d feat(POB): POB 연동 기능 추가 N-9`
  - `resources/lua/**` 의 LuaJIT/HeadlessWrapper/ipc_bridge 리소스를 `packages/pob-headless-glue/resources/lua/**` 로 이동했다.
  - PoBSession dev `resourceRoot`, Imported Build2/session 테스트 resource path, electron-builder `extraResources` 경로를 새 package boundary 로 갱신했다.
  - `packages/pob-headless-glue/resources.test.ts` 를 추가하고 root lint 범위에 `packages/pob-headless-glue` 를 포함해 package 리소스 경계를 검증한다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 66 files / 259 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.10a** launcher package source move
  - 커밋: `dc3d40e feat(POB): POB 연동 기능 추가 N-10a`
  - `src/main/**`, `src/renderer/**`, `src/vite-env.d.ts` 를 `packages/launcher/src/**` 로 이동하고 root `src/` source tree 를 제거했다.
  - root Vite/Electron entry, TypeScript/Vitest alias, lint scope, electron-builder fixture path 를 launcher package source boundary 에 맞췄다.
  - `packages/launcher/tsconfig.json` 을 추가하고 `pob-ui` package env typing 을 분리해 monorepo package 경계에서 독립 타입 체크가 가능하게 했다.
  - renderer 의 `RemoteFontItem` 타입 참조를 launcher main 구현에서 shared 계약으로 보정했다.
  - 검증: Windows `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 66 files / 259 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.10b** electron-builder extraResources path guard
  - 커밋: `a1fa749 feat(POB): POB 연동 기능 추가 N-10b`
  - electron-builder `extraResources` 에 남아 있던 stale `packages/launcher/src/main/assets` 경로를 제거해 packaging 의 missing source warning 을 해소했다.
  - `packages/launcher/src/main/electronBuilderResources.test.ts` 를 추가해 `electron-builder.json5` 의 `extraResources.from` 경로가 실제로 존재하는지 검증한다.
  - Windows `npm run build` 로 electron-builder NSIS 생성까지 통과함을 확인했다. `npm run dev` 수동 검증은 별도 종료 점검으로 남긴다.
  - 검증: Windows `npm test -- packages/launcher/src/main/electronBuilderResources.test.ts`, `npm run lint`, `npm test`, `npm run build:check`, `npm run build` 통과. 전체 테스트 67 files / 260 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.11** workspace package LICENSE files
  - 커밋: `055d961 feat(POB): POB 연동 기능 추가 N-11`
  - `packages/launcher/LICENSE` 에 AGPL-3.0-or-later 사본을 추가하고 PoB/shared 계열 workspace package 에 MIT LICENSE 파일을 추가했다.
  - `packages/shared/src/packageLicenseFiles.test.ts` 로 각 package 의 `package.json` license field 와 package LICENSE 내용이 일치하는지 검증한다.
  - 검증: Windows `npm test -- packages/shared/src/packageLicenseFiles.test.ts`, `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 68 files / 261 tests passed, 1 file / 2 tests skipped.

- [x] **PR-N.12a** PR workflow test gate
  - 커밋: `d7daa45 feat(POB): POB 연동 기능 추가 N-12a`
  - `.github/workflows/pr-check.yml` 에 `npm test` 게이트를 추가해 PR CI 가 lint/test/build:check 를 모두 실행하게 했다.
  - `packages/shared/src/githubWorkflowCommands.test.ts` 로 PR workflow 명령 순서와 RePoE CDN workflow 의 monorepo package test path 를 고정한다.
  - 검증: Windows `npm test -- packages/shared/src/githubWorkflowCommands.test.ts`, `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 69 files / 263 tests passed, 1 file / 2 tests skipped.
  - 추가 확인: Windows `npm run build --workspace=@poe2-launcher/pob-ui`, `npm run build` 통과. 기존 Vite/fzstd/electron-builder npm collector 경고는 유지.
  - Dev smoke: Windows `npm run dev` 로 Vite dev server, Electron main, renderer ready, launcher focus 로그 확인. 검증 후 dev process 종료.

- [x] **PR-N.12b** launcher menu label + 수동 검증 closeout
  - 커밋: `d88c6f3 fix(POB): POB 연동 기능 추가 N-12b`
  - 런처 좌측 메뉴 라벨을 `POB i18n` 에서 결정된 이름인 `PoB Unofficial Wrapper` 로 변경했다.
  - 긴 라벨이 기존 버튼 레이아웃을 밀어내지 않도록 label overflow 경계를 보정했다.
  - `PobLaunchButton` 회귀 테스트로 라벨, PoE2 click open, non-PoE2 hidden 상태를 고정했다.
  - 사용자 수동 검증: 버튼 클릭 시 wrapper window open, BuildListView 표시, 빌드별 로드, Tree/Skills 등 탭 전환 정상.
  - 검증: Windows `npm test -- packages/launcher/src/renderer/components/pob/PobLaunchButton.test.tsx`, `npm run lint`, `npm test`, `npm run build:check` 통과. 전체 테스트 70 files / 266 tests passed, 1 file / 2 tests skipped.

## 작업 항목

### 0. 사전 경계 점검

- `src/pob/` 에서 launcher main/renderer 구현을 직접 import 하는 곳이 없는지 확인
- `src/main/services/pob*` 계열에서 React/DOM/App UI 의존이 없는지 확인
- package 경계를 넘는 깊은 상대경로 import 목록 작성 후 `@poe2-launcher/*` alias 로 이동
- launcher AGPL 코드와 PoB MIT 상속 후보 코드가 같은 파일에 섞인 곳이 없는지 확인

### 1. workspaces 활성화

- 파일: [../../package.json](../../package.json) (편집)
- 추가:
  ```json
  {
    "workspaces": ["packages/*"]
  }
  ```
- `package-lock.json` 재생성 — **Windows 에서만 `npm install`** (CLAUDE.md WSL 규칙)

### 2. 디렉토리 구조 변환

- 변환 매핑:
  ```
  src/main/                    → packages/launcher/src/main/
  src/renderer/                → packages/launcher/src/renderer/
  src/shared/                  → packages/shared/src/
  src/main/utils/registry.ts   → packages/shared/src/registry.ts (PoB 도 사용)
  src/main/services/pobVault/  → packages/pob-vault/src/
  src/main/services/pobRepoe/  → packages/pob-repoe/src/
  src/main/services/pobSession.ts → packages/pob-bridge/src/session.ts
  src/main/services/pobLocator.ts → packages/pob-bridge/src/locator.ts
  src/main/services/buildsScanner.ts → packages/pob-bridge/src/buildsScanner.ts
  src/pob/                     → packages/pob-ui/src/
  resources/lua/               → packages/pob-headless-glue/resources/
  ```
- 최종 구조:
  ```
  packages/
  ├── launcher/           ← 런처 본체 (AGPL-3.0)
  ├── pob-bridge/         ← Locator, BuildsScanner, Session (PoB MIT 상속)
  ├── pob-ui/             ← React 앱 (PoB MIT 상속, 독립 빌드 가능)
  ├── pob-headless-glue/  ← luajit.exe + HeadlessWrapper.lua + ipc_bridge.lua (PoB MIT 상속)
  ├── pob-vault/          ← PoBVault (PoB MIT 상속)
  ├── pob-repoe/          ← RePoE 캐시 + Translator + overrides (PoB MIT 상속)
  └── shared/             ← 공통 타입, registry 헬퍼
  ```

### 3. 각 package 의 package.json

- 공통 필드:
  ```json
  {
    "name": "@poe2-launcher/<name>",
    "version": "0.0.0",
    "private": true,
    "main": "dist/index.js",
    "types": "dist/index.d.ts"
  }
  ```
- 라이선스 명시 (plan §6 B 결정):
  - `launcher/package.json`: `"license": "AGPL-3.0-or-later"`
  - 나머지 packages: `"license": "MIT"` + LICENSE 파일 동봉 (PoB MIT 상속)
- 의존성:
  - root devDependencies: Electron, React, Vite, eslint, vitest, prettier 등 빌드 도구
  - 각 package 의 `peerDependencies`: 사용하는 root dep 선언만 (실제 install 안 함)
  - package 간 의존: `"dependencies": { "@poe2-launcher/shared": "*" }` 식

### 4. tsconfig + vite 설정

- 새 파일: 각 package 의 `tsconfig.json` (root tsconfig 상속)
- [../../tsconfig.json](../../tsconfig.json) (편집) — `paths` alias 추가:
  ```json
  {
    "compilerOptions": {
      "paths": {
        "@poe2-launcher/shared": ["packages/shared/src"],
        "@poe2-launcher/shared/*": ["packages/shared/src/*"],
        "@poe2-launcher/pob-bridge": ["packages/pob-bridge/src"]
        // ...
      }
    }
  }
  ```
- [../../vite.config.ts](../../vite.config.ts) (편집):
  - entry 경로 갱신 (`packages/launcher/index.html`, `packages/pob-ui/index.html`)
  - resolve.alias 추가
- [../../electron-builder.json](../../electron-builder.json) (편집): files 경로 갱신

### 5. import 경로 일괄 변경

- 기존 상대경로 (`../utils/registry`) → 절대경로 (`@poe2-launcher/shared/registry`) 일괄 치환
- 스크립트 (`scripts/migrate-imports.mjs`) 작성하여 자동화

### 6. CI 갱신

- `.github/workflows/*.yml` 의 명령어 갱신:
  - `npm run lint` → 그대로 (root 가 모든 workspace 처리)
  - `npm test` → 그대로
  - `npm run build` → 그대로
- 보류: `pob-ui-build.yml` artifact 업로드 workflow 는 향후 `pob-ui` 레포지토리 분리 시 별도 정의한다. 현재 PR-N 에서는 release 때 같이 배포하지 않으므로 새 `actions/upload-artifact` 의존성을 추가하지 않는다.

### 7. 라이선스 파일

- `packages/launcher/LICENSE` — AGPL-3.0
- 나머지 packages 각각 `LICENSE` — MIT + 사본 (Anthropic 또는 NERDHEAD 명의)
- 루트 `LICENSE` — 기존 AGPL 유지

## 결정 사항 (plan §6 에서 참조)

- **Q2**: npm workspaces 로 시작 (pnpm 마이그레이션은 별도 트랙)
- **B (라이선스)**: launcher 본체 AGPL, PoB 래핑 모듈 (pob-\*) MIT
- **Phase 6 원칙**: 마지막에 한 번에 분리, 중간 분리 금지

## 검증 시나리오

1. **WSL 검증**: lint, type check (`npm run lint`, `npx tsc --noEmit`) 통과
2. **Windows pwsh 검증**:
   - `npm ci` (workspaces 모드로 hoist) 성공
   - `npm run build` → electron-builder 패키징 정상
   - `npm run dev` → 메인 launcher + PoB Unofficial Wrapper Window 정상 동작
   - vitest 전 케이스 통과 (PoBSession 통합 테스트 포함)
3. **독립 빌드**: `npm run build --workspace=@poe2-launcher/pob-ui` → `packages/pob-ui/dist/` 생성, electron 없이 단독 React 빌드 검증
4. **import 검증**: 임의 파일에서 `import { ... } from '@poe2-launcher/pob-bridge'` 동작
5. **라이선스 검증**: PoB 래핑 모듈에 AGPL-3.0 헤더가 들어가지 않았는지 grep

## 마일스톤

PR-N 완료 후 본 통합의 monorepo 분리 트랙은 종료. 이후는:

- 패시브 트리 옵션 A 마이그레이션 (현재 옵션 C 임시)
- Phase 5.5 의 #2~#5 데이터 점진 대체
- 트레이 메뉴, 단축키, 우클릭 컨텍스트 메뉴 등 후순위 (handoff 문서)
- pnpm 마이그레이션 검토

## 참고

- npm workspaces docs: https://docs.npmjs.com/cli/v10/using-npm/workspaces
- plan §2 모노레포 분리안 (구조도)
- CLAUDE.md WSL 규칙: `npm install` 은 Windows 에서만

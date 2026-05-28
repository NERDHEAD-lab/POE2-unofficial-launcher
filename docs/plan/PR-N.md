# PR-N: Monorepo 분리 (npm workspaces)

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-10](PR-10.md) 머지로 M7 BETA 출시 후보 달성 후
> 후속: 본 PR 이 마지막. 이후는 별도 트랙 (Phase 5.5 점진 대체, 패시브 트리 옵션 A 마이그레이션, 트레이/핫키 등)

## 목표

본 통합 작업 동안 `src/main/services/pobRepoe/`, `src/main/services/pobVault/`, `src/pob/` 등에 흩어진 코드를 **npm workspaces 모노레포로 분리** — 향후 `pob-ui` 만 독립 빌드/배포 가능.

**중요**: PR-10 머지 시점에 **M7: BETA 출시 후보**를 달성하고, 본 PR 은 그 직후 진행하는 **마지막 단계**다. 중간에 분리하면 PR 충돌이 폭발 (plan §3 Phase 6 명시)하므로 PR-3-2 ~ PR-10 머지 완료 후 단일 PR 로 진행.

단, PR-3-2 ~ PR-10 은 handoff §4.5 의 "패키지 분리 대비 규칙"을 지킨 상태여야 한다. PR-N 은 새 경계 설계 PR 이 아니라, 이미 지켜 온 경계를 npm workspaces 구조로 옮기고 독립 빌드를 검증하는 PR 이다.

## 종료 기준

- [ ] `package.json` 의 `"workspaces": ["packages/*"]` 동작
- [ ] 모든 코드가 `packages/<name>/src/` 구조로 이동
- [ ] 각 package 의 `package.json` 에 scoped name 부여 (`@poe2-launcher/...`)
- [ ] launcher 본체 빌드 정상 (`npm run build`)
- [ ] `packages/pob-ui` 만 별도 빌드 가능 (`npm run build --workspace=@poe2-launcher/pob-ui`)
- [ ] 모든 vitest 통과
- [ ] eslint / prettier 통과
- [ ] Windows 에서 `npm run dev` 수동 검증 + electron-builder 패키징 통과

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
- 새 워크플로우 추가: `pob-ui-build.yml` — `pob-ui` 만 빌드해서 artifact 업로드 (독립 배포 검증)

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
   - `npm run dev` → 메인 launcher + POB i18n Window 정상 동작
   - vitest 전 케이스 통과 (PoBSession 통합 테스트 포함)
3. **독립 빌드**: `npm run build --workspace=@poe2-launcher/pob-ui` → `packages/pob-ui/dist/` 생성, electron 없이 단독 React 빌드 검증
4. **import 검증**: 임의 파일에서 `import { ... } from '@poe2-launcher/pob-bridge'` 동작
5. **라이선스 검증**: PoB 래핑 모듈에 AGPL-3.0 헤더가 들어가지 않았는지 grep

## 마일스톤

PR-N 머지 후 본 통합의 모든 PR 완료. 이후는:

- 패시브 트리 옵션 A 마이그레이션 (현재 옵션 C 임시)
- Phase 5.5 의 #2~#5 데이터 점진 대체
- 트레이 메뉴, 단축키, 우클릭 컨텍스트 메뉴 등 후순위 (handoff 문서)
- pnpm 마이그레이션 검토

## 참고

- npm workspaces docs: https://docs.npmjs.com/cli/v10/using-npm/workspaces
- plan §2 모노레포 분리안 (구조도)
- CLAUDE.md WSL 규칙: `npm install` 은 Windows 에서만

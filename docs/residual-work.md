# 잔여작업 (범용)

> 작성일: 2026-05-20 · 브랜치: `fix/custom-font` 작업 중 발견되었으나
> 폰트 PR과 무관해 분리한 항목.
> 폰트 전용 잔여작업은 `docs/font-analysis/font-residual-work.md` 참조.

이 문서는 **폰트 작업과 분리되어야 할 hotfix 후보**와 **재작업 시 시간
절약용 환경/도구 메모**를 모은다. 폰트 PR에 끌고 들어가면 안 되는 변경이
한 PR에 섞이는 사고를 막는 게 목적.

---

## 0. [최우선] eslint-plugin-react-hooks 7.1 신규 룰 위반 정리

> 2026-05-21 작업. 다음 세션 진입 시 이 섹션부터 처리할 것.
> 컨텍스트: #164(`chore: eslint v10 + eslint-plugin-react-hooks 7.1
업그레이드`, squash `ab49cdc`)에서 lint v10 메이저로 올리면서
> react-hooks 7.1의 신규 룰 두 개가 기존 코드 14건을 잡아냈다. 의존성
> 업그레이드와 코드 수정을 분리하기 위해 두 룰만 **임시 off**로 머지함
> ([eslint.config.mjs](../eslint.config.mjs) L31-L35 TODO 주석 참조).
> 이 섹션은 본 임시 disable을 걷어내기 위한 정리 작업 명세다.

### 0.1 작업 목표

1. 14건의 react-hooks 위반을 코드 수정으로 해소.
2. `eslint.config.mjs`의 두 줄 disable 제거:
   - `"react-hooks/set-state-in-effect": "off"`
   - `"react-hooks/refs": "off"`
3. `npm run lint` 통과 확인 후 PR.

### 0.2 작업 진행 방식

- **별도 브랜치/PR**: `fix/react-hooks-violations` (master 기반).
- **disable 잠정 유지**: 수정 진행 중 일부 파일 lint 실패 가능 → 모든
  위반 정리가 끝난 마지막 커밋에서 disable 두 줄을 제거하는 게 깔끔.
- **WSL ↔ Windows 빌드 분기 준수**: `npm run lint` / `npm test`는 WSL
  bash, `npm run build:check`는 pwsh로 (§2.1).
- **lock 변경 금지**: 본 작업은 코드 수정만. `package.json` /
  `package-lock.json` 건드리지 말 것. 만약 변동되면 WSL↔Windows npm i
  사고일 가능성 (§1.2 패턴) — `git checkout master -- package*.json`.

### 0.3 위반 14건 상세

신규 룰 두 종류:

| 룰                                | 카운트 | 의미                                                           |
| --------------------------------- | ------ | -------------------------------------------------------------- |
| `react-hooks/refs`                | 8건    | 렌더 중 ref 값 읽기/쓰기 금지                                  |
| `react-hooks/set-state-in-effect` | 6건    | useEffect 본문에서 동기 setState 호출 금지 (cascading renders) |

파일별 위반 위치 (master `ab49cdc` 기준 라인 번호 — 작업 시 drift 가능,
파일에서 grep으로 위치 재확인할 것):

#### A. `react-hooks/refs` (8건)

1. [src/renderer/components/DebugConsole.tsx:125](../src/renderer/components/DebugConsole.tsx#L125)
   - `bottomRef: bottomRef as React.RefObject<HTMLDivElement>` — props 객체에
     ref 담아 함수에 전달.
2. [src/renderer/components/DebugConsole.tsx:134](../src/renderer/components/DebugConsole.tsx#L134)
   - `editorRef: editorRef as React.RefObject<HTMLTextAreaElement>` — 동일 패턴.
3. [src/renderer/components/DebugConsole.tsx:395](../src/renderer/components/DebugConsole.tsx#L395)
   - `getLogViewerProps(filter)` 호출 시 내부에서 ref 접근 발생.
4. [src/renderer/components/DebugConsole.tsx:400](../src/renderer/components/DebugConsole.tsx#L400)
   - `getConfigViewerProps()` 호출 시 동일.
5. [src/renderer/components/modals/FontCatalogModal.tsx:254](../src/renderer/components/modals/FontCatalogModal.tsx#L254)
   - `container={modalRef.current}` — 렌더 중 `.current` 직접 접근 (Toast portal target).
6. [src/renderer/components/modals/FontManagerModal.tsx:306](../src/renderer/components/modals/FontManagerModal.tsx#L306)
   - 동일 (`container={modalRef.current}`).
7. [src/renderer/components/settings/SettingsContent.tsx:118](../src/renderer/components/settings/SettingsContent.tsx#L118)
   - `buttonTextRef.current = buttonText` — 렌더 중 ref 할당.
8. [src/renderer/components/settings/SettingsContent.tsx:120](../src/renderer/components/settings/SettingsContent.tsx#L120)
   - `variantRef.current = variant` — 동일 패턴.

#### B. `react-hooks/set-state-in-effect` (6건)

1. [src/renderer/components/modals/FontCatalogModal.tsx:141](../src/renderer/components/modals/FontCatalogModal.tsx#L141)
   - `useEffect`에서 `loadCatalog()` 호출 → 내부 setState.
2. [src/renderer/components/modals/FontManagerModal.tsx:156](../src/renderer/components/modals/FontManagerModal.tsx#L156)
   - `useEffect`에서 `fetchFonts()` 호출 → 내부 setState.
3. [src/renderer/components/modals/NoticeModal.tsx:68](../src/renderer/components/modals/NoticeModal.tsx#L68)
   - `useEffect`에서 `loadContent()` 호출 → 내부 setState.
4. [src/renderer/components/settings/SettingsContent.tsx:92](../src/renderer/components/settings/SettingsContent.tsx#L92)
   - `setDescriptionBlocks([{ text: item.description, variant: "default" }])`.
5. [src/renderer/components/settings/SettingsContent.tsx:170](../src/renderer/components/settings/SettingsContent.tsx#L170)
   - `useEffect`에서 `resetDescription()` 호출 → 내부 setState.
6. [src/renderer/components/ui/ConfirmModal.tsx:34](../src/renderer/components/ui/ConfirmModal.tsx#L34)
   - `setTimeLeft(timeoutSeconds)` — effect 진입 시 1회. 룰 의도와는
     약간 결이 다른 케이스로, **`useState`의 초기값으로 빼면 해소** 가능성.

### 0.4 수정 방향 가이드

룰 문서 참고: https://react.dev/learn/you-might-not-need-an-effect

#### `set-state-in-effect` 패턴 처리

- **모달 진입 시 데이터 로드 (1, 2, 3, 5번)**: 함수 호출 자체가 문제가
  아니라 effect body에서 동기 setter를 부르는 게 문제. 두 가지 옵션:
  - (a) 로드 함수를 비동기로 감싸기: `Promise.resolve().then(loadCatalog)`
    또는 `queueMicrotask(loadCatalog)`. 가장 적은 변경.
  - (b) 데이터 로드를 비동기 콜백 안에서만 setState 하도록 구조 변경:
    `useEffect(() => { fetchCatalog().then(setCatalog); }, [...])`.
    이미 그렇게 되어 있을 가능성 높으니 함수 내부 확인 필요.
- **`SettingsContent.tsx:92` (`setDescriptionBlocks`)**: useEffect 시작 시
  description 동기화. → derived state로 만들거나 (`useMemo`), 입력값
  변화 시점에 set으로 처리.
- **`ConfirmModal.tsx:34` (`setTimeLeft`)**: effect 진입 시 1회 초기화.
  → `useState`의 lazy initializer로 옮기거나, `isOpen` 변화시점에 setter
  를 effect 밖에서 처리하는 패턴 검토.

#### `refs` 패턴 처리

- **`SettingsContent.tsx:118/120` (`ref.current = value` 렌더 중 할당)**:
  안티패턴. `useLayoutEffect`로 옮기는 게 React 정석 (값 동기화).
- **`container={modalRef.current}` (5, 6번)**: portal target에 ref
  직접 전달. callback ref + state로 잡거나 `useLayoutEffect`에서 state
  로 캐시해서 전달. 또는 ref를 일급으로 받는 portal API 사용.
- **`DebugConsole.tsx` 1~4번 (props 객체에 ref 담아 함수에 전달)**:
  함수가 ref를 props로 받는 구조. `React.forwardRef` 패턴이나 ref 자체
  대신 callback ref(`onMount` 같은 콜백)를 props로 넘기는 방식 검토.
  네 군데가 같은 구조라 한 군데 패턴 잡으면 나머지 동일하게 적용 가능.

### 0.5 검증

```bash
# WSL bash
npm run lint                                  # exit 0 기대
node node_modules/eslint/bin/eslint.js src    # RTK 우회 직접 확인 (§2.5)
```

빌드 검증은 §2.1에 따라 pwsh:

```powershell
cd D:\project_poe2\POE2-unofficial-launcher
npm run build:check
```

### 0.6 disable 제거 (마지막 단계)

`eslint.config.mjs` L30~L35의 TODO 주석 4줄 + disable 2줄을 삭제. 직전
master 시점에 추가된 [eslint.config.mjs#L30-L35](../eslint.config.mjs#L30):

```js
// TODO(fix/react-hooks-violations): eslint-plugin-react-hooks 7.1에서
// 새로 추가된 두 룰이 기존 코드의 hook 패턴 14건을 잡아낸다.
// eslint v10 업그레이드와 코드 수정 PR을 분리하기 위해 임시 off.
// 별도 PR에서 위반 정리 후 이 두 줄 삭제할 것.
"react-hooks/set-state-in-effect": "off",
"react-hooks/refs": "off",
```

위 블록 통째로 제거 후 lint 한 번 더 돌려 확인.

### 0.7 컨텍스트 (왜 이런 PR 시퀀스가 됐는지)

`master` 로그 기준 작업 흐름 (Renovate가 막혔던 메이저 업그레이드를 풀어낸 시퀀스):

- `cf94708` #120 @vitejs/plugin-react v6 (merge)
- `7352870` #122 vite v8 (merge)
- `3bcbd8b` #161 esbuild devDep 추가 (squash) — vite v8가 esbuild를
  자체 deps에서 빼면서 발생한 빌드 차단 해소.
- `417deec` #131 typescript v6 (merge) — `tsconfig.json`의 baseUrl
  deprecation 격상 차단을 #160에서 선제 해결.
- `65a2568` #160 tsconfig baseUrl/paths 제거 (merge).
- `14b75b7` #162 eslint-plugin-import → eslint-plugin-import-x 교체
  (squash) — 본가가 eslint v10 peer 미지원 (`^2 || ... || ^9`)이라
  fork로 교체. 자세한 유지보수 정체 근거는 본 문서 작성 시점 세션 기록.
- `5d621de` #163 RTK lint 출력 이슈 메모 (squash) — §2.5.
- `ab49cdc` #164 eslint v10 + react-hooks 7.1 (squash) — Renovate
  PR #111이 lock 재생성 실패로 막혀 우리가 직접 진행. lock의 핀
  (`react-hooks@7.0.1`)이 v10 호환 불가라 명시적으로 `^7.1.1`로
  올려야 했음. **본 §0이 이 PR의 잔여작업.**
- Renovate PR #111은 `chore(deps): Update lint & format to v10`이었고,
  본 PR #164가 동일 목적을 직접 처리했기에 close 처리 (master에 의존성
  변경 흡수됨).

### 0.8 함정 박제

- **lock에 핀된 버전이 `package.json` range를 깨고 업그레이드를 막을 수
  있다.** master `^7.0.1`이라도 lock이 `7.0.1`이면 npm은 7.1을 안
  고른다. ERESOLVE처럼 보이지만 진짜 원인은 *lock에 박힌 transitive*가
  range 밖의 의존성을 강제하는 것. 같은 함정 만나면 `npm ls <pkg>` +
  `npm view <pkg>@<locked-version> peerDependencies` 조합으로 판별.
- **`renovate/artifacts: FAILURE`는 Renovate의 lock 재생성 실패 신호.**
  CI보다 먼저 보면 시간 절약. 이게 떠 있으면 PR을 그대로 두지 말고
  근본 원인 파악(보통 peer 충돌).

---

## 1. 폰트 릴리즈 이후 작업

### 1.1 config-integrity 테스트 1건 fail

- `theme_mode_poe1`/`theme_mode_poe2`가 `settings-config.ts` UI 아이템인데
  `DEFAULT_CONFIG`에 키 없음. 폰트 작업 git diff 무관 = 사전 버그.
- **수정안**: `DEFAULT_CONFIG`에 두 키 기본값 추가 (테마모드 기본 정책
  확인 후).
- **현재 진단성**: 실패 시 assertion message에 누락 키+해결법 직접 노출
  (`console.warn` 의존 제거 완료).
- **hotfix 브랜치 별도 진행 예정** (사용자 결정). 폰트 PR에 포함 금지.

### 1.2 axios 1.16 우연 업그레이드 → `PatchManager.ts:445` TypeScript 에러

- WSL↔Windows `npm i` 반복으로 `package-lock.json` 재생성되며
  `axios 1.15.0 → 1.16.1` minor bump.
- 1.16에서 `AxiosHeaderValue` union이 `number|boolean|AxiosHeaders` 추가되어
  `parseInt(response.headers["content-length"])`가 TypeScript 에러
  ([src/main/services/PatchManager.ts:445](../src/main/services/PatchManager.ts)).
- **현재 상태**: `git checkout master -- package-lock.json && npm ci`로
  1.15.0 회귀, 빌드 통과.
- **hotfix 처리안**: axios 1.16+ 의도적 업 + 코드 수정 (`String(...)` 캐스팅)
  묶어 별도 PR. 폰트 릴리즈 이후. 폰트 PR에 포함 금지.

### 1.3 B-2차: 설치 HKLM → HKCU 전환 (기능 작업 — 우선순위 ★ 중)

원래 `font-residual-work.md`에 있던 항목. **hotfix가 아닌 별도 기능 작업**
규모라 폰트 릴리즈 이후 별도 브랜치로 이관 (2026-05-20 결정).
상세: `font-analysis/bugfix-hkcu-font-removal-plan.md` §8.

- **목적**: `installSystemFont`가 HKLM(`%windir%\Fonts`)에만 설치 → 항상
  관리자 권한 필요. Windows 1809+ 표준 HKCU
  (`%LOCALAPPDATA%\Microsoft\Windows\Fonts`)으로 전환 → UAC 불필요.
- **선결 리스크 (plan §8.3)**: 게임/배프 패치가 HKCU 등록 폰트를 실제로
  인식하는지 검증 필요. 미해소 시 "설치는 됐는데 게임이 폰트 못 읽음"
  회귀. admin 실행 시 HKCU 하이브 오인 문제(B-1차 §4-1과 동일 논점).
- **안전망**: B-1차(제거 대칭화)가 선행돼 있어 HKCU 설치 후 제거는 이미
  양쪽 훑음 — 잔재 회수 안전망 확보됨.
- 첫 폰트 릴리즈 묶음에 있었다면 schema bump·마이그레이션 불필요했으나,
  분리됨에 따라 별도 처리 시 마이그레이션 검토 필요.

---

## 2. 환경/도구 메모 (재작업 시 시간 절약)

### 2.1 WSL ↔ Windows 빌드 분기 (CLAUDE.md `## Commands` 박제 완료)

- `uname -r`에 `microsoft`/`WSL` 포함 → WSL.
- WSL bash에선 `npm run lint` / `npm test`만 직접 (Node 스크립트라 동일 결과).
- `npm run build:check`는 `pwsh.exe`(PowerShell 7) 우선, 없으면
  `powershell.exe`(5.1) 폴백.
- **WSL↔Windows 왔다갔다 `npm i` 금지** — lock 우연 변동이 의존성 minor
  bump를 유발해 무관한 TypeScript 에러를 다른 PR에 끌고 옴(§1.2 사례).
  `npm ci`만 사용.

### 2.2 WSL 테스트/빌드 부팅 실패 (rollup 플랫폼 모듈)

- `/mnt/d` 작업트리에 Windows용 `node_modules` →
  `@rollup/rollup-linux-x64-gnu` 누락으로 vitest/vite 부팅 실패.
- **우회**: `npm install --no-save @rollup/rollup-linux-x64-gnu@<rollup버전>`
  (package.json 영향 없음, 커밋 대상 아님).
- **근본**: WSL에서 작업 시 WSL 전용 lock/install 분리 — 현재는
  Windows에서 `npm ci` + WSL은 lint/test만 도는 분기로 우회 중(§2.1).

### 2.3 pre-commit 17~20s

- ESLint+typescript-eslint 콜드스타트 (데몬 아님).
- eslint_d는 Windows/CI 제약, `--cache` 효과 미미 → **미수정, 트레이드오프
  수용**. 커밋 느려도 정상.
- 개별 우회: `--no-verify`.

### 2.4 설정 추가 규칙

- `AppConfig` 필드 추가 시 `config-management` 스킬 필수
  (AppConfig + CONFIG_METADATA + DEFAULT_CONFIG 세 곳 동기화).
- UI 노출 시 추가로 `settings-management` 스킬.
- 누락 시 ORPHANED config 발생.

### 2.5 RTK가 `npm run lint` 출력에 lint 대상 외 파일을 섞어 보여줌

- `package.json`의 lint 스크립트는 `eslint src`라 **`src/` 만 검사 대상**.
- 그러나 `npm run lint`(RTK 후킹 경유)의 요약 출력에는 `scripts/` 등
  **lint 대상이 아닌 파일이 issues 목록에 포함되어 표시됨**.
- 2026-05-21 재현 결과:
  - RTK 출력 상단: `ESLint: 9 errors, 1 warnings in 3 files` /
    `font-test-suite.ts`, `generate-notice-list.js`, `generate-theme-hashes.js`
    가 "Top files" 섹션에 나열됨 (모두 `scripts/` 소속).
  - RTK 우회 직접 실행: `node node_modules/eslint/bin/eslint.js src` →
    출력 없음, **exit 0 (실제로는 깨끗)**.
- 즉 RTK 요약이 lint 대상 범위를 잘못 표시 → "내 변경이 새 lint 에러를
  만들었나?" 같은 잘못된 진단을 유발할 수 있다.
- **회피**: 의심될 때 `node node_modules/eslint/bin/eslint.js <범위>`로
  직접 실행해 exit code와 실제 결과를 확인.
- **RTK 저장소 보고용 재현 시나리오**:
  - 환경: WSL2 (`Linux 6.6.87.2-microsoft-standard`) + bash + Claude
    Code Bash hook + RTK 후킹.
  - 프로젝트의 `package.json` lint 스크립트가 디렉터리 한정 (`eslint src`).
  - `npm run lint` 실행 시 RTK 요약 출력에 검사 대상 외 디렉터리
    (`scripts/`)의 파일이 포함되어 나옴.
  - `node node_modules/eslint/bin/eslint.js src`로 직접 돌리면 결과
    상이 (실제 깨끗).

---

## 3. 박제 핵심 (재함정 방지)

- **WSL↔Windows 왔다갔다 npm 작업 시 `npm i` 금지**. 우연 minor bump가
  무관한 PR에 TypeScript 에러로 노출됨 (§1.2 axios 사례). `npm ci`만.
- **사전 결함은 무조건 분리 PR**. config-integrity·axios처럼 폰트 작업
  중 발견됐어도 git diff 무관이면 hotfix 브랜치 따로. 폰트 PR이 통과 못
  하는 일을 막음.

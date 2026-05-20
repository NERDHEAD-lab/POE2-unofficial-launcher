# 잔여작업 (범용)

> 작성일: 2026-05-20 · 브랜치: `fix/custom-font` 작업 중 발견되었으나
> 폰트 PR과 무관해 분리한 항목.
> 폰트 전용 잔여작업은 `docs/font-analysis/font-residual-work.md` 참조.

이 문서는 **폰트 작업과 분리되어야 할 hotfix 후보**와 **재작업 시 시간
절약용 환경/도구 메모**를 모은다. 폰트 PR에 끌고 들어가면 안 되는 변경이
한 PR에 섞이는 사고를 막는 게 목적.

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

# AGENTS.md — POE2 Unofficial Launcher

Electron + React 19 + Vite 8 + TypeScript launcher for Path of Exile / PoE 2.
Layout: `src/main/` (Electron main), `src/renderer/` (React UI), `src/shared/` (shared types).

This file is the **single source of project rules for all coding agents**
(Codex, Claude, Gemini, …). `CLAUDE.md` imports it and adds Claude-specific
routing; `GEMINI.md` just points here. Do not fork rules across entry files.

## Language

Always respond to the user in Korean (한국어). Repo docs and commit messages
follow the existing convention (mostly Korean).

## Project status — shipped, in maintenance

This is a **released product** (latest ~1.4.x) with real Windows users on
auto-update. Releases are cut automatically by release-please on every
`master` push (merge = release candidate). That changes the defaults:

- **Backward compatibility first.** Changes to config schema
  (`AppConfig`/`DEFAULT_CONFIG`), font/UAC migrations, updater flow, or
  Kakao automation selectors affect existing installs. State the blast
  radius before changing them.
- **Regressions get root cause, not patches.** Use `git log`/`git blame`
  before writing a fix.
- **Smallest correct change wins.** No drive-by refactors of the god files
  (`main.ts` ~2.8k lines, `App.tsx` ~1.3k lines) unless that is the task.

### Stop and ask before

1. Changing config schema, migration behavior, or anything that rewrites
   user data.
2. Changing IPC/EventBus boundaries, service lifecycle, or the updater/release flow.
3. Adding or major-bumping dependencies.
4. Merging to `master` (it auto-releases).

Routine fixes and edits inside an agreed task proceed without asking.

## 개발 워크플로 (feat/fix) ★core

사용자가 기능/수정 브리핑만 주어도 이 루프가 기본 동작한다. 대상: master로
갈 코드 변경(=PR) 전부.

역할 분리(필수): **구현자** = 현 세션. **설계·리뷰어** = 구현자와 분리된
컨텍스트 (Claude는 architect 서브에이전트 — CLAUDE.md 참조. 그 외 에이전트는
별도 서브에이전트 또는 구현과 분리된 리뷰 패스). 구현자는 자기 구현을 스스로
리뷰 통과시킬 수 없다.

| #   | 단계        | 수행           | 산출물/행동                                      | 진행 게이트              |
| --- | ----------- | -------------- | ------------------------------------------------ | ------------------------ |
| 1   | 계획        | 설계자         | `docs/work/YYYY-MM-DD-<주제>.md`: 마일스톤 + DoD | **사용자 승인**          |
| 2   | 브랜치      | 구현자         | master에서 `feat/*`·`fix/*`·`hotfix/*` 분기      | —                        |
| 3   | 구현        | 구현자         | 마일스톤 단위, 해당 영역 skills 준수             | 마일스톤 DoD 자체 통과   |
| 4   | 리뷰 루프   | 리뷰어↔구현자  | 판정·지적을 work 문서에 라운드별 누적            | 리뷰 통과 (최대 3라운드) |
| 5   | 사용자 검증 | 사용자         | `[사용자]` DoD의 Windows 실동작 확인             | **사용자 OK**            |
| 6   | 마무리      | 구현자         | 위키 raw 노트 → 커밋 → PR → 머지                 | **사용자 머지 승인**     |
| 7   | 릴리스      | release-please | 릴리스 PR 확인 후 머지 여부 질의, 종료           | **사용자 릴리스 결정**   |

**DoD 규약** — 각 마일스톤 = 관찰 가능한 판정 기준 + 검증 환경 태그
`[WSL | Windows-pwsh | 사용자]`. 런처/인게임/카카오 자동화가 걸린 작업은
빌드 통과로 대체 불가 — `[사용자]` DoD 필수 (아래 WSL 규칙 참조).

**리뷰 루프** — 리뷰어 입력: work 문서 + `git diff master...HEAD` + 이전
라운드 지적. 판정: `통과` / `조건부 통과`(경미 — 수정 후 재리뷰 불필요) /
`반려`(재리뷰, 라운드 소모) / `설계 결함`(라운드 소모 없이 1단계 회귀 +
사용자 보고). 리뷰 범위는 DoD + blast radius(stop-and-ask 4종) + 스킬 준수로
한정하고, 범위 밖 발견은 blocking 없이 work 문서에 남기거나 roadmap-capture
트랙 규칙대로 이관한다 (사용자 가시 → `docs/Roadmap.md`, 개발 내부 → 루트
`AGENTS-ROADMAP.md`). 3라운드 미통과 시 잔여 지적·이견을 정리해 사용자
에스컬레이션.

**PR·머지** — PR 본문 = Summary + 배경/동기만, "Test plan" 류 섹션 금지.
모든 gh 작업은 `github-cli-token` 스킬 절차. master 머지 = 자동 릴리스이므로
반드시 사용자 승인 후 실행 (stop-and-ask #4와 동일). 커밋은 WSL·Windows
어디서든 가능하다 — pre-commit이 WSL을 감지해 lint-staged를 Windows pwsh에
위임한다(#241, 아래 WSL 규칙).

**커밋 규약** — 커밋 제목은 release-please가 CHANGELOG(릴리스 노트)로
사용자에게 그대로 노출한다(본문은 미노출). Conventional Commits
(`feat`/`fix`/`refactor`/`perf`/`docs`/`chore`/`internal`) 준수 —
형식·type-enum은 commitlint(`commit-msg` 훅)이 강제하고, 아래 의미 판단은
규율로 지킨다.

- **노출 타입의 제목 = 사용자 관점 결과**, 코드 메커니즘 아님. "어느
  화면/기능에서 무엇이 달라졌나"를 한국어로, diff 없이 이해되게
  자기완결적으로. 관용구: `<맥락>에서 <증상> 문제 수정/개선`, `<조건>일 때
<동작>하도록 개선`, `<기능>을 <동작>할 수 있도록 개선`.
- **타입은 diff 모양이 아니라 사용자 영향으로 선택.** 동작·문구·UI가 바뀌면
  리팩터 위주여도 노출 타입으로 — 잘못된 동작·표시의 교정 = `fix`(patch),
  새 기능·동작 추가 = `feat`(minor), 호환성 파괴 = `!`(major, stop-and-ask).
  규모 작은 기능 개선은 `fix`로, 경계가 애매하면 사용자에게 확인. 순수 내부
  정리만 `refactor`, 빌드·툴링·CI·내부 문서 잡무는 `chore`/`internal`(숨김).
  `docs`는 노출 타입 — 사용자 문서에만. 섹션 매핑은
  `release-please-config.json`.
- **hidden 타입만으로는 릴리스가 잘리지 않는다**(release-please가 "no user
  facing commits"로 스킵). 사용자 대상 변경에 `chore`를 붙이면 배포가
  누락되고, 노출 타입(refactor 포함)은 단독으로도 릴리스 PR을 만든다.
- **본문 = 기술 상세**(왜/어떻게·근거·테스트·blast radius). 자명한 수정은
  생략 가능.

**마무리 체크리스트(6단계)**: ① 위키 raw 노트
(`~/project_llm_wiki/raw/projects/poe2-launcher/`) 작성 — `/ingest`는 위키
저장소에서 수행(불가 시 사용자에게 요청) ② work 문서를 `docs/archive/`로
이동 ③ 커밋·PR·(승인 후) 머지.

**경량 트랙**: 명백히 국소적인 fix(설계 판단·stop-and-ask 비해당, 마일스톤
1개)는 계획을 대화 내 요약+DoD로 갈음하고 work 문서·위키 노트를 생략할 수
있다. 단 핵심 게이트(계획 승인·분리 리뷰·사용자 검증·머지 승인)는 생략 불가.

## Documentation map

- `docs/README.md` defines the repo doc system: `docs/` root = user-facing
  (do not move), `docs/work/` = in-flight work notes
  (`YYYY-MM-DD-<topic>.md`), `docs/archive/` = completed work docs.
  Non-trivial work starts by checking `docs/work/` and ends by updating it.
- Roadmaps — two tracks (routing rule in the `roadmap-capture` skill):
  `docs/Roadmap.md` + `docs/roadmap/` = **user-facing product roadmap**,
  CI-coupled (master push syncs GitHub Issue #7 + the gh-pages notice —
  public text, do not move); root `AGENTS-ROADMAP.md` = **agent-internal
  engineering roadmap** (dev tooling, build/CI, refactors, tech debt —
  not CI-coupled).
- **LLM wiki** (deep architecture context, Korean):
  `~/project_llm_wiki/wiki/projects/poe2-launcher.md` + subpages. Read it
  for non-trivial work, **but it is stale after 2026-05 — cross-verify
  load-bearing claims against source and `git log`.**
  After meaningful decisions/analysis: dump a raw note to
  `~/project_llm_wiki/raw/projects/poe2-launcher/<YYYY-MM-DD>-<topic>.md`,
  then run `/ingest raw/projects/poe2-launcher/<file>.md` in the wiki repo.
- `README.md`/`docs/README_KR.md` describe user-facing behavior (rewritten
  2026-05-13). `CHANGELOG.md` is release-please generated.

## Commands

- `npm run dev` — Vite dev server (Electron). `chcp 65001` for UTF-8 on Windows.
- `npm run build` — `tsc && vite build && electron-builder`. `npm run build:check` skips packaging.
- `npm test` — vitest. `npm run lint` / `npm run lint:fix` — eslint on `src`.
- `npm run format` — prettier.
- Husky + lint-staged run eslint --fix + prettier on commit.

## GitHub CLI token

Before any repo-local `gh` command or GitHub HTTPS push, follow
`.agents/skills/github-cli-token/SKILL.md` (repo-local `GH_TOKEN` injection;
never mutate global gh auth state).

## Skills (`.agents/skills/`)

Plain-markdown playbooks, agent-agnostic — read the SKILL.md before working
in its area:

- `architecture-management` — lifecycle phases, service startup/shutdown,
  EventBus/IPC boundaries, shared state ownership, cross-module workflows.
- `config-management` — MANDATORY for any `AppConfig` field change (type +
  `CONFIG_METADATA` + `DEFAULT_CONFIG`; `CONFIG_KEYS` only for legacy
  call-sites). Includes the `gameInstallPaths` install-path area.
- `settings-management` — settings-screen UI items (pair after
  config-management when the field has UI).
- `event-ipc-integration` — new events, EventBus subscription via
  `CORE_EVENT_HANDLERS`, renderer IPC sync.
- `kakao-automation` — any change under `src/main/kakao/` or the KakaoGames
  starter/UAC path: selector-from-dump policy, SecurityCenter visibility
  classification, real-user blast radius.
- `roadmap-capture` — when work is deferred to later ("나중에", backlog,
  roadmap requests): two tracks — user-visible product change →
  `docs/Roadmap.md` (CI-synced to Issue #7 + gh-pages notice, public
  wording gate); dev-internal (tooling/build/CI/refactor/tech debt/agent
  workflow) → root `AGENTS-ROADMAP.md` (not CI-coupled).
- `windows-electron-debugging` — **mandatory single owner** for every
  WSL→Windows command (tests/lint/build/dev), hidden process lifecycle, Electron
  runtime/CDP/screenshots and cleanup. Read it before any Windows execution.
- `github-cli-token` — see above.

### Windows Electron QA visibility

- Agent-driven Windows commands and Electron QA must follow the mandatory
  `windows-electron-debugging` skill from first WSL interop through exact owned
  cleanup. Do not substitute a second launcher or direct Windows interop.
- Electron QA must remain hidden, use the real app, and use an isolated
  temporary profile rather than the user's launcher profile.
- Show or focus a QA window only when the behavior cannot be verified while
  hidden. Explain why and obtain the user's confirmation before making it
  visible.

Project-specific recipes (after reading the skill):

- Repository cwd: `/mnt/d/project_poe2/POE2-unofficial-launcher` ↔
  `D:\project_poe2\POE2-unofficial-launcher`.
- Hidden launcher variables: `ELECTRON_START_HIDDEN`, `ELECTRON_QA_RUN_ID`,
  `ELECTRON_REMOTE_DEBUGGING_PORT`, `ELECTRON_QA_USER_DATA_DIR`.
- Renderer target: `http://localhost:54321/`; project CDP capture script:
  `scripts/qa/cdp-capture.cjs` (`CDP_PORT`, `CDP_TARGET_URL`, `CDP_OUTPUT`).
- `dev:wsl` uses `scripts/qa/hidden-electron-launch.cjs`; it selects a unique CDP
  port and succeeds only when its owned child exposes the run-marked exact
  renderer target. Its default isolated profile is outside the repository under
  `%TEMP%\poe2-unofficial-launcher-codex-qa\<runId>`; ready evidence records the
  absolute profile path and matching run ownership marker.
- Kakao dump source: `%TEMP%\poe2-unofficial-launcher\kakao-page-dumps`;
  preserve selected evidence only under this repository's `.tmp` directory.

## WSL execution rules (detect at session start)

If `uname -r` contains `microsoft`/`WSL`, this is WSL — WSL is the
development primary (edit/git/inspection) and Windows is the build/run
primary (Electron + actual POE/POE2 game test, which Linux cannot run).
Both OSes share the same `node_modules` under `D:\project_poe2\POE2-unofficial-launcher\`.

Split work by where it belongs:

- WSL bash, direct: pure Node scripts only (e.g. `node -e ...` hypothesis
  checks). **eslint/vitest both require Linux-native binaries
  (`unrs-resolver`, `@rolldown/binding-linux-x64-gnu`) that are absent in
  this shared `node_modules` — they fail in WSL; do not try.**
- Windows: `npm install`, `npm ci`, tests, lint, build, dev, Electron, CDP and
  Windows-only probes. From WSL, read and follow
  `.agents/skills/windows-electron-debugging/SKILL.md`; it owns the exact
  hidden runner invocation, sync/detached modes, logs, timeouts and cleanup.
- Do not improvise a second WSL→Windows launcher or bypass the runner after a
  failure. Report the actionable runner failure or ask the user to execute the
  command in an already-visible Windows terminal.

Why `npm install`/`npm ci` must not run in WSL: WSL's npm writes only POSIX
symlinks under `node_modules/.bin/` and does not create the Windows wrappers
(`.cmd`, `.ps1`). The next `npm run build` / `npm run dev` from Windows then
fails with `'tsc' is not recognized` / `'vite' is not recognized`. If
dependencies need reinstalling (lock conflict, native binding error,
pre-commit hook failing on unrs-resolver, etc.), ask the user to run
`npm ci` from Windows pwsh — do not auto-repair from WSL.

The pre-commit hook is the sole direct-interop exception: `.husky/pre-commit`
detects WSL and internally delegates
lint-staged to Windows pwsh (path via `wslpath -w`), so `git commit` from WSL
passes without `--no-verify` while still running eslint/prettier through the
Windows `node_modules` (#241). If pwsh/`wslpath` are missing it fails closed
(`exit 1`) — do not reach for `--no-verify`; fix the tooling or commit from
Windows instead.

The `commit-msg` hook (commitlint) is pure JS with no native bindings and also
runs fine in WSL. Both commit hooks are fine in WSL; only the `npm`
install/build/lint/test commands above still require Windows.

Tasks requiring in-game verification (e.g. font work, launcher boot): a
passing build is not sufficient — always request the user's live check on
Windows.

## Code style

- State assumptions; ask when ambiguous.
- Minimum code that solves the problem. No speculative abstractions.
- Surgical edits — every changed line traces to the task.
- Define a verifiable success check before declaring done.

# PoB Unofficial Wrapper 통합 — 핸드오프 문서

> 작성일: 2026-05-26 · 최종 정리: 2026-05-29
>
> 완료 이력은 [pob-completed-work.md](pob-completed-work.md) 로 옮겼다. 이 문서는 새 세션이 바로 이어서 작업할 수 있게 **현재 상태, 잔여 작업, 규칙**만 유지한다.

---

## 0. 30초 컨텍스트

`POE2-unofficial-launcher` (Electron + React 19 + Vite, AGPL-3.0) 에 **PoB Unofficial Wrapper (BETA)** 기능을 추가하는 통합 작업.

현재 구조:

- Launcher 좌측 `PoB Unofficial Wrapper (BETA)` → 별도 BrowserWindow (`PoB 2 Unofficial Wrapper`)
- PoB Lua 코어는 사용자 설치본을 직접 spawn 하지 않고 검증된 PoBVault 사본을 LuaJIT 으로 headless spawn
- Renderer 는 `packages/pob-ui`, bridge/vault/repoe/headless glue 는 각 workspace package 로 분리
- UI 자체 문자열은 `packages/pob-ui/src/i18n/{ko,en}.json`; 게임 데이터 번역은 `packages/pob-repoe`

**현재 상태 (2026-05-29)**: PR-20 RePoE/display UX follow-up squash commit `826859e feat(POB): POB 연동 기능 추가 20 (RePoE display coverage follow-up)` 이 로컬 `feat/next-release` 에 생성됐고 아직 push 전이다. [PR-21](plan/PR-21.md)은 PR-20 이후 사용자 제보 이슈를 분석해 실제 수행 항목으로 기록할 빈 follow-up 문서로 `next` 상태이며, Passive Tree resource/cache/render 최적화는 [PR-22](plan/PR-22.md)로 이관해 `pending` 상태로 둔다. 장기 후순위 항목은 [plan/BACKLOG.md](plan/BACKLOG.md) 에 보관한다.

PR-N 수동 검증 결과:

- 실제 런처에서 `PoB Unofficial Wrapper` 버튼 클릭 시 PoB wrapper window 가 열린다.
- BuildListView 진입/표시, 빌드별 로드, Tree/Skills 등 탭 전환이 정상 동작한다.

**중요 결정**: `pob-ui-build.yml` artifact 업로드 workflow 는 현재 PR-N 에서 만들지 않는다. release 에 같이 배포하려는 단계가 아니며, 향후 `pob-ui` 레포지토리 분리 시 workflow 를 별도 정의한다.

---

## 1. 작업 재개 순서

1. [current-plan.md](current-plan.md) 에 새 미이관 항목이 있는지 확인한다.
2. 본 문서의 **§2 진행 커서** 에서 `in-progress` 행을 찾는다. 없으면 `next` 행을 찾는다.
3. 해당 PR 문서 하나만 먼저 읽고, 그 문서의 `Resume Cursor` 를 확인한다.
4. 완료 이력이나 이전 판단이 필요할 때만 [pob-completed-work.md](pob-completed-work.md), PR-ELSE, 과거 PR 문서를 참조한다.
5. 코드 sub-step 은 작게 쪼개고, Windows PowerShell 검증 후 코드 변경분만 work branch 에 커밋한다.
6. PR 완료 시 `feat/next-release` 로 돌아와 PR 번호 단위 squash commit 을 만든다.

---

## 2. 잔여 작업

### PR-11 이후 진행 커서

잔여 작업은 PR-11 부터 독립 문서로 승격했다. 새 goal 은 아래 표에서 `in-progress` 또는 `next` 행 하나만 고른 뒤 해당 PR 문서를 읽는다. 전체 PR 문서를 순회해서 진행 상태를 추론하지 않는다.

상태값:

- `next`: 다음에 시작할 PR
- `in-progress`: 현재 진행 중인 PR
- `blocked`: 사용자 결정이나 외부 상태가 필요한 PR
- `done`: `feat/next-release` 에 PR 단위 squash commit 완료
- `pending`: 선행 PR 완료 전 대기

| 순서 | 문서 | 상태 | 현재 sub-step | 작업 브랜치 | 마지막 코드 커밋 | 마지막 검증 | 다음 액션 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [PR-11](plan/PR-11.md) | done | complete | work/pob-pr-11 | 8fc34e9 | lint, npm test, build:check 통과 | 완료 |
| 2 | [PR-12](plan/PR-12.md) | done | complete | work/pob-pr-12 | 04f42b0 | lint, npm test, build:check 통과 | 완료 |
| 3 | [PR-13](plan/PR-13.md) | done | complete | work/pob-pr-13 | 67e8c1c | lint, npm test, build:check 통과 | 완료 |
| 4 | [PR-14](plan/PR-14.md) | done | complete | work/pob-pr-14 | 5d87431 | lint, focused test, npm test, build:check 통과 | 완료 |
| 5 | [PR-15](plan/PR-15.md) | done | complete | work/pob-pr-15 | 1bdffd9 | lint, focused test, npm test, build:check 통과 | 완료 |
| 6 | [PR-16](plan/PR-16.md) | done | complete | work/pob-pr-16 | b8ecef9 | lint, focused test, npm test, build:check 통과 | 완료 |
| 7 | [PR-17](plan/PR-17.md) | done | complete | work/pob-pr-17 | b246d9c | lint, focused test, npm test, build:check 통과 | 완료 |
| 8 | [PR-18](plan/PR-18.md) | done | complete | work/pob-pr-18 | 9466ec1 | lint, focused test, npm test, build:check 통과 | 완료 |
| 9 | [PR-19](plan/PR-19.md) | done | complete | work/pob-pr-19-current-plan | b2092a1 | PR-19.18 focused parser tests, lint, npm test, build:check 통과 | push 요청 대기 |
| 10 | [PR-20](plan/PR-20.md) | done | complete | work/pob-pr-20 | 826859e | dev:agent with Unnamed build, lint, npm test, build:check 통과 | 완료 |
| 11 | [PR-21](plan/PR-21.md) | next | 사용자 제보 이슈 대기 | 예정 (`work/pob-pr-21`) | 없음 | 없음 | 사용자 제보 이슈 분석 후 PR-21 실제 항목으로 기록 |
| 12 | [PR-22](plan/PR-22.md) | pending | PR-22.1 baseline agent measurement | 예정 (`work/pob-pr-22`) | 없음 | 없음 | PR-21 완료 후 Passive Tree resource/cache/render optimization 착수 |

각 PR 의 세부 컨텍스트는 해당 PR 문서의 `Resume Cursor`, `Context Notes`, `Subagent Reports`, `Decisions / Risks` 에만 기록한다. handoff 는 위 표처럼 재개 포인터와 마지막 검증 상태만 유지한다.

### 후순위 백로그

현재 직접 구현하지 않는 장기 항목은 [BACKLOG](plan/BACKLOG.md) 에 보관한다. 이 문서는 PR 진행 커서가 아니며, 다음 실제 구현 작업은 새 PR 번호와 새 PR 문서로 시작한다. Build Explorer / launcher entry UX 는 [PR-18](plan/PR-18.md) 에서 먼저 triage 했다.

- [ ] ja / ru 다국어 활성화
- [ ] 한글 번역의 인게임 용어 정합
- [ ] pnpm 마이그레이션 검토
- [ ] PoBVault 압축 옵션 및 PoB Update.exe 사용자 트리거 흐름
- [ ] PoE2 거래소 도메인별 검색 API
- [ ] PoB Archives 외부 빌드 공유
- [ ] PoB Community (PoE1) 통합
- [ ] 원본 PoB 의존성 제거 / 모든 로직 직접 구현
  - 가장 후순위 장기 목표다. 현재는 PoB 원본 parity 와 wrapper 안정화가 우선이며, 원본 의존성 제거는 데이터/계산/트리/아이템/스킬 로직이 충분히 계약화된 뒤 별도 대형 PR 로 다룬다.

---

## 3. 핵심 결정 사항

| 결정 | 내용 |
| --- | --- |
| LuaJIT 호스트 | launcher 가 `packages/pob-headless-glue/resources/lua/luajit.exe` 번들. PoB 본체 exe 직접 headless 실행 불가 |
| PoB Vault | 사용자 InstallLocation 직접 spawn 금지. 항상 `userData/pob-vault/<version>/` 검증 사본만 spawn |
| 레지스트리 | launcher registry adapter 재사용. `getPobInstallPath()` 로 PoE2 우선 |
| 모노레포 | npm workspaces. pnpm 마이그레이션은 후순위 |
| 다국어 | ko + en. en 은 PoB 원본 그대로, ko 는 현 단계 임의 번역 |
| i18n 도메인 | UI 문자열과 RePoE 게임 데이터 번역을 섞지 않음 |
| UI 포팅 | PoB Lua UI 1:1. UI 레이아웃 개선은 허용하지만 활성 컨트롤/값/의미 제거 금지 |
| 트리 렌더링 | React Canvas 자체 렌더 + PoB Lua 패스 계산. 트리 자산은 vault `TreeData/<version>/` 사용 |
| 빌드 코드 | `ipc_bridge` 가 Inflate/Deflate 를 Node zlib 으로 RPC redirect. PoB Lua 무변경 |
| Electron 보안 | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` |
| Telemetry | 없음. 오류는 launcher `logger.error()` 로 흘림 |
| License | launcher AGPL-3.0, PoB wrapping packages 는 MIT |
| 대상 게임 | PoE2 먼저. PoE1 PoB 통합은 후순위 |

---

## 4. 작업 규칙

### 4.1 Windows / WSL

- Windows PowerShell: `npm install`, `npm run build`, `npm run dev`, `npm test`, PoB Lua spawn 관련 검증
- WSL: 문서 편집, git 상태 확인, 빠른 검색
- WSL 에서 `npm install` 금지

### 4.2 PoB 코어 불변

- 사용자 InstallLocation 에 파일을 쓰지 않는다.
- vault 사본도 무결성 복제 대상으로만 취급한다.
- `HeadlessWrapper.lua` / `ipc_bridge.lua` 는 `packages/pob-headless-glue/resources/lua/` 에서만 관리한다.

### 4.3 PoB 원본 parity

- UI/UX 레이아웃 개선은 가능하지만 PoB 원본의 활성 컨트롤, option value, label, blank display 의미를 바꾸지 않는다.
- 번역 display text 를 PoB Lua 가 원본 ID/영문 identifier 를 기대하는 자리로 되돌려 보내지 않는다.
- blank string, `-`, `-%`, `- to -` 는 서로 다른 표시 상태로 취급한다.

### 4.4 계획 문서 커밋 금지

아래 문서는 계속 unstaged 상태로 유지한다.

- `docs/current-plan.md`
- `docs/pob-handoff.md`
- `docs/pob-completed-work.md`
- `docs/pob-integration-plan.md`
- `docs/plan/PR-*.md`
- `docs/check/**`

코드 sub-step 커밋에는 코드/resource/test/config 변경분만 포함한다.

### 4.5 검증 / 커밋

각 코드 sub-step 마다 Windows PowerShell 로 검증한다.

```powershell
cd D:\project_poe2\POE2-unofficial-launcher
npm run lint
npm test
npm run build:check
```

필요한 경우 focused test, `npm run build`, workspace build 를 추가한다. git commit 도 Windows PowerShell 로 실행한다.

### 4.6 사용자 확인 필요

- npm dependency 또는 새 GitHub Action 등 dependency 추가 전
- plan §5 / 활성 PR 공통 원칙과 다른 판단이 필요한 경우
- destructive git 작업, push, PR 생성
- vault 세대 수/디스크 사용 정책 변경
- PoB 호환성 회귀가 의심되는 경우

---

## 5. 자주 막힐 만한 문제

### LuaJIT 이 lcurl 로드 실패

cwd 가 InstallLocation/vault active 가 아니거나 `LUA_PATH` 가 빠졌을 가능성이 높다.

### HeadlessWrapper.lua 가 없다

PoB 설치본에는 NSIS 가 제외해서 없다. launcher bundled glue package 의 `HeadlessWrapper.lua` 를 사용한다.

### 사용자 Builds 폴더를 못 찾는다

OneDrive Documents 리다이렉트가 흔하다. Node `os.homedir()/Documents` 대신 Electron `app.getPath("documents")` 기준을 사용한다.

### InstallLocation 값이 따옴표 포함

레지스트리 `InstallLocation` 값은 `"G:\..."` 형태일 수 있다. trim quotes 가 필요하다.

### Pastebin/build code import 실패

PoB 포맷은 base64url + raw deflate 이다. `+`/`/` 치환과 padding 복원, raw inflate 를 확인한다.

### WSL 에서 vitest 실패

PoB Lua, Windows registry, Electron spawn 관련 테스트는 Windows PowerShell 에서 실행한다.

### Lua RPC timeout

`HeadlessWrapper` stdout 에 `READY` 가 찍혔는지, JSON-RPC 한 줄 프로토콜이 섞이지 않았는지 확인한다.

---

## 6. 참고 자료

- [pob-integration-plan.md](pob-integration-plan.md)
- [pob-completed-work.md](pob-completed-work.md)
- [current-plan.md](current-plan.md)
- [plan/PR-N.md](plan/PR-N.md)
- [plan/PR-ELSE.md](plan/PR-ELSE.md)
- [plan/PR-11.md](plan/PR-11.md)
- [plan/PR-12.md](plan/PR-12.md)
- [plan/PR-13.md](plan/PR-13.md)
- [plan/PR-14.md](plan/PR-14.md)
- [plan/PR-15.md](plan/PR-15.md)
- [plan/PR-16.md](plan/PR-16.md)
- [plan/PR-17.md](plan/PR-17.md)
- [plan/PR-18.md](plan/PR-18.md)
- [plan/BACKLOG.md](plan/BACKLOG.md)
- PoB 원본: `D:\project_poe2\PathOfBuilding-PoE2-KR`
- PoB Config 원본: `D:\project_poe2\PathOfBuilding-PoE2-KR\src\Modules\ConfigOptions.lua`

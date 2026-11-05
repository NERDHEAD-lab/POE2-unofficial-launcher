# 카카오 POE 홈페이지 리뉴얼 대응

> 작성일: 2026-11-05 · 상태: 진행 · 브랜치: fix/kakao-home-renewal-20261105
> 갱신: 2026-11-05

## 승인 및 작업 경계

- 사용자 승인: 홈페이지 구조 변경에 맞춰 POE1·POE2 모두 검토한다. 구 홈페이지 하위 호환은 요구하지 않는다. 대응 후 dev 빌드를 준비하고, 사용자가 직접 켜서 확인할 때까지 대기한다.
- 후속 사용자 승인: “fix 로 PR 올리고 master에 병합해서 release-pr 직전 까지 쭉 진행해줘”. 이번 fix의 commit·push·PR 작성·master 병합과 후속 release-please/릴리스 PR 상태 확인까지 진행하며, 릴리스 PR 병합·태그·배포 전 정지한다.
- 실제 Windows 사용자 실행 결과는 아직 보고되지 않았다. 이 후속 진행/병합 승인을 사용자 실동작 PASS로 해석하지 않는다.
- 이번 작업에서 앱·게임·Electron·GUI 실행은 숨김을 포함해 금지한다. 공유 데스크톱을 사용하지 않는다. 비간섭 CLI 검증 및 승인된 원격 전달만 진행한다.
- 적용 임시 지시: root 평가 `poe-kakao-desktop-busy-20261105` revision 2, 사용자 명시 허용까지 유효. 완료 보고나 사용자 직접 실행은 에이전트의 앱 실행 권한이 아니다.
- config/사용자 데이터/IPC/EventBus/lifecycle/updater/의존성의 제품 변경은 범위 밖이다. 기존 master의 의존성 lock은 fix payload와 섞지 않는다.
- 단독 writer: 이 work unit. 기존 dirty `AGENTS.md`, `docs/README.md`, untracked `.codex/` 및 다른 work 문서, 기존 ignored 산출물은 보존한다.

## 기준 코드 및 근본 원인

- 기준 HEAD: `bc7ad750797ffa9bc2db47b83165fd793f804985` (현재 설치와 같은 1.7.4 코드). 오래된 local master `92f6a79`로 돌아가지 않고 이 HEAD에서 fix 브랜치를 생성했다.
- read-only origin/master `6f79e75d52a5c872a3ef0f7c3e1f6487956aedbf`도 1.7.4다. 이후 두 dependency-only commit은 이번 범위에서 따라가지 않는다. `git diff HEAD origin/master -- src/main/kakao/preload.ts src/shared/kakao-url-policy.ts`는 차이가 없다.
- 후속 PR 단계에서는 origin/master를 fetch하여 위 SHA가 현 원격 기준임을 확인했다. 기존 검토 기준 branch는 `fix/kakao-home-renewal-20261105-reviewed-baseline`로 로컬 보존하고, `origin/master`에서 새 `fix/kakao-home-renewal-20261105`를 만들면서 검토된 dirty source/test를 그대로 유지했다. reset/stash/force-push 없이 PR ancestry에서 별도 release-notes commit을 제외했다.
- 제품 source/test 3개는 검증된 scratch 입력과 byte 단위 동일하다. 기존 local tests/lint/build·독립 리뷰는 동일 source 및 변경 없는 실제 node_modules 환경에 대한 증거로 재사용한다. baseline의 lock 차이는 원격 Windows CI의 `npm ci`·lint·build로 별도 검증하며, 이전 scratch 빌드를 새 master lock의 검증으로 주장하지 않는다.
- `git log`/`git blame` 결과 POE2 `.main-start__link`는 2026-01-16 `b5ca46f6`에서 도입됐으며, POE1 `#signupButton`은 2026-01-19 `8aeb621f`에서 유지된다.
- 설치된 1.7.4의 2026-11-05 20:03 로그: HTTP 200, challenge=false 후 `Poe2MainHandler`의 시작 버튼 탐색이 약 10초 만에 `KAKAO_START_BUTTON_TIMEOUT`으로 끝났다. root가 읽은 당시 실패 HTML에서도 `.main-start__link` 0개, `.btn_start` 1개다.

## 현재 공식 페이지 근거

root의 2026-11-05 20:22 KST HTTP GET 및 공개 웹 확인을 재사용한다. 로그인/게임 시작 요청이나 페이지 스크립트 실행은 하지 않았다.

| 게임 | 공식 URL / 관찰                                                                                                                                                                                                 | 판단                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| POE1 | `https://poe.kakaogames.com/`, HTTP 200, final URL 동일, HTML 76,090 chars. `#signupButton` 1개, `<a id="signupButton" href="#" onclick="kgPoe.launch(); return false"><span>지금 무료로 플레이하기</span></a>` | 현 시작 버튼 selector 유지. 실제 사이트가 `pathofexile.kakaogames.com`의 svc-lib/ggg-lib scripts도 사용하므로 관련 host를 추측 제거하지 않는다. |
| POE2 | `https://pathofexile2.kakaogames.com/main`, HTTP 200, HTML 54,843 chars. `.main-start__link` 0개, `.btn_start` 1개                                                                                              | 현 HTML에 맞춰 `.btn_start`로 교체. obsolete selector fallback은 추가하지 않는다.                                                               |

- POE2 `/res/js/service/main/poe2-start-home-ui.bundle.js`의 document delegated click은 `e.target.closest('.btn_start')`를 통해 `window.kgPoe.launch('poe2')`를 호출한다.
- `#autoStart`는 런처가 붙이는 실행 목적 표식이다. 공홈 HTML에 그 문자열이 없다는 이유로 제거하지 않는다.
- root의 20:24 KST 추가 GET에서 old `kgIntroModalContents`, `.modal__container`, `.modal__button-block`, `.modal__button-x`는 HTML/새 bundle 모두 0개다. 새 HTML에는 `#layerIntro.popup_layer.popup_intro`, `.layer_body`, `.layer_foot .btn_close`, `.layer_foot .btn_today`가 있고 `on` class로 활성화된다.
- 새 bundle은 `new LayerComm('#layerIntro', ...)`, `INTRO_COOKIE_NAME='POE2_INTRO_MODAL'`, `.btn_today` click의 `setCookie(...,1,1)` 및 `closeIntro()`를 사용한다. 쿠키가 없으면 `/api/ea/main/layer` 응답을 render한다. 따라서 활성 `#layerIntro.on`의 오늘 닫기/닫기 버튼을 클릭하고 쿠키 저장은 사이트에 맡긴다. old selectors, 수동 cookie parsing, 실제로 await되지 않던 500ms 지연을 제거했다.
- 시작 버튼의 실제 markup은 `<button type="button" class="btn_start"><span class="ir_pm">GAME START</span></button>`이다. 새 bundle은 일반 `type=text/javascript` script이며 `DOMContentLoaded`에서 document delegated start click을 등록한다. preload도 `DOMContentLoaded` 후 IPC 응답을 await하므로 사이트의 동기 listener 등록 이후 클릭하게 된다. 실제 Electron에서의 사이트 실행은 사용자 gate다.
- 별도 pubsvc·로그인·보안 DOM은 바꾸지 않았다.

## 변경 및 검증 계획

영향 범위는 카카오 POE2 홈페이지의 자동 시작 버튼 탐색과 활성 intro 닫기 처리다. POE1 현 시작 흐름, KakaoGames Starter/UAC, 설정·계정·이벤트 경계는 유지한다.

| 마일스톤      | DoD                                                                                           | 상태                      |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| 홈페이지 대응 | [Windows-pwsh] 실제 공홈 HTML/번들 근거에 맞는 POE1·POE2 homepage 처리 및 최소 diff           | 로컬 구현 완료            |
| 자동 검증     | [Windows-pwsh] 관련 기존 회귀 테스트와 POE2 현 버튼 클릭 검증, lint/type/build 성공           | 통과                      |
| 독립 리뷰     | [Windows-pwsh] 실제 diff·현재 페이지 근거·테스트 필요성·실행 제한·blast radius 검토 통과      | 통과                      |
| 사용자 확인   | [사용자] 사용자가 Windows dev 런처를 직접 실행해 카카오 POE1·POE2 시작이 정상 진행되는지 확인 | 미실행 — 사용자 확인 대기 |

### 테스트 필요성

- 기존 POE1 preload dispatch 및 URL policy 테스트는 현 POE1 시작을 보호하므로 재사용한다.
- 기존 테스트에는 POE2의 실제 홈페이지 시작 버튼 클릭을 검증하는 사례가 없다. 현 HTML 기반 fixture로 preload를 실행해 click 발생 및 시작 버튼 timeout 미발생을 확인하는 최소 회귀 테스트를 추가한다. selector 문자열/소스 모양만 비교하지 않는다.
- 실제 사이트 JS, 로그인, Starter, 게임 실행 성공은 jsdom 테스트나 빌드로 입증할 수 없다. 사용자 Windows gate는 유지한다.

### dev 산출물 보존 및 비실행 경계

- `npm run dev`는 Vite serve의 Electron onstart를 실행하므로 에이전트는 호출하지 않는다.
- 설치된 `vite-plugin-electron` 1.1.1의 `dist/index.mjs`는 dev callback에서만 `triggerStartup`을 등록하고 build callback은 `buildBase`만 호출한다. `base-sK7COpY_.mjs`는 `apply: "serve"`와 `apply: "build"`를 분리한다.
- 기존 `dist/`, `dist-electron/`은 다른 작업의 ignored 산출물이므로 덮어쓰지 않는다. task scratch `.tmp/kakao-home-renewal-20261105/` 아래에 필요한 source/config/public/package/build 파일만 복사해 동일 CLI 빌드를 수행한다. `.env`, 사용자 프로필, `node_modules`는 복사하지 않는다.
- source 복사 입력과 출력 위치, 정확한 검증 명령·결과는 아래에 기록한다. 사용자 수동 `npm run dev`는 원본 checkout에서 수행한다.

## 검증 증거

- 환경: Native Windows PowerShell, Node `v24.18.0`, npm `11.16.0`, 실제 Vitest `4.1.11`, Vite `8.2.2`, vite-plugin-electron `1.1.1`. 의존성 설치/변경 없음. package/lock 변경 없음.
- `npm test -- --run --dir src`: **96 files / 782 tests 통과**, 36.84초, exit 0. `.tmp/kakao-home-renewal-20261105/tests.log`. 원본 source tree만 대상으로 하여 기존 `.tmp` checkout의 중복 test 수집을 피한다. 앞선 focused run도 성공했으나 중복 checkout을 포함해 최종 증거는 이 전체 run을 사용한다.
- `npm run lint`: exit 0. `.tmp/kakao-home-renewal-20261105/lint.log`.
- source/test 3개 파일 및 이 work 문서의 Prettier check 통과. `git diff --check`도 통과했다.
- scratch cwd `.tmp/kakao-home-renewal-20261105/build-input`에서 `npm run build:check`: **tsc 및 Vite build 통과**, exit 0. 실제 renderer 153 modules, main 641 modules, 일반 preload 5 modules, kakao preload 9 modules를 빌드했다. `.tmp/kakao-home-renewal-20261105/build-check.log`. 500 kB chunk 크기 경고만 존재한다.
- build child shell에만 `ELECTRON_STARTUP_PREVENT=true`를 설정했다. serve/onstart 경로를 사용하지 않았고 앱/게임/GUI/desktop을 실행하거나 조작하지 않았다.
- 빌드 입력은 `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.mts`, `electron-builder.json5`, `index.html`, `src/`, `public/`, `build/`의 **360개 파일**이다. manifest의 각 copied file hash를 원본과 대조해 전부 일치함을 확인했다. 입력 목록과 SHA256은 `.tmp/kakao-home-renewal-20261105/build-input-manifest.json`이며 manifest SHA256은 `9A916F8D1A92A92426D1834F80CA21FD791BE140D714584090D00A1252E5D315`이다.
- 초기 scratch copy에서 root `index.html`이 빠져 plugin mock renderer가 생성된 run은 최종 검증으로 인정하지 않았다. 원인을 바로잡아 실제 `index.html`을 포함한 위 입력으로 재빌드했다.
- 비실행 산출물: `build-input/dist/index.html`, `build-input/dist/assets/`, `build-input/dist-electron/main.js`, `build-input/dist-electron/preload.js`, `build-input/dist-electron/kakao/preload.js`, `build-input/dist-electron/workers/` (모두 위 task scratch 아래). 원본 `dist/`, `dist-electron/`은 덮어쓰지 않았다.
- 사용자가 직접 실행할 명령 (원본 checkout): **설치판 런처를 완전히 종료한 뒤** `Set-Location 'D:\project_poe2\POE2-unofficial-launcher'` 후 `npm run dev`. Vite가 수정된 원본에서 dev 결과물을 다시 만들고 Electron을 실행한다. 에이전트는 이 명령을 실행하지 않는다.
- 완전 종료가 필요한 근거: `src/main/store.ts:13-20`은 QA env override가 없으면 dev도 설치판과 같은 `%APPDATA%/POE2 Unofficial Launcher` userData를 사용한다. `main.ts:721-732`는 single-instance lock을 얻지 못한 새 인스턴스를 종료하고 기존 인스턴스 창을 표시/포커스한다. 설치판이 남아 있으면 수정 전 런처를 보게 될 수 있다. 기존 설치판을 에이전트가 종료하거나 프로필을 수정하지 않았다.

## 리뷰 라운드

### 1차 — 통과

- 독립 read-only reviewer `/root/kakao_home_update/independent_review`에게 승인 범위, 실제 후보 diff, root 공홈 HTTP 근거, DoD·blast radius, 테스트 필요성 및 exact 검증 로그를 제공했다.
- dispatch checker: `-Role reviewer -WorkKind independent-review -Model gpt-6-astra -Effort xhigh` allowed=true. 요청 프로필은 `gpt-6-astra/xhigh`이며 실제 모델/effort metadata는 도구에 노출되지 않아 확인 불가다.
- 판정: **통과**. 수정이 필요한 결함이나 승인 범위 초과 없음. 현 POE2 시작 버튼·intro 대응은 실제 공홈 근거와 일치한다. POE1·trigger/URL 제한·timeout·IPC/config/security 변경 없음.
- 신규 테스트 2개는 현 버튼 클릭/timeout 방지와 활성 intro의 오늘 닫기 우선이라는 다른 실패를 구별하므로 **KEEP**. DELETE/MERGE/REWRITE 지적 없음.
- 삭제한 500ms 대기는 기존 호출부에서 await하지 않았으므로 클릭 사이의 실제 대기 동작을 제거한 변경이 아니다.
- 후보 동결 후 source/test 수정은 없었다. root가 별도 최종 QA를 담당하며 실제 Windows 사이트 JS·로그인·Starter·게임 실행은 사용자 확인 대기다.

### root 최종 QA — 비간섭 범위 PASS

- root의 별도 `/root/kakao_home_final_qa` 판정: **PASS**, blocking finding 없음. 사용자 수동 검증용 dev 준비 완료로 안내할 수 있다.
- 원본/scratch/manifest의 360개 입력 일치를 독립 확인했고, 96 files/782 tests, lint, type/build 증거가 현재 동결 후보에 유효함을 확인했다.
- 이 판정은 실제 앱/게임 실행 성공이나 사용자 Windows gate 통과를 의미하지 않는다. 앱·게임·Electron을 실행하지 않았고 `[사용자]` 검증은 여전히 대기다.

## 남은 게이트와 종료 상태

- 실제 Windows 앱/게임 확인은 사용자 수행 대기다. 앱은 실행하지 않았다.
- 로컬 구현·비간섭 검증·독립 리뷰 handoff 후 후속 승인 범위의 단독 writer lease를 재부여받아 commit/push/PR/master 병합을 진행한다. primary checkout과 증거는 **preserve**하며 소유 기록은 `.tmp/kakao-home-renewal-20261105/worktree.md`에 남겼다.
- 사용자 확인과 릴리스 결정이 남아 있으므로 이 문서는 `docs/work/`에 유지한다. 원격 전달 결과는 task scratch의 후속 handoff 기록에 누적한다.
- `~/project_llm_wiki/wiki/projects/poe2-launcher.md`가 없고 사용자 홈 및 D 드라이브 루트의 1회 bounded wiki 폴더 탐색도 결과가 없었다. raw note는 `.tmp/kakao-home-renewal-20261105/wiki-raw/2026-11-05-kakao-home-renewal.md`에 보존하며 wiki ingest는 미실행이다. 이 누락이 추가 승인된 원격 전달을 막지는 않는다.

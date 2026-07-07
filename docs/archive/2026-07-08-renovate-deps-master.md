# 2026-07-08 — renovate 의존성 PR 일괄 반영 (10건)

## 목표

오픈 renovate `chore(deps)` PR 10건을 **위험 오름차순**으로 master에 반영한다.
#182(opentype.js v2)는 CI 실패 상태라 **FontManager 코드 마이그레이션**까지 포함.
설계·리뷰: architect(=Fable5, VSCode 폴백). 구현: 세션.

## 결정 (2026-07-08 사용자 확인)

1. **릴리스 분리 안 함** — master에 쭉 병합하면 release-please가 #236을 자동
   갱신. 기존 개발분 + 의존성 업데이트를 **함께 통합 릴리스**할 예정(타이밍은
   추후). 배치 병합 시점부터 1.4.3에 Electron 43 등이 포함된 상태가 된다.
2. **#182 배치 포함** — opentype.js v2 코드 마이그레이션까지 이번 작업 범위.
3. **저위험→고위험 순서, 한 세션 연속** — 단 `[사용자]` 실검증 게이트는 세션
   중 대기(electron·폰트).

## 공통 수칙 (모든 PR)

- **병합 방식**: 서버사이드 **squash** (`gh pr merge N --squash`) — 관례
  (#227/#230/#233)와 일치, commitlint/husky/WSL 마찰 없음, release-please가
  chore로 파싱해 #236이 1.4.3 유지.
- **병합 원자 루프** (PR마다, 생략 불가):
  1. renovate 재베이스 트리거 (PR 체크박스 / Dependency Dashboard)
  2. 새 merge-ref에서 pr-check green (`gh pr checks N --watch`) — required
     check 없으니 규율로 강제
  3. `gh pr merge N --squash`
  4. 병합 push 후 release-please 런 성공 + **#236 open·"release 1.4.3"·
     CHANGELOG 불변** 확인
  5. 다음 PR (lock 충돌 시 renovate 자동 재베이스 대기)
- **lock**: renovate 환경에서만 재생성시켜 로컬 npm 11.6.x 버그를 원천 회피
  ([[npm-lockfile-emnapi-bug]]). CI가 EUSAGE로 실패하면 폴백: 해당 절차대로
  `@emnapi` 항목 복원 후 renovate 브랜치에 수정 push.
- **테스트**: pr-check에는 vitest 없음 → "테스트 통과"는 Windows pwsh
  `npm test`로 별도 확인.

## 마일스톤 + DoD

### M0. 기준선 확립

- ① 로컬 git fetch + master를 `cc1f1cb`로 동기화 `[WSL]`
- ② Windows pwsh `npm ci` 성공 + `npm test` 전체 green (귀속 기준선) `[Windows-pwsh]`
- ③ gh 토큰 · #236(open/1.4.3) 확인 `[WSL]`
- **DoD**: 세 항목 관찰 확인.

### M1. 안전 툴링 (#228 → #231 → #181)

lint&format 그룹 / @types/chrome / lint-staged 17. 런타임 무관. #228은 lock
전용이라 첫 타자로 재베이스→lock 정합 파이프라인을 검증.

- **DoD**: 3건 머지드 + 각 병합 전 fresh pr-check green + 매 병합 후 #236
  불변 `[CI/gh]`. lint-staged 17 실동작은 M7 커밋 시 자연 검증 `[Windows-pwsh]`.

### M2. CI 인프라 (#229 → #232)

actions/checkout v7 / actions/cache v6. lock 무관.

- **DoD**: 2건 머지드 + 이후 워크플로 런 green `[CI]`. cache v6은 릴리스
  빌드에서만 실행 → "다음 릴리스 빌드에서 확인"으로 이월 기록.

### M3. 빌드 체인 (#179 → #194)

esbuild 0.28 → vite-plugin-electron v1. #179 green 후 #194 진행. #194는 major
(codeSplitting 전환), vite.config.mts의 5엔트리 + startup/reload API에 결합.

- **DoD**: CI green + `npm ci`·`npm test` green + `npm run dev` 기동/핫리로드
  스모크 + `npm run build:check` + `dist-electron/` 산출물 구조가
  electron-builder.json5와 정합 `[Windows-pwsh]` + 런처 부팅 1회 `[사용자]`.
  빌드 통과만으로 종결 불가.

### M4. Electron v43 (#234 단독)

electron 40→43 (Chromium 150 / Node 24). BrowserView 미사용 확인, breaking은
Linux 전용뿐이나 기동·카카오 임베디드 웹·폰트 렌더 잠재 영향.

- **DoD**: 병합 후 `npm ci`(바이너리 교체)+`npm test`+dev `[Windows-pwsh]`,
  이어 **`[사용자]` 실검증**: 런처 부팅, 메인 UI/폰트 렌더, 커스텀 폰트 적용·
  미리보기, 카카오 자동 로그인·SecurityCenter, 게임 실행, 업데이트 체크
  (electron-updater). **이 게이트 통과 전 M5 진행 금지.**

### M5. opentype.js v2 마이그레이션 (#182 = dep 번프 + 코드)

CI 실패 원인 = `FontManager.ts:221` `opentype.load(path, cb)`(v2 제거) + v2
`font.names` 구조 재편(플랫폼별)으로 `names.fullName?.ko` 접근 파손 +
`@types/opentype.js@1.x` 충돌. **코드 마이그레이션 필요** → renovate #182와
별개로 브랜치에서 dep 번프 + 코드 수정을 함께 처리(구현=세션, 리뷰=Fable5).

- 작업: `opentype.load`→버퍼 `readFile`+`opentype.parse`, v2 names 구조 대응
  (L131·L221 경로), `@types/opentype.js` 정리, `kakao-automation`/폰트 스킬
  준수.
- **DoD**: `npm run build:check` green + `npm test` green `[Windows-pwsh]` +
  **`[사용자]` 커스텀 폰트 파싱·적용·미리보기 인게임 실검증** + Fable5 리뷰
  통과. 빌드 통과만으로 종결 불가.

### M6. 릴리스 엔진 (#183 마지막)

release-please-action v4→v5. breaking = node24 런타임뿐. 9건 병합 동안 릴리스
엔진을 v4로 안정 유지하고 최후에 단독 변경. **사용자 명시 승인 후 병합**
(stop-and-ask #2). 병합 push가 v5 첫 런 → #236 재생성 즉시 관찰. 문제 시
워크플로 1파일 revert로 복구(코드 영향 0).

- **DoD**: v5 런 성공 + #236 open·1.4.3·CHANGELOG 불변 + 중복 릴리스 PR 없음 `[CI/gh]`.

### M7. 종합 검증 · 리뷰 · 보고 · 마무리

- ① 최종 `npm ci --dry-run` 클린 + `npm test` green + lint green `[Windows-pwsh]`
  - 런처 최종 스모크 `[사용자]`
- ② **Fable5 리뷰 루프** — 게이트 준수 감사 + #236 무결 + 잔여 리스크 판정
  (라운드별 work 문서 기록)
- ③ **사용자 보고** — 병합 이력, #236 릴리스 질의
- ④ 마무리 — 위키 raw 노트 + 이 문서 `docs/archive/` 이동
- **DoD**: 리뷰 `통과/조건부 통과` + 사용자 보고 완료.

## 호환성 / stop-and-ask

- **stop-and-ask #3 (major deps)**: #234/#194/#182/#181/#183/#229/#232 →
  이 계획 승인 = 일괄 승인. 단 M4(electron)·M6(release 엔진) 진입 시 개별 재확인.
- **stop-and-ask #2 (릴리스 플로)**: #183 → 최후순위 + 단독 관찰 + 사용자 승인.
- **기존 사용자 blast radius**: config 스키마·폰트/UAC 마이그레이션·카카오
  셀렉터 변경 없음. 실질 영향 = 다음 통합 릴리스로 자동 업데이트되는 **Electron
  43 런타임**(Chromium 150/Node 24 — 카카오 임베디드 웹·폰트·기동) + **빌드
  산출물 구조(#194)** + **폰트 파싱(#182)**. M3/M4/M5의 `[사용자]` DoD가 커버.
- **#236 상호작용**: chore hidden → 버전·CHANGELOG 불변, rebase만. 교란 없음.

## 리뷰 (라운드별 누적)

### 병합 로그 (master, squash)

`cc1f1cb`(M0 기준선) → `e0d5491`(#228) → `e4d3adc`(#231) → `8c4fb50`(#181) →
`85e2974`(#229) → `b01cc92`(#232) → `38136bd`(#179) → `39bf1ab`(#194) →
`69d434c`(#234) → `b74cf0d`(#182) → `e13a232`(#183). 10건 전부 단일부모 squash,
`chore(deps): … (#NNN)`. #236은 내내 OPEN·1.4.3·changelog 불변.

### M5 리뷰 — Fable5 라운드 1 (opentype v2 + FontManager): 조건부 통과

- 실폰트(malgun/arial) 전수 실행 검증. 핵심: v2 `load`는 제거가 아니라 **무동작
  스텁**(console.error만) → 구 코드 유지 시 폰트 추가 무한 행 → 마이그레이션 필수.
- namespace import·`pickFontName`(플랫폼 순회, v1 우선순위 보존)·buffer→parse·
  미변경 `generateFontThumbnail`(getPath/tables/toSVG)까지 전부 v2 정상 검증.
- 필수 수정 1건(파싱 catch가 원본 오류 폐기) → `cause`+로깅으로 반영(`bfbc265`).

### M7 최종 감사 — Fable5: 조건부 통과

- 게이트: 10건 클린 squash, release-please 런 전부 success(v5 첫 런 포함), master
  FontManager = 리뷰 통과본과 바이트 동일.
- #236 무결: 단독 OPEN·1.4.3·changelog는 fix 1건뿐(chore 10건 0 유출), 태그 오발행 없음.
- 신규 2건: **F1** `scripts/generate-font-assets.ts`의 `opentype.load` 잔존(CI
  스크립트, 자동화 파손) / **F2** `@types/opentype.js@1` 잔존.
- CI 미포착 TOP 리스크 + 통합 `[사용자]` 체크리스트 18항 제시(패키징 부팅·업데이터·
  카카오·게임·폰트).

### 후속 (branch `chore/opentype-v2-followup`)

- **F1 수정**(Fable5 위임): `generate-font-assets.ts`를 v2 buffer parse로 마이그레이션 → `fix` 커밋.
- **테스트 추가**: `opentype-v2-contract.integration.test.ts`(실 GmarketSans로 v2
  계약 회귀 가드, 6건) → `chore` 커밋. opentype 커버리지 0 부분 해소.
- **F2 + 잔여** → `AGENTS-ROADMAP.md` 이관.
- Fable5 전체 변경 최종 리뷰(문제 없을 때까지 루프) 후 PR·보고.

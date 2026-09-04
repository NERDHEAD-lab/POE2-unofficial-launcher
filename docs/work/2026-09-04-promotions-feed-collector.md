# GGG 이벤트 수집 및 Pages 발행

> 작성일: 2026-09-04 · 상태: 로컬 검증·분리 리뷰 완료, 공개 적용 진행 · 브랜치: feat/promotions-feed-collector

## 승인과 사전 확인

사용자가 별도 gh-pages 작업에서 수집기 이관·구현·검증을 명시적으로 위임했다. 로컬 구현까지 승인됐으며 push, PR, master 머지, 실제 Pages 배포는 최종 승인 전 실행하지 않는다. 원래 런처 작업 트리는 읽기 전용이다. 구현자는 이 작업, 분리 설계·리뷰는 `promotions_design_review`다.

- 원격은 런처와 같은 `NERDHEAD-lab/POE2-unofficial-launcher`. 최신 master `2c62c6977ebb494765e8da6d1d3c4865ee1b5465`에서 분기했다.
- 저장된 gh-pages 작업 트리는 clean, HEAD `ace02e1a12b700d0a3ddddd8ca7f974a0bf3c693`. API에서 legacy / gh-pages / 루트 배포 확인. 이벤트 workflow는 아직 없다.
- 실제 소비 계약은 원래 작업 트리의 미커밋 `src/shared/promotions.ts`를 읽었다. SHA256 `249D400841A9ABC4DA2D8223715E3FC416E547F06181834404284B90132FCBD6`.
- 새 의존성, AppConfig, IPC, 서비스, 릴리스 흐름 변경은 없다. 기존 사이트·테마 workflow와 파일은 수정하지 않는다. 추가 owner 결정은 발견되지 않았다.

## 설계

기본 브랜치에 단일 수집 workflow와 `scripts/promotions/`를 둔다. `17 */6 * * *` 및 수동 실행으로 GGG 공식 자료를 읽고, 별도 checkout의 `gh-pages/promotions.json`만 발행한다. gh-pages에 scheduler만 두는 방식은 GitHub 기본 브랜치 제약 때문에 제외했다. 전체 Pages artifact 배포 전환은 기존 배포 구조를 바꾸므로 제외했다.

JSON schemaVersion 1과 소비 URL `https://nerdhead-lab.github.io/POE2-unofficial-launcher/promotions.json`을 유지한다. 독립 수집용 validator는 런처의 실제 검증 규칙과 같으며 선택적 실제 소비자 대조 검사로 드리프트를 확인한다. 런처 TS 파일 이관이나 런타임 코드는 이 범위에 넣지 않는다.

RSS와 양쪽 공지 게시판 각 최대 3페이지를 매 실행 탐색한다. 이전 미종료 원본은 다시 확인한다. 요청 간격 500ms, 요청당 15초/2MiB, 후보 최대 60개로 제한한다. 발견 실패 시 파일 교체를 중단한다. 개별 원본 실패는 마지막 정상 미종료 자료와 경고를 남긴다. 기간 추측 없이 명시 날짜·시간대·기간 및 공식 staff 첫 글만 파싱한다. 아래 사용자 후속 결정에 따라 종료된 일정은 매 정상 수집에서 제거한다.

발행은 수집 시점 gh-pages revision을 기록하고 최신 gh-pages를 fast-forward로 반영한다. 그 사이 promotions.json이 바뀌면 중단해 오래된 결과의 덮어쓰기를 막는다. 다른 사이트 파일 변경은 그대로 유지한다. 한 파일만 커밋하고 일반 push한다. 경합 push 실패는 실패로 보고하며 force push하지 않는다. Pages build를 요청한 뒤 공개 URL HTTP 200과 검증된 JSON 일치를 재시도하며 확인한다.

## 작업 순서와 DoD

### M1 — 수집기 이관과 계약 보완

- [x] [Windows-pwsh] `collector.test.mjs`, `collect.test.mjs`, `contract.test.mjs`에 두 종류, 시간대, 첫 staff 원본, 초기 3페이지, 동일 일정, override/disabled, 실패·보존·만료 제거 회귀 검사를 먼저 추가해 실패를 확인한다.
- [x] [Windows-pwsh] 기존 `collector.mjs`, `collect.mjs`, `overrides.json`을 이관하고 `contract.mjs`에 동일 validator를 둔다. `node --test scripts/promotions/*.test.mjs` 통과.

### M2 — 안전한 발행과 단일 workflow

- [x] [Windows-pwsh] `publish.test.mjs`의 로컬 bare Git 저장소에서 최초/재발행, 사이트 동시 변경 보존, 피드 동시 변경 중단, 잘못된 JSON 무변경을 검증한다.
- [x] [Windows-pwsh] `publish.mjs`, `verify-published.mjs` 및 `.github/workflows/update-promotions.yml` 구현. schedule/manual, 기본 브랜치 한정, 권한/경합/실패 시 보존/Pages 확인 경로를 검토한다.

### M3 — 실제 수집·소비 계약·분리 리뷰

- [x] [Windows-pwsh] 실제 원문으로 최초 및 이전 피드 갱신 수집. `.tmp/promotions-evidence/`에 실자료와 결과 보존. 합성 테스트 자료는 테스트 파일/격리 임시 Git 저장소에만 둔다.
- [x] [Windows-pwsh] 원래 런처 `parsePromotionFeed`에 실제 출력 통과. 4000901/4001078을 원문과 대조하고 실행 시점 활성/예정을 구분한다. 보관함 현재 일정이 없으면 없다고 보고한다.
- [x] [Windows-pwsh] 변경 파일만 형식/문법/회귀 검사, `git diff --check`, 분리 리뷰 통과.
- [ ] [사용자, 적용 승인 후] master 변경 적용, 수동 수집 실행, 공개 URL HTTP 200/실제 내용 확인. 로컬 검증과 별도 완료 게이트.

## 런처 작업과 적용 조정

원래 작업의 `scripts/promotions/` 6개 파일과 `.github/workflows/update-promotions.yml` 초안은 이 변경으로 대체해야 한다. 해당 작업의 소유자가 제거/제외한다. 소비 코드, URL, JSON schema 변경은 필요 없다. 본 작업은 원래 트리를 수정하지 않는다.

`docs/work/`는 적용 승인 대기 동안 유지한다. 외부 wiki 경로는 현재 허용된 쓰기 루트 밖이며 노트 이관/아카이브는 실제 마무리 단계에 남긴다.

## 리뷰 기록

사전 분리 설계 검토: 보관함 시작 시각을 제외한 중복 판정, 수동 override 이후 중복, 첫 글과 staff 검사의 결합 보완이 필요하다. 확정 계약 내 수정으로 반영한다.

### 사용자 후속 결정 — 공개 피드 만료 관리

사용자: “당장 필요한 드롭스랑 창고 할인에대해서만 누적하면되고, 해당 스케줄러에서 만료된 일정은 제거하는등 관리만 되면 될 듯”. 초기 90일 과거 기록 보존 방침을 대체한다. `endsAt <= 수집 시각`인 일정은 제거하고 진행·예정만 유지한다. 발견 실패 때 정상 파일 보존 정책과 런처의 종료 즉시 로컬 판정은 유지한다. 계약의 이벤트 **최대 기간 90일**은 보관 기간과 다른 제한이므로 그대로다.

### 분리 리뷰 1라운드 — 반려 후 수정

반복 수집 시 두 결함을 재현했다. 비활성 원문 정보가 출력에서 사라지면 재공지 ID가 재등장하고, 초기 2페이지에서 실패한 원본은 이후 1페이지 탐색에서 다시 발견되지 않았다. 실패 회귀 검사 후 수정했다. 비활성 공식 ID 원문을 매 실행 재조회하며 그 원문 실패 시 발행을 중단한다. 각 게시판 3페이지 상한을 매 실행 유지한다. 스키마/의존성/외부 권한 확대는 없다.

### 분리 리뷰 2라운드 — 통과

`promotions_design_review`가 최종 코드, 두 반복 실행 회귀 수정, 사용자 만료 제거 요구, README, 검사 로그, 실수집 증거를 확인했다. 추가 차단 지적 없음. 로컬 구현·검증 완료 판정이며 공개 적용은 별도다.

## 최종 로컬 결과

- Node 24.18.0 / Windows PowerShell. 36개 테스트 통과, 실패·skip 0. 실제 원래 런처 TS 모듈의 계약 수용/거부 비교를 포함한다. TS 파일을 ESM으로 다시 해석한다는 Node 경고는 기존 모듈 설정에서 나온 것으로 제품/설정 파일을 수정하지 않았다.
- 두 종류 파싱, PDT/PST/EDT/IANA 시간대, 연도 경계·존재하지 않거나 모호한 DST 시각 거부, 첫 원문 staff, canonical 원문 교체, 일정 중복/수동 우선/비활성 반복, 실패 파일 바이트 보존, 종료 경계 제거, Git 동시 변경·push 거부, 공개 404/오래된 JSON 재시도 검증을 통과했다.
- actionlint 1.7.12로 새 workflow 검사 통과(shellcheck는 로컬 미설치로 비활성). 공식 릴리스 asset의 SHA256 digest를 검증한 실행 파일을 `.tmp/tools/`에서만 사용했다. Prettier 및 `git diff --check` 통과. 기존 dependency manifest/lockfile 변경 없음.
- 실제 원문을 최초/재수집한 총 40개 응답을 `.tmp/promotions-evidence/sources/`에 저장했다. 두 실행의 일정이 같고 실제 런처 `parsePromotionFeed`로 각각 통과했다. 최종 `generatedAt`은 `2026-09-04T08:06:01.221Z`다.
- `2026-09-04T08:06:20.874Z`(KST 17:06) 기준: [PoE1 예선 Drops](https://www.pathofexile.com/forum/view-thread/4000901) 진행 1건, UTC 9월 3일 21:00–9월 4일 21:00. [PoE2 Drops](https://www.pathofexile.com/forum/view-thread/4001078) 예정 1건, UTC 9월 4일 20:00–9월 11일 20:00. 종료 일정은 0건.
- 현재/예정 보관함 할인은 탐색 범위에서 발견되지 않았다. 공식 과거 [3926103](https://www.pathofexile.com/forum/view-thread/3926103)의 양 게임 할인은 UTC 4월 3일 00:00–4월 7일 01:00, `derived-start`로 실제 파싱/계약 통과했으며 만료되어 공개 후보에는 없다. 과거 3934610의 다른 종료 문구는 지원하지 않아 경고 1건으로 남겼다.
- 공개 URL은 같은 확인 시각 **HTTP 404**. GitHub workflow 실행/실제 push/master 머지/Pages 배포는 수행하지 않았다. 로컬 bare 저장소의 publish 테스트를 실제 GitHub 발행 증거로 사용하지 않는다.
- 기존 사이트 파일과 테마/릴리스 workflow를 수정하지 않았다. 저장된 gh-pages 작업 트리도 clean을 유지한다. 원래 런처 작업 트리/사용자 프로필에 수정 또는 합성 데이터 주입 없음.

증거: `.tmp/promotions-evidence/tests-final.log`, `live-summary.json`, `bootstrap.json`, `promotions.json`, `historical-stash-parsed.json`, 실패 재현 로그 및 공개 원문 응답. 최종 피드는 실자료 2건이며 합성 피드가 아니다.

### 변경 파일

- `.github/workflows/update-promotions.yml`: 6시간/수동/관련 push 실행, PR 읽기 전용 검사, 안전한 gh-pages 발행 및 Pages/공개 검증.
- `scripts/promotions/collect.mjs`, `collector.mjs`, `contract.mjs`, `overrides.json`: 수집·파싱·스키마·운영 조정.
- `scripts/promotions/publish.mjs`, `verify-published.mjs`: 발행 경합 보호와 공개 결과 확인.
- `scripts/promotions/collect.test.mjs`, `collector.test.mjs`, `contract.test.mjs`, `publish.test.mjs`, `verify-published.test.mjs`: 회귀 검사.
- `scripts/promotions/README.md`, 이 work 문서: 운영 절차·이관·검증·남은 승인.

## 남은 적용과 원래 작업 깨우기

현재 변경은 이 브랜치의 미커밋 14개 신규 파일이다. 구체적인 다음 단계는 커밋 → push/PR → 승인된 master 머지 → `Update Event Promotions` 첫 실행 → gh-pages JSON과 Pages build 및 공개 HTTP 200/내용 확인이다. master 머지는 기존 release-please도 실행한다. 릴리스 PR 머지는 별도 결정으로 남긴다.

### 공개 적용 진행 지시

push·master 머지·Pages 배포 세 단계까지 진행할지 명시적으로 확인한 뒤 사용자가 “모니터링하다가 검토까지 끝내면 작업 깨워”라고 지시했다. 이 응답에 따라 해당 적용을 진행하고 실제 공개 동작 검토 후 원래 작업을 깨운다. 릴리스 PR 머지나 원래 런처 트리 수정 권한은 확장하지 않는다. 별도 Codex 자동화도 만들지 않는다.

사용자 후속 지시에 따라 Codex heartbeat/폴링 자동화는 만들지 않는다. **공개 실제 동작 확인을 마친 뒤** `mcp__codex_app__send_message_to_thread`로 `01a06a7d-20b7-7543-9dff-c7758cfd7e05`(local, GGG 일정 크롤링 계획 구상)를 직접 깨운다. 피드 URL/schema/generatedAt/진행·예정 목록, 적용 커밋, workflow run 및 공개 검증 증거, 중복 초안 제거 목록을 전달하고 “사용자 요청에 따라 필요한 연동 수정 또는 이미 호환되면 실제 피드로 숨김 Windows Electron QA와 캡처를 진행해 주세요”라고 요청한다. 현재는 공개 적용 승인 대기이므로 연동 QA 완료를 주장하거나 후속 QA를 시작시키지 않는다.

# GGG 이벤트 피드

공식 GGG 공지에서 Twitch Drops와 보관함 할인을 읽어 런처용 `promotions.json`을 만든다. 수집 코드와 스케줄러는 **master**, 공개 결과는 **gh-pages 루트**에 둔다. 두 브랜치는 같은 GitHub 저장소에 있다.

## 로컬 실행

Node 24와 저장소에 이미 등록된 `node-html-parser`를 사용한다. Electron 실행이나 새 의존성은 필요 없다.

```powershell
npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
node --test scripts/promotions/*.test.mjs
node scripts/promotions/collect.mjs --output .tmp/promotions.json
```

`--output`이 이미 존재하면 이전 정상 피드로 읽는다. 다른 입력은 `--previous <파일>`로 지정한다. 이전 파일이 없으면 최초 수집이며, 잘못된 JSON은 오류로 중단한다. 완성된 피드의 검증이 끝난 뒤 임시 파일을 rename하여 출력 파일을 교체한다. **이 명령은 Git push나 Pages 배포를 하지 않는다.**

수집기는 미커밋 런처 기능과 독립적으로 적용할 수 있게 `contract.mjs`를 사용한다. 계약 검사는 schema v1의 수용/거부 사례를 검증하며, `src/shared/promotions.ts`가 병합되면 실제 소비자와도 자동 비교한다. 다른 작업 트리의 실제 소비자를 읽기 전용으로 비교하려면:

```powershell
$env:PROMOTIONS_CONSUMER_MODULE = 'D:/project_poe2/POE2-unofficial-launcher/src/shared/promotions.ts'
try { node --test scripts/promotions/*.test.mjs }
finally { Remove-Item Env:PROMOTIONS_CONSUMER_MODULE }
```

소비자 파일이 없는 브랜치에서는 이 비교 한 건만 명시적으로 skip한다. 독립 계약 검사는 항상 실행한다. 지정한 파일이 없으면 실패한다.

## 수집과 실패 처리

- `/news/rss`와 `/forum/view-forum/news`, `/forum/view-forum/2211`의 **각 1–3페이지**를 매 실행 확인한다. 이전 실행에서 실패했던 2–3페이지 원문도 다시 발견하기 위한 고정 상한이다. 이전 미종료 원문과 비활성 공식 ID의 원문도 확인한다.
- 요청은 직렬이며 500ms 간격, 요청당 15초와 2MiB, 전체 후보 60개로 제한한다. 무제한 과거 탐색이나 계정 로그인은 없다. 범위 밖의 오래된 미종료 공지를 모두 찾는다는 보장은 없다.
- `/filter-account-type/staff` 응답의 첫 `.newsPost` 본문과 바로 뒤 작성자 정보의 staff 표시를 함께 확인한다. FAQ/다른 보상 섹션/사용자 댓글을 이벤트로 사용하지 않는다.
- Drops의 `Start Time`/`End Time`, `from … until …`, 명시적인 시간 수와 종료 시각을 지원한다. 시청할 게임의 category/directory/stream 문구로 게임을 판정한다. 다른 게임에서도 보상을 쓴다는 FAQ는 게임 판정에 사용하지 않는다.
- 보관함 할인은 `Stash Tab Sale ends at/on …`과 양 게임 적용 문구가 명시된 글을 지원한다. 시작은 RSS 또는 원문 게시 시각이며 `derived-start`다. 지원하지 않는 표현이나 불확실한 게임·기간은 경고로 남기고 추측하지 않는다.
- 발견 요청 실패/챌린지 페이지/잘못된 입력/후보 초과는 전체 실행을 실패시킨다. 개별 원문 실패는 그 원문의 마지막 정상 일정을 유지하며 다른 원문은 갱신할 수 있다. 최초 실행에서 실패만 있고 검증한 일정도 없으면 발행하지 않는다.
- 원문이 정상적으로 다시 파싱되면 해당 원문의 이전 섹션을 교체한다. 실패 시에는 이전 미종료 일정을 유지한다. **종료 시각이 수집 시각 이하인 일정은 매 수집에서 제거**하여 공개 JSON에는 진행·예정 일정만 유지한다. 200건을 넘는 출력은 발행하지 않는다. 발견 단계 자체가 실패하면 이전 공개 파일을 보존하므로 만료 정리는 다음 정상 실행에서 이루어진다. 런처의 로컬 종료 판정은 이 지연과 무관하다.

## JSON 계약과 수동 조정

공개 URL은 [promotions.json](https://nerdhead-lab.github.io/POE2-unofficial-launcher/promotions.json)이다. schema 변경이나 URL 변경은 소비 런처와 사전 동기화가 필요하다.

- 최상위: `schemaVersion: 1`, UTC ISO `generatedAt`, `events` 배열(최대 200건).
- 이벤트: `id`, `kind`(`twitch-drops`/`stash-sale`), `game`(`poe1`/`poe2`/`both`), UTC ISO `startsAt`/`endsAt`, 공식 forum thread `sourceUrl`, `precision`(`exact`/`derived-start`/`manual`). Drops에는 `both`를 허용하지 않는다.
- ID는 `[a-z0-9:-]` 1–160자, 중복 불가. 종료는 시작보다 뒤이고 기간은 최대 90일. UTC 문자열은 초 또는 밀리초 3자리와 `Z`를 사용한다.
- 동일 일정은 **종류 + 게임 + 시작 UTC epoch + 종료 UTC epoch**다. 같은 일정의 재공지는 하나로 합치고 가능한 경우 기존 ID를 유지한다. 기간이 달라지면 별도 일정으로 취급한다. 자동 ID는 스레드/섹션 기반이며 일반적인 기간 정정에서 유지된다.

`overrides.json`의 `events`에는 공식 출처와 전체 필드를 가진 `precision: "manual"` 이벤트를 넣는다. 같은 ID를 교체하며 동일 일정의 자동 항목보다 우선한다. 수동 입력도 필터링 전에 계약을 검증한다. 원래 자동 일정을 취소하고 다른 ID로 정정하려면 자동 ID를 `disabledIds`에도 명시한다.

`disabledIds`에 지정한 ID 및 현재 확인 가능한 같은 일정의 재공지들을 제외한다. `ggg-{thread}-…` ID는 이후 실행에도 그 공식 원문을 재조회하므로 피드에서 제거된 뒤에도 재공지 억제를 유지한다. 이 원문을 읽지 못하면 억제 규칙을 잃지 않도록 전체 발행을 중단한다. 수동 ID의 동일 일정 억제를 유지하려면 그 이벤트를 `events`에도 유지한다. 종료한 억제 규칙은 운영자가 정리해 원문 재조회를 줄일 수 있다.

## GitHub Actions와 발행

`.github/workflows/update-promotions.yml`은 UTC **00:17/06:17/12:17/18:17**(KST **09:17/15:17/21:17/03:17**)에 실행한다. GitHub schedule은 지연되거나 누락될 수 있으므로 정확한 시작·종료 판정은 런처가 로컬 시각으로 수행한다. 런처의 시작/절전 복귀/1시간 조회 계약은 유지한다. [GitHub schedule 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

동일 workflow의 PR 실행은 읽기 권한의 테스트만 수행한다. 수집·발행은 원래 저장소 master의 schedule/수동 실행/관련 경로 push에서만 가능하다. 별도 중복 스케줄러는 필요 없다. 예약/수동 실행을 등록하려면 workflow가 기본 브랜치에 적용되어야 한다.

승인 후 수동 실행은 GitHub Actions의 **Update Event Promotions → Run workflow → master**를 선택한다. 저장소의 GitHub CLI 토큰 스킬을 적용한 환경에서는 `gh workflow run update-promotions.yml --ref master`도 가능하다.

발행 절차:

1. 기존 Pages 설정이 `legacy`, source `gh-pages`, path `/`인지 확인한다.
2. 별도 gh-pages checkout의 revision을 기록하고 기존 피드를 읽어 `.tmp/promotions-candidate.json`을 만든다.
3. `publish.mjs`가 깨끗한 gh-pages checkout과 기준 revision을 확인하고 원격을 fetch한다. 수집 이후 원격 피드가 변경됐으면 실패한다. 다른 사이트 변경은 fast-forward로 보존한다.
4. `promotions.json` **한 파일만** 커밋하고 일반 push한다. 경합·권한 오류는 실패로 보고하며 force push하지 않는다. 수집·검증 실패는 기존 원격 파일을 건드리지 않는다.
5. `pages: write` 권한으로 [Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)를 요청한다. GITHUB_TOKEN push만으로 배포를 가정하지 않는다. 빌드 완료와 발행 커밋 포함 여부를 최대 5분 확인한다.
6. `verify-published.mjs`가 공개 URL의 HTTP 200과 검증된 내용 일치를 최대 20회 확인한다. push 성공, build 요청 성공, 공개 내용 검증 성공은 서로 별도 단계다. 빌드나 CDN 확인이 실패해도 강제 롤백하지 않고 실패를 보고한다.

`publish.mjs`는 실제 원격을 변경하는 명령이다. 운영자의 배포 승인 후 workflow에서만 실행한다. 테스트는 `.tmp` 아래의 격리된 로컬 bare 저장소에서만 실행하여 기존 사이트와 사용자 작업 트리를 보존한다.

## 이관과 적용 순서

현재 구현은 런처 작업의 수집기 초안을 이관한 것이다. 런처 작업 소유자는 그 작업 트리의 `scripts/promotions/` 및 `.github/workflows/update-promotions.yml` 초안을 제거/제외하고 이 변경을 사용해야 한다. `src/shared/promotions.ts`, `SUPPORT_URLS.PROMOTIONS_JSON`, 소비 서비스는 그대로 유지한다.

로컬 검증 후 적용 승인 → master 대상 변경 병합 → 수동 workflow 실행 → 실제 공개 JSON 확인 → 원래 런처 작업에 완료 통보 순서다. master 머지는 기존 release-please를 실행하므로 머지 승인은 별도로 필요하다. 실제 피드로 런처의 숨김 Windows Electron QA와 캡처는 원래 작업에서 수행한다.

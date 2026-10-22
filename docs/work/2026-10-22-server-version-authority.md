# 서버 버전과 복구·예약 목표 정합성

> 2026-10-22 · 진행 · `fix/server-version-authority`

## 승인·분리 경계

사용자가 구현·검증·커밋·원격 상신 후 두 fix를 각각 병합하도록 승인했다. release-please PR 생성/갱신·CI 확인까지 root가 수행하며 그 PR의 병합·태그·배포는 승인 범위가 아니다. 실제 Windows/game 사용자 QA는 아직 미완료이며 자동 검사로 대체하지 않는다.

기준은 `df12d03487cc96c8f3acd8d1cb443cf643d98ce9`. 원본 결합 commit `93787de2119fecbd0a6f7008de415cd4395e63db`의 버전 관련 코드만 분리한다. 공지 NEW 변경은 별도 `fix/news-visible-unread`다. 새 동작·의존성·재설계는 추가하지 않는다. App 자체 업데이트의 semver 비교는 유지한다.

local_serial에 따라 main checkout의 한 writer가 순차 작업한다. 기존 사용자 dirty/untracked와 원본 브랜치를 보존한다. 사용자 수동 확인 앱이 사용하는 dist/dist-electron 및 node_modules는 변경하지 않는다. desktop-busy 제한으로 화면·입력·캡처·추가 앱 실행은 하지 않는다.

## 계약·마일스톤과 DoD

1. **서버 목표 계약 분리** — [Windows-pwsh] 게임 버전은 opaque identity로 비교하며 서버가 직접 반환한 버전/주소를 목표로 채택한다. 숫자 대소로 로컬·오래된 보조주소를 선택하지 않는다. 게임/서비스/경로와 조회 시각/원본 시각, 관측/설치완료 증거를 구분한다.
2. **소비자 정합성** — [Windows-pwsh] 버튼·복구·자동 진단·예약·UI snapshot을 같은 정책으로 연결한다. 시작한 작업의 context/runId/목표를 고정한다. 과거 로그/다른 경로·목표의 startup/Done은 완료로 승격하거나 예약을 종료하지 않는다. 조회 실패 예약을 유지하고 restart에도 실패 이유/중복알림 억제를 유지한다. 수동 override는 명시한 작업에만 적용한다.
3. **분리 검증** — [Windows-pwsh] 단독 tsc/lint/영향 회귀, 두 분리본의 조합 src tree가 원본과 동일함, 조합 전체 src 회귀, 별도 Astra 리뷰 및 root 최종 비간섭 QA를 확인한다. 빌드는 실행 중 산출물을 보존하기 위해 로컬에서 다시 실행하지 않고 새 PR Windows CI에서 확인한다.
4. **실사용 검증** — [사용자] 서버 0.x/로컬 관측4.x 상황의 버튼·강제복구·예약과 서비스/경로 전환을 Windows/game에서 확인한다. **보류, PASS 아님.**

기존 knownGameVersions와 예약 저장값은 선택적 context/증거/실패 메타데이터를 추가하는 호환 방식이다. 전체 기록 초기화나 사용자 설정 추가는 없다. 테스트는 기존 통제 fixture를 그대로 사용한다.

## 검증·리뷰 기록

- 원본은 R2 독립 리뷰/비간섭 QA와 src95파일780검사/lint/build/tsc를 통과했다. 이 근거는 원본 행동의 출처이며 분리 후보의 검사로 대신하지 않는다.
- A source28개(전용22·공통6), 이번 문서1개만 포함한다. 원본 결합 workdoc은 포함하지 않는다. scratch `.tmp/server-version-news-visibility/split-prs/`에 정확한 파일목록·검사·동일성 근거를 보존한다.
- 단독 검사·조합·독립 리뷰 결과는 아래 누적한다.
- [Windows-pwsh] 단독 `npx tsc --noEmit`, `npm run lint` PASS. `npm test -- --run --exclude '.tmp/**' --exclude 'scripts/**'`에 AutoPatchRunCorrelation/GameVersionPolicy/PatchManagerTarget/PatchReservationService/RemoteVersionResolver/ghPagesLatest/register-handlers 7파일을 지정하여 **7파일67검사 PASS**. `a-typecheck.log`, `a-lint.log`, `a-tests.log`. Prettier check도 source28개 PASS (`a-prettier.log`).
- 분리 자체 검증에서 Main helper 경계의 빈줄 배분만 base에 맞게 정정했다. 새 제품 동작은 없으며 정정 후 단독 tsc/lint/67검사를 다시 통과했다. commit hooks도 우회 없이 통과했다.
- [Windows-pwsh] **독립 분리 리뷰 통과**: 별도 Astra xhigh reviewer가 실제 A/B diff·본 문서·단독 검사 근거를 검토했다(요청 프로필, 실제 runtime variant 미확인). 기능 누락·범위 혼입·타입/등록 누락 및 불필요한 테스트 지적 없음. 이 판정 뒤에는 결과 문서만 반영하며 제품 source는 동결한다.
- [Windows-pwsh] 양방향 `git merge-tree --write-tree`는 Main/preload의 인접 type import 추가 한 영역씩만 충돌한다. Main은 NewsDisplayReport/NewsSource 다음 GameVersionContext/RemoteWebRootPayload, preload는 RemoteWebRootPayload 다음 NewsSource/NewsDisplayReport를 보존하면 된다. 임시 index의 양방향 조합 src tree는 모두 원본과 동일한 `58aa0a803a97df49bbd94dc7d92ef09e013f1969`다. 다른 네 공통 파일은 자동 병합된다. `equivalence.json`, 빈 `composition-a-b.diff`/`composition-b-a.diff`에 기록했고 독립 reviewer도 Git 객체로 확인했다.
- 조합 전체 회귀는 동일 src/입력/dependencies/Windows 환경의 기존 `r2-full-src-tests.log` **95파일780검사 PASS**와 `node-promotions-tests.log` **59검사 PASS**를 재사용한다. 새 단독 후보의 빌드는 미실행이며 Windows PR CI에서 확인한다. root의 분리 final QA와 원격 CI/병합은 별도 단계다.

## 보존·다음 단계

root가 최종 QA/원격 상신·각 PR CI·개별 병합과 release-please CI를 맡는다. 누락된 사용자 QA를 PASS로 승격하지 않는다. 사용자 QA 미완료로 문서는 work에 유지한다. 위키 raw는 task scratch에 보존하며 미-ingest다. main checkout·원본 브랜치·사용자 dirty·실행 앱·증거는 preserve한다. 삭제 권한은 없다.

# 카카오게임즈 게임 경로 진단 및 레지스트리 복구

> 작성일: 2026-08-09 · 갱신: 2026-08-27 · 상태: 진행 · 브랜치: `fix/kakao-game-registry-path-diagnostics`

## 배경과 목표

카카오게임즈 스타터 전환 이후에도 런처의 POE1·POE2 설치 경로 진단은
`DaumGames` 레지스트리만 조회한다. 새 `Kakaogames` 키만 존재하는 설치를
찾지 못할 수 있고, 반대로 런처 설정 경로는 유효하지만 레지스트리 후보가
모두 비어 있는 상태를 사용자가 알아차리기 어렵다. 진단 화면에서는 레지스트리
키와 값 이름을 한 경로처럼 연결해 표시하는 오류도 있었다.

이번 작업은 다음을 목표로 한다.

1. 공식 후보 순서인 `Kakaogames` 우선, `DaumGames` fallback으로 설치 경로를
   찾는다.
2. 런처 설정 경로는 유효하지만 레지스트리 설치 정보가 없거나 읽히지 않을 때
   실행을 막지 않는 경고를 표시하고, 클릭하면 해당 게임 경로 진단 모달을 연다.
3. 사용자가 유효한 런처 설정 경로를 확인한 뒤 canonical `Kakaogames` 키에
   `InstallPath`를 명시적으로 등록할 수 있게 한다.
4. 경로 조작 뒤 설치 상태를 다시 계산하고, 늦게 끝난 과거 검사가 최신 상태를
   덮어쓰지 않게 한다.

## 공식 출처와 근거 경계

2026-08-09에 아래 퍼블리셔 CDN 문서를 조회했다.

- POE1:
  <https://common.gdn.gamecdn.net/live/config/kakaogames/poe.gamestarter.json>
- POE2:
  <https://common.gdn.gamecdn.net/live/config/kakaogames/poe2.gamestarter.json>

당일 POE1의 `{ poe: { live: { ... } } }`, POE2의
`{ poe2: { live: { ... } } }` 구조에서 확인한 값은 다음과 같다.

| 게임 | 필드 접두사 | `RegistryRoot` | `RegistryPath` (우선순위 순)                          |
| ---- | ----------- | -------------- | ----------------------------------------------------- |
| POE1 | `poe.live`  | `HKCU`         | `SOFTWARE\Kakaogames\POE`, `SOFTWARE\DaumGames\POE`   |
| POE2 | `poe2.live` | `HKCU`         | `SOFTWARE\Kakaogames\POE2`, `SOFTWARE\DaumGames\POE2` |

근거의 경계는 다음과 같다.

- 공식 JSON은 레지스트리 루트와 후보 키·순서를 명시한다.
- 공식 JSON은 레지스트리 **값 이름 `InstallPath`를 명시하지 않는다.** 이 값
  이름은 기존 런처 동작과 실제 설치 환경 관찰에 근거한다. 따라서 신규
  `Kakaogames` 설치 환경에서의 실제 값 이름 확인은 사용자 실동작 DoD로 남긴다.
- 퍼블리셔는 JSON 구조와 값을 바꿀 수 있다. 런처는 이 문서를 런타임에
  요청하거나 자동 반영하지 않는다.

### 현재 PC 읽기 전용 관찰 스냅샷

2026-08-09 읽기 전용 점검에서는 새 `KakaogamesStarter`가 설치되어 있고 구
`DaumGameStarter`는 제거된 상태였지만, POE1·POE2 게임 경로 키는 모두
`DaumGames` 아래에만 남아 있었다. 개인 설치 경로는 이 문서에 기록하지 않는다.

따라서 스타터가 전환된 기존 사용자에게 신·구 게임 키가 모두 존재한다고
가정할 수 없다. 새 키 우선과 구 키 fallback을 동시에 유지해야 한다.

## 소스 계약 관리 정책

- 제품 런타임은 저장소에 버전 관리되는 정적 후보 목록만 사용한다.
- 런타임, 시작 검사, 진단 모달에서 CDN을 요청하지 않는다.
- 기본 `npm test`, build, CI에는 외부 CDN 검사를 연결하지 않는다.
- `npm run audit:kakao-registry-source`는 개발자가 명시적으로 실행하는 opt-in
  네트워크 감사다. `poe.live.RegistryRoot`/`poe.live.RegistryPath`와
  `poe2.live.RegistryRoot`/`poe2.live.RegistryPath`의 구조·값·순서 drift 및
  네트워크 실패를 검출한다.
- 감사 실패는 런타임 매핑을 자동 수정하지 않는다. 사람이 퍼블리셔 변경을
  검토한 뒤 코드·문서·오프라인 테스트를 함께 갱신한다.
- 정적 후보 선택과 fallback 동작은 네트워크 없는 단위 테스트로 검증한다.

## 아키텍처와 안전 경계

### 생명주기와 상태 소유권

- 레지스트리 후보 탐색은 bootstrap/post-init 설치 경로 reconciliation과 사용자
  진단 동작에서 사용한다.
- `GameStatusStore`의 런타임/프로세스 상태가 설치 검사 상태보다 강하다.
  reconciliation은 `preparing`, `processing`, `authenticating`, `ready`,
  `running`을 임의로 낮추지 않는다.
- 경로 선택·등록·삭제·동기화 성공 뒤 해당 게임 설치 상태를 명시적으로 다시
  계산한다.
- 겹친 설치 검사는 generation/token을 비교해 오래된 결과가 최신 결과를
  덮어쓰지 못하게 한다.

### IPC와 정확한 대상 조작

- 새 EventBus를 만들지 않고 기존 게임 경로 진단 흐름을 확장한다.
- Renderer가 임의의 레지스트리 경로를 전달해 쓰게 하지 않는다. Main이
  `serviceId`, `gameId`, 진단한 후보 identity로 허용 목록의 정확한 키를 다시
  해석한다.
- sync/delete/register는 사용자가 모달에서 확인한 정확한 후보만 대상으로 하며,
  쓰기 직전 상태를 다시 읽어 TOCTOU 변경을 검사한다.
- `read-failed`는 키 없음/빈 값과 구분한다. 읽기 실패가 하나라도 있으면 자동
  fallback 등록이나 덮어쓰기를 허용하지 않는다.

### 외부 레지스트리 변경 권한

- 제품 기능 구현 범위에는 사용자 선택으로 수행되는 HKCU 레지스트리
  등록·동기화·삭제와 이에 필요한 IPC 계약 보강이 승인되어 있다.
- 실제 변경은 모달에서 대상 키·값 이름·경로를 표시하고 사용자가 확인한 뒤에만
  수행한다.
- 수동 등록 대상은 `HKCU:\Software\Kakaogames\POE{,2}`의 `InstallPath`
  하나다. `DaumGames` 키를 새로 만들거나 미러링하지 않고, 다른 값 또는 키
  컨테이너를 삭제하지 않는다.
- 두 후보가 확정적으로 키 없음/값 없음/빈 값이고 런처 설정 경로 및
  `PathOfExile_KG.exe`가 쓰기 직전에도 유효할 때만 등록한다. 기존에 비어 있지
  않은 값이 생겼으면 덮어쓰지 않고 중단한다.
- 에이전트의 자동 검증은 mock/격리된 키를 사용한다. 사용자 PC의 실제 게임
  레지스트리를 변경하는 검증은 별도 명시 승인 없이 수행하지 않으며 최종 확인은
  `[사용자]` DoD로 남긴다.

## Blast radius

- 게임 설치 경로 조회가 기존 단일 `DaumGames` 키에서 신·구 후보 탐색으로
  넓어진다.
- 경로 진단 결과와 IPC payload가 선택된 후보 identity를 보존하도록 확장된다.
- 알림 UI에 실행을 막지 않는 typed 운영 경고가 추가되고 클릭 시 기존 진단
  모달을 연다.
- 사용자 확인 후 canonical HKCU 값 하나를 생성·수정하거나 선택된 기존 값을
  삭제할 수 있다.
- 경로 조작 후 설치 상태 reconciliation의 실행 순서가 보강된다.
- AppConfig schema, 설정 migration, 의존성, updater/release flow는 변경하지
  않는다.
- CDN 가용성이나 JSON 변경은 제품 런타임과 기본 CI에 영향을 주지 않는다.

## 마일스톤과 DoD

### MS1 — 출처 계약과 작업 기준 고정

- [WSL] 본 문서에 공식 URL, 2026-08-09 계약 값, 근거 경계, 현재 PC 관찰,
  runtime no-fetch 정책과 안전 경계가 기록되어 있다.
- [WSL] Node built-in만 사용하는 opt-in CDN drift 감사 명령이 있고 기본
  test/build/CI에서 호출되지 않는다.
- [WSL] 감사의 JSON 추출·비교 로직을 네트워크 없이 import하여 검사할 수 있다.

### MS2 — 정적 후보 탐색, exact-target 경계와 상태 reconciliation

- [Windows-pwsh] POE1·POE2 모두 `Kakaogames` 유효 후보를 우선 선택하고,
  누락·빈 값·무효 경로이면 `DaumGames`의 유효 후보로 fallback한다.
- [Windows-pwsh] 둘 다 유효하면 `Kakaogames`를 선택하며 실제 선택 키가 진단
  결과에 보존된다.
- [Windows-pwsh] 런처 설정 경로 우선순위와 GGG 동작에는 회귀가 없다.
- [Windows-pwsh] conflict keep/sync와 registry clear는 모달이 본 allowlisted
  candidate identity 및 expected 현재 경로를 전달한다. sync/delete는 Main의
  단일 PowerShell 실행 안에서 fresh read·정규화 비교·mutation을 순서대로
  수행하며, 일치할 때만 정확한 후보 하나를 조작한다.
- [Windows-pwsh] conflict keep/sync는 모달이 본 launcher config path도 전달하고,
  Main의 fresh config path 및 실행 파일 검증과 일치해야 진행한다.
- [Windows-pwsh] target mismatch/missing/read-failed 또는 비허용 identity이면
  registry/config mutation 없이 최신 진단을 반환한다.
- [Windows-pwsh] 경로 조작 뒤 상태를 다시 계산하고 늦은 과거 검사 결과는 최신
  상태를 덮어쓰지 않는다.
- [Windows-pwsh] 성공한 경로 조작 뒤 reconciliation이 실패해도 이미 성공한
  action result는 유지하고 실패 동작은 reconciliation을 시작하지 않는다.

### MS3 — 경고 알림, 진단 후보 UI와 명시적 canonical 등록

- [Windows-pwsh] 런처 설정 경로가 유효하지만 유효한 레지스트리 후보가 없으면
  amber warn 알림이 한 건만 유지되고 게임 실행은 계속 가능하다.
- [Windows-pwsh] 키 없음/빈 값과 `read-failed`의 안내 문구가 구분된다.
- [Windows-pwsh] 알림 클릭 시 해당 서비스·게임의 경로 진단 모달이 열린다.
- [Windows-pwsh] 모달은 레지스트리 키와 값 이름을 별도 필드로 표시하고,
  후보·검증 상태·조작 대상을 모호하지 않게 보여준다.
- [Windows-pwsh] 유효한 런처 설정 경로와 두 후보의 확정적 부재가 확인된 경우에만
  사용자가 canonical `Kakaogames`의 `InstallPath` 등록 확인창을 열 수 있다.
- [Windows-pwsh] 확인창에 정확한 키·값 이름·등록 경로가 표시된다.
- [Windows-pwsh] 값이 생겼거나 후보 읽기가 실패하면 덮어쓰지 않고 재진단을
  요구한다.
- [Windows-pwsh] register도 MS2 exact-target 허용 목록·fresh-read 경계를
  재사용하며 렌더러가 전달한 임의 경로는 거부한다.
- [Windows-pwsh] 등록 성공 뒤 설치 상태와 진단·경고를 다시 계산하고, 실패 시
  최신 진단을 표시한다.

### MS4 — 통합 검증과 실제 Electron 시각 QA

- [Windows-pwsh] 관련 단위/UI 테스트, 전체 lint, `npm run build:check`가
  통과한다.
- [Windows-pwsh] hidden 실제 Electron의 POE1·POE2 진단 상태를 각각 캡처하고
  터미널 로그·CDP fatal 여부와 함께 사용자에게 브리핑한다.
- [Windows-pwsh] isolated profile을 사용한 hidden 실제 Electron에서 알림 클릭,
  진단, 등록 확인 흐름에 fatal/IPC 오류가 없고 캡처가 확보된다.
- [사용자] 실제 신규 `Kakaogames` 환경에서 값 이름·실행·진단 및 등록 결과를
  확인한다.
- [사용자] 실제 런처에서 경고 문구·모달·등록 동작을 확인한다.
- [WSL] 분리 리뷰가 work 문서, `git diff master...HEAD`, 이전 지적을 기준으로
  `통과` 또는 `조건부 통과` 판정을 내린다.

## 결정 로그

| 날짜       | 결정                                                                        | 이유                                                                                      |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2026-08-09 | `Kakaogames` 우선, `DaumGames` fallback을 정적 정책으로 채택                | 공식 스타터 JSON의 후보 순서와 기존 사용자 호환성을 함께 보존                             |
| 2026-08-09 | CDN은 런타임과 기본 CI에서 참조하지 않고 opt-in drift 감사에만 사용         | 퍼블리셔 구조 변경과 네트워크 장애가 제품 실행·필수 게이트를 깨지 않게 함                 |
| 2026-08-09 | 런처 설정 경로 유효 + 레지스트리 이상은 실행 차단이 아닌 warn 알림으로 처리 | 실제 게임 실행 가능성과 복구 안내를 분리                                                  |
| 2026-08-09 | warn 클릭은 기존 게임 경로 진단 모달을 재사용                               | 새 UI 진입점과 EventBus 추가를 피하면서 정확한 복구 문맥 제공                             |
| 2026-08-09 | 수동 등록은 canonical `Kakaogames` 키 하나에만 명시적으로 수행              | 구 키 재생성과 불필요한 미러링을 피하고 공식 우선순위에 맞춤                              |
| 2026-08-09 | 레지스트리 조작 뒤 재조정과 오래된 검사 결과 차단을 함께 구현               | 등록만으로 가려질 수 있는 stale `uninstalled` 상태의 근본 원인을 해결                     |
| 2026-08-09 | exact-target IPC 경계를 경고·등록 UI보다 먼저 구현                          | 표시용 후보를 mutation authority로 오용하지 않고 이후 UI가 안전한 계약 위에서 동작하게 함 |
| 2026-08-09 | UI 변경 후 hidden 실제 Electron 캡처를 사용자에게 브리핑                    | Windows Electron 실제 렌더링과 클릭 흐름을 검증                                           |

## 구현 및 검증 기록

### MS1

- 공식 CDN 계약 문서와 runtime no-fetch/opt-in 감사 정책을 기록했다.
- `scripts/check-kakao-registry-source.cjs`와
  `npm run audit:kakao-registry-source`를 추가했다. 기본 test/build/CI에는
  연결하지 않았다.
- 오프라인 계약 테스트는 실제 `poe.live`/`poe2.live` 중첩 fixture, 상위 게임
  key 누락, `live` 누락, 후보 순서 drift를 고정한다.

리뷰 기록:

- Round 1 — `반려`: 최초 감사 스크립트가 공식 JSON의 상위 `poe`/`poe2`
  객체를 건너뛰고 `document.live`를 읽는 구조 오류가 발견됐다.
- 수정 — source별 `documentKey`를 계약에 포함하고 전체 필드 경로 기반 추출·오류
  보고 및 중첩 fixture 테스트를 추가했다.
- Round 2 — `통과`: 수정된 소스 계약과 MS1 DoD가 승인됐다.

### MS2

구현:

- 카카오 POE1·POE2 레지스트리를 공식 순서의 정적 후보 배열로 확장했다.
  후보마다 값을 읽고 정규화한 뒤 `PathOfExile_KG.exe`를 검증하며, 첫 유효
  후보만 active로 선택한다. GGG는 기존 단일 후보와 `PathOfExile.exe` 검증을
  유지한다.
- 진단 결과에 후보별 path/state/verification/정확한 key/value name/active 여부와
  aggregate `valid | absent | invalid | unknown`을 추가했다. 진단 getter는 설정이나
  레지스트리를 변경하지 않는다.
- 유효 후보가 없을 때 후보 read 실패 또는 실행 파일 검증 unknown이 하나라도
  있으면 설치 상태를 `unknown`으로 유지한다.
- 모든 성공한 수동 set/pick/conflict keep/sync/config clear/registry clear IPC
  동작은 동일한 await 래퍼를 통해 해당 context 설치 상태를 명시적으로 다시
  계산한다. 설정값이 동일하여 config-change 이벤트가 발생하지 않는 경우도
  포함한다.
- context별 generation guard를 추가해 먼저 시작한 비동기 설치 검사의 늦은
  결과를 폐기한다. 기존 launch-blocking runtime 상태 보존 규칙은 유지한다.
- conflict keep/sync와 registry clear는 typed target으로 후보 identity와 expected
  현재 경로를 전달한다. Conflict target은 모달이 확인한 config path snapshot도
  별도로 포함한다. Main은 service/game 정적 map으로 path/value name을 재해석하고
  fresh config path·실행 파일 검증이 snapshot과 일치할 때만 conflict action을
  진행한다. 표시용 `displayedCandidate` 자체는 mutation authority로 사용하지
  않는다.
- sync/delete는 레지스트리 read와 mutation 사이의 별도 App 프로세스 창을 없앴다.
  한 PowerShell 실행 안에서 exact key/value를 읽고 현재 경로와 expected를
  정규화 비교한 직후 `Set-ItemProperty` 또는 `Remove-ItemProperty`를 수행한다.
  결과는 `mutated | changed | missing | read-failed | mutation-failed` marker로
  구분하고 non-mutated 결과에는 최신 diagnostics를 다시 읽어 반환한다.
- primary read-failed/verify-unknown과 무관하게 active legacy target 자체의 fresh
  read가 expected와 일치하면 해당 legacy 후보 조작을 허용한다. 후보 전체의
  clear/readable 조건은 후속 canonical register eligibility에서 적용한다.
- 성공한 수동 action 뒤 reconciliation 예외는 warn으로 격리하여 성공 결과를
  뒤집지 않는다. 실패 action은 reconciliation을 실행하지 않는다.

검증:

- [Windows Node] correction 관련 Vitest 5개 파일, 60개 테스트 통과.
  - primary/fallback/둘 다 유효/primary missing·empty·invalid·read-failed·verify
    unknown/aggregate unknown/config 우선/GGG 단일 후보 회귀
  - POE1 primary missing 및 POE2 primary invalid/read-failed의 resolver 반환,
    빈 config cache, installed status
  - primary read-failed + legacy absent/invalid의 unknown 보존
  - exact target allowlist/fresh match, mismatch·missing·read-failed mutation 0회,
    primary read-failed 상태의 exact legacy sync
  - conditional PowerShell 한 실행에 expected 비교와 set/delete가 함께 포함되는지,
    changed marker overwrite/delete 0회, 잘못된 value name 거부
  - config snapshot mismatch mutation 0회, clear missing/read-failed mutation 0회,
    sync mutation-failed 최신 diagnostics 반환
  - 동일 config 경로 재확인 후 stale 상태 회복, sync 후 회복, generation ordering,
    launch-blocking 상태 보존, reconcile 예외 격리와 실패 action 0회
  - MS1 오프라인 CDN 계약과 기존 모달 metadata 회귀
- [Windows Node] `tsc --noEmit` 통과. shared ElectronAPI → preload → main → renderer
  call-through의 typed target signature를 확인했다.
- [Windows Node] Round 3 조건 보강 후 영향 대상 Vitest 1개 파일, 43개 테스트와
  `tsc --noEmit`이 통과했다. PowerShell이 mutation marker를 출력했더라도 종료
  코드가 0이 아니면 성공으로 인정하지 않으며, mutation 실패 뒤 재조회한 최신
  diagnostics가 mutation 전 snapshot이 아닌 변경된 경로를 반환하는 것을 고정했다.
- 전체 lint와 build는 MS4 통합 게이트까지 보류한다.

리뷰 기록:

- Round 1 — `반려`: 표시 후보를 암묵적 mutation 대상으로 재사용해 modal 확인
  이후 후보 전환/값 변경을 막지 못했고, resolver/status/cache fallback evidence와
  post-action reconcile 예외 격리가 부족했다.
- correction — typed exact target, Main allowlist 재해석, fresh expected-value 비교,
  최신 진단 실패 반환, resolver/status/cache 및 reconcile failure 회귀 테스트를
  추가했다. exact-target 경계를 MS3 UI보다 선행하도록 마일스톤 순서를 고쳤다.
- Round 2 — `반려`: sync/delete가 exact target을 fresh read한 뒤 별도 generic
  PowerShell mutation을 실행하여 두 프로세스 사이 TOCTOU 창이 남았고, conflict
  확인 시점의 launcher config path snapshot이 IPC 계약에 없었다.
- correction — sync/delete를 한 PowerShell 실행의 conditional mutation marker
  계약으로 교체하고 conflict target에 `expectedConfigPath`를 추가했다. Main은
  fresh config path·verification 및 allowlisted registry identity를 검증한다.
- Round 3 — `조건부 통과`: mutation marker와 비정상 종료 코드 조합의 보수적
  실패 처리, mutation-failed 최신 diagnostics의 stale snapshot 구분 evidence를
  경미 보강하는 조건으로 MS2 DoD가 승인됐다.
- 조건 보강 — `__REG_CONDITIONAL_MUTATED__`는 PowerShell 종료 코드 0과 함께
  반환될 때만 성공으로 분류하고, 비정상 종료 조합 테스트를 추가했다. mutation
  실패 뒤 레지스트리 mock 경로를 변경해 반환 diagnostics가 fresh read임을
  명시적으로 검증했다.
- MS2 — 완료. MS3 경고 알림·진단 모달 UI 구현 전 안전 경계가 확정됐다.

### MS3

구현:

- renderer가 config 로드·현재 서비스/게임 변경·설정 경로 변경 뒤 기존
  `getGameInstallPathDiagnostics` invoke로 현재 context를 진단한다. 유효한 런처
  설정 경로와 유효한 레지스트리 후보 부재가 함께 확인된 Kakao context에만
  session-local amber warning 한 건을 만든다.
- warning refresh에는 generation/cancel guard를 두어 이전 context의 늦은 응답이
  최신 알림을 덮지 못하게 했다. 정상화·진단 실패 시 알림을 제거하며 append,
  dismiss localStorage, 새 EventBus 또는 Main→Renderer push를 추가하지 않았다.
- TitleBar/WindowControls는 기존 exception 알림을 그대로 유지하면서 typed
  operational notification을 함께 표시한다. 헤더는 `알림`으로 일반화했고 경로
  warning 클릭은 오류 제보 modal 대신 알림에 담긴 정확한 서비스/게임의
  `openGamePathModal("diagnostic", ...)`을 호출한다.
- 진단 모달은 `Kakaogames (기본)`과 `DaumGames (호환)` 후보 각각의 key/value
  name/path 및 active/fallback/absent/read-failed 상태를 표시한다. 기존 요약의
  레지스트리 키와 값 이름 분리 표시도 유지한다.
- 유효한 config와 두 후보의 확정적 `key-missing | value-missing | value-empty`
  상태가 동시에 확인된 경우만 등록 버튼을 활성화한다. read-failed/verify-unknown
  또는 기존 nonempty 값이 있으면 비활성화하고 이유를 표시한다.
- 등록 확인창은 canonical key, `InstallPath`, config path와 `DaumGames` 미변경을
  명시한다. 전용 typed ElectronAPI/preload/Main IPC는 renderer가 registry target을
  전달하지 않고 config snapshot만 전달하도록 했다.
- Main은 Kakao static map의 canonical/legacy 후보를 다시 도출하고 fresh config
  path 정규화·`PathOfExile_KG.exe` 검증 뒤, 한 PowerShell 실행에서 두 후보의
  부재 확인 → canonical key/property `REG_SZ` 생성 → read-back 검증을 수행한다.
  nonempty/read-failed/mutation-failed/readback-failed이면 성공으로 보고하지 않고
  최신 diagnostics를 반환한다. legacy mirror, key rollback/delete, GGG 등록은
  수행하지 않는다.
- 등록을 포함한 성공한 경로 action은 기존 manual action wrapper reconciliation을
  거친 뒤 현재 context warning을 다시 진단한다. 설치 시작 상태를 warning 로직이
  변경하지 않는다.

검증:

- [Windows Node] targeted Vitest 7개 파일, 72개 테스트 통과.
  - canonical-only atomic command, 두 후보 guard, config mismatch, nonempty,
    read-failed, mutation/read-back failure, GGG 거부와 fresh diagnostics
  - shared/preload/Main 전용 register channel 계약과 typed payload
  - warning 조건·문구·dedupe·정상화 제거·async generation ordering
  - WindowControls의 exact context click, exception notification 보존,
    `SHOW_REPORT_MODAL` 미호출
  - 모달 primary/fallback label·상태, key/value 분리, 등록 eligibility, 정확한
    confirm 필드와 성공 후 fresh candidate 표시
- [Windows Node] `tsc --noEmit` 통과.
- 전체 lint, build와 hidden 실제 Electron 캡처는 MS4 통합 게이트로 남겼다.

리뷰 기록:

- Round 1 — `반려`: context 전환 commit과 passive effect 사이에 이전 warning이
  잠시 노출될 수 있었고, register 비동기 응답이 닫히거나 다른 context로 바뀐
  modal state를 덮을 수 있었다. busy 중 backdrop 닫기 차단, registered marker와
  비정상 종료 코드 조합, nonempty invalid 후보의 직접 UI evidence도 부족했다.
- correction — hook 반환값을 현재 owner context key로 동기 필터하여 새 진단이
  unresolved인 전환 직후에도 이전 warning과 클릭 대상을 0건으로 만들었다.
  register success/failure/catch updater는 캡처한 service/game identity와 현재 modal이
  일치할 때만 diagnostics/error/busy/toast를 적용하며, 공용 modal backdrop은 busy
  동안 닫히지 않는다.
- correction evidence — [Windows Node] 영향 대상 Vitest 4개 파일, 63개 테스트
  통과. 이전 warning 존재 후 context 전환 즉시 숨김, 닫힘/새 modal에 대한 late
  success·failure 무효화, busy backdrop, nonempty invalid eligibility,
  `__REG_REGISTERED__` + nonzero exit 실패를 고정했다. `tsc --noEmit`도 통과했다.
- Round 2 — `통과`: correction이 Round 1 지적과 MS3 DoD를 충족했다.
- MS3 — 완료. MS4 통합 검증과 실제 Electron 시각 QA를 진행한다.

### MS4

게이트 correction:

- [Windows Node] 전체 Vitest 65개 파일, 376개 테스트가 통과했다.
- 최초 lint는 CDN 계약 테스트의 import group, warning hook의
  `react-hooks/set-state-in-effect`, modal 파일의 eligibility helper export에 대한
  Fast Refresh 경고로 실패했다.
- CDN 계약 테스트의 Node/Vitest import group을 분리했다. warning hook은 기존
  owner-context 동기 반환 필터를 유지하고 effect가 외부 diagnostics Promise를
  직접 구독하여 비동기 callback에서만 상태를 반영하도록 바꿨다.
- 등록 eligibility type/helper는 React component 파일에서 renderer utility로
  이동해 component 파일이 component만 export하도록 했다.

검증:

- [Windows Node v24.14] 최종 전체 Vitest 65개 파일, 376개 테스트 통과.
- [Windows Node] 영향 대상 Vitest 3개 파일, 14개 테스트 통과.
- [Windows Node] `eslint src` 전체 lint 통과. `npm.ps1` wrapper는 lint 실행 전에
  미설정 `$LASTEXITCODE` 오류를 냈으므로 동일 Windows Node와 저장소 ESLint
  entrypoint로 package script의 정확한 명령을 실행했다.
- [Windows Node] `tsc`와 `vite build`가 통과해 `build:check`와 동등한 compile 및
  renderer build를 확인했다. 기존과 같은 500 kB 초과 chunk 경고만 남았다.
- [WSL] `git diff --check` 통과.

Hidden 실제 Electron QA:

- Windows Vite/Electron과 격리 profile `codex-kakao-registry-qa-5H1s4j`을 사용했다.
  hidden 1440×960에서 POE1·POE2를 각각 확인하고 1024×683으로 resize한 POE2도
  확인했다.
- POE1·POE2 모두 `Kakaogames` primary가 `key-missing`, `DaumGames` fallback이
  `found / valid / isActive`로 표시됐다. 두 후보의 키와 값 이름이 각각 분리된 두
  행으로 표시됐고, modal body는 `clientHeight == scrollHeight == 534`로 clipping이
  없었다.
- capture의 fatal 상태는 `false`였고 Log/Runtime event 목록은 모두 비어 있었다.
- 캡처:
  - `.tmp/kakao-registry-ms4/poe1-diagnostic-1440x960.png`
  - `.tmp/kakao-registry-ms4/poe2-diagnostic-1440x960.png`
  - `.tmp/kakao-registry-ms4/poe2-diagnostic-1024x683.png`
- 실제 PC에는 두 legacy 후보가 유효했으므로 warning과 register confirm 조건을
  만들기 위해 사용자 HKCU를 변경하지 않았다. 이 두 실제 Electron 흐름은
  `[사용자]` DoD로 남기며, 조건·클릭·confirm·backend 안전 경계는 단위/UI/backend
  테스트로 검증했다.
- 실행 소유 PID 56604 process tree를 종료했고 격리 QA profile은 제거했다. 캡처와
  로그는 검토 evidence로 보존했다.

MS4 상태:

- 안전한 자동화 범위의 candidate 검증은 완료했다.
- 실제 warning/register confirm 및 신규 `Kakaogames` 환경 검증은 `[사용자]` DoD
  대기이며, MS4와 전체 작업의 최종 완료로 판정하지 않는다.

분리 리뷰:

- fresh complete-working-tree 리뷰에서 tracked 변경과 모든 untracked 파일을 함께
  점검했다.
- 판정 — `통과`: blocking finding 없음.
- 리뷰는 자동화 evidence가 완료됐다는 사실과 실제 warning/register confirm 및
  신규 `Kakaogames` 환경의 `[사용자]` DoD가 남았다는 경계를 유지했다. 따라서
  자동화 candidate와 분리 리뷰는 완료됐지만 전체 작업 완료로 판정하지 않는다.
- 리뷰어는 파일을 수정하거나 테스트를 실행하지 않았다.

## MS5 — 설치 경로 상태 단일화와 여유 시점 재검사

### 계획과 결정

- 생명주기는 `bootstrap/post-init reconciliation`과 `runtime show/focus`로 한정한다.
  Main의 `GameInstallStatusReconciler`가 context별 실행 가능 여부와 Kakao
  레지스트리 advisory를 하나의 install-path-health snapshot으로 소유한다.
- 기존 `GAME_STATUS_CHANGE` → `game-status-update` 계약의 optional health 필드만
  확장한다. 새 EventType·IPC·preload 구독·서비스·AppConfig·주기 타이머는 만들지
  않는다.
- 앱 시작의 전체 context 강제 검사는 유지한다. show/focus는 마지막 성공한
  install-path reconciliation 후 30분이 지난 현재 선택 context만 검사하며,
  중복 show+focus는 context별 in-flight/generation으로 합친다. 수동 경로 동작
  성공은 해당 context를 즉시 강제 검사하고 TTL 기준 시각도 갱신한다.
- 런타임 상태가 install-check 상태보다 강하다는 기존 소유권을 유지한다. 일반
  launch/update/error 상태 이벤트는 advisory를 보존하고, 완료된 install-path
  reconciliation만 같은 context의 advisory를 교체하거나 제거한다.
- Renderer의 별도 diagnostics invoke warning loop는 제거하고 활성
  `GameStatusState`의 advisory만 표시한다. warning은 실행을 막지 않으며 active
  context가 아니면 즉시 숨긴다.
- 버튼은 `uninstalled → 설치하기`, 업데이트 필요 → `업데이트`,
  `install_check_blocked → 경로 확인`, 그 외 → `게임 시작`으로 표시한다. blocked
  클릭은 기존 경로 진단 모달 동작을 유지한다.
- CDN 런타임 조회와 실제 레지스트리 변경 검증은 추가하지 않는다.

### 관찰 가능한 DoD

- [Windows-pwsh] startup은 전체 context를 강제 검사하고, show/focus는 30분 TTL
  만료 후 현재 context만 검사한다. TTL 이내에는 생략하며 연속 show+focus는 한
  검사로 합쳐진다. clock은 테스트에서 주입할 수 있다.
- [Windows-pwsh] 늦은 과거 generation은 최신 status/advisory/TTL을 덮지 못하고,
  성공한 수동 경로 동작은 즉시 강제 검사하여 TTL을 갱신한다.
- [Windows-pwsh] Kakao에서 config 실행 파일이 유효하고 레지스트리가
  `absent | invalid | unknown`이면 설치 상태는 `idle`인 채 해당 advisory가
  전달된다. 신·구 후보 중 하나가 유효하면 advisory가 제거되고 GGG에는 생성되지
  않는다. config가 무효인 경우 설치 판정도 사실대로 유지한다.
- [Windows-pwsh] runtime `GAME_STATUS_CHANGE`는 같은 context의 advisory를
  보존하며, install reconciliation 결과만 그 context advisory를 교체/제거한다.
  다른 context snapshot은 전파되지 않는다.
- [Windows-pwsh] Renderer는 활성 status advisory에서만 warning을 만들고 context
  전환 직후 이전 warning을 표시하지 않는다. 클릭은 advisory의 정확한 context로
  진단 모달을 열며 별도 diagnostics invoke loop가 없다.
- [Windows-pwsh] `install_check_blocked` 버튼 문구는 `경로 확인`이고 클릭은 기존
  진단 모달을 연다. `설치하기`·`업데이트`·`게임 시작` 매핑에는 회귀가 없다.
- [Windows-pwsh] 관련 단위/UI 테스트, 전체 lint, typecheck와
  `npm run build:check`가 통과한다.
- [사용자] 장기간 미사용 후 런처를 다시 표시/포커스했을 때 현재 게임의 경로
  상태와 warning/button 표시가 갱신되는지 확인한다.

### Blast radius

- 기존 게임 상태 payload/store에 optional advisory가 추가되고 show/focus에서
  TTL 기반 현재 context 설치 경로 읽기가 발생한다.
- AppConfig schema, migration, updater/release flow, Kakao 자동화 selector,
  레지스트리 mutation 계약과 의존성은 변경하지 않는다.

### 구현 및 검증 기록

구현:

- shared `GameStatusState`에 optional `installPathHealth`를 추가했다. snapshot은
  설치 판정, 검사 시각, optional Kakao 레지스트리 advisory만 담으며 기존
  `GAME_STATUS_CHANGE` → `game-status-update` 채널을 그대로 사용한다.
- Main registry 모듈에 config 실행 파일과 registry 후보를 한 번의 흐름에서
  검사하는 health getter를 추가했다. 유효한 config는 실행 가능 상태를 유지한
  채 Kakao registry `absent | invalid | unknown`을 advisory로 반환한다. 신·구
  후보 중 하나가 유효하거나 GGG이면 advisory를 만들지 않는다. config가
  무효이면 기존 registry fallback/persist와 unknown/uninstalled 구분을 유지한다.
- `GameStatusStore`는 runtime status 이벤트에서 기존 health를 보존하고,
  `checkedAt`이 더 오래된 carried snapshot이 최신 reconciliation 결과를 되돌리지
  못하게 했다. context key가 다른 snapshot은 공유하지 않는다.
- reconciler에 30분 TTL, injectable clock, context별 passive in-flight map과 기존
  generation guard를 결합했다. startup은 전체 context를 강제 검사하고 show/focus는
  TTL이 지난 현재 context만 검사한다. 겹친 show+focus는 한 작업을 기다리며,
  수동 경로 동작 성공은 기존 강제 reconciliation으로 TTL 기준도 갱신한다.
- Renderer의 `useGamePathRegistryWarning`과 별도 diagnostics invoke loop를 제거했다.
  활성 `GameStatusState` health에 advisory가 있을 때만 기존 amber operational
  notification을 파생하며 exact context 클릭으로 진단 모달을 연다.
- `install_check_blocked` 버튼 문구를 `경로 확인`으로 바꾸고, 기존처럼 missing
  경로 진단 모달을 여는 click 분기를 pure helper로 고정했다.
- 기존 `onGameStatusUpdate` preload 구독이 cleanup 함수를 반환하도록 보강했다.
  새 IPC/EventType/preload channel/service/timer/AppConfig/dependency는 추가하지 않았다.

검증:

- [Windows Node v24.14] targeted Vitest 7개 파일, 100개 테스트 통과.
  - startup 전체 force, current-only TTL 만료/미만, show+focus coalescing, manual
    TTL refresh, stale generation
  - config valid + registry absent/invalid/unknown advisory, primary/legacy valid clear,
    GGG absent, config invalid unknown/uninstalled
  - runtime health 보존, completed reconciliation 교체/clear, older snapshot 거부,
    context 격리와 기존 status event renderer broadcast
  - active-context warning/문구/dedupe/exact identity, no diagnostics warning hook,
    blocked `경로 확인`과 diagnostic click 분기
- [Windows Node] 전체 `eslint src` 통과.
- [Windows Node] `tsc && vite build` (`build:check`과 동일 명령) 통과. 기존과 같은
  500 kB 초과 chunk 경고만 남았다.
- [WSL] `git diff --check` 통과.

상태:

- MS5 구현 candidate와 구현자 자동 게이트는 완료했다.
- 분리 test/리뷰와 hidden Electron QA 및 `[사용자]` 장기 미사용 후 show/focus
  실동작 확인은 아직 완료로 주장하지 않는다.

## MS5-H — WSL→Windows 숨김 실행 하네스 교정

### 교정 배경과 결정

- 기존 WSL 실행 예시는 `pwsh.exe`/`powershell.exe` 또는 Windows console-subsystem
  `node.exe`를 첫 interop 프로세스로 직접 실행했다. 이 경로는 agent 검증 중
  console 창이 표시될 수 있어 hidden/non-focus-stealing 정책을 구조적으로
  보장하지 못한다.
- 공개 진입점은
  `.agents/skills/windows-electron-debugging/scripts/run-hidden-windows.cjs`
  하나로 고정한다. WSL Node가 collision-safe request를 만든 뒤 GUI-subsystem
  `wscript.exe //B //NoLogo`만 첫 Windows interop으로 호출한다. WSH bootstrap은
  Windows Node worker를 `windowstyle=0`으로 시작하고, worker만
  `child_process.spawn({ shell: false, windowsHide: true })`로 실제 명령을 실행한다.
- sync는 request/result/log 파일로 bounded wait하면서 stdout/stderr를 relay하고
  child exit/signal/timeout을 호출자에게 전달한다. detached는 필수 stdout/stderr
  경로, owner token, PID와 run metadata/control 파일로 격리한다. stop은 metadata와
  owner token을 검증한 뒤 known root PID tree만 graceful→bounded force 순서로
  정리한다.
- 명령 argv는 배열 경계를 유지하고 cwd와 명시적 allowlist env만 전달한다. env
  값과 token은 출력하지 않으며 새 dependency나 compiled binary를 추가하지 않는다.
- agent는 WSL에서 Windows `pwsh.exe`/`cmd.exe`/`node.exe`를 직접 호출하지 않는다.
  `.husky/pre-commit`의 내부 위임만 기존 명시적 예외로 유지한다.

### 관찰 가능한 DoD

- [WSL] parser/static tests가 sync/detached/stop 옵션, argv 경계, cwd 변환, env
  allowlist, ownership validation과 collision-safe run isolation을 검증한다.
- [Windows-runner] sync가 exact argv/cwd/env를 child에 전달하고 stdout/stderr를
  각각 relay하며 exit code/signal을 보존한다.
- [Windows-runner] timeout은 해당 run의 known root PID tree만 graceful 후 bounded
  force 정리하고 actionable timeout result를 반환한다.
- [Windows-runner] detached는 서로 다른 run ID/metadata/log를 만들고 stop은 owner
  metadata가 일치하는 run만 종료한다. 잘못된 metadata/token은 process를 건드리지
  않고 거부한다.
- [Windows-runner] GUI bootstrap은 `//B //NoLogo`, WSH worker 시작은
  `windowstyle=0`, worker child는 `shell:false/windowsHide:true`임이 정적으로
  고정된다. native monitor가 held workload 전체를 100ms 이하 간격으로 20회 이상
  관찰하며 owned visible top-level window, foreground, focus가 모두 0이다. owned
  conhost는 PID/name과 visible handle 0을 정보성으로 기록하고 존재 자체로
  실패시키지 않는다.
- [WSL] 루트 `AGENTS.md`, Windows Electron skill과 `dev:wsl`이 단일 runner 사용법을
  가리키며 direct Windows console interop 예시가 제거되어 있다.
- [Windows-runner] runner targeted tests/probe 후 MS5 targeted tests, lint와
  typecheck가 runner 경유로 통과한다.

### MS5 분리 리뷰 correction

- P1: runtime launch-blocking 상태나 이미 감지된 running process도 install-path
  health 검사를 생략하지 않는다. 상태 소유권은 보존하면서 health/advisory와 TTL은
  완료된 최신 검사로 갱신한다. startup과 수동 성공도 running/preparing 상태에서
  warning을 refresh/clear할 수 있어야 한다.
- P2: pending manual reconciliation 중 연속 show/focus는 passive health read를
  추가하지 않는다. manual은 정확히 한 번 완료되고 guard counter가 해제되며 해당
  결과의 TTL이 유지되는 직접 race test를 추가한다.
- exact-target registry mutation, CDN runtime no-fetch, 기존 EventType/IPC/AppConfig
  경계는 변경하지 않는다.

### 구현 및 검증 기록

하네스 구현:

- reusable skill은 project cwd, URL, port, npm script, Kakao 경로를 하드코딩하지
  않는다. project-specific cwd/env/renderer target/CDP script/dump path는 루트
  `AGENTS.md`의 최소 recipe에만 남겼다. skill 본문은 100줄이며 Windows command,
  tests/lint/typecheck/build, process lifecycle과 Electron/CDP/screenshot/cleanup의
  단일 owner로 갱신했다.
- 공개 CJS가 request/result/log를 만들고 `wscript.exe //B //NoLogo`로만 Windows에
  진입한다. WSH bootstrap은 worker를 `windowstyle=0`으로 실행하며 worker는 exact
  argv/cwd/allowlisted env, `shell:false`, `windowsHide:true`로 child를 소유한다.
- sync stdout/stderr/exit/timeout, detached 필수 로그·metadata·readiness, collision-safe
  run ID, owner token 검증 stop과 exact tree graceful→bounded force cleanup을
  dependency 없이 구현했다. env 값과 owner token은 public output에 포함하지 않는다.
- `scripts/qa/cdp-capture.cjs`로 project-specific CDP capture를 분리했고,
  `dev:wsl`은 PowerShell/npm wrapper 대신 public runner의 Windows Node가 Vite를
  직접 실행한다.

MS5 review correction:

- reconciler는 cached `running/preparing/processing/authenticating/ready` 또는 실제
  process가 감지되어도 health 조회를 끝까지 수행한다. 완료 시 runtime/process
  status는 그대로 보존하고 최신 health/advisory를 같은 event에 실으며 TTL을
  갱신한다. 이로써 startup force와 running 중 수동 성공도 advisory를 refresh/clear
  할 수 있다.
- manual guard count를 action 완료 뒤가 아니라 action 호출 전부터 잡는다. pending
  action 중 연속 show/focus는 passive read를 시작하지 않고, 성공한 manual만 한 번
  force reconcile한다. `finally`에서 count를 해제하고 성공 health 시각을 TTL
  baseline으로 사용한다.

검증:

- [WSL] runner parser/static tests 8/8 통과: argv/cwd/env/path 변환, detached 필수
  로그, collision-safe ID, stop ownership, genericity, WSH/worker hidden flags와 native
  Toolhelp/user32 monitor 계약을 검사했다.
- [WSL] skill-creator `quick_validate.py` 통과, `git diff --check` 통과.
- [Windows-runner] native visibility run
  `20260812160920689-397023-dc5e05a37352f3dc` 통과: worker PID 125292,
  2553ms 동안 41 samples, first 0ms/last 2490ms, max gap 64ms, visible owned
  top-level 0, owned foreground 0, owned focus 0. 첫 sample 뒤 생성된 sentinel PID
  35684가 2303ms 전 sample까지 소유 계보에 관찰됐다. conhost 4개는 모두 visible
  handle 없이 정보성으로 기록됐다.
- 첫 visibility 시도 `20260812160457479-396726-ed48bbc33416244f`는 visible/foreground/
  focus가 0이었지만 WMI 병목으로 3577ms 동안 3 samples뿐이어서 빈도 DoD 실패로
  판정했다. 이후 C# Toolhelp32Snapshot/EnumWindows/GetGUIThreadInfo monitor로
  교체하고 승인된 재검증 1회에서 위 native 기준을 통과했다.
- [Windows-runner] worker integration 4/4 통과: exact argv/cwd/env/stdout/stderr/exit,
  timeout parent+grandchild cleanup, file readiness + metadata + wrong ownership rejection
  - stop, concurrent detached isolation을 검사했다. 최초 readiness test는 test와
    worker deadline이 같은 5초라 경계에서 실패했고, 잔존 exact runner/fixture
    process 0을 public runner로 확인한 뒤 bounded wait와 failure `finally` exact worker
    cleanup을 보강해 재검증했다.
- [Windows-runner] MS5 관련 Vitest 10개 파일, 114개 테스트 통과. running/preparing
  health+TTL, process-detected startup, running manual advisory clear, pending manual 대
  연속 show/focus race와 기존 registry/store/renderer/modal/button 계약을 포함한다.
- [Windows-runner] `eslint src`, `tsc --noEmit` 통과.
- [Windows-runner] `vite build` 통과. `npm run build:check`의 PowerShell wrapper
  시도는 설치된 `npm.ps1`이 strict-mode 미설정 `$LASTEXITCODE` 오류를 내면서도
  exit 0을 반환해 유효 evidence에서 제외했다. 동일 runner에서 build:check의 두
  구성 요소인 TypeScript와 Vite를 각각 Windows Node entrypoint로 실행했고, 기존
  500kB chunk warning 외 실패는 없었다.

현재 상태:

- 하네스와 MS5 P1/P2 correction은 구현자 candidate 및 자동 게이트까지 완료했다.
- 이 기록은 fresh 분리 리뷰, full suite, hidden Electron QA 또는 `[사용자]` 장기
  미사용 show/focus 실동작 통과를 주장하지 않는다.

### Round 2 fresh test·forward-review — `반려`

반려 사유:

- detached public output의 filesystem path가 Windows 형식이라 WSL 사용자가 출력된
  `metadataPath`를 그대로 `stop --metadata`에 붙여 넣으면 WSL `path.resolve`에서
  잘못 해석된다.
- cleanup 결과가 `stopped:false`여도 timeout/stop/readiness failure가 성공적인
  정리처럼 보고될 수 있고 public stop이 child 종료와 cleanup true를 독립적으로
  검증하지 않는다.
- sensitive env 값이 CLI `--env NAME=VALUE`, request JSON과 Windows child env
  snapshot에 남고, argv도 metadata/public output에 그대로 보존된다.
- detached 자연 종료와 log close/result write 사이에 completion flag가 먼저
  보이는 race가 있으며 readiness test의 단계별 진단과 실패 시 orphan assertion이
  부족하다.
- 첫 WSL→`wscript.exe` spawn에 `windowsHide:true`가 명시되지 않았고 project
  `dev:wsl` detached recipe에 실제 renderer/CDP readiness gate가 없다.

Round 2 correction 결정과 관찰 가능한 DoD:

- [WSL] public detached output은 cwd/stdout/stderr/metadata를 WSL copy-paste-safe
  path로 반환하고, stop은 WSL path와 absolute Windows path를 모두 정확히
  해석한다. 출력의 `metadataPath`를 그대로 stop에 전달하는 public E2E가 통과한다.
- [WSL/Windows-runner] secret은 이름 기반 `--pass-env NAME`으로만 전달하며 값은
  CLI argument/request/result/metadata/public output에 기록하지 않는다. safe literal
  env는 명시적으로 구분하고 secret 사용을 금지한다. persisted/public argv는
  redacted command summary만 보존하고 secret marker absence test를 둔다.
- [Windows-runner] cleanup `stopped:false`는 sync/detached 어느 경로에서도
  `stopped`, exit 0 또는 단순 124로 축약되지 않고 `cleanup-failed`와 actionable
  nonzero로 귀결된다. result/metadata는 cleanup detail을 보존하며 public stop은
  cleanup true와 child dead를 모두 확인해야 성공한다.
- [Windows-runner] detached finalization은 log close와 result/metadata atomic write를
  완료한 Promise를 monitor loop가 await한다. large/slow log natural-exit test에서
  결과·로그가 완전하며 orphan이 없다.
- [Windows-runner] readiness test는 metadata creation, ready artifact, running status를
  별도 deadline과 diagnostics로 검사한다. 모든 실패 finally가 exact worker tree를
  정리하고 child/worker dead를 assert한다. fixed port를 사용하지 않는다.
- [WSL] public bootstrap spawn도 `shell:false/windowsHide:true`가 정적으로 고정된다.
  generic skill은 copy-paste detached→returned metadata→stop, secret/env 계약과 cleanup
  failure semantics를 설명한다.
- [Windows-runner] project `dev:wsl`은 project-owned renderer readiness URL을
  제공하여 즉시 Vite/Electron 실패를 detached 성공으로 반환하지 않는다.
- 검증은 WSL syntax/static/quick_validate 뒤 public runner의 worker/integration 및
  public detached→stop E2E만 수행한다. project tests/build/Electron은 Round 2 fresh
  harness review 전 실행하지 않는다.

Round 2/3 correction 구현 및 제한된 검증:

- public detached output의 cwd/stdout/stderr/metadata를 WSL path로 변환하고 stop은
  반환된 WSL path와 absolute Windows path를 모두 해석한다. metadata에는 full argv
  대신 command basename과 SHA-256 fingerprint만 남긴다.
- `--env`를 폐기하고 non-secret `--literal-env`와 sensitive named
  `--pass-env NAME`을 분리했다. public runner는 request에 pass-env 이름만 0600으로
  기록하고 WSLENV/inherited env로 값을 전달한다. worker는 값을 consume한 직후
  request를 삭제하고 child env를 구성한다. bootstrap/public failure도 request
  best-effort unlink를 수행한다. pass-env 값이 child argv에 있으면 실행 전 거부한다.
- sync timeout, detached readiness/timeout/stop에서 cleanup true와 child dead를 함께
  검증한다. 실패하면 result/metadata에 cleanup detail과
  `childAliveAfterCleanup`을 남기고 `cleanup-failed`/public exit 125로 fail-closed한다.
  public stop도 두 조건을 다시 확인해야 exit 0을 반환한다.
- detached finalization을 단일 Promise로 직렬화해 log close와 metadata/result atomic
  write가 끝나기 전 monitor loop가 결과를 읽지 않는다. Windows atomic update는
  기존 target을 exact-path remove 후 temp file rename으로 처리한다.
- worker tests는 metadata creation/readiness/running을 별도 deadline으로 진단하고,
  모든 failure `finally`가 worker뿐 아니라 known child PID도 exact cleanup 후 dead를
  assert한다. large stdout/stderr natural-exit, cleanup failure 3경로, concurrent run
  격리와 secret marker 부재를 포함한다.
- 첫 WSL→wscript spawn에 `shell:false`, `stdio:'ignore'`, `windowsHide:true`를
  명시했다. `dev:wsl`은 hidden start, runId별 isolated profile, CDP port와
  `http://localhost:9222/json/version` readiness timeout을 project recipe로 지정한다.

검증 evidence:

- [WSL] final parser/static tests 11/11 통과, Node syntax checks 통과,
  skill `quick_validate.py` 통과, scoped Prettier check와 `git diff --check` 통과.
- [Windows-runner] worker integration outer run
  `20260812164437894-403033-bc01581a52165eee`가 child PID 17576, exit 0으로 종료했고
  8/8 통과했다: sync exact contract, timeout exact tree, injected cleanup failure,
  named secret consume/request deletion/redaction, wrong owner rejection, detached
  readiness/timeout/stop cleanup fail-closed, 512KiB stdout+stderr flush, concurrent
  isolation을 검증했다.
- [Windows-runner] public E2E inner run
  `20260812164613430-403437-62b61b49f10a2f71`은 worker PID 132120/child PID 22280으로
  시작했다. detached output의 WSL metadata path를 그대로 stop에 전달해
  `status=stopped`, `cleanup.stopped=true`, `childAliveAfterCleanup=false`를 받았고,
  별도 public PID probe가 child dead를 확인했다. request는 consume되어 없고 secret
  marker는 metadata/result/stdout/stderr/public output 어디에도 남지 않았다. evidence는
  `.tmp/windows-runner-public-evidence/public-e2e-Rg5uKc/`에 보존했다.
- 최초 corrected worker 실행 `20260812164201031-402616-9f785c51ba159bc4`는 WSH
  JScript가 trailing call comma를 거부해 worker child 생성 전에 종료됐다. error
  호출을 구형 JScript 호환 형태로 교정하고 static guard를 추가했다. 다음 run
  `20260812164303828-402831-dfceca9eb0d55cea`은 6/8이었으며 실패 `finally` exact
  cleanup 후, Windows metadata replace와 cleanup finalization race를 교정해 위 final
  8/8을 얻었다.

Round 2/3 상태:

- harness correction candidate와 제한된 runner-only evidence까지 완료했다.
- project MS5 tests/full suite/build/Electron은 이번 correction 뒤 실행하지 않았고,
  fresh 분리 test/review 통과를 주장하지 않는다.

### Round 3 fresh review — `반려`

반려 사유:

- detached가 readiness 단계에서 `cleanup-failed`로 끝나면 public entrypoint가
  structured result를 전달하지 않고 일반 예외/exit 1로 축약할 수 있다.
- worker가 직접 소유한 target root가 자연 종료하면 이미 분리된 descendant를
  이후 exact tree cleanup으로 회수할 수 없다. 초기 metadata write 실패도 spawn된
  child를 정리하지 않는 경로가 있다.
- named pass-env 값은 argv/artifact에서는 숨겨지지만 target stdout/stderr가 그 값을
  출력하면 log 및 sync relay에 그대로 남는다. chunk 경계에서 분할 출력된 값도
  누출되지 않는 stream-level redaction이 필요하다.

Round 3 correction 결정과 관찰 가능한 DoD:

- [WSL/Windows-runner] detached startup/readiness 중 cleanup 검증 실패는 public
  output에 `status=cleanup-failed`, cleanup detail,
  `childAliveAfterCleanup`을 구조화해 남기고 정확히 exit 125로 끝난다. public E2E가
  injected cleanup false 경로를 직접 검증한다.
- [Windows-runner] generic PowerShell/C# supervisor가 target을
  `CREATE_SUSPENDED`로 생성하고 `KILL_ON_JOB_CLOSE` Job에 assign한 뒤에만 resume한다.
  worker는 supervisor PID를 exact root로 소유한다. target root 자연 종료, stop,
  timeout 또는 supervisor 종료 시 Job close가 모든 descendant를 회수한다. 이
  race-free 할당을 no-dependency 도구로 구현할 수 없으면 optimistic fallback 없이
  설계 장벽으로 중단한다.
- [Windows-runner] sync·detached fixture에서 target root가 held grandchild를 만든 뒤
  자연 종료해도 grandchild가 남지 않는다. 초기 metadata write failure도 spawned
  supervisor/target tree를 exact cleanup하고 child dead를 검증한다.
- [WSL/Windows-runner] worker는 named pass-env의 exact UTF-8 byte 값을 stdout/stderr
  양쪽에서 cross-chunk-safe하게 `<redacted>`로 교체한 뒤에만 log와 public sync
  relay에 노출한다. split-chunk fixture는 raw marker가 request/metadata/result/log/
  public output 어디에도 없고 replacement가 있음을 검증한다. 변형·인코딩된 값은
  검출할 수 없으므로 child가 secret을 출력하지 않는 원칙을 유지한다.
- 검증은 WSL syntax/static/skill quick validation 뒤 public runner를 통한 runner
  unit/integration만 수행한다. MS5 product source/test, full suite/build/Electron은
  변경하거나 실행하지 않는다.

Round 3 correction 구현:

- generic PowerShell/C# supervisor는 target을 `CREATE_SUSPENDED |
CREATE_NO_WINDOW`로 생성하고 kill-on-close Job에 assign한 뒤에만 resume한다.
  supervisor는 worker owner handle과 target handle을 함께 기다리며 worker가 먼저
  사라져도 Job을 닫는다. worker가 소유·정리하는 root PID는 supervisor이고 실제
  target PID도 metadata/result에 별도로 남긴다.
- supervisor stdin/stdout/stderr는 shell interpolation 없이 inherited pipe로 연결한다.
  worker가 named pass-env의 exact UTF-8 byte 값을 stdout/stderr 독립 transform에서
  chunk 경계까지 보존해 `<redacted>`로 교체한 뒤 log를 쓴다. sync public relay는
  이미 redacted된 log만 읽는다. 변형·인코딩·opaque binary 표현은 보장하지 않는다.
- initial detached metadata write가 실패하면 이미 spawn된 supervisor tree를 exact
  cleanup하고 output close와 child-death 검증 뒤 structured result를 남긴다. 자연
  target exit와 explicit stop 모두 Job close 뒤 descendant pipe EOF까지 기다린다.
- detached startup/stop의 cleanup false는 public entry가 structured result를 stdout에
  내고 exit 125를 반환한다. integration 전용 named injection은 실제 exact cleanup을
  먼저 수행하되 검증 결과만 false로 바꿔 orphan 없이 public contract를 시험하도록
  격리했다.
- fixture/test는 split secret stdout/stderr, root-exit held grandchild, metadata write
  failure, public cleanup-failed 125를 추가했다. 자연 종료 회귀는 15초 test-local
  timeout과 failure `finally` exact grandchild cleanup을 둬 outer runner timeout보다
  먼저 진단한다.

Round 3 제한 검증 evidence:

- [WSL] parser/static 12/12, 관련 JS/CJS syntax, skill `quick_validate.py`, scoped
  Prettier와 `git diff --check`가 통과했다. static은 exact UTF-8 cross-chunk redaction,
  `CREATE_SUSPENDED → AssignProcessToJobObject → ResumeThread`, hidden flags와 genericity를
  포함한다.
- 첫 Windows integration run
  `20260812172113655-419373-59c5a319645dd809`은 supervisor PID 86172/target PID
  124748에서 synchronous pipe handle을 async `FileStream`으로 연 오류로 exit 1했다.
  Job-assigned target은 supervisor `finally`에서 종료됐다. pipe copy를 synchronous
  handle용 task로 교정했다.
- 다음 run `20260812172209618-419747-e3e752bd2cb7f6fe`은 supervisor PID
  131204/target PID 104304였다. fixture `orphan-exit`가 grandchild handle을
  `unref()`하지 않아 자연 종료하지 못했고 outer 240초 timeout에 도달했다. public
  runner가 graceful code 128 뒤 force code 0으로 exact tree를 정리했고
  `cleanup.stopped=true`, `childAliveAfterCleanup=false`를 기록했다. fixture를
  independent held grandchild로 교정하고 local timeout을 추가했다.
- 승인된 단일 integration 재시도
  `20260812172843890-423408-f7a4fc346763364d`는 supervisor PID 102056/target PID
  116796, exit 0, 13/13 통과했다. sync split-secret redaction, sync/detached 자연 root
  exit descendant 회수, detached stop descendant 회수, timeout/cleanup-false,
  metadata-write failure, large-log finalization과 concurrent isolation을 포함한다.
- public cleanup-failed exit-125 및 public split-secret E2E test 코드는 추가했지만,
  owner가 허용한 단일 integration 재시도를 소진해 Round 3에서는 실행하지 않았다.
  따라서 public E2E 동작 통과를 주장하지 않으며 fresh review 전 잔여 gate로 남긴다.
- 이번 Round 3에서는 MS5 product source/test, full suite/build/Electron을 변경하거나
  실행하지 않았다. commit/stage도 수행하지 않았다.

### Round 4 fresh review — `반려`

반려 사유:

- public cleanup-failed E2E가 detached startup/readiness 실패가 아니라 정상 기동 뒤
  `stop`에서만 exit 125를 확인해 `waitForDetachedMetadata()` 자체의 structured
  failure 계약을 검증하지 않는다.
- detached target이 held grandchild를 만든 뒤 자연 종료할 때 supervisor Job close가
  descendant를 회수하더라도 final metadata/result에 cleanup 검증이 없다. public
  `stop`은 `status=exited` metadata만 보고 exit 0을 반환해 cleanup 증거 없이 성공을
  주장할 수 있다.

Round 4 correction 결정과 관찰 가능한 DoD:

- [Windows-runner] safe named test injection을 readiness timeout에 적용한다. 실제 exact
  cleanup은 수행하되 검증 결과만 false로 만들어 `waitForDetachedMetadata()`가
  structured `cleanup-failed` result와 cleanup/child-alive detail을 출력하고 정확히
  exit 125를 반환하는 public E2E를 둔다.
- [Windows-runner] detached natural target exit는 supervisor close 시점에 Job close가
  완료됐고 supervisor/target PID가 모두 dead인지 result/metadata에 기록한다. 하나라도
  확인할 수 없으면 `cleanup-failed`로 fail-closed한다.
- [Windows-runner] public `stop`의 `status=exited` 경로는 matching finalized result의
  `status=exited`, `cleanup.stopped=true`, supervisor dead, target dead를 모두 확인할
  때만 exit 0을 반환한다. 자연 종료 fixture의 held grandchild PID도 public probe로
  dead임을 확인한다.
- 검증은 WSL syntax/static/skill validation 뒤 public runner의 public E2E test만
  실행한다. product gates/full build/Electron은 실행하지 않는다.

Round 4 correction 및 검증 evidence:

- detached supervisor 자연 종료 시 worker는 Job close 뒤 supervisor/target PID가 모두
  dead인지 확인해 `cleanup.mechanism=job-close`, `cleanup.stopped`,
  `childAliveAfterCleanup`, `targetAliveAfterCleanup`을 result/metadata에 남긴다. 어느
  PID라도 살아 있으면 `cleanup-failed`로 fail-closed한다.
- public `stop`의 `status=exited` 경로는 bounded하게 finalized result를 기다린 뒤
  matching run ID, exited status, cleanup true, supervisor/target dead를 모두 확인할
  때만 exit 0을 반환한다. stopped 경로도 target-dead 조건을 함께 요구한다.
- readiness public E2E는 존재하지 않는 ready file과 safe named injection을 사용한다.
  실제 exact cleanup은 먼저 성공시키고 verification flag만 false로 바꿔
  `waitForDetachedMetadata()`가 cleanup detail을 포함한 JSON과 exit 125를 반환하게
  하며 orphan을 만들지 않는다.
- [WSL] 관련 JS/CJS syntax, parser/static 12/12, skill `quick_validate.py`, Prettier와
  `git diff --check`가 통과했다.
- public test 파일을 outer Windows target으로 한 번 더 감싼 잘못된 호출 run
  `20260812174333711-430998-c6d1838044787007`은 supervisor PID 122156/target PID
  116368에서 내부 public entry가 WSL mount Windows Node를 찾지 못해 4개 테스트가
  child 기동 전에 exit 1했다. outer Job close result는 cleanup true,
  supervisor/target dead를 기록했다. 테스트 드라이버는 WSL pure Node로, 각 Windows
  동작은 public runner로만 진입해야 한다는 호출 경계를 바로잡았다.
- 교정된 public E2E는 4/4, exit 0으로 통과했다. copy-paste detached stop run
  `20260812174406857-431309-9fa22c06053788e0`은 worker PID 124140/supervisor PID
  108760, cleanup true/child dead였다. split-secret public relay/log도 통과했다.
- readiness cleanup-failure run
  `20260812174416643-431383-41864e39bd01e97f`은 worker PID 68936/supervisor PID
  54956/target PID 128372에서 startup 성공 전에 structured
  `status=cleanup-failed`, cleanup detail, supervisor/target dead를 출력하고 정확히
  exit 125를 반환했다.
- natural-exit run `20260812174428317-431488-07b5716bd6ddf4a0`은 worker PID
  109768/supervisor PID 101944/target PID 124108/held grandchild PID 43972였다.
  finalized metadata/result는 `status=exited`, `cleanup.stopped=true`, supervisor/
  target dead를 기록했고 public `stop`은 이를 검증해 exit 0을 반환했다. 별도 public
  PID probe가 worker/supervisor/target/grandchild 네 PID 모두 dead임을 확인했다.
- 이번 Round 4에서도 product gates/full build/Electron은 실행하지 않았고 product
  source를 변경하지 않았다. commit/stage도 수행하지 않았다.

### Round 5 fresh review — `반려`

반려 사유:

- cleanup false에서 supervisor가 죽었지만 target/descendant pipe가 살아 있으면
  redactor `outputDone`을 무기한 기다려 structured exit 125 자체가 나오지 않을 수
  있다. sync cleanup failure도 JSON detail 대신 stderr 요약만 낸다.
- `dev:wsl`이 고정 CDP port의 `/json/version`만 readiness로 사용해 기존 프로세스의
  응답을 새 Electron 기동 성공으로 오인할 수 있다. readiness는 새 Job descendant와
  그 run이 소유한 unique port의 정확한 renderer target을 함께 증명해야 한다.
- detached finalization이 terminal metadata를 result보다 먼저 쓰고 atomic replace가
  기존 metadata 삭제 gap을 만든다. public stop은 transient missing/partial JSON 및
  metadata/result identity mismatch를 충분히 fail-closed하지 않는다.
- fast-exit supervisor가 start handshake 전에 close되면 terminal handler가 target PID
  미확정 상태를 성공 종료로 finalize할 수 있다. stopped/exited 성공 결과도 metadata의
  supervisor/target identity와 일치하는지 검증하지 않는다.

Round 5 correction 결정과 관찰 가능한 DoD:

- [Windows-runner] cleanup false이며 supervisor 또는 target이 살아 있으면 bounded
  output drain 뒤 stdout/stderr/redactor를 force-close하고 sanitized structured
  `cleanup-failed`를 result에 남긴다. sync public output도 동일 JSON과 exit 125를
  반환하며 어떤 stream도 무기한 기다리지 않는다.
- [Windows-runner] supervisor start handshake가 target PID를 확정하기 전 close/error는
  terminal finalize를 하지 않는다. handshake 실패는 exact supervisor cleanup 뒤
  fail-closed한다. delay 없는 immediate-exit fixture가 정상 exited cleanup result를
  만든다.
- [WSL/Windows-runner] detached는 finalized result를 먼저 atomic replace하고 terminal
  metadata를 마지막에 쓴다. public stop은 transient missing/JSON parse를 bounded retry하고
  matching result를 기다린다. stopped/exited success는 run ID, supervisor PID, target PID
  identity 일치, cleanup true, 양 PID dead를 모두 요구한다.
- [Windows-runner] project `scripts/qa/hidden-electron-launch.cjs`가 unique available
  Windows port를 선택·검증하고 Vite를 자신의 Job descendant로 spawn한다. hidden flag,
  run별 isolated profile, selected port를 전달한 뒤 own child alive와 해당 port
  `/json/list`의 exact renderer target을 모두 확인해야 per-run ready file을 쓴다.
  기존 포트 false-positive와 child early-exit 테스트를 둔다. generic runner는 ready-file만
  사용하고 project URL/port/recipe는 `scripts/qa`, package와 AGENTS에만 둔다.
- 검증은 WSL syntax/static/skill validation 뒤 public runner를 통한 worker/public/project
  QA launcher targeted tests만 수행한다. product full gates/build/Electron은 fresh review 전
  실행하지 않는다.

Round 5 correction 구현:

- cleanup 종료 뒤 output drain은 500ms로 제한했다. supervisor 또는 target liveness가
  남거나 pipe가 닫히지 않으면 child stdout/stderr를 unpipe/destroy하고 redactor와 log를
  bounded 종료해 `outputDone`을 무기한 기다리지 않는다. sync public entry는 sanitized
  structured `cleanup-failed` JSON을 출력하고 정확히 exit 125를 반환한다.
- supervisor의 close/error는 target start handshake 전에는 terminal 후보만 기록한다.
  target PID가 확인된 뒤에만 자연 종료를 finalize하고, handshake 실패는 supervisor
  exact cleanup 뒤 fail-closed한다. delay 없는 `immediate-exit` fixture를 추가했다.
- detached finalization은 result를 먼저 쓰고 terminal metadata를 마지막에 쓴다. atomic
  replace는 우선 delete 없는 rename을 사용하고 Windows replace 제한 때만 compatibility
  fallback을 사용한다. public entry는 transient missing/partial JSON을 bounded retry하며,
  result/metadata의 run ID, worker PID, supervisor PID, target PID와 cleanup/dead 상태가
  모두 일치해야 stopped/exited 성공을 반환한다.
- project 전용 `scripts/qa/hidden-electron-launch.cjs`는 매 run에 사용 가능한 loopback
  port를 예약·선택하고 Vite/Electron child에 hidden flag, 격리 profile, 선택 port를
  전달한다. own child alive와 그 port의 `/json/list` exact renderer target을 함께 확인한
  뒤에만 per-run ready file을 쓴다. generic runner/skill에는 project URL, port, npm script를
  넣지 않았다. `dev:wsl`은 이 launcher와 ready-file contract를 사용한다.
- fixture/test는 target-alive pipe hang, immediate exit, result-before-metadata, transient
  metadata gap/partial JSON, stopped/exited identity mismatch, sync structured 125, 기존 port
  false-positive와 child early exit를 추가했다.

Round 5 제한 검증 evidence:

- [WSL] 관련 JS/CJS syntax, runner static 13/13, skill `quick_validate.py`, scoped Prettier와
  `git diff --check`가 통과했다.
- target-alive pipe hang test를 처음 추가한 Windows worker run
  `20260812180528107-440830-0a5af5079e367292`은 supervisor PID 121172/target PID
  112500/worker PID 30964에서 abandoned stream promise의
  `ERR_STREAM_PREMATURE_CLOSE` rejection으로 14/15, exit 1이었다. 해당 promise에 explicit
  rejection sink를 두고 exact Job cleanup true, supervisor/target dead를 유지했다.
- 교정한 Windows worker integration run
  `20260812180647032-441559-b6fb4abe03729f17`은 worker PID 6276/supervisor PID
  120504/target PID 130736, 15/15, exit 0이었다. final result는
  `cleanup.mechanism=job-close`, `cleanup.stopped=true`, supervisor/target dead를 기록했다.
- public E2E 첫 시도는 sync child relay 뒤 structured JSON을 단일 stdout JSON으로
  parse해 5/6이었다. trailing structured JSON parser로 실제 public contract에 맞춘 뒤
  6/6, exit 0으로 통과했다. copy-stop run
  `20260812180806292-442263-7aa7d2efe24ae7e8`은 worker PID 129116/supervisor PID
  132464/target PID 38540, cleanup true였다. startup readiness cleanup-failed run
  `20260812180822325-442463-06d99658e60ab113`은 worker PID 85424/supervisor PID
  125256/target PID 123588, structured exit 125를 확인했다. sync cleanup-failed run
  `20260812180815972-442420-fff43538046131d9`도 structured exit 125를 확인했다.
- natural-exit identity/probe run
  `20260812180831285-442529-45645541cd0d656f`은 worker PID 103676/supervisor PID
  129432/target PID 78692/held grandchild PID 88380이었다. cleanup true와 identity 일치를
  확인했고 별도 public probes가 네 PID 모두 dead임을 확인했다. stopped/exited identity
  mismatch는 exit 125 후 원본 result를 복구했으며 transient metadata missing/partial JSON
  stop도 bounded retry로 통과했다.
- project QA launcher targeted run
  `20260812180853050-442734-dd30bd06739d76a0`은 worker PID 126148/supervisor PID
  119744/target PID 127236, 4/4, exit 0, cleanup true였다. package recipe, pre-existing port
  false-positive 거부, child early-exit 거부, unique port exact-target readiness를 검증했다.
  실제 Electron은 기동하지 않았고 Node HTTP fixture만 사용했다.
- 모든 Windows 동작은 public runner로만 진입했고 direct Windows interop은 0회였다. 위
  결과와 public PID probes 기준 owned live PID는 0이다. 이번 Round 5에서는 MS5 product
  source/test, full suite/build/Electron을 변경하거나 실행하지 않았고 commit/stage도 하지
  않았다. fresh separated review 전 candidate evidence로만 기록한다.

### Round 6 fresh review — `반려`

반려 사유:

- public `stop`의 running 분기에서 stopped result가 먼저 보이면 terminal metadata와 같은
  finalization인지 증명하기 전에 성공 또는 기존 running metadata 기반 판정을 할 수 있다.
  result-first는 기록 순서일 뿐 성공 증거가 아니며, terminal metadata 누락·쓰기 실패는
  bounded nonzero로 끝나야 한다.
- supervisor start handshake 실패의 cleanup detail이 문자열 error로 축약된다. cleanup
  검증도 실패하면 sync/detached public contract가 structured `cleanup-failed`와 정확한
  exit 125를 반환해야 한다.
- project hidden Electron launcher가 port reservation을 child spawn 전에 닫고 own child
  alive와 renderer URL을 독립 확인해, reservation 직후 다른 responder가 같은 base target을
  제공하면 그 endpoint를 own renderer로 오인할 수 있다.

Round 6 correction 결정과 관찰 가능한 DoD:

- [WSL/Windows-runner] worker가 detached finalization마다 collision-safe
  `finalizationId`를 생성해 result와 마지막 terminal metadata에 함께 기록한다. public
  stopped/exited 성공은 finalizationId, run ID, worker/supervisor/target identity,
  cleanup true와 dead 상태가 모두 일치할 때만 가능하다.
- [Windows-runner] running metadata에서 finalized result를 먼저 관찰해도 matching terminal
  metadata를 bounded하게 기다린다. result→terminal gap은 기다린 뒤 성공하고, terminal
  metadata write failure/gap 만료는 result만으로 성공하지 않고 nonzero를 반환한다.
- [Windows-runner] supervisor start handshake error는 cleanup, supervisor/target PID,
  post-cleanup liveness를 담은 typed error다. cleanup true/dead면 spawn-error를 유지하고,
  cleanup false면 worker result와 public sync/detached output이 structured
  `cleanup-failed`, exit 125로 fail-closed한다.
- public E2E는 result→terminal gap, terminal metadata write failure, sync/detached handshake
  cleanup-false를 직접 검증하고 각 owned PID가 dead임을 확인한다. WSL syntax/static 뒤
  runner worker/public tests만 실행하며 product gates/full build/Electron은 실행하지 않는다.
- [Windows-runner] project launcher는 non-secret `ELECTRON_QA_RUN_ID`를 owned child에
  전달한다. Main은 dev URL이며 `ELECTRON_START_HIDDEN=true`인 QA에만 기존 query를 보존해
  `codexQaRun=<runId>`를 추가한다. readiness는 base URL이 아니라 자기 marker를 포함한 exact
  target만 인정한다. base target, 다른 run marker는 own child가 살아 있어도 실패하고 exact
  own marker만 성공한다. 일반 dev/prod renderer URL은 변경하지 않는다.

Round 6 correction 구현:

- detached terminal finalization마다 128-bit random `finalizationId`를 생성해 result에 먼저,
  terminal metadata에 마지막으로 기록한다. public stopped/exited success는 같은
  finalizationId와 run/worker/supervisor/target identity, cleanup true, supervisor/target dead가
  모두 맞아야 한다. running metadata에서 result를 먼저 봐도 matching terminal metadata를
  bounded wait하고 result만으로는 성공하지 않는다.
- worker test injection으로 result→terminal gap과 terminal metadata write failure를 분리했다.
  metadata write가 실패하면 result에 sanitized `terminalMetadataError`를 보강하지만 running
  metadata를 성공 증거로 승격하지 않는다. public stop은 gap 뒤 matching metadata가 오면
  성공하고 끝내 오지 않으면 exact exit 125로 fail-closed한다.
- `SupervisorStartError`가 spawn/handshake 원인과 exact cleanup, supervisor/target PID,
  post-cleanup liveness를 함께 운반한다. cleanup 검증 실패는 sync/detached worker 양쪽에서
  `cleanup-failed` result로 보존되어 public entry가 structured detail과 exit 125를 반환한다.
- project hidden launcher는 child env에 `ELECTRON_QA_RUN_ID`를 전달하고 base renderer target에
  자기 `codexQaRun` marker를 붙인 exact CDP target만 ready로 인정한다. Main은 dev URL,
  hidden=true, nonempty QA run ID 세 조건에서만 기존 query에 marker를 추가하며 그 외 dev/prod
  URL 문자열은 그대로 load한다. base target과 다른 run marker는 own child alive 상태에서도
  거부하고 exact-own marker만 수락한다.

Round 6 제한 검증 evidence:

- [WSL] 관련 JS/CJS syntax, runner static 13/13, scoped Prettier와 `git diff --check`가
  통과했다.
- public runner를 통한 worker integration run
  `20260812183339728-446933-308706563764f9c1`은 worker PID 125100/supervisor PID
  57364/target PID 125408, 16/16, exit 0이었다. handshake cleanup-false typed detail,
  finalizationId result/metadata 결합을 포함했고 outer cleanup true, supervisor/target dead였다.
- public E2E 첫 전체 run은 기존 7개와 새 handshake sync/detached exit-125가 통과했지만,
  새 finalization gap/write-failure 두 테스트의 stop deadline을 detached owner의 3초 cleanup
  grace보다 짧게 잡아 7/9였다. 산출물은 두 owned tree 모두 cleanup true/dead를 기록했다.
  stop deadline을 owner cleanup 이후 terminal evidence wait까지 포함하도록 10초로 교정했고
  두 테스트 targeted retry가 2/2, exit 0으로 통과했다.
- result→terminal gap run `20260812183711535-448474-6ccf299bf3b645f1`은 worker PID
  121940/supervisor PID 128228/target PID 46044, finalizationId
  `780c8d9f38285e8b68cde6831d6024ce`, cleanup true/dead였다. public stop은 result-first 동안
  running metadata를 관찰한 뒤 같은 terminal finalization을 기다려 성공했다.
- terminal metadata failure run `20260812183719319-448591-477b06ed93fc16ad`은 worker PID
  18576/supervisor PID 54896/target PID 38724, cleanup true/dead와 structured
  `terminalMetadataError`를 남겼으며 public stop은 result만으로 성공하지 않고 exit 125였다.
- handshake cleanup-false sync run `20260812183605013-447792-4ad6fc8b9887589b`과 detached
  run `20260812183615798-447867-5907f452105b38e0`은 각각 worker/supervisor/target PID
  75060/131288/56580, 128820/17492/16468이었다. 실제 exact cleanup은 성공해 양 PID dead였고
  injected verification false가 structured cleanup-failed와 exact exit 125로 보존됐다.
- Main의 non-QA dev URL 문자열 보존까지 반영한 최종 project QA marker targeted run
  `20260812183905247-449397-e880234fddfede2a`은 worker PID 128352/supervisor PID
  94628/target PID 125248, 6/6, exit 0, outer cleanup true/dead였다.
  기존 port reservation 거부, child early exit, unmarked base, 다른 run marker 거부와 exact-own
  marker 성공을 검증했다. 실제 Electron은 기동하지 않고 Node HTTP fixture만 사용했다.
- 모든 Windows 동작은 public runner로만 진입했고 direct Windows interop은 0회였다. 결과와
  public PID probe 기준 owned live PID는 0이다. product full gates/build/실제 Electron,
  commit/stage는 수행하지 않았으며 fresh separated review 전 candidate evidence다.

### Runner test collection integration review — `반려`

반려 사유:

- generic runner의 Node `node:test` harness 세 파일과 project QA launcher harness 한 파일이
  `*.test.cjs` 이름을 사용해 표준 Vitest collection에 함께 잡힌다. Node 전용 harness가
  Vitest worker 안에서 public Windows runner와 process fixture를 기동해 product test gate의
  소유권과 종료 조건을 오염시킬 수 있다.

Correction 결정과 관찰 가능한 DoD:

- [WSL] runner static/worker/public 및 project QA launcher harness 네 파일을
  `*.node-test.cjs`로 rename한다. broad Vitest exclude는 추가하지 않으며 product test 파일과
  Vitest config는 변경하지 않는다.
- [WSL] skill과 repository 내 모든 직접 참조는 새 파일명으로 갱신한다. public runner는
  Windows integration에서 이 파일을 여전히 explicit Node argv로 실행할 수 있다.
- [WSL] rename 뒤 old `*.test.cjs` 참조와 Node harness가 표준 `*.test.*` 패턴에 남아 있지
  않음을 확인하고, 새 경로의 syntax/static, skill validation, Prettier, `git diff --check`를
  실행한다. Windows/product gate는 separated tester가 다시 수행하므로 여기서는 실행하지
  않는다.

Correction 및 제한 검증 evidence:

- generic runner harness를 `run-hidden-windows.node-test.cjs`,
  `run-hidden-windows-worker.node-test.cjs`,
  `run-hidden-windows-public.node-test.cjs`로, project QA harness를
  `scripts/qa/hidden-electron-launch.node-test.cjs`로 rename했다. Node `node:test` 코드와
  public runner argv 계약은 변경하지 않았다.
- skill의 WSL static 명령은 새 `run-hidden-windows.node-test.cjs` 경로를 사용한다.
  AGENTS, package scripts와 다른 repository scripts/tests에는 네 old harness filename의
  직접 참조가 없어 추가 동작 변경이 필요하지 않았다. broad Vitest exclude와 Vitest config는
  추가·수정하지 않았다.
- [WSL] 새 네 파일의 `node --check`, renamed static harness 13/13, skill
  `quick_validate.py`, scoped Prettier와 `git diff --check`가 통과했다. repository scope에서
  old 네 `*.test.cjs` 파일명/참조가 0이고 Node harness 네 파일이 표준 Vitest-style 이름과
  일치하지 않음을 확인했다.
- 이 integration correction에서는 Windows/public runner, product tests/build, 실제 Electron을
  실행하지 않았다. product runtime code, commit/stage도 변경하거나 수행하지 않았다.

### Project QA profile isolation review — `반려`

반려 사유:

- project hidden Electron launcher의 기본 `ELECTRON_QA_USER_DATA_DIR`가 Vite cwd 아래
  `.tmp/electron/profile-<runId>`를 사용한다. Vite file watching/build input 경계와 QA browser
  state가 같은 repository tree에 있어 launcher가 생성한 profile 변동이 dev runtime을 교란할
  수 있고, ready evidence만으로 어느 run이 어느 profile을 소유하는지도 명시적이지 않다.

Correction 결정과 관찰 가능한 DoD:

- [Windows-runner] 기본 QA profile은 Windows `os.tmpdir()` 아래 project 전용 root와 run ID로
  생성한다. launcher는 최종 profile이 absolute이고 Vite cwd 바깥인지 spawn 전에 fail-closed
  검증한다.
- [Windows-runner] optional `--profile-path`는 `{runId}` 치환을 지원하되 absolute outside-cwd
  경로만 허용한다. relative 또는 cwd 내부 경로는 child를 기동하지 않고 실패한다.
- [Windows-runner] ready JSON은 `profilePath`, `runId`, exact renderer ownership marker를 함께
  기록한다. default outside-cwd, explicit outside 경로, invalid relative/inside 경로와 ready
  ownership을 project launcher Node harness로 검증한다.
- package `dev:wsl`에는 repository profile 경로/env를 넣지 않고 launcher default를 사용한다.
  AGENTS에는 project temp root와 ownership evidence만 기록한다. generic runner/skill, MS5/product
  runtime은 변경하지 않는다.

Correction 구현 및 제한 검증 evidence:

- project launcher 기본 profile을
  `%TEMP%\poe2-unofficial-launcher-codex-qa\<runId>`로 옮겼다. optional
  `--profile-path`는 `{runId}`를 치환하며, 최종 경로가 absolute가 아니거나 Vite cwd와 같거나
  그 아래이면 port reservation/child spawn 전에 실패한다.
- ready JSON은 absolute `profilePath`, `runId`, `{ name: "codexQaRun", value: runId }`
  ownership marker와 그 marker가 포함된 exact renderer target을 함께 기록한다. child env의
  `ELECTRON_QA_USER_DATA_DIR`와 ready evidence가 같은 validated profile을 가리킨다.
- package `dev:wsl`은 repository profile path나 `ELECTRON_QA_USER_DATA_DIR`를 직접 지정하지
  않고 project launcher default를 사용한다. AGENTS에 Windows temp root와 ready ownership
  evidence를 기록했다. generic runner/skill과 MS5/product runtime은 변경하지 않았다.
- [WSL] launcher/harness syntax, package recipe static contract, scoped Prettier와
  `git diff --check`가 통과했다.
- public runner를 통한 project launcher targeted run
  `20260812190430601-459556-ab6bbfd3afec7edb`은 worker PID 38784/supervisor PID
  22856/target PID 113348, 8/8, exit 0이었다. default outside-cwd Windows temp profile,
  explicit absolute outside profile, relative/inside-cwd 거부, ready profile/run marker ownership,
  기존 unique port/exact target 조건을 검증했다. outer Job cleanup true이며 supervisor/target은
  모두 dead였다.
- direct Windows interop은 0회이고 확인된 owned live PID는 0이다. full product gates/build,
  실제 Electron, commit/stage는 수행하지 않았다.

### Public ready-file run ID expansion review — `반려`

반려 사유:

- public runner가 stdout/stderr/metadata path와 literal/path env에는 `{runId}`를 치환하지만,
  `--ready-file` readiness path와 child argv에는 raw placeholder를 남긴다. package `dev:wsl`은
  같은 ready-file template을 public option과 project launcher child argument에 함께 사용하므로
  worker와 child가 서로 다른 literal path를 관찰하거나 WSL→Windows path 변환 전에 placeholder가
  고정될 수 있다.

Correction 결정과 관찰 가능한 DoD:

- [WSL] `buildRequest`에서 한 run ID로 child argv, literal/path env, ready URL/file을 중앙 치환한다.
  `--ready-file`은 치환 후 absolute WSL path로 resolve하고 그 결과를 Windows readiness path로
  변환한다. child argv/env에는 같은 run ID가 들어간다.
- [WSL] static contract는 placeholder ready-file, child argv와 env에 `{runId}`가 남지 않고
  readiness와 child 경로가 같은 run artifact를 가리키는지 검증한다.
- [Windows-runner] public detached E2E는 placeholder ready-file을 option과 child argv 양쪽에
  전달한다. child가 치환된 동일 파일을 쓰면 runner가 ready를 반환하고, public stop이 exact
  cleanup/dead를 확인한다.
- generic runner만 외과적으로 수정하며 product/MS5/project launcher 동작, full gates/build,
  실제 Electron은 변경하거나 실행하지 않는다.

Correction 구현 및 제한 검증 evidence:

- public `buildRequest`가 단일 `expandRunId` 경계에서 child argv, cwd, literal/path env,
  ready URL/file을 치환한다. secret-in-argv 검증도 expanded argv를 대상으로 수행한다.
  ready-file은 치환 후 WSL absolute path로 resolve한 다음 Windows path로 변환하고, child argv는
  같은 run ID가 치환된 값을 받는다.
- [WSL] 관련 syntax, scoped Prettier, `git diff --check`와 static harness 14/14가 통과했다.
  static은 request JSON 전체에 raw `{runId}`가 남지 않고 readiness Windows path, child relative
  argv와 literal/path env가 같은 generated run ID를 사용하는지 확인한다.
- targeted public E2E run `20260812192041707-464668-c64bbccff11e9748`은 worker PID
  127316/supervisor PID 105112/target PID 112420이었다. detached option과 child argv 양쪽에
  `ready-{runId}.json`을 전달했고 child가 쓴 expanded file로 worker readiness가 성공했다.
  이어 public stop이 `status=stopped`, cleanup true, supervisor/target dead를 확인했으며
  finalizationId는 `eecde6239dd3b1fec3d455d36daa50f2`였다. targeted E2E는 1/1, exit 0이다.
- direct Windows interop은 0회이고 public PID probes/result 기준 owned live PID는 0이다.
  product/MS5/project launcher, full gates/build, 실제 Electron, commit/stage는 변경하거나
  수행하지 않았다.

### MS5 / MS5-H 최종 candidate 종합 evidence

리뷰 상태:

- Round 6 이전의 stale fork-none review 결과는 이후 correction을 반영하지 못한 이력으로
  supersede한다. Round 7 separated review와 후속 외과적 correction 뒤 lightweight review는
  blocking 지적 없이 통과했다. 이 판정은 자동화 candidate에 한정하며 아래 `[사용자]` DoD를
  대신하지 않는다.

Fresh gate evidence:

- 최종 Node harness rename/update 직전 fresh runner gate는 static 13/13, worker 16/16,
  public 9/9, project launcher 6/6으로 통과했다. 이후 profile isolation correction은 project
  launcher 8/8, ready-file `{runId}` correction은 static 14/14와 public E2E 1/1로 각각 다시
  닫았다.
- final full product gates는 public hidden runner로만 실행했다. Vitest run
  `20260812185702143-456616-9a910a4a42136b0d`가 65 files / 402 tests, ESLint run
  `20260812185741340-456870-5d45c3fe4e0fd694`, TypeScript run
  `20260812185818341-457061-9bcf24765c678cc0`, Vite build run
  `20260812185825446-456869-f917c2f53316da5e`가 모두 exit 0이었다. 각 runner 결과는 exact
  owned cleanup true와 supervisor/target dead를 기록했다. electron-builder packaging은 이
  Vite build evidence에 포함하지 않는다.

Hidden native Electron QA evidence:

- owner run `20260812191234983-462680-50e830187cf52d9d`의 exact CDP target
  `http://localhost:54321/?codexQaRun=20260812191234983-462680-50e830187cf52d9d`에서 실제
  Electron main/preload/renderer를 검사했다. fatal renderer text 없이 launcher main 화면과
  두 게임의 경로 진단 modal이 열렸다.
- main screenshot:
  `/mnt/d/project_poe2/POE2-unofficial-launcher/.tmp/ms5-electron-final/main-20260812191234983.png`
- POE1 modal screenshot:
  `/mnt/d/project_poe2/POE2-unofficial-launcher/.tmp/ms5-electron-final/modal-20260812191234983.png`
- POE2 modal screenshot:
  `/mnt/d/project_poe2/POE2-unofficial-launcher/.tmp/ms5-electron-final/modal-poe2-20260812191234983.png`
- warning 확인 screenshot:
  `/mnt/d/project_poe2/POE2-unofficial-launcher/.tmp/ms5-electron-final/modal-poe2-warning-check.png`
- POE1/POE2 modal은 각각 canonical `HKCU:\Software\Kakaogames\POE` / `POE2` key missing을
  표시하면서 legacy `HKCU:\Software\DaumGames\POE` / `POE2`의 유효 경로를 fallback으로
  선택했다. config 경로와 선택 경로가 일치했고 register action도 노출됐다. mutation 안전을
  위해 register/delete/sync action은 누르지 않아 이 QA의 HKCU mutation은 0이다.
- 이 환경에는 유효한 DaumGames fallback이 있었으므로 registry warning은 의도대로 나타나지
  않았다. 따라서 canonical/legacy 둘 다 absent/invalid/unknown일 때의 native warning,
  `install_check_blocked`의 `경로 확인` 버튼, register write/read-back은 자동 native QA 공백으로
  남는다.

Final `dev:wsl` smoke evidence:

- run `20260812192326357-465455-ca3e8061296037e6`은 ready-file을 약 6.2초 안에 만들었다.
  worker PID 120904, supervisor PID 100608, project hidden launcher PID 67124, Vite child PID
  51288였고 unique port 59463의 exact own-run renderer target만 ready로 인정했다.
- visibility monitor는 전체 sentinel 구간에서 49 samples, max gap 64ms였으며
  visible/foreground/focus ownership count가 모두 0이었다. hidden console host PID는
  informational로만 관찰했고 visible/focus window는 없었다. CDP와 launcher logs에는 fatal
  runtime event가 없었다.
- stop 결과는 cleanup true, supervisor/target dead였다. run에서 관찰한 13개 owned PID가 모두
  dead임을 post-stop probe로 확인했고, Windows temp의 isolated QA profile도 제거됐다. QA는
  registry mutation action을 호출하지 않아 HKCU mutation 0이었다.

Candidate DoD 결론:

- MS5와 MS5-H의 자동화·hidden Windows candidate DoD는 위 fresh gates, separated/lightweight
  review, native modal 및 lifecycle smoke 기준으로 통과했다. work 문서는 아직 archive하지 않고
  commit/stage도 하지 않는다.
- 남은 `[사용자]` DoD는 (1) 실제 사용자 상태에서 설정 경로는 유효하지만 canonical/legacy
  registry가 모두 absent/invalid/unknown일 때 warning과 exact modal click, `경로 확인` 버튼을
  확인하고, 안전한 대상에서 register 후 read-back을 확인하는 것, (2) 30분 이상 장기 미사용 뒤
  show/focus가 현재 context만 reconcile하며 TTL 미만에서는 skip되는 것을 확인하는 것이다.
  이 두 항목 전에는 사용자 DoD 또는 전체 기능 완료를 주장하지 않는다.

## 2026-08-22 PR candidate closeout

- 제품 변경과 WSL→Windows 숨김 실행 하네스 변경을 각각 독립 커밋으로 분리해
  `origin/master` 위에 재배치하고 PR로 상신한다.
- 위키 raw 노트와 `/ingest`는 실행하지 않았다. 이 저장소에서 `/ingest`는
  `.claude/commands/ingest.md`가 정의하는 승인형 Claude command이며, 먼저 영향 페이지를
  제시하고 owner 승인을 받아야 한다. 현재 위키 worktree에는 대상
  `wiki/projects/poe2-launcher.md`를 포함한 기존 사용자 수정이 있어 이 closeout에서 해당
  페이지와 raw를 수정하거나 커밋하지 않았다.
- 자동화 candidate와 분리 리뷰는 통과했지만 아래 사용자 DoD는 여전히 미완료다.
  1. 실제 `Kakaogames` 단독 설치 또는 두 registry 후보 모두 비정상인 안전한 HKCU에서
     후보 우선순위, warning, 진단 modal, canonical 등록과 read-back을 확인한다.
  2. 30분 이상 장기 미사용 뒤 show/focus가 현재 context만 재검사하고 TTL 미만에서는
     생략하는지 확인한다.
- 위 두 항목 전에는 사용자 DoD 또는 전체 기능 완료를 주장하지 않는다. 따라서 이 문서는
  `docs/work/`에 유지하고 미완료 사용자 검증을 PR 검증 경계로 추적한다.

## MS6 — 수동 경로 다중 적용과 후보별 관리

### 범위, 이전 결정과 변경 금지 경계

- 진단 본문은 기존의 좌측 registry / 우측 launcher config 2열을 유지한다. MS6는
  선택한 한 경로를 어느 저장 대상으로 적용할지 명시하게 할 뿐, 두 진단 열을 합치거나
  launcher config를 registry의 하위 정보로 바꾸지 않는다.
- 이전의 `DaumGames` 키 생성 금지 결정은 2026-08-27 사용자 요구로 **MS6 범위에서만
  명시적으로 supersede**한다. 사용자가 `registry-compatibility`를 선택했을 때
  `InstallPath` 생성 및 조건부 overwrite를 허용한다. 선택하지 않은 호환 키에는 쓰지
  않으며, 이 변경은 다른 마일스톤의 자동 등록 정책을 소급 변경하지 않는다.
- persistent `AppConfig` schema, EventBus, 의존성, updater/release flow, Kakao DOM
  selector는 변경하지 않는다. `gameInstallPaths`의 이미 존재하는 nested 값만 immutable
  update로 쓴다. `GameInstallStatusReconciler`의 소스도 수정하지 않는다.
- `origin/master` 재배치는 완료되었다. old `a8fece1`은 new `975262b`로, old `990a668`은
  new `e83258d`로 각각 patch-id가 동일하게 재배치되었고 remote는 아직 갱신하지 않았다.
- 열린 owner 결정: 없음.

### 대안 비교와 채택안

| 접근                                   | 내용                                                                                             | 판정                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| A. renderer chain                      | renderer가 picker 결과 뒤 registry/config IPC를 순서대로 호출                                    | renderer lifecycle·재로딩·중복 클릭이 mutation 순서와 retry 상태를 소유하므로 배제                     |
| B. stateless batch                     | 매 batch IPC가 diagnostics를 다시 읽고 전달된 대상 목록을 즉시 처리                              | 이전 성공 대상과 확인 당시 snapshot을 안정적으로 묶지 못해 partial retry와 TOCTOU 설명이 약하므로 배제 |
| C. main-owned opaque selection session | Main이 picker 이후 선택 세션·allowlist·snapshot·완료 대상을 소유하고 renderer는 opaque ID만 제출 | 채택. 권한, lifecycle, 순서, retry 경계를 Main 한 곳에 둔다                                            |

### Main 소유권, opaque 선택 세션과 IPC 계약

- 새 focused main runtime owner로 `GameInstallPathSelectionService`를 둔다. 세션은
  `selectionId`, owner `webContents`, `serviceId`/`gameId`, 검증된 path, 예상 target
  snapshot, completed target ID 집합, lazy TTL을 가진다. 새 selection 생성, renderer
  destroy, TTL 만료 시 즉시 폐기한다. 세션은 persistent state가 아니며 AppConfig에
  저장하지 않는다.
- renderer가 Main에 보내는 mutation 식별자는 `selectionId`와 allowlisted target ID뿐이다.
  raw registry path·value는 diagnostics 화면 표시용이며 mutation authority가 아니다.
  Main은 세션의 owner `webContents` 및 `serviceId`/`gameId`를 검사한 뒤 target ID를
  현재 세션 snapshot으로 다시 해석한다.
- target ID는 `registry-primary`, 후보가 있을 때만 `registry-compatibility`, `config`다.
  candidate diagnostics에는 readonly `targetId`를 추가한다. GGG는
  `registry-primary`와 `config`만 노출하며 compatibility target을 만들지 않는다.
- native folder picker의 `defaultPath`는 registry candidate 순서로 실존 directory를
  먼저 찾고, 없으면 config path를 사용한다. 어느 후보도 실존 directory가 아니면
  `defaultPath`를 생략한다. picker는 path 검증과 selection session 생성만 수행하며
  picker 성공만으로 config를 즉시 저장하지 않는다.
- selection batch 결과는 target별 `applied` / `unchanged` / `failed`와 fresh
  diagnostics를 반환한다. completed target은 retry allowlist에서 제외하고, failed target만
  fresh diagnostics를 보여준 뒤 다시 선택할 수 있다.

### 다중 적용 UI와 접근성

- picker 성공 뒤 nested selection dialog를 열고 primary registry와 config checkbox는
  기본 checked, compatibility checkbox는 기본 unchecked로 둔다. CTA는 `선택 (n개)`이며
  0개이면 disabled다. service, game, path는 readonly로 표시한다.
- 각 registry candidate의 삭제 버튼은 해당 candidate `path`가 `null`이면 disabled다.
  삭제 요청은 `targetId`와 `expectedPath`만 받아 allowlist에서 재해석하고,
  `Remove-ItemProperty`만 실행해 값만 제거한다. key container는 유지한다.
- outer 진단 dialog에는 최소 `role="dialog"`/`aria-modal="true"`/접근 가능한 이름을
  보강한다. nested dialog는 native `fieldset`/`checkbox`/`button`, `role="dialog"`,
  `aria-modal`, title 연결, initial focus, focus trap, Escape close, opener focus restore,
  `aria-live` 결과 알림을 갖춘다.
- 1024x683, 1440x960, 1920x1080과 Windows 100/125/150%에서 body scroll, header/footer,
  긴 path wrapping, hit target, outer/nested overlay를 확인한다.

### batch mutation, ordering과 실패 처리

- batch 시작 시 선택 path를 fresh verify한 뒤, 모든 미완료 target의 현재 상태와
  expected snapshot을 preflight한다. mutation 순서는 `registry-primary` →
  `registry-compatibility` → `config`의 직렬 순서다.
- 각 registry write는 expected state/path atomic recheck 후 조건부 write하고 read-back한다.
  config는 immutable nested update와 expected snapshot compare를 통과했을 때만 쓴다.
  preflight 또는 target mutation 실패는 다른 미완료 target의 결과를 숨기지 않고 target별로
  기록한다.
- rollback은 하지 않는다. 부분 성공은 보존하고 failed target만 재시도한다. 하나 이상의
  target이 success이면 기존 `runManualGameInstallPathAction`의 `ok=true` 경로로
  reconciliation을 정확히 1회 실행한다. `GameInstallStatusReconciler`는 호출 대상일
  뿐 소스 변경 대상이 아니다.

### MS6.1 — target identity + registry atomic mutation

**TDD RED → GREEN 구현 파일**

- RED: `src/main/tests/registry-install-status.test.ts`에 Kakao primary/compatibility 및
  GGG allowlist, `targetId` readonly diagnostics, selected compatibility 생성·조건부
  overwrite, stale expected state/path 거부, read-back, candidate별 값 삭제와 key container
  유지, partial target 결과를 먼저 고정한다.
- GREEN: `src/shared/types.ts`에 target ID·readonly diagnostic·batch target/result 계약을
  추가하고, `src/main/utils/registry.ts`에 allowlist 해석, atomic recheck/write/read-back,
  immutable config snapshot compare에 필요한 mutation primitive를 구현한다. AppConfig
  type/metadata/default는 수정하지 않는다.

**DoD**

- [Windows-pwsh] `src/main/tests/registry-install-status.test.ts`의 RED case가 primary,
  선택 compatibility, GGG 단일 primary, stale snapshot, read-back, `Remove-ItemProperty`
  value-only 삭제를 fixture/격리된 registry profile에서 모두 GREEN으로 판정한다.
- [Windows-pwsh] 테스트 fixture 외 실제 사용자 HKCU를 읽거나 쓰지 않았음을 실행
  환경과 mock/isolated profile 경로로 확인한다.

#### MS6.1 구현 및 분리 리뷰 기록

- TDD/검증 경과: 최초 RED 18건을 추가한 뒤 targeted 77/77, candidate target-ID
  delete correction RED 11건을 거쳐 88/88, quality correction에서 drive-root RED 2건과
  partial config RED 4건을 거쳐 최종 targeted 92/92를 통과했다.
- 최종 회귀 검증은 65 files / 435 tests가 모두 통과했고, `tsc`, `lint`, `prettier`,
  `git diff --check`도 통과했다. PowerShell은 mock으로만 실행했으며 실제 사용자 HKCU
  접근·변경은 0건이다.
- 변경 API/파일 요약:
  - `src/shared/types.ts`: `GameInstallPathTargetId`, registry target ID, target snapshot,
    apply status/failure/result, registry delete request/failure/result 계약과 candidate
    diagnostic의 readonly `targetId`를 추가했다.
  - `src/main/utils/registry.ts`: `resolveGameInstallPathTarget`,
    `collectGameInstallPathTargetSnapshots`, `applyGameInstallPathTarget`,
    `deleteGameInstallPathRegistryTarget`를 추가하고 target allowlist, GGG compatibility
    거부, atomic expected-state/path recheck와 read-back, value-only delete, immutable config
    snapshot compare/write를 구현했다.
  - `src/main/tests/registry-install-status.test.ts`: 위 target/API와 PowerShell
    quoting·marker·exit/read-back, drive-root, partial config 회귀 계약을 고정했다.
  - `src/renderer/components/modals/GamePathDiagnosticModal.test.tsx`: 기존 candidate
    fixture에 readonly `targetId` 1줄을 보강해 shared contract 변경을 반영했다.
- Review Round 1:
  - 명세 리뷰는 candidate target-ID delete 누락으로 `반려`되었고, correction 후
    재검토에서 `통과`했다.
  - 품질·안전성 리뷰는 drive root 훼손과 partial persisted config shape 처리 문제로
    `반려`되었고, 각각 root-aware normalization과 complete-shape immutable 처리로
    correction한 뒤 재검토에서 `통과`했다.
- 비차단 관찰: PowerShell command 중복과 사용자 경로가 로그에 포함될 수 있는 privacy
  문제는 MS6.1 blocking이 아니며, 이번 범위 밖의 향후 개선 사항으로만 남긴다.

### MS6.2 — picker + selection service + batch IPC

**TDD RED → GREEN 구현 파일**

- RED: 새 `src/main/tests/GameInstallPathSelectionService.test.ts`에 owner webContents
  격리, 새 selection 교체 폐기, renderer destroy 폐기, lazy TTL 만료, target allowlist,
  completed target retry 제외, registry 우선의 existing-directory `defaultPath`/생략을
  고정한다. `src/main/tests/game-install-path-register-ipc-contract.test.ts`에는 opaque
  selection batch IPC가 raw registry path/value를 받지 않고 한 success batch마다
  reconciliation을 정확히 한 번 요청하는 계약을 고정한다.
- GREEN: 새 `src/main/game/GameInstallPathSelectionService.ts`가 session lifecycle과 batch
  orchestration을 소유한다. `src/main/main.ts`, `src/main/preload.ts`,
  `src/shared/types.ts`에 picker/session/batch IPC를 연결하고, 기존 picker의 즉시
  `setGameInstallPath` 경로를 selection 생성으로 교체한다. 기존
  `runManualGameInstallPathAction`은 batch 결과 중 하나 이상 success일 때만 정확히 한 번
  감싼다.

**DoD**

- [Windows-pwsh] 새 service test가 session owner mismatch, destroy, TTL, 새 selection,
  completed target 재제출과 GGG compatibility 미생성을 모두 거부하고, valid path만
  session으로 만들며 config를 picker 단계에서 쓰지 않음을 GREEN으로 판정한다.
- [Windows-pwsh] IPC contract test가 `selectionId`와 target ID 이외의 registry mutation
  authority를 허용하지 않고, successful target이 하나 이상인 batch의 reconciliation
  호출 수를 1로 판정한다.

#### MS6.2 구현 및 분리 리뷰 기록

- TDD/검증 경과: initial RED를 확인한 뒤 service focused 21건, IPC focused 26건,
  related 118건, full 460건과 build gate를 통과했다.
- 명세 Review Round 1은 selection ID collision, async invalidation, coherent preflight,
  TTL, source-string IPC contract 5건으로 `반려`되었다. correction 후 focused 136건과
  full 478건을 통과했다.
- 명세 재리뷰는 retired selection ID reuse 1건으로 다시 `반려`되었다. issued ID
  tombstone correction 후 service 32건과 full 480건을 통과했고, 명세 재검토에서
  `통과`했다.
- 품질·안전성 리뷰는 same-selection concurrent apply와 retryable/disabled final snapshot
  모순 2건으로 `반려`되었다. session in-flight lock과 단일 final eligibility correction 후
  focused 44건, related 143건, full 485건과 최종 build gate를 통과했고, 분리 품질
  재검토에서 `통과`했다.
- 최종 runtime 계약:
  - `GameInstallPathSelectionService`가 owner generation, owner별 issued selection ID,
    lazy TTL, completed target과 coherent preflight/final snapshot을 소유한다.
  - apply는 첫 await 전에 session 단위 in-flight lock을 획득하고 final diagnostics refresh까지
    유지하며, identity-checked `finally`로 해제한다. 동시 replay는 typed
    `selection-busy`로 거부한다.
  - `GameInstallPathIpcHandlers`는 production DI와 동일한 service/context/manual-action
    경계를 사용한다. renderer mutation request는 opaque `selectionId`와 allowlisted target
    ID만 받으며 raw registry path/value/context를 authority로 사용하지 않는다.
  - 새 `pickGameInstallPathTargets`/`applyGameInstallPathTargets` batch API를 연결하면서 기존
    `pickGameInstallPath` legacy picker barrier API는 호환 경계로 유지한다.
- 변경 파일:
  - `src/main/game/GameInstallPathSelectionService.ts`,
    `src/main/game/GameInstallPathIpcHandlers.ts`
  - `src/main/tests/GameInstallPathSelectionService.test.ts`,
    `src/main/tests/GameInstallPathIpcHandlers.test.ts`
  - `src/shared/types.ts`, `src/main/main.ts`, `src/main/preload.ts`
  - `src/main/utils/registry.ts`, `src/main/tests/registry-install-status.test.ts`,
    `src/main/tests/game-install-path-register-ipc-contract.test.ts`
- 검증 중 실제 사용자 HKCU 접근·변경과 Electron 실행은 각각 0건이다.
- 비차단 관찰: live owner의 issued selection ID tombstone은 selection 생성 횟수에 따라
  선형 증가한다. 또한 기존 Vite 500 kB chunk warning은 유지되며 둘 다 MS6.2
  correctness blocking은 아니다.

### MS6.3 — renderer modal + candidate delete + partial retry/accessibility

**TDD RED → GREEN 구현 파일**

- RED: `src/renderer/components/modals/GamePathDiagnosticModal.test.tsx`에 기본 checked
  primary/config, 기본 unchecked compatibility, `선택 (n개)`와 0 disabled, GGG의
  compatibility 부재, null path 삭제 disabled, failed-only retry, target별 결과와
  fresh diagnostics, nested dialog focus/Escape/restore/aria-live를 고정한다.
  `src/renderer/utils/game-path-modal-state.test.ts`에는 selection 결과가 기존 좌/우
  diagnostic state를 유지하는 reducer/state 전이를 고정한다.
- GREEN: `src/renderer/App.tsx`가 picker selection과 batch/partial retry 결과를 state로
  연결하고, `src/renderer/components/modals/GamePathDiagnosticModal.tsx`와
  `src/renderer/components/modals/GamePathDiagnosticModal.css`가 nested selection UI,
  candidate별 delete, accessibility, 긴 path wrapping과 overlay layering을 구현한다.
  `src/shared/types.ts`의 readonly result만 표시하고 raw registry identity를 다시 전송하지
  않는다.

**DoD**

- [Windows-pwsh] renderer tests가 checkbox default/disabled CTA, GGG 제한, candidate null
  delete guard, partial success 후 failed-only retry, aria role/name/live/focus 계약을
  모두 GREEN으로 판정한다.
- [Windows-pwsh] fixture/isolated profile에서 primary 성공·compatibility 실패처럼 부분
  성공을 재현했을 때 성공 target이 retry UI에 다시 나타나지 않고 registry/config 두 열이
  모두 fresh diagnostics를 표시함을 확인한다.

#### MS6.3 구현 기록 (분리 리뷰 전)

- TDD RED는 renderer modal/state와 IPC 계약 4개 파일에서 새 동작 부재 13건을 확인했다.
  초기 GREEN 35/35 이후 failed-only retry가 이전 성공 결과를 보존하는 상태 전이와 후보
  삭제 확인 dialog의 focus/Escape/restore를 별도 RED로 추가해 최종 GREEN으로 고정했다.
- renderer는 legacy 즉시 저장 picker 대신 `pickGameInstallPathTargets`를 사용한다. Main이
  반환한 기본값으로 primary/config를 checked, compatibility를 unchecked로 표시하고,
  `선택 (n개)`의 0개 disabled, readonly service/game/path, target별 결과와 Main이 반환한
  `retryableTargetIds`만 제출하는 재시도를 구현했다. 재시도 결과는 같은 selection의 이전
  성공 결과와 target ID별로 병합해 부분 성공 표시를 보존한다.
- registry 후보 행마다 target별 삭제 버튼과 exact candidate/path 확인 dialog를 추가했다.
  renderer→preload 삭제 authority는 `targetId + expectedPath`로 제한했고, Main의
  `deleteGameInstallPathRegistryTarget` primitive를 `runManualGameInstallPathAction`으로 한 번
  감싸 fresh diagnostics를 반환한다. 기존 raw registry clear bridge는 제거했고 config clear는
  전용 channel로 좁혔다.
- outer 2열 진단 layout은 유지했다. outer/apply/delete 및 기존 nested confirm dialog에
  dialog semantics를 보강하고, nested initial focus, focus trap, busy 중 Escape/backdrop 차단,
  opener focus restore, native checkbox fieldset/legend/label, aria-live 결과를 연결했다. modal
  body scroll, scale-aware max size, long path wrapping, reduced-motion CSS를 추가했다.
- 최종 검증은 focused 4 files / 36 tests, full 67 files / 498 tests, `tsc`,
  `npm run build:check`, `npm run lint`, touched-file Prettier check, `git diff --check`가 모두
  통과했다. 기존 Vite 500 kB chunk warning 외 새 warning/error는 없다.
- 검증 중 Electron 실행, 실제 사용자 HKCU 접근·변경, branch/commit/push/PR 변경은 각각
  0건이다. Windows hidden visual QA와 실제 HKCU/native picker 확인은 MS6.4 및 `[사용자]`
  DoD로 남긴다.

#### MS6.3 분리 리뷰 Round 1 교정 기록

- 명세·품질 리뷰는 같은 context close/reopen과 selection 교체를 구분하지 못하는 async
  identity, Main candidate delete 중복 실행, session-level retry 실패 시 누적 성공 표시 소실,
  result/delete 전환 focus, nested modality/오류 알림, raw conflict mutation bridge를 blocking으로
  판정해 `반려`했다.
- 교정 RED는 focused 5 files / 146 tests에서 18 failed, 128 passed로 고정했다. canary는 modal
  generation과 selection ID, synchronous duplicate re-entry, 네 session failure variant의 누적
  결과, delete coalescing invocation count, targetId 기반 conflict 대상 파생, nested inert/alert와
  focus 전환·복원을 각각 재현했다.
- renderer는 modal generation과 exclusive per-operation token을 사용한다. picker/apply/delete,
  config clear, conflict, register 및 modal diagnostics 완료는 current generation과 request token을
  통과해야 state를 갱신하고, apply는 요청 당시 selection ID까지 일치해야 결과를 병합한다.
  transport에 diagnostics/selection이 없는 failure는 이전 target 결과만 표시 상태에 보존하며
  fresh diagnostics나 retry ID를 만들지 않는다.
- Main candidate delete는 owner webContents/context/target 단위 in-flight Promise를 공유하고
  `finally`에서 제거한다. 동시 동일 요청은 mutation, manual-action reconciliation, final diagnostics를
  각각 한 번만 실행하며 완료 뒤 새 요청은 정상 실행된다.
- conflict mutation 요청은 `targetId + expectedPath + expectedConfigPath`로 축소했다. Main은
  service/game allowlist에서 registry path/value name을 다시 파생하고 expected path를 조건부 mutation
  안에서 재검증한다. renderer/preload conflict 요청에는 raw registry path/value name이 없다.
- nested dialog가 열리면 outer background만 `inert`/`aria-hidden`으로 차단하고 outer의
  `aria-modal`을 제거한다. apply/delete IPC 예외는 활성 nested dialog의 `role=alert`로 표시하고,
  result 전환은 retry 또는 닫기로 focus를 옮긴다. 삭제로 opener가 disabled되면 candidate heading,
  다음 action, outer dialog 순으로 복원한다. decorative glyph, overscroll containment, 40 px candidate
  delete target도 함께 고정했다.
- 최종 GREEN은 focused 5 files / 146 tests, full 67 files / 515 tests이며 `npx tsc --noEmit`,
  `npm run build:check`, `npm run lint`, touched-source Prettier check, `git diff --check`가 모두 exit 0이다.
  기존 Vite 500 kB chunk warning 외 새 warning/error는 없다.
- 이 교정에서 Electron 실행, 실제 HKCU 접근·변경, command approval 요청, branch/commit/push/PR 및
  기타 외부 상태 변경은 각각 0건이다. full-viewport outer overlay/titlebar 문제는 별도 fix로 유지했고
  Windows DPI/scale 실동작 증거는 생성하거나 주장하지 않았다.

#### MS6.3 독립 재검토 판정

- 현 오케스트레이터의 mock 기반 표적 재검토는 6 files / 182 tests GREEN으로 `통과`했다.
- 비차단 잔여 위험: 동일 owner/context/target에 서로 다른 `expectedPath` 요청을 동시에 보내면
  delete coalescing이 첫 Promise 결과를 공유할 수 있다. 정상 renderer의 단일 작업 잠금 경로에서는
  이 조합이 발생하지 않으며, Main의 atomic `expectedPath` 검증을 우회하지도 않는다.

### MS6.4 — Windows regression / hidden Electron QA + 사용자 DoD

**검증 파일과 변경 분리**

- 제품 regression의 정확한 대상은 `src/main/tests/registry-install-status.test.ts`,
  `src/main/tests/GameInstallPathSelectionService.test.ts`,
  `src/main/tests/game-install-path-register-ipc-contract.test.ts`,
  `src/renderer/components/modals/GamePathDiagnosticModal.test.tsx`,
  `src/renderer/utils/game-path-modal-state.test.ts`다.
- hidden Electron QA는 기존 `scripts/qa/hidden-electron-launch.cjs`와
  `scripts/qa/cdp-capture.cjs`를 사용하고 isolated temporary profile만 사용한다. 이
  harness를 고쳐야 하는 경우 그 변경은 제품 변경과 분리한 별도 `internal` 커밋으로
  기록한다.

#### MS6.4-A — HKCU 비접근 hidden fixture 진입점

- activation owner는 Main bootstrap이다. `app.isPackaged=false`, Vite dev server,
  `ELECTRON_START_HIDDEN=true`, safe run ID, run ID와 일치하는 `*-codex-qa/<runId>` 절대
  `ELECTRON_QA_USER_DATA_DIR`, allowlisted `ELECTRON_QA_GAME_PATH_FIXTURE`가 모두 맞을 때만
  전용 fixture window를 만든다. 하나라도 다르면 기존 normal startup을 그대로 수행한다.
- active fixture branch는 `app.whenReady` 첫머리에서 1024x683 hidden frameless window를
  만들고 즉시 return한다. 따라서 UAC registry check, `syncInstallLocation`,
  `syncAutoLaunch`, normal `createWindow`, install-status reconciliation과 core service init에
  진입하지 않는다. 창은 기존 preload/background/title-bar chrome과 run-owned
  `codexQaRun` marker를 사용하고, same Vite origin의 allowlisted fixture URL 외 navigation과
  새 창을 거부한다.
- renderer query allowlist는 `diagnostic`, `selection`, `partial`, `delete` 네 mode와 valid
  `codexQaRun`만 허용한다. fixture는 typed static diagnostics/selection/result를 실제
  `GamePathDiagnosticModal`에 전달하며 Electron product API를 호출하지 않는다.
- 기존 hidden launcher는 수정하지 않는다. 후속 실행은 renderer target에 allowlisted
  `codexQaFixture`를 먼저 넣고 launcher가 동일 run의 `codexQaRun` ownership marker를 붙이는
  기존 exact-target 계약을 유지한다.
- 이번 A 단계는 source/jsdom targeted test만 수행하며 Electron, 실제 사용자 HKCU,
  capture와 full suite는 실행하지 않는다.
- TDD RED는 fixture 진입점/renderer module 부재로 2 suites가 실패했고, 기존 hidden
  launcher exact-target 호환 URL 순서 canary는 13 tests 중 1건이 의도대로 실패했다. 최종
  targeted GREEN은 2 files / 26 tests이며 `npx tsc --noEmit`, `npm run lint`, touched-file
  Prettier check와 `git diff --check`가 모두 통과했다.
- 검증 중 Electron, 실제 HKCU read/write, capture, full suite, branch/commit/stage/push/PR 및
  외부 상태 변경은 각각 0건이다.

#### MS6.4-B — internal CDP capture harness

##### Review correction evidence (2026-08-27)

- 고정 `--app-scale: 0.711` fixture 값은 제거했다. QA fixture는 mount 및 `resize`마다
  App과 동일한 `min(innerWidth / 1440, innerHeight / 960)` 값을
  `documentElement`에 설정하고, unmount 시 기존 값과 priority를 복구한다. renderer
  canary는 수정 전 14건 중 1건 실패로 1024x683 scale 불일치를 확인했고, 수정 후
  1024x683 약 `0.711111`, 1440x960 `1`, 1920x1080 `1.125`와 cleanup 복구를 포함해
  14/14 통과했다.
- capture state/manifest assertion은 fixture가 계산한 `appScale`을 scenario 기대값과
  `0.0001` tolerance로 비교한다. document/body 및 modal body scroll containment,
  대표 long Windows path wrap/containment, checkbox option/delete/active CTA hit target,
  nested initial focus, nested overlay의 outer modal containment/coverage도 구조화된
  boolean evidence로 기록한다. Node canary는 수정 전 18건 중 2건 실패했고, 잘못된
  scale, overflow, nowrap, 작은 hit target, dialog 밖 focus, overlay overflow를 거부하는
  adversarial 검증을 포함해 수정 후 18/18 통과했다.
- `npm run lint`, capture CJS 두 파일의 직접 ESLint, touched Prettier 및
  `git diff --check`를 통과했다. 이 matrix는 CDP viewport/deviceScaleFactor simulation
  전용이며 실제 Windows OS DPI 통과 근거가 아니다. 이 correction에서 Electron,
  실제 HKCU, branch/commit/stage/push/PR은 실행하거나 변경하지 않았다.

##### Live QA layout-readiness correction (2026-08-27)

- hidden Electron live capture에서 첫 scenario가 `Page.loadEventFired` 직후 두 차례
  `Interactive hit target contract failed`로 종료됐지만, 같은
  `LAYOUT_STATE_EXPRESSION`을 즉시 다시 평가하면 통과했다. 관찰된 scale과 unscaled
  button/delete 크기는 각각 약 `0.711111`, `36px`, `40px`였으므로 assertion 기준이
  아니라 React/layout/font 안정화 이전 state read race로 판정했다.
- capture 순서는 `setViewport -> navigate -> waitForLayoutReady -> readState ->
screenshot`으로 고정했다. CDP readiness는 5초 내부 deadline과 기존 10초 command
  timeout 아래에서 `document.fonts.ready`, allowlisted fixture marker, App scale,
  viewport/DPR을 확인하고 두 번의 `requestAnimationFrame` 뒤 같은 조건을 다시
  확인한다. mismatch/timeout은 state read, screenshot, artifact write 전에 fail closed
  한다.
- TDD RED는 Node 22건 중 5건 실패(helper/validator 2, 순서 1, timeout/mismatch 2)였고,
  구현 후 22/22 통과했다. writer는 실행 중인 Electron/CDP target에 접근하거나
  종료하지 않았고 실제 HKCU 및 Git 외부 상태도 변경하지 않았다.

##### Live QA entry-animation correction (2026-08-27)

- readiness 적용 후 1920x1080/DPR 1.5 live capture에서 viewport/DPR과 App scale
  `1.125`는 정확했지만 delete와 primary rect가 각각 `43.2px`, `38.88px`로 측정됐다.
  unscaled 값 `38.4px`, `34.56px`는 목표 크기의 정확히 0.96배이며, modal의
  0.16/0.18초 entry CSS animation initial transform과 일치하므로 2 RAF만으로 animation
  완료를 보장하지 못한 race로 판정했다.
- readiness는 game-path modal overlay/modal/confirm overlay 및 그 내부 dialog subtree의
  실행 중인 Web Animation 중 `endTime <= 1000ms`이고 endTime/iterations가 유한한
  항목만 기다린다. 문서 전체 animation, Toast lifecycle, 장기 및 무한 animation은
  수집하지 않는다. allowlisted animation 완료 후 2 RAF와 marker/scale/viewport를 다시
  확인하며, animation cancellation/rejection은 `owned animation rejected`로 fail closed
  한다.
- animation await 순서 canary와 전역 dialog selector 배제 canary는 각각 수정 전 Node
  22건 중 1건 실패를 확인했고, 최종 22/22 통과했다. writer는 실행 중인
  Electron/CDP target에 접근하거나 종료하지 않았다.

##### Live QA scale-aware nested geometry correction (2026-08-27)

- live capture에서 diagnostic 3개 scenario와 selection 1024x683/1440x960은 통과했고,
  selection 1920x1080/DPR 1.5만 nested overlay edge의 고정 1px tolerance에서 실패했다.
  해당 scenario의 App scale `1.125`가 정확하고 overlay inset이 modal의 1 CSS px border
  안쪽이므로 물리 edge delta 약 `1.125px`는 제품 clipping이 아니라 scale된 border다.
- nested overlay containment와 edge coverage에만 `1 CSS px border + 0.25 CSS px bounded
subpixel tolerance`를 적용한다. 물리 containment allowance는 `appScale * 1.25`, edge
  delta는 `appScale`로 나눈 CSS px 값으로 판정한다. outer modal의 viewport clipping
  tolerance와 다른 geometry assertion은 변경하지 않았다.
- TDD RED는 23건 중 1건 실패로 1920x1080의 정상 1 CSS px inset을 재현했다. 수정 후
  정상 inset 통과, 1.35 CSS px gap 및 allowance 밖 clipping 거부를 포함해 Node 23/23
  통과했다. writer는 실행 중인 Electron/CDP target에 접근하거나 종료하지 않았다.

##### Live QA launcher-splash visual blocker correction (2026-08-27)

- 이전 hidden run은 DOM/manifest assertion 12개 scenario를 통과했지만, PNG 직접 검토에서
  모든 화면이 `#launcher-splash`의 `POE UNOFFICIAL LAUNCHER / PREPARING ASSETS`로
  덮여 있었다. 따라서 해당 run의 visual artifact는 무효이며 이후 증거로 supersede한다.
  오케스트레이터가 exact run-owned profile/tmp/visual copy를 Recycle Bin으로 정리하고
  Electron을 종료했다. writer가 이 cleanup이나 Electron 종료를 수행한 것은 아니다.
- allowlisted game-path fixture parse 결과가 있을 때 renderer는 `createRoot` 전에 정적
  `#launcher-splash`를 one-shot 제거한다. fixture 요청이 없으면 helper가 DOM을 변경하지
  않으므로 기존 normal `Root`/`App` splash lifecycle은 그대로 유지된다.
- capture state/manifest에는 `splashPresent`와 `splashVisible`을 포함하며 둘 다 반드시
  `false`여야 한다. renderer TDD RED는 15건 중 1건, Node TDD RED는 23건 중 3건
  실패였고 수정 후 각각 15/15, 23/23 통과했다. 최종 hidden Electron visual PASS는 아직
  실행하거나 주장하지 않는다.

##### Live QA compositor-activation correction (2026-08-27)

- hidden fixture BrowserWindow가 layout-ready에 도달한 뒤에도 scenario별 `Page.navigate`
  직후 compositor activation을 잃어 모든 `Page.captureScreenshot`이 timeout됐다. 같은
  CDP target에 수동 `Page.bringToFront`를 호출하면 screenshot capture가 즉시 복구됐다.
  그러나 첫 correction의 `navigate -> bringToFront -> waitForLayoutReady` placement는 live
  rerun에서도 screenshot timeout이 지속되어 충분하지 않았다. 앞선 수동 진단은
  `Page.captureScreenshot` 직전에 activation했을 때만 성공한 것으로 재확인됐다.
- 세 번째 live rerun은 같은 장기 CDP WebSocket에서 pre-screenshot
  `Page.bringToFront`를 호출한 두 번째 correction도 항상 timeout됨을 확인했다. 같은
  run에서 exact 동일 target에 새 WebSocket을 열고 `Page.bringToFront`와
  `Page.captureScreenshot`만 전송하면 즉시 61,546-byte PNG가 반환됐다. 따라서 문제는
  placement가 아니라 navigation을 수행한 장기 session의 capture 경로에 국한된다.
- 네 번째 live rerun에서는 fresh one-shot capture도 장기 observer WebSocket이 연결된 동안은
  timeout됐고, 실패한 harness가 종료되어 observer가 닫힌 뒤에만 수동 fresh capture가
  성공했다. 따라서 session 역할 분리만으로는 부족하며, 동일 target에 observer와 capture
  connection이 동시에 존재하는 것이 실제 차단 조건임을 관찰했다.
- 다섯 번째 live 진단은 동일 Node 프로세스에서 observer open/enable/close event를 완료하고
  추가 500ms를 기다린 뒤 새 WebSocket을 열어도 `Page.captureScreenshot`이 timeout됨을
  확인했다. 반면 별도 Node 프로세스는 같은 exact target에 연결해 `Runtime.evaluate` 없이도
  즉시 61,546-byte PNG를 반환했다. 따라서 connection 동시성뿐 아니라 observer를 소유했던
  Node 프로세스 자체가 남기는 상태가 capture 차단 조건이라는 process-level 증거가 됐다.
- 여섯 번째 live run은 capture child를 분리해도 CDP observer를 먼저 소유했던 부모 process가
  살아 있는 동안에는 child의 `Page.captureScreenshot`이 계속 timeout됨을 확인했다. 같은
  exact target의 수동 capture는 그 부모 process가 종료된 뒤에만 성공했다. 따라서 capture만
  child로 옮기는 구조도 충분하지 않으며, top-level orchestrator가 전체 수명 동안 CDP-free여야
  한다는 최종 process isolation 경계가 확정됐다.
- 일곱 번째 live run은 분리된 capture/validation worker 자체가 Runtime/Page/Log/Inspector를
  enable하고 readiness/state evaluate를 수행한 뒤 screenshot을 요청하면 timeout됨을 확인했다.
  같은 live target에서 별도 pure process가 1024x683 DPR1 metrics 적용,
  `Page.bringToFront`, `Page.captureScreenshot` 세 명령만 보내면 즉시 61,546-byte PNG가
  반환됐다. 따라서 process 분리뿐 아니라 screenshot process의 CDP command surface도 순수
  캡처 세 명령으로 제한해야 한다는 최종 causal proof가 됐다.
- 여덟 번째 live run은 screenshot timeout에는 진입하지 않았지만 navigation worker가 성공적인
  metrics/navigation/load 뒤 WebSocket close handshake의 `Observer WebSocket close failed`로
  즉시 실패했다. dedicated child-process 경계에서는 성공 payload 뒤 process exit가 CDP session을
  결정적으로 해제하므로 이 close 오류만 worker 실패로 승격하지 않는다. operation 실패는 그대로
  실패하며, operation과 close가 모두 실패하면 두 원인을 `AggregateError`로 보존한다. 이 정책은
  navigation/validation client helper에만 적용하며 pure screenshot의 세-command 및 close 계약은
  변경하지 않았다.
- 아홉 번째 live run에서 pure screenshot worker 단독 실행은 exit 0이었지만 validation worker 종료
  후 250ms만 기다린 실행은 다시 screenshot timeout이 발생했고, 동일 조건에서 1000ms를 기다린
  실행은 exit 0이었다. 부모는 validation payload와 assertion이 모두 성공한 뒤 scenario당 정확히
  한 번의 bounded 1000ms CDP worker-detach settle을 기다린 다음 pure screenshot worker를 시작한다.
  navigation 또는 validation 실패 시 settle과 screenshot은 모두 시작하지 않으며, pure worker의
  metrics/bring-to-front/capture 세-command 계약은 변경하지 않았다.
- 열 번째 live run에서는 1000ms detach settle 뒤에도 첫 pure screenshot worker가 간헐적으로
  `Timed out waiting for pure CDP command Page.captureScreenshot`으로 실패했다. 첫 worker가 10초
  command timeout 뒤 종료되면 그 시간이 추가 detach interval이 되고, harness 종료 뒤 수동 pure
  worker는 일관되게 성공했다. 부모는 첫 child가 정확히 이 내부 timeout 서명으로 nonzero 종료한
  경우에만 brand-new pure worker process를 한 번 재실행한다. 다른 nonzero, malformed PNG,
  ownership 또는 protocol 오류는 재시도하지 않는다. 두 번째 실패는 두 attempt 오류와
  scenario/target context를 `AggregateError`로 보존하며, retry가 성공하기 전에는 artifact를 쓰지
  않는다. 첫 시도 전 1000ms settle과 pure worker의 세-command 계약은 그대로 유지한다.
- 최종 harness의 부모는 WebSocket, `/json/list`, CDP command를 직접 사용하지 않는다. 각
  scenario마다 첫 navigation worker가 직전 exact run-owned target에 연결해 device metrics를
  적용하고 `Page.navigate`와 load 완료까지 기다린 뒤 완전히 종료한다. 두 번째 validation
  worker는 결과 target에 metrics를 재적용하고 기존 font/finite-animation readiness,
  state 및 Runtime/Page/Log error를 수집·검증한 bounded JSON payload만 반환한 뒤 종료한다.
  부모가 이 payload를 재검증한 후에만 세 번째 pure screenshot worker를 실행한다. pure worker는
  `/json/list` exact match와 WebSocket open 후 metrics, `Page.bringToFront`,
  `Page.captureScreenshot`만 수행하며 Runtime/Page/Log/Inspector enable과 evaluate를 절대
  호출하지 않는다. 부모는 bounded raw PNG를 검증한 뒤에만 screenshot과 manifest를 쓴다.
- Node canary는 수정 전 27건 중 7건 실패로 세 worker parser/runner, pure command surface와
  CDP-free matrix 경계를 확인했다. 최종 28/28은 12개 scenario의 worker 36회 생성과 무중첩
  nav→validation→screenshot 순서, 세 worker metrics 전달, pure 세-command exact contract,
  exact argv/env/ownership, nonzero/timeout/oversized/malformed/foreign cleanup 및
  navigation/validation/screenshot 실패 artifact 0건을 포함한다.
- 이 correction은 정적 harness 검증만 수행했다. 최종 hidden Electron capture와 visual
  PASS는 아직 재실행하거나 주장하지 않는다.

- 기존 `cdp-capture.cjs`와 `hidden-electron-launch.cjs`는 변경하지 않고,
  `scripts/qa/game-path-diagnostic-capture.cjs`와 전용 Node test만 추가한다. 입력은
  `CDP_PORT`, exact `CDP_TARGET_URL`, explicit absolute `GAME_PATH_QA_OUTPUT_DIR`만 읽는다.
- target URL은 `http://localhost:54321/`의 valid `codexQaRun` + allowlisted
  `codexQaFixture`만 허용한다. output은 `<runId>/game-path-diagnostic-capture` 소유 구조를
  강제하고, repository 내부라면 `.tmp/electron/<runId>/game-path-diagnostic-capture`만
  허용한다. 스크립트 안에는 cleanup/delete 동작을 두지 않는다.
- `diagnostic`, `selection`, `partial`, `delete`를 각각 1024x683@DPR1,
  1440x960@DPR1.25, 1920x1080@DPR1.5와 paired해 총 12 scenario를 exact owned URL로
  순회한다. 이 값은 `Emulation.setDeviceMetricsOverride`의 simulated viewport/DPR이며
  실제 Windows OS DPI 검증이 아니다.
- scenario마다 Runtime/Page/Log error 부재, fixture marker/dialog count, modal containment,
  header/footer visibility, 좌측 registry/우측 config 2열, selection CTA/defaults, partial
  failed-only retry, exact delete confirmation, nested inert/ARIA modality를 구조화 assertion으로
  판정한 뒤 PNG를 쓰고, 마지막에 simulation disclaimer와 scenario evidence를 포함한
  `manifest.json`을 기록한다.
- TDD RED는 capture module 부재로 Node suite가 실패했고, screenshot 단계 protocol error가
  다음 scenario로 늦게 귀속되는 canary는 18 tests 중 1건이 의도대로 실패했다. 최종 Node
  GREEN은 18/18이다. 실제 Electron/CDP capture는 이 writer 단계에서 실행하지 않았다.
- 최종 정적 회귀는 MS6.4-A targeted Vitest 2 files / 26 tests, `npm run lint`, 새 CJS 두
  파일의 direct ESLint, touched-file Prettier와 `git diff --check`가 모두 통과했다. actual
  HKCU, Electron, branch/commit/stage/push/PR 및 외부 상태 변경은 각각 0건이다.

##### Final hidden Electron run evidence (2026-08-27)

- 최종 hidden Electron run ID는 `ms64-20260827-234500-a6c8e2d4`이고 isolated profile은
  `C:\Users\nerdl\AppData\Local\Temp\poe2-unofficial-launcher-codex-qa\ms64-20260827-234500-a6c8e2d4`였다.
  capture는 exit 0으로 완료됐으며 `diagnostic`, `selection`, `partial`, `delete` 네 mode의
  12개 scenario에서 PNG 12개와 manifest 1개를 생성했다.
- manifest의 protocol error는 0건이고 모든 scenario assertion이 `true`였다. 확인 범위는
  splash absence, App scale, viewport/modal containment, wide viewport two-column layout,
  document/body/modal scroll containment, long path wrapping, 주요 hit target, nested
  modality/focus/overlay 및 mode-specific selection/partial/delete 계약을 포함한다.
- 1024 viewport의 네 mode와 1920 viewport의 `selection`/`partial` PNG를 직접 시각 검토했다.
  여섯 화면은 mode별 내용이 구분됐고 launcher splash, clipping 또는 잘린 주요 control이 없었다.
- 이 결과의 100/125/150 값은 CDP viewport/deviceScaleFactor simulation이다. 실제 Windows OS
  DPI 설정은 변경하거나 검증하지 않았으므로 actual OS DPI 통과 근거로 사용하지 않는다.
- 검증 종료 후 Electron launcher, child process와 CDP endpoint가 모두 종료됐음을 확인했다.
  exact run-owned profile, repository temp 및 ready marker만 Recycle Bin으로 이동했고, 기존의 더
  오래된 QA folder는 건드리지 않았다.
- 보존 증거는
  `C:\Users\nerdl\.codex\visualizations\2026\08\22\01a02845-0014-7ac0-90d0-aee29881b09b\ms6.4-game-path-diagnostic-ms64-20260827-234500-a6c8e2d4`에 있다.
  PNG 12개와 manifest 1개, 총 13개 파일의 이름과 크기가 원본 evidence와 일치했다.

**DoD**

- [Windows-pwsh] hidden Electron + isolated profile에서 1024x683, 1440x960, 1920x1080 및
  CDP simulated DPR 1/1.25/1.5의 outer/nested dialog를 12개 screenshot과 manifest로 판정했다.
  실제 사용자 HKCU 자동 QA는 수행하지 않았다.
- [사용자] native folder dialog가 registry candidate 우선의 실존 directory를
  `defaultPath`로 열고, 후보가 없으면 `defaultPath`를 생략하는지 확인한다.
- [사용자] 실제 사용자 HKCU에서 선택한 primary/compatibility/config 적용, target별
  read-back, 부분 실패 보존과 failed-only retry를 확인한다.
- [사용자] 실제 Windows OS DPI 100/125/150%에서 clipping, scroll, path wrapping, hit target,
  nested modality/focus/overlay를 확인한다.

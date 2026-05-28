# PR-9: ContractValidator + PoBVault 세대 관리 + UI 배너

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-8](PR-8.md) (빌드 코드 라운드트립)
> 후속 PR: [PR-10](PR-10.md) (Lua 데이터 점진 대체)

## 목표

PR-4 의 PoBVault 가 단순 1회 복사였다면, 본 PR 은 **PoB 업데이트 감지 → 백그라운드 smoke test → 통과 시에만 vault promote, 실패 시 직전 정상본 유지** 의 완전한 검증/롤백 시스템 구축.

D.2 결정의 핵심 — launcher 는 사용자 PoB InstallLocation 을 직접 spawn 하지 않고, 항상 vault 의 검증된 사본을 cwd 로 사용. 본 PR 이 그 신뢰성 보장.

## 종료 기준

- [x] ContractValidator 가 smoke test 4단계 모두 수행
- [x] PoBVault 세대 관리 (active + 직전 정상본 1개, 총 2 generation 유지)
- [x] vault 갱신 흐름: detect → staging 복사 → smoke test → promote 또는 폐기
- [x] UI fallback indicator: fallback/uninitialized 상태를 PoB titlebar badge 로 표시
- [x] 사용자 설정 토글: "자동 vault 갱신" (기본 ON), "vault generation 개수" (1~5, 기본 2)
- [ ] PoB 본체 손상 시뮬레이션 → 자동 fallback 동작 영상 (PR 본문)
- [x] vitest: validator + vault 세대 관리 단위 테스트

## 작업 항목

## 세부 진행 단계

- [x] **PR-9.1** ContractValidator smoke test contract
  - `src/main/services/pobVault/validator.ts` 추가
  - PoB 버전 감지: `manifest.xml` 우선, 없으면 exe mtime/size fallback
  - smoke test 4단계 계약 구현: ping → fixture build DPS → XML export roundtrip → build-code inflate
  - 세션 dispose 및 단계별 실패 short-circuit 단위 테스트 추가
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (`722b5e7`)
- [x] **PR-9.2** PoBVault stage/promote generation API
  - `stageSnapshot()` 및 `PoBVault.stage()` 추가
  - `promote()` 가 staged snapshot 또는 기존 version 을 받아 active 전환, smoke metadata 기록, generation prune 수행
  - `rollback()`, `listGenerations()`, `pruneOldest()` 추가
  - active 보존 prune, staged promote, rollback 단위 테스트 추가
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (`6209740`)
- [x] **PR-9.3** vault update flow orchestration
  - `PobVaultUpdateFlow` 추가: detect → stage → smoke test → promote/fallback
  - 자동 갱신 OFF 시 staging 없이 `update-available` 반환
  - smoke 실패 시 staging 폐기, active 유지, 실패 detail 반환
  - manifest 없는 설치본에서 exe fallback version 을 stage/promote 에 일관 적용
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (`bb1a3dd`)
- [x] **PR-9.4** vault status IPC + read-only fallback badge
  - `getPobVaultStatus()` 추가: active vault 와 InstallLocation version 비교
  - `pob:vault-status` IPC 및 `window.pobAPI.vault.status()` 노출
  - fallback/uninitialized 상태를 PoB titlebar badge 로 표시
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (`12d199b`)
- [x] **PR-9.5** vault settings contract
  - `PobSettings` 에 자동 vault 갱신 및 generation limit 추가
  - `DEFAULT_POB_SETTINGS` 와 정규화 helper 를 공유 모듈로 분리
  - preload/config 기본값이 같은 계약을 쓰도록 정리
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (`fc216d3`)
- [x] **PR-9.6** vault generations read-only IPC
  - `getPobVaultGenerations()` 추가: active 여부, metadata, size 를 shared snapshot 으로 매핑
  - `pob:vault-generations` IPC 및 `window.pobAPI.vault.generations()` 노출
  - read-only 세대 목록 계약 단위 테스트 추가
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (`6aad449`)
- [x] **PR-9.7** vault settings read-only UI
  - PoB titlebar 설정 버튼 및 modal 추가
  - 자동 vault 갱신/세대 수 설정을 `pob.settings` 로 저장
  - vault generation 목록을 read-only 로 표시
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋 (`c01a2df`)
- [x] **PR-9.8** vault refresh IPC + default smoke fixture + force refresh UI
  - `Imported Build2.xml` 기반 기본 smoke fixture 를 production packaging 에 포함
  - `pob:vault-refresh` IPC 및 `window.pobAPI.vault.refresh()` 노출
  - 자동 vault 갱신과 설정 modal 의 강제 갱신 버튼 연결
  - `mainSkillDPS` 가 `FullDPS=0` 에 고정되지 않고 실제 `CombinedDPS` 를 사용하도록 보정
  - Windows `npm run lint`, `npm test`, `npm run build:check` 통과 후 코드 변경분만 커밋

### 1. ContractValidator

- 새 파일: `src/main/services/pobVault/validator.ts`
- 업데이트 감지:
  - `manifest.xml` 의 `<Version number="X.Y.Z">` 우선 ([../../docs/plan/PR-4.md](PR-4.md) 의 vault metadata 와 비교)
  - 없으면 `Path of Building-PoE2.exe` 의 mtime/size
- Smoke test 4단계 (모두 통과해야 정상):
  1. `pob.ping` 응답 OK + 버전 문자열 파싱 가능
  2. fixture 빌드 XML (단일 메인 스킬, 기댓값 hardcoded) import → mainSkillDPS 가 기댓값 ±5% 내
  3. export 한 XML 이 import 와 round-trip 동일 (whitespace 무시)
  4. fixture Pastebin 코드 1개 inflate → 정상 디코드 (PR-5 의 Deflate/Inflate IPC override 검증 겸용)
- **smoke test 는 vault-staging/ cwd 에서 실행** — active 영향 없음
- fixture 위치: `src/main/services/pobVault/__tests__/fixtures/`

### 2. PoBVault 세대 관리

- PR-4 의 vault 확장:
  - `userData/pob-vault/<version>/` 디렉토리들 + `active.txt`
  - 세대 정책: active + 직전 정상본 1개 = 총 2개 (기본). 사용자 설정으로 1~5 조정
  - 새 promote 시 가장 오래된 generation 정리 (`fs.rm`)
- 메서드 추가:
  ```ts
  promote(stagingVersion: string): Promise<void>;
  rollback(): Promise<void>; // 사용자 수동 트리거
  listGenerations(): Promise<Array<{ version: string; smokeTestPassedAt: string; sizeBytes: number }>>;
  pruneOldest(): Promise<void>;
  ```

### 3. 갱신 흐름

- BuildListView 진입 시 또는 사용자 "PoB 업데이트" 버튼 (PR-5 의 D.2 후속 5.6 항목):
  ```
  1. PoBLocator 로 InstallLocation 확인
  2. ContractValidator.detectVersion(installLocation) → 새 버전 X
  3. vault.getActive().version === X 면 → 그대로 사용 (배너 없음)
  4. 다르면 →
     a. vault.stage(installLocation, X) — InstallLocation → vault-staging/ 으로 복사
     b. validator.runSmokeTest(staging) — vault-staging/ 에서 PoBSession spawn + 4단계 검증
     c. 통과 → vault.promote(X) + 이전 generation 정리 + active 갱신 + 배너 숨김
     d. 실패 → vault-staging/ 폐기 + active 그대로 + 배너 표시
  ```
- staging 복사 중에는 진행률 표시 (~315MB)
- 사용자 설정 "자동 vault 갱신 OFF" → 새 버전 감지만 하고 갱신 안 함, UI 에 "업데이트 가능" 알림

### 4. UI 배너

- 새 파일: `src/pob/components/FallbackBanner.tsx`
- 위치: BuildListView 상단, BuildEditView 상단 (양쪽 노출)
- 표시 조건: `vault.active.version !== installLocation.version`
- 내용:
  ```
  ⚠️ PoB <new-ver> 와 호환 검증 실패 — vault 의 직전 검증본 <old-ver> 사용 중
  [세부정보] [재시도]
  ```
- [세부정보] → smoke test 실패 단계 + 에러 로그 모달
- [재시도] → staging 복사 + smoke test 재실행

### 5. 사용자 설정 UI

- POB i18n Window 의 설정 화면 (또는 launcher 본체의 설정 패널) 에 추가:
  - **자동 vault 갱신** 토글 (기본 ON)
  - **vault 보관 세대 수** 슬라이더 1~5 (기본 2)
  - **vault 강제 갱신** 버튼 (현재 InstallLocation 으로 강제 staging + smoke test)
  - **vault generations 리스트** (각 버전, 크기, 검증 일시, 삭제 버튼)

### 6. vitest

- 새 파일: `src/main/services/pobVault/validator.test.ts`, `vault.test.ts`
- 케이스:
  - smoke test 4단계 모두 통과 → promote 성공
  - 1단계 실패 (ping timeout) → staging 폐기, active 유지
  - 2단계 실패 (DPS 차이 +5% 초과) → 동일
  - 3단계 실패 (export round-trip 깨짐) → 동일
  - 4단계 실패 (Inflate noop, PR-5 override 미적용 가정) → 동일
  - generation 정리: 3개 있을 때 promote → 가장 오래된 1개 삭제 (기본 N=2 가정)

### 7. PoB 업데이트 종료 감지 (PR-5 의 D.2 후속 5.6 항목)

- POB i18n Window 내부에 "PoB 업데이트" 버튼 (Settings 또는 helper 패널)
- 클릭 → `child_process.spawn(installLocation + '/Update.exe')`
- exit 감지 → ContractValidator 즉시 트리거 → vault 갱신 흐름
- 완료 시 BrowserWindow 리로드 (PoBSession dispose + 재spawn)

## 결정 사항 (plan §6 에서 참조)

- **D.2**: launcher 는 InstallLocation 직접 spawn 안 함, 항상 vault active
- **Q7**: vault 위치 `userData/pob-vault/`
- **5.5** (plan §5 Phase 5 의 5.5): 자동 갱신 토글, 세대 N 설정

## 검증 시나리오

1. **정상 흐름**:
   - PoB 새 버전 설치 (사용자가 자체 Update.exe 실행)
   - launcher POB i18n 진입 → 새 버전 감지 → staging 복사 → smoke test 통과 → vault promote
   - 배너 표시 없음, 새 버전으로 정상 동작
2. **Fallback 흐름 (시뮬레이션)**:
   - vault 의 fixture XML 을 수동으로 깨뜨림 (PoB Lua 로딩 실패 유도)
   - launcher 진입 → smoke test 실패 → 이전 generation 으로 active 유지
   - 배너 노출 "PoB X.Y.Z 와 호환 검증 실패" → 사용자가 [재시도] 클릭 → 동일 실패 → 배너 유지
3. **세대 정리**:
   - 5번 연속 PoB 버전 변경 → vault 디렉토리 N=2 만 유지 확인 (가장 오래된 3개 삭제됨)
4. **사용자 토글 OFF**:
   - 자동 갱신 OFF + 새 버전 감지 → 갱신 안 함, "업데이트 가능" 알림만
   - 수동 [vault 강제 갱신] 버튼으로 트리거

## 마일스톤

PR-9 머지 시 **M6: Fallback 검증** 달성. PoB 가 깨져도 launcher 는 살아있음.

## 참고

- plan §5 Phase 5 의 5.1~5.6 항목 상세
- D.2 결정: plan §6 "D.2 (PoB Update.exe 와 충돌 처리)" 행
- fixture 빌드: PR-8 의 한국 커뮤니티 빌드 코드 3개 재사용 가능

# 폰트 강제 적용 Implementation Plan

> 작성일: 2026-09-04 · 갱신: 2026-09-04 · 상태: PR #286 상신, 사용자 Windows 검증 대기 · 브랜치: fix/font-force-apply-mockup
> 사용자 승인: 실행 파일별 AppConfig map 캐시 설계에 대해 “ㅇㅇ 그렇게 계획하고 진행해”. 구현자는 현 세션, 리뷰는 별도 컨텍스트에서 수행한다.

**Goal:** 폰트 관리 모달에서 두 실행 파일의 Windows 폰트 정책을 조회하고 함께 변경한다.

**Architecture:** Windows 정책이 원본이며 AppConfig는 마지막 확인값만 보관한다. Main의 ProcessFontMitigationService가 조회·변경을 직렬화하고 캐시를 갱신한다. PowerShellManager의 기존 일반/관리자 세션을 재사용하고 기존 Font IPC 영역에 요청/응답 API 두 개를 추가한다.

**Tech Stack:** Electron, React 19, TypeScript, Windows ProcessMitigations, Vitest. 의존성 추가 없음.

## 승인 범위와 preflight

- 기존 UI 변경 3개 파일을 보존하고 현재 fix 브랜치에서 계속한다. 기준 커밋 a9f4365 (1.6.4).
- AppConfig 필드 1개 추가: type + CONFIG_METADATA + DEFAULT_CONFIG 등록. 기존 설정 마이그레이션 없음. 구버전의 누락/손상 캐시는 null로 정규화한다.
- 신규 IPC는 getForceApplyPolicy / setForceApplyPolicy(boolean). Renderer가 실행 파일명이나 명령을 주입할 수 없다.
- 실행 단계는 runtime/user action뿐이다. 자동 시작 시 정책 변경, 신규 백그라운드 서비스/승격 경로, 폰트 파일 설치 로직 변경 없음.
- ON은 DisableNonSystemFonts 활성화, OFF는 해당 override만 시스템 기본으로 복원. 사용자가 외부에서 켜 둔 동일 항목도 명시적으로 OFF할 수 있는 직접 제어 방식이다. 소유권/원상복원 이력, 언인스톨 자동 복원은 구현하지 않는다.
- 관리자 세션은 변경 요청에만 사용. 실게임 대상 OS 정책을 에이전트 QA에서 변경하지 않는다. 검증 시 실제 모달·비승격 조회와 격리된 IPC fixture를 구분한다.
- 기존 폰트 적용 버튼과 별개이며 중복 클릭/게임 실행 중 변경을 차단한다. Main은 모든 게임/채널 런타임 상태를 검사하고 승격 후 명령 안에서도 프로세스를 검사한다.
- 여러 대상 변경은 OS의 원자적 트랜잭션이 아니다. 일부 실패 시 readback으로 실제 상태를 표시하며 전체 성공을 주장하지 않는다.
- 최초 계획은 커밋/PR 전 사용자 Windows 검증이었다. 이후 사용자가 “PR상신해줘 QA 캡쳐도 첨부해서”로 선행 상신을 명시적으로 승인했다. 실제 Windows 검증은 미완료로 공개하고, master 머지와 릴리스는 별도 승인 게이트를 유지한다.

## 상태 계약

```ts
type FontForceApplyTarget = "PathOfExile_KG.exe" | "PathOfExile.exe";
type FontForceApplyState = Record<FontForceApplyTarget, boolean | null>;
interface FontForceApplyPolicy {
  state: FontForceApplyState;
  errors: Partial<Record<FontForceApplyTarget, string>>;
}
interface FontForceApplyUpdateResult extends FontForceApplyPolicy {
  error?: string;
  cancelled?: boolean;
}
// 최초 캐시
const initial = { "PathOfExile_KG.exe": null, "PathOfExile.exe": null };
```

두 값이 모두 true이면 체크, 모두 false이면 해제, 서로 다른 boolean이면 indeterminate. null은 미확인이고 오류/진행 상태는 AppConfig에 저장하지 않는다. 앱이 이미 로드한 config를 prop으로 전달하여 모달 최초 렌더부터 캐시를 표시한다. 모달 재오픈마다 비승격 조회; 확인 중/실패에는 표시를 보존하고 체크박스 조작만 막는다. 성공한 대상만 새 객체로 캐시에 병합한다. 변경 뒤 반드시 재조회한다.

## M1 — 정책 경계와 캐시

Files: src/shared/types.ts, src/shared/config.ts, src/shared/font-force-apply.ts, src/main/utils/powershell.ts, src/main/services/ProcessFontMitigationService.ts, src/main/tests/font-force-apply.test.ts.

- [x] RED: map 기본값/정규화, ON/OFF/NOTSET 파싱, 부분 조회 실패 보존, 관리자 플래그, 대상 allowlist, 조회/변경 순서, UAC 취소, readback 불일치를 테스트한다.
- [x] GREEN: 고정 allowlist와 nullable map을 추가하고 PowerShell 스크립트 builder/파서 및 관리자 변경 메서드를 구현한다.
- [x] GREEN: Main 서비스에서 queue로 조회/변경을 직렬화하고 성공한 readback만 setConfigWithEvent로 병합한다.

```ts
expect(DEFAULT_CONFIG.fontForceApplyState).toEqual({
  "PathOfExile_KG.exe": null,
  "PathOfExile.exe": null,
});
expect(buildSetFontForceApplyScript(false)).toContain(
  "-Remove -Disable DisableNonSystemFonts",
);
expect(buildSetFontForceApplyScript(false)).not.toContain("-Reset");
```

Run: `npm test -- --run src/main/tests/font-force-apply.test.ts` — RED 확인 후 전부 PASS.

DoD [Windows-pwsh]: 조회는 useAdmin=false, 변경만 true; 두 고정 대상 외 입력 불가; 폰트 외 mitigation 재설정 없음; 조회 실패/부분 실패/UAC 취소로 캐시를 임의 OFF하지 않음; 직렬화 회귀 테스트 통과.

## M2 — IPC 및 모달

Files: src/main/events/handlers/FontIpcHandler.ts, src/main/preload.ts, src/renderer/App.tsx, src/renderer/components/modals/FontManagerModal.tsx, FontManagerModal.css, 신규 FontForceApplyControl.tsx 및 테스트.

- [x] RED: IPC 조회/변경 위임과 비boolean 거부 테스트.
- [x] RED: 모달의 캐시 즉시 렌더, 늦은 조회, mixed, 첫 조회 null, 실패/재시도, 재오픈, mutation pending, 취소, 모든 게임 실행 차단 테스트.
- [x] GREEN: 기존 FontIpcHandler에서 서비스에 위임하고 preload에 invoke 두 개만 노출한다.
- [x] GREEN: 승인된 카드 UI를 작은 전용 control로 분리; App.tsx에서는 캐시 prop 하나만 추가한다. 효과 cleanup으로 닫힌 모달의 늦은 응답을 폐기한다.

```ts
getForceApplyPolicy: () => ipcRenderer.invoke("font:get-force-apply-policy"),
setForceApplyPolicy: (enabled: boolean) =>
  ipcRenderer.invoke("font:set-force-apply-policy", enabled),
```

Run: `npm test -- --run src/renderer/components/modals/FontManagerModal.test.tsx src/main/tests/font-force-apply-ipc.test.ts` — RED 확인 후 PASS.

DoD [Windows-pwsh]: 캐시가 첫 렌더부터 표시됨; 읽기 실패 때 캐시 유지; 조회/변경 동안 중복 조작 차단; mixed는 파생 상태일 뿐 저장하지 않음; 기존 font.applyBatch 호출과 연결되지 않음.

## M3 — 검증과 리뷰

- [x] `npm test -- --run`: 최종 전체 회귀 통과 (76 files / 623 tests).
- [x] `npm run lint` 및 `npm run build:check`: 대응 단계 eslint src, tsc --noEmit, vite build 통과. 패키징/릴리스 미실시.
- [x] 숨김 실제 Electron, 고유 QA profile: 실제 비승격 조회 및 1440×960 / 1024×768 캡처. 상태 시나리오는 Vitest의 IPC 대역으로 검증했으며 실제 정책 변경과 구분한다.
- [x] 원시 DOM rectangle으로 카드/푸터/모달이 viewport 안에 있는지 확인. QA 소유 프로세스 정리 확인.
- [x] 분리 리뷰: 본 문서 + 전체 변경분 + 검증 결과로 판정 기록. 코드 Round 2 및 최종 CSS/캡처 리뷰 통과.
- [ ] [사용자] 게임 종료 → ON(UAC) → 두 실행 파일의 정책 및 두 클라이언트 폰트 표시 확인 → OFF → 해당 override만 복원 확인. 실제 정책 변경/인게임 성공을 빌드로 대체하지 않는다.

## 조사 근거

- https://learn.microsoft.com/en-us/defender-endpoint/customize-exploit-protection
- https://learn.microsoft.com/en-us/powershell/module/processmitigations/set-processmitigation
- https://learn.microsoft.com/en-us/powershell/module/processmitigations/get-processmitigation

앱별 NOTSET은 기본값 상속이므로 조회 시 시스템 정책을 확인한다. OFF는 `-Remove -Disable DisableNonSystemFonts`만 사용하며 전체 process 정책 제거/Reset/XML import는 금지한다. 모듈 미지원/형식 불명/권한 차단은 확인 실패로 처리한다.

## 실행 및 리뷰 기록

- 계획 자체 점검: 기존 권한/IPC 경로 재사용, 캐시와 OS 소유 분리, 쓰기 이후 readback, 임시 상태 미저장, 사용자 검증 게이트가 모든 M1–M3에 대응함.

### TDD 및 정적 검증 [Windows-pwsh]

- 초기 정책 경계 테스트 14개 RED 확인 후 구현; 서비스 테스트는 skeleton 상태의 14개 동작 RED를 확인 후 구현.
- 최종 기능 관련 테스트: 정책/config/전송 경계 24개, 서비스 15개, IPC 3개, 모달 12개, 실제 Windows PowerShell 문법 8개. PowerShell 문법 테스트는 Get/Set-ProcessMitigation과 Get-Process를 로컬 대역 함수로 바꾸므로 실제 레지스트리 정책은 변경하지 않는다.
- 전체 Vitest 76 files / 620 tests 통과 (2026-09-04 11:04:53 KST 시작). 최종 변경은 이후 CSS 레이아웃 보완뿐이며 실제 Electron 재캡처로 검증했다.
- eslint src 오류/경고 0, tsc --noEmit 통과, vite build 통과, 변경 파일 Prettier check 및 git diff --check 통과. Vite의 500 kB chunk 경고는 남아 있으며 이번 범위에서 번들 구조를 바꾸지 않았다.
- 모든 Windows 실행은 기존 hidden runner 사용. 최초 Windows-native runner 호출은 WSL 경로 인식 실패로 중단했고 이후 동일 runner를 WSL 진입점으로 호출했다. 별도 실행기나 승격 경로를 추가하지 않았다.

### 분리 리뷰

- 설계 리뷰 — 조건부 통과: persistent worker의 전송 변수 보호와 timeout 이후 완료 확인이 필요. 폰트 스크립트를 `& { ... }`로 격리하고 원래 관리자 연결에 completion fence를 추가했다.
- Round 1 — 반려 [P2]: 관리자 세션의 명령 제출 전 연결 실패도 불확실한 쓰기로 분류해 이후 재시도가 막힘. 미제출 입증 실패와 제출 후 불확실 상태를 구분하도록 요청.
- 수정: PSResult.notSubmitted는 ensureSession 실패/소켓 없음/쓰기 전 연결 종료에서만 기록. 보안 차단 예외도 제출 여부를 구분. timeout/socket write 오류는 계속 fail-closed이며 원래 연결의 fence 성공만 불확실 상태를 해제한다. 연결 유실은 Windows 재시작 안내를 표시한다.
- Round 2 — 통과: 미제출 재시도, fence 성공/timeout/교체 거부, 전송부의 미제출 3경로 테스트를 확인. 추가 blocking 지적 없음.
- UI 후속 리뷰 — 통과: 최종 CSS와 두 실제 캡처 및 원시 좌표를 직접 검토. 외부 폰트 경고와 함께 표시해도 목록/카드/푸터가 겹치거나 잘리지 않으며 추가 blocking 지적 없음.

### 실제 Electron QA [Windows-pwsh]

- 실행: `scripts/qa/hidden-electron-launch.cjs`, 고유 CDP port 52714, exact renderer `http://localhost:54321/?codexQaRun=20260904020442518-273-1bc79e1ec869379f`.
- runId `20260904020442518-273-1bc79e1ec869379f`; worker 55780 / supervisor 74444 / target 39136. 프로필은 `%TEMP%/poe2-unofficial-launcher-codex-qa/<runId>`로 사용자 프로필과 분리했다.
- 실제 Main/preload 조회 결과는 두 대상 모두 false, errors 없음. 격리 프로필 config.json의 map도 두 false로 저장됨을 확인했다. 실제 setForceApplyPolicy, Set-ProcessMitigation, 폰트 가져오기/복원은 실행하지 않았다.
- 캐시 ON/mixed/null/느린 응답/부분 오류/UAC 취소는 Vitest에서 검증한 시나리오다. 실제 Electron 캡처는 현 Windows의 OFF 상태이며 fixture 결과로 오인하지 않는다.
- 처음 CDP 크기 변경 직후에는 resize 처리가 지연되어 기존 크기의 DOM 좌표가 읽혔다. resize 이벤트와 scale 갱신을 기다리고 프레임 캡처 이후 좌표를 수집해 재검증했다.
- 새 카드가 목록 공간을 좁히는 문제를 시각 확인(1440 목록 88px / 1024 목록 51px)하고 모달 높이를 840px로 확장했다. 높이 850px 이하에서는 헤더/푸터 여백과 미리보기를 압축한다. 최종 목록은 각각 188px / 145px로 기본 행과 헤더가 함께 보인다.
- 최종 증거: `.tmp/evidence/font-force-policy/layout-fixed/qa-state.json`, `font-policy-real-1440x960.png`, `font-policy-real-1024x768.png`. 별도 오류 이벤트 0.
- 원시 경계: 1440 모달 [300,76–1140,916], 카드 bottom802 < footer top818. 1024 모달 [92,65.421875–932,767.984375], 카드 bottom669.984375 < footer top685.984375. 타이틀바 bottom65.422211과 모달 top 차이는 0.000336px의 레이아웃 반올림뿐이다.
- native visibility probe: QA 소유 트리 41 samples, max gap63ms, visible/foreground/focus 각 0. conhost 4개는 모두 비표시. `.tmp/evidence/font-force-policy/native-visibility.json` 보존.
- 반환받은 exact metadataPath로 stop: cleanup.stopped=true, childAliveAfterCleanup=false, targetAliveAfterCleanup=false. 캡처/로그/격리 프로필 증거는 보존했다.

### 남은 사용자 검증과 전달 경계

- [사용자] 실제 ON 시 UAC 승인/취소, 게임 재시작 후 카카오/GGG 폰트 표시, OFF 후 해당 override 복원 확인.
- 시스템 기본이 ON이면 override를 지워도 유효 정책은 ON이다. 이 경우 OFF 성공으로 표시하지 않고 readback과 실패 안내를 표시하도록 자동 테스트했다.
- 최초 구현 완료 시점에는 로컬 변경만 존재했다. 이후 사용자 요청으로 커밋/푸시/PR을 진행했으며 아래 상신 기록을 현재 상태로 삼는다. 사용자 Windows 검증, 머지, 릴리스는 미완료다.

### 사용자 UI 피드백 — 중복 상태 문구 제거

- 승인된 수정: 체크박스로 알 수 있는 정상 ON/OFF 문구를 없애고, 두 대상이 모두 OFF인 카드만 저채도로 표현한다. 미확인/mixed를 OFF로 오인하지 않으며 확인 중/실패/취소/변경 후 안내는 유지한다.
- 범위: FontForceApplyControl.tsx, FontManagerModal.css, FontManagerModal.test.tsx. 정책/API/AppConfig 변경 없음.
- [x] RED → GREEN [Windows-pwsh]: 신규 3개 테스트 실패 확인 후 모달 15개 전부 통과. 정상 ON/OFF 상태 행 없음, OFF 스타일과 미확인/mixed 구분, 안내가 있을 때만 aria-describedby 연결.
- [x] 검증 [Windows-pwsh]: scoped lint/typecheck, git diff --check 통과. 분리 코드 리뷰 통과(추가 blocking 없음). 사용자 검증/커밋 게이트는 기존대로 유지.
- 실제 숨김 Electron OFF 재캡처: `.tmp/evidence/font-force-off/qa-state.json` 및 1440×960 / 1024×768 PNG. 정상 상태 행 없음, off=true, option filter=saturate(0), 체크박스 조작 가능, runtime 오류 이벤트 0. 카드 높이 103→79px로 줄고 작은 창 목록 높이169px 확보. 글자 불투명도와 경고 행의 색상은 유지한다.
- QA run `20260904022130703-285-eb65dcfe0ff8b351`, CDP53205 및 exact run-marked renderer, 격리 프로필 사용. native visibility 41 samples / max gap64ms / visible·foreground·focus 각0, 비표시 conhost4개. 실제 Windows 정책 변경 없이 조회만 수행했다.
- exact metadata stop 완료: cleanup.stopped=true, childAliveAfterCleanup=false, targetAliveAfterCleanup=false. 이전 전체 620개 회귀 이후 이번 UI 변경은 모달 15개와 실제 캡처로 비례 검증했으며 전체 회귀를 재실행한 것으로 주장하지 않는다.

### PR 상신 및 최종 검증 — 2026-09-04

- 사용자 요청: “PR상신해줘 QA 캡쳐도 첨부해서”. 제품 변경을 커밋/푸시하고 PR을 상신하되 실제 OS 정책 변경, 머지, 릴리스는 수행하지 않는다.
- PR: https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/pull/286
- 제품 커밋: `b63ef51dcd0ea559349333760110102baad66106` — `fix: 폰트 관리에서 모든 클라이언트에 폰트를 강제 적용할 수 있도록 개선`.
- fetch 후 기준 `origin/master`는 `a9f4365`로 동일함을 확인했다. 기존 변경을 덮어쓰거나 rebase하지 않았다.
- 최종 전체 회귀 [Windows-pwsh]: 2026-09-04 11:45:10 KST 시작, 76 files / 623 tests PASS (26.06초). Vite build 재실행 PASS. 앞선 린트·타입 검사와 별개로 제품 커밋의 pre-commit eslint/prettier도 PASS. 훅 우회 없음.
- PR 본문은 Summary / Motivation만 사용하고 실제 UAC 승인 후 정책 변경 및 인게임 검증이 미수행임을 명시했다. 자동 PowerShell 테스트의 cmdlet 대역과 실제 비승격 조회를 구분한다.
- 최신 실제 Electron 캡처 2장: `.tmp/evidence/font-force-off/font-policy-real-1440x960.png`, `.tmp/evidence/font-force-off/font-policy-real-1024x768.png`. 두 캡처 모두 OFF 저채도 UI이며 정상 ON/OFF 중복 상태 문구가 없다.
- 최초 GitHub 네이티브 첨부는 Chrome 확장 프로그램의 파일 URL 접근 권한으로 차단됐다. 이때 요청했던 사용자 설정 변경은 불필요한 것으로 정정한다. 아래 기존 raw URL 전달 방식으로 마무리한다.
- 위키 raw 노트: `/home/nerdhead/project_llm_wiki/raw/projects/poe2-launcher/2026-09-04-font-force-apply.md` 신규 작성. 위키 지침의 별도 승인 게이트에 따라 `/ingest raw/projects/poe2-launcher/2026-09-04-font-force-apply.md`는 미실시했다. 실제 사용자 검증도 남아 있어 본 문서는 docs/work에 유지한다.
- 내부 작업/QA 기록은 제품 커밋과 별도 `internal:` 커밋으로 전달한다. master 머지 및 릴리스는 실행하지 않았다.

### QA 본문 이미지 전달 방식 정정

- 사용자의 기존 첨부 방식 지적을 받아 PR #279와 #284의 실제 본문을 확인했다. 두 PR 모두 캡처를 저장소에 커밋하고 커밋 SHA 고정 `raw.githubusercontent.com` URL을 본문 이미지로 사용했다. 브라우저 파일 업로드는 필수 조건이 아니다.
- 현재 docs/README.md는 docs에 로그·스크린샷·실행 산출물 추가를 금지하므로 기존 docs/evidence 위치를 늘리지 않는다. 이번 두 PNG만 `.github/qa/font-force-apply/`에 보관하고 제품 코드와 별도 `internal:` 커밋으로 푸시한다. 각 PNG는 원본과 SHA256이 같음을 확인했다.
- PR의 Summary 아래에 1440×960 / 1024×768 실제 Electron 캡처를 커밋 고정 raw URL로 삽입한다. 두 화면 모두 실제 비승격 조회의 OFF 상태이며, 모의 ON 화면이나 실제 정책 변경 검증으로 표현하지 않는다.
- Chrome 확장 권한이나 공유 인증 상태는 변경하지 않는다. 실제 UAC·인게임 검증 및 머지·릴리스 게이트는 그대로 유지한다.

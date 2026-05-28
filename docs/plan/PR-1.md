# PR-1: 좌측 진입 버튼 + InstallerModal (UI only)

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md) · [../pob-handoff.md](../pob-handoff.md)
> 선행 PR: 없음
> 후속 PR: [PR-2](PR-2.md) (PoBLocator 실제 구현)

## 목표

비공식 런처 좌측 패널에 **POB i18n (BETA)** 진입 버튼을 추가하고, 클릭 시 PoB 미설치 상태를 가정한 InstallerModal 을 띄운다. **이 PR 에서는 locator 가 항상 "미설치" 를 반환하는 mock** — 실제 레지스트리 조회는 PR-2.

## 종료 기준

- [ ] 좌측 패널 진입 버튼이 보이고 클릭 가능 (**`activeGame === "POE2"` 일 때만**, Q10)
- [ ] PoE1 활성 시 항목 자체가 렌더되지 않음
- [ ] 클릭 시 InstallerModal 이 뜸 (mock locator 가 항상 null 반환)
- [ ] 모달에서 [공식 사이트 열기], [수동 경로 지정] 동작
- [ ] 수동 경로 지정 → 폴더 선택 다이얼로그 → 선택한 폴더에 `Path of Building-PoE2.exe` 존재 검증 → electron-store 저장
- [ ] 새 BrowserWindow 는 아직 열리지 않음 (PR-3 작업)
- [ ] Windows 에서 `npm run dev` 로 수동 검증 완료

## 작업 항목

### 1. 좌측 패널 버튼 추가

- 파일: [../../src/renderer/App.tsx](../../src/renderer/App.tsx) (편집)
- 위치: `Section B: 메뉴 영역` ([App.tsx:1191-1212](../../src/renderer/App.tsx#L1191-L1212)) 의 **최상단** — 현재 `SupportLinks` 위
- 새 컴포넌트: `src/renderer/components/pob/PobLaunchButton.tsx`
  - 라벨: `POB i18n (BETA)`
  - 우측에 노란색 `BETA` 배지 (작은 칩)
  - 기존 `SupportLinks` 와 동일 톤 (다크 + 액센트 컬러)
  - onClick → `window.electronAPI.pob.open()`
  - **노출 가드 (Q10)**: 부모(`App.tsx`) 에서 `config.activeGame === "POE2"` 일 때만 마운트. 컴포넌트 내부에도 동일 가드(이중 안전) 두는 것을 권장

### 2. main 프로세스 IPC 핸들러 (skeleton)

- 파일: [../../src/main/main.ts](../../src/main/main.ts) (편집) 또는 새 파일 `src/main/services/pobLauncher.ts`
- 핸들러: `ipcMain.handle('pob:open', async () => { ... })`
  - mock locator 호출 → 항상 null 반환
  - null 이면 InstallerModal 표시 신호 → renderer 로 IPC event `pob:show-installer-modal`

### 3. InstallerModal 컴포넌트

- 파일: `src/renderer/components/pob/InstallerModal.tsx` (신규)
- 내용:
  - 제목: "공식 PoB (PoE2) 가 감지되지 않았습니다"
  - 본문: "Path of Building Community (PoE2) 를 설치하거나 설치 폴더를 직접 지정해주세요"
  - 버튼:
    - **공식 사이트 열기** → `shell.openExternal('https://pathofbuilding.community/')`
    - **수동 경로 지정** → main 으로 IPC `pob:pick-install-location` → main 이 `dialog.showOpenDialog({ properties: ['openDirectory'] })`
  - 수동 경로 검증 (main 측):
    - 선택 폴더에 `Path of Building-PoE2.exe` 존재 확인
    - 통과 시 `electron-store` 의 `pob.installLocation` 에 저장
    - 실패 시 renderer 에 에러 메시지

### 4. preload 갱신

- 새로운 channel: `pob:open`, `pob:pick-install-location`, `pob:show-installer-modal`
- contextBridge.exposeInMainWorld 로 노출

### 5. preload / electron-store 설정

- electron-store 키 `pob.installLocation` 사용
- 보안: `pob:*` 채널만 화이트리스트

## 결정 사항 (plan §6 에서 참조)

- **Q4** 좌측 메뉴 버튼만 (트레이/핫키 X)
- **Q10** PoE2 만 먼저. `activeGame === "POE2"` 가드 필수. PoE1 통합은 후순위 (handoff §5.8)
- **C.2** BrowserWindow 신규 생성은 PR-3 — 본 PR 은 main 창에서 모달만
- 라이선스: 본 PR 의 새 코드는 launcher 본체 AGPL-3.0 영역 (PoB 래핑이 아니라 진입 UI)

## 검증 시나리오

1. `npm run dev` 로 launcher 실행
2. 활성 게임이 PoE2 인 상태에서 좌측 패널에 `POB i18n (BETA)` 버튼 확인 — 보이고 클릭 가능
3. **게임 셀렉터를 PoE1 로 전환 → 버튼이 사라짐**. 다시 PoE2 로 → 버튼 복귀 (Q10 가드)
4. 클릭 → InstallerModal 표시
5. "공식 사이트 열기" → 기본 브라우저로 PoB 공식 페이지 열림
6. "수동 경로 지정" → 폴더 다이얼로그 → `G:\Path of Building Community (PoE2)\` 선택 → 성공 (`Path of Building-PoE2.exe` 존재)
7. 잘못된 폴더 (예: 임의 빈 폴더) 선택 → 에러 메시지 표시
8. 다시 클릭 시 mock locator 가 여전히 null 이므로 모달이 다시 뜸 (PR-2 에서 electron-store 캐시 활용으로 바뀜)

## 마일스톤

PR-1 + PR-2 + PR-3 머지 시 **M1: UI 첫 진입** 도달.

## 참고 자료

- launcher 기존 모달 스타일: `src/renderer/components/` 의 기존 모달 컴포넌트 참고 (NewsModal, SettingsModal 등)
- preload 패턴: [../../src/main/preload.ts](../../src/main/preload.ts)
- electron-store 사용: launcher 의 [../../src/main/store.ts](../../src/main/store.ts) 패턴 참고

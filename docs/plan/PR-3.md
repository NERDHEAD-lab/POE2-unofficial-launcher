# PR-3: BuildsScanner + BuildListView 1:1 포팅 + i18n 골격

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-2](PR-2.md) (PoBLocator 동작)
> 후속 PR: [PR-4](PR-4.md) (PoBSession + LuaJIT 번들)

## 목표

POB i18n Window (별도 BrowserWindow) 를 열어 **BuildListView 1:1 포팅** 완성. 사용자 PoB 빌드 폴더 (`*.xml`) 를 fs 만으로 스캔해서 표시. **Lua 세션은 절대 spawn 하지 않음** — Phase 3 종료 기준.

🎯 **이 PR 머지 후 마일스톤 M1 달성** — 비공식 런처에서 POB i18n 버튼 → 새 창에 한국어 BuildList 표시.

## 종료 기준

- [ ] POB i18n 버튼 → 새 BrowserWindow 오픈 (보안 옵션 3종 적용)
- [ ] 사용자 Builds 폴더 (`%MyDocuments%\Path of Building (PoE2)\Builds\`) 자동 해석 (OneDrive 리다이렉트 처리)
- [ ] BuildListView 가 PoB 원본의 모든 컨트롤 표시 (New / New Folder / Open / Copy / Rename / Delete / Sort / Search / Breadcrumb)
- [ ] 각 빌드에 `Level X <Ascendancy>` 메타 표시 (Lua spawn 없이)
- [ ] 단축키 동작 (Ctrl+N, Ctrl+C/X/V, MOUSE4/5, Delete)
- [ ] i18n JSON 분리 (ko/en 두 파일), 평면 포맷
- [ ] **Lua 세션이 한 번도 spawn 되지 않은 상태에서 위 모두 동작** (Phase 3 종료 기준)
- [ ] PoB 원본 스크린샷과 본 launcher 의 동일 화면 나란히 첨부 (PR 본문)
- [ ] 사용자 머신 4개 빌드 (`Imported Build`, `Imported Build2`, `Unnamed build`, `Unnamed build2`) 정상 표시

## 작업 항목

### 1. BrowserWindow + Vite 멀티 엔트리

- 파일: [../../src/main/main.ts](../../src/main/main.ts) (편집)
- `pob:open` 핸들러 보강 (PR-1/PR-2 의 mock 제거 후):
  ```ts
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "POB i18n (BETA)",
    webPreferences: {
      preload: path.join(__dirname, "pob-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile("pob.html"); // dev 에서는 vite dev server
  ```
- 보안 옵션 3종은 plan §6 의 "C.2 (보안)" 행 참조 — **`true / false / true`**.

- [../../vite.config.ts](../../vite.config.ts) 편집:

  ```ts
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        pob: "pob.html",  // 신규
      }
    }
  }
  ```

- 신규 파일: `pob.html` (프로젝트 루트), `src/pob/main.tsx`, `src/main/pob-preload.ts`

### 2. BuildsScanner

- 새 파일: `src/main/services/buildsScanner.ts`
- userPath 해석 우선순위:
  1. Electron `app.getPath('documents')` → OneDrive 리다이렉트 자동 처리 (PoC 결과: `C:\Users\nerdl\OneDrive\문서\` 로 정상 해석됨)
  2. PoB `Settings.xml` 의 `<userPath>` (있으면 우선)
  3. fallback: `os.homedir() + '/Documents/Path of Building (PoE2)/Builds/'`
- IPC 핸들러:
  - `pob:listBuilds({ subPath })` → 폴더 트리 1단계
  - `pob:newFolder({ subPath, name })` → fs.mkdir
  - `pob:renameBuild({ subPath, oldName, newName })` → fs.rename
  - `pob:deleteBuild({ subPath, name })` → fs.unlink (휴지통? 안전을 위해 trash 패키지는 보류)
  - `pob:copyBuild({ srcSubPath, srcName, dstSubPath, dstName })` → fs.copyFile
- 메타 추출:
  - 각 `*.xml` 의 첫 ~10줄만 fs 로 읽어 정규식 또는 lightweight XML 파서로 `<Build level="X" className="Y" ascendClassName="Z">` attribute 추출
  - 결과 스키마:
    ```ts
    type BuildEntry = {
      kind: "file" | "folder";
      name: string;
      mtime: number;
      size: number;
      level?: number;
      className?: string;
      ascendClassName?: string;
    };
    ```
- **Lua spawn 절대 안 함** — PoB [BuildListHelpers.lua:48-51](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/BuildListHelpers.lua#L48-L51) 와 동일 동작.

### 3. BuildListView 컴포넌트

- 새 파일: `src/pob/views/BuildListView.tsx`
- 레이아웃 (PoB [BuildList.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/BuildList.lua) 와 동일 시각적 위치):
  ```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ [New] [New Folder] [Open] [Copy] [Rename] [Delete] [Sort ▼]          │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Search: [______________________________________________________]     │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Builds ► subFolder ► ...                                             │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Imported Build                                Level 62 Invoker       │
  │ Imported Build2                               Level 81 Invoker       │
  │ Unnamed build                                 Level 1 Ranger         │
  │ Unnamed build2                                Level 1 Ranger         │
  └──────────────────────────────────────────────────────────────────────┘
  ```
- 선택 시 Open/Copy/Rename/Delete 활성화 (PoB 의 `enabled = function() return selValue ~= nil end`)
- Sort 옵션: `Sort by Name | Sort by Class | Sort by Last Edited | Sort by Level`
- 단축키 (`BuildList.lua` 의 OnFrame 핸들러 그대로):
  - `Ctrl+N` → New build
  - `Ctrl+C` (선택 시) → copyBuild 클립보드 상태
  - `Ctrl+X` → cutBuild
  - `Ctrl+V` → paste (다른 폴더면 fs 복사/이동, 같은 폴더면 rename 다이얼로그)
  - `MOUSE4` / `MOUSE5` → path 뒤로/앞으로 (subPath 히스토리)
  - `Delete` → 삭제 확인 모달
- **dead code 미포팅**: `if false then ... showPublicBuilds ...` 류 ([BuildList.lua:71](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/BuildList.lua#L71))
- **우클릭 무시**: plan §6 Q9 — PoB 의 RMB=Paste 동작도 가져오지 않음 (사용자 "불편하더라")

### 4. BuildEditView 라우팅 골격

- 새 파일: `src/pob/views/BuildEditView.tsx`
- 라우트: `/build/:fileName?` (react-router 또는 간단한 자체 라우터)
- 진입 시 화면: placeholder "BUILD 모드 — PR-5 에서 구현"
- 종료 버튼: BuildListView 로 복귀
- **이 PR 에서는 Lua 세션 spawn 안 함** — PR-5 에서 lazy spawn 추가

### 5. i18n 분리

- 새 파일:
  - `src/pob/i18n/ko.json`
  - `src/pob/i18n/en.json`
- 포맷: **평면** (plan §6 Q8 = A)
  ```json
  {
    "buildList.toolbar.new": "새로 만들기",
    "buildList.toolbar.newFolder": "새 폴더",
    "buildList.toolbar.open": "열기",
    "buildList.toolbar.copy": "복사",
    "buildList.toolbar.rename": "이름 변경",
    "buildList.toolbar.delete": "삭제",
    "buildList.sort.name": "이름순",
    "buildList.sort.class": "클래스순",
    "buildList.sort.lastEdited": "수정일순",
    "buildList.sort.level": "레벨순",
    "buildList.search.placeholder": "검색",
    "buildList.breadcrumb.root": "Builds"
  }
  ```
- **en.json** 은 PoB 원본 영문 문자열 그대로:
  ```json
  {
    "buildList.toolbar.new": "New",
    "buildList.toolbar.newFolder": "New Folder",
    "buildList.toolbar.open": "Open",
    "buildList.toolbar.copy": "Copy",
    "buildList.toolbar.rename": "Rename",
    "buildList.toolbar.delete": "Delete",
    "buildList.sort.name": "Sort by Name",
    ...
  }
  ```
- i18next 설정: 기본 locale = `ko`, fallback = `en`
- **금지**: 게임 데이터 (아이템 이름, 스탯, 모드 텍스트) 를 이 JSON 에 넣으면 안 됨 (RePoE 영역, PR-7 에서 분리 관리)

### 6. 좌측 패널 진입 버튼 → 새 창

- PR-1 에서 만든 `PobLaunchButton` 의 onClick:
  - PR-2 의 locator 가 성공 반환하면 → main 으로 IPC `pob:open` → main 이 BrowserWindow 생성
  - locator null 이면 → InstallerModal (PR-1 동작 유지)

## 결정 사항 (plan §6 에서 참조)

- **Q4**: 좌측 메뉴 버튼만
- **Q5**: ko + en, 영문은 PoB 원본 그대로
- **Q6**: List 화면 먼저 (이 PR), 나머지 mode 는 PR-6
- **Q8**: i18n 평면 포맷
- **Q9**: 우클릭 메뉴 없음, PoB RMB=Paste 도 안 가져옴
- **D.1**: XML 헤더 attribute 만 fs 추출 (Lua 불필요)
- **C.2 (보안)**: 새 BrowserWindow 도 `contextIsolation: true / nodeIntegration: false / sandbox: true`

## 검증 시나리오

1. `npm run dev` 실행
2. POB i18n 버튼 클릭 → 새 BrowserWindow 오픈, 메인창은 그대로 보임
3. BuildListView 가 사용자 머신 4개 빌드 한국어로 표시:
   - Imported Build — Level 62 Invoker
   - Imported Build2 — Level 81 Invoker
   - Unnamed build — Level 1 Ranger
   - Unnamed build2 — Level 1 Ranger
4. 상단 툴바의 New / New Folder / Open / Copy / Rename / Delete / Sort 모두 보임
5. New 클릭 → BuildEditView 의 placeholder 화면으로 라우팅 (Lua 세션 안 띄움)
6. New Folder → 폴더 생성 다이얼로그 → fs 에 폴더 생성됨 → 목록 갱신
7. Sort 드롭다운 → Class/Edited/Level 순 변경 동작
8. Search 입력 → 실시간 필터링
9. 빌드 선택 → Open/Copy/Rename/Delete 활성화
10. 언어 셀렉터: ko ↔ en 전환 시 UI 텍스트만 바뀜 (메타는 영문 그대로)
11. **DevTools Network 탭에서 외부 요청 0건** — 본 PR 은 오프라인 동작
12. **Lua 프로세스 모니터링: spawn 0회** — Phase 3 종료 기준

## 스크린샷 첨부 (PR 본문 필수)

- PoB 원본 BuildList 화면 (이전 세션에서 사용자가 공유한 스크린샷)
- 본 PR 의 한국어 BuildListView
- 두 화면 나란히 — §4.5 "UI 1:1 포팅 원칙" 검증

## 마일스톤

🎯 **PR-1 + PR-2 + PR-3 머지 후 M1: UI 첫 진입** 달성. 본 마일스톤 시점에 진행 상황 캡쳐 가능.

## 참고

- PoB BuildList 코드: [BuildList.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/BuildList.lua)
- PoB ScanFolder 로직: [BuildListHelpers.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/BuildListHelpers.lua)
- launcher 기존 BrowserWindow 보안 설정 예시: [../../src/main/main.ts:1287-1298](../../src/main/main.ts#L1287-L1298)

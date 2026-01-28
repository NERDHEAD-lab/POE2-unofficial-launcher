# Architecture: POE2-Unofficial-Launcher

이 문서는 POE2-Unofficial-Launcher 프로젝트의 기술 스택, 디렉토리 구조 및 코딩 컨벤션을 정의합니다.

## 1. Project Context

- **목적**: Kakao Games Path of Exile 2용 비공식 런처.
- **주요 기능**:
  - 깔끔하고 현대적인 UI 제공.
  - 로그인 창(새 탭/팝업)의 유연한 처리.
  - 불필요한 광고 및 외부 팝업 차단.

### Tech Stack

- **Runtime**: Node.js (v24+)
- **Framework**: Electron (with Vite)
- **UI**: React
- **Language**: TypeScript (Target: `esnext`)
- **Builder**: electron-builder

### Build Commands

- `npm run dev`: 개발 모드 실행 (Vite + Electron)
- `npm run build`: TypeScript 컴파일 및 Vite 빌드.

## 2. Directory Structure

```text
/
├── dist/               # 빌드 결과물 (Electron entry)
├── dist-electron/      # Main Process 빌드 결과물
├── src/
│   ├── main/           # Electron Main Process
│   │   ├── main.ts     # Entry Point
│   │   ├── preload.ts  # Main Window Preload
│   │   └── preload-game.ts # Game Window Preload
│   ├── renderer/       # React UI (Vite Root)
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── shared/         # 공용 타입 및 유틸리티
├── .github/
│   └── workflows/      # CI/CD (Release Please, PR Check)
├── electron-builder.json5 # Builder 설정
└── vite.config.ts      # Vite 설정
```

## 3. Coding Conventions

- **Language**: 한국어 주석 및 커밋 메시지 권장 (UI 텍스트 포함).
- **Naming**:
  - React Component: `PascalCase.tsx`
  - Logic/Utils: `camelCase.ts`
- **Linting**: ESLint + Prettier (Strict 모드 권장)

## 4. Architecture Decision Records (ADR)

### Active Rules (Mandatory Constraints)

#### ADR-001: Documentation Synchronization

- **Rule**: `README.md` (영문) 업데이트 시, **즉시** `docs/README_KR.md` (국문)도 동일한 내용으로 동기화해야 합니다.

#### ADR-002: Icon Source

- **Source**: 아이콘이 필요한 경우, [Google Fonts Icons](https://fonts.google.com/icons) (Material Symbols/Icons)를 표준 소스로 사용합니다.
- **Implementation**: 모든 아이콘은 `src/assets/icons/` 디렉토리에 **SVG/PNG 파일**로 저장하여 관리하며, 코드 내에서 Import하여 사용합니다. (Inline SVG 지양)

#### ADR-003: Persistence & Theme Optimization (Reactive Observer)

- **상황**: 앱 재시작 시 설정을 유지해야 하며, 게임 전환 시 IPC 지연으로 인한 테마 색상 반영의 미세한 끊김(Latency)을 해결해야 함.
- **결정**:
  - **Persistence**: `electron-store`를 도입하여 메인 프로세스에서 설정을 관리함.
  - **Reactive Observer Pattern**:
    - 메인 프로세스의 `store.onDidChange` 이벤트를 구독하여 설정 변경 시 `mainWindow`, `debugWindow`, `gameWindow` 등 모든 활성 창으로 즉시 알림(`config-changed`)을 브로드캐스트함.
    - 렌더러는 설정 데이터를 로컬 React State로 동기화하여 관리함.
- **Theme Optimization**:
  - **Zero-latency Application**: 로컬 State(`themeCache`)를 즉시 참조하여 게임 전환 시 테마를 **0ms** 반응 속도로 적용함.
  - **Hash-first Validation**: 렌더러에서 무거운 이미지를 로드하기 전, 메인 프로세스를 통해 이미지 파일의 **MD5 해시**를 먼저 비교함.
  - **Asset-Specific Indexing**: 이미지 경로 대신 `gameId`('POE1', 'POE2')를 키로 사용하여 각 게임당 최적의 테마 데이터를 유지하고 관리 복잡도를 낮춤.
- **결과**: 앱 설정이 영구 저장되며, 리소스 낭비(불필요한 이미지 디코딩)가 없는 매끄러운 사용자 경험을 제공함.

#### ADR-004: Type-Safe Event Bus (Pub-Sub Pattern)

- **상황**: 메인 프로세스 내 비즈니스 로직(창 제어, 프로세스 감시 등)이 복잡해짐에 따라, 모듈 간 결합도를 낮추고 타입 안전성을 보장하는 통신 방식이 필요함. 기존의 단순 콜백이나 하드 코딩된 호출은 유지보수가 어려움.
- **결정**:
  - **Event Bus 도입**: `EventBus` 싱글톤을 통해 컴포넌트 간 통신을 중개하는 **Publish-Subscribe** 패턴을 적용함.
  - **Discriminated Unions**: 이벤트 타입(`AppEvent`)을 `Generic`과 `Discriminated Union`으로 정의하여, 이벤트 종류(`type`)에 따라 페이로드(`payload`) 타입이 자동으로 추론되도록 설계함.
  - **Handler Interface**: `EventHandler<T>` 제네릭 인터페이스를 구현하여 핸들러 내부에서 강제 형변환(`as Casting`) 없이 안전하게 로직을 작성하도록 강제함.
- **결과**:
  - **결합도 감소**: `StartupHandler`, `CleanupHandler` 등이 서로를 알 필요 없이 이벤트를 구독하여 독립적으로 동작함.
  - **타입 안전성**: 잘못된 페이로드를 emit하거나 처리할 수 없게 되어 컴파일 단계에서 오류를 방지함.
  - **확장성**: 새로운 기능 추가 시 기존 코드를 수정하지 않고 새로운 핸들러를 등록(`register`)하는 것만으로 기능 확장이 가능함.

  > **참고**: 구현 예제 및 상세 가이드는 [EVENT_SYSTEM_GUIDE.md](./EVENT_SYSTEM_GUIDE.md)를 참고하세요.

#### ADR-005: Unified PowerShell Management (Singleton & IPC)

- **상황**: `registry.ts`와 `process.ts` 등 여러 곳에서 개별적으로 PowerShell 프로세스를 `spawn`/`execFile`하여 사용함. 특히 관리자 권한이 필요한 작업마다 매번 새로운 UAC 팝업이 발생하여 사용자 경험을 저해함.
- **결정**:
  - **PowerShellManager Singleton**: 모든 PowerShell 요청을 중앙에서 관리하는 싱글톤 클래스를 도입함.
  - **Persistent Admin Session**: 관리자 권한이 최초 필요할 때만 `Start-Process ... -Verb RunAs`로 프로세스를 띄우고, **Named Pipe**를 통해 메인 프로세스와 지속적으로 통신함.
  - **IPC Protocol**: JSON 기반의 요청/응답 프로토콜을 사용하여 명령 실행 결과를 안정적으로 비동기 처리함.
- **결과**:
  - **UX 개선**: 앱 실행 중 UAC 승인이 최대 1회로 제한됨.
  - **리소스 효율**: 불필요한 프로세스 생성/종료 오버헤드 감소.
  - **유지보수**: PowerShell 실행 옵션 및 에러 처리가 한곳으로 통합됨.

#### ADR-006: Enhanced Debug Console (Raw Config Editor)

- **상황**: 개발 및 디버깅 과정에서 앱 설정(Config)을 실시간으로 확인하고 안전하게 수정할 수 있는 기능이 필요함. 특히 `config.ts` 메타데이터에 정의되지 않은 고아(Orphaned) 설정들을 식별하고 관리해야 함.
- **결정**:
  - **Categorized Config Viewer**: `CONFIG_METADATA`를 기반으로 설정을 카테고리별(General, Game, Appearance)로 분류하여 시각화함.
  - **Inline JSON Editor**: 설정을 인라인에서 바로 편집할 수 있는 기능을 추가하고, `JSON.parse` 및 커스텀 제약 조건(예: `activeGame`은 'POE1'/'POE2'만 허용)을 통한 유효성 검증을 수행함.
  - **Orphaned Config Detection**: `electron-store`에는 존재하지만 코드상 메타데이터에는 매핑되지 않은 설정들을 별도 섹션(Orange Accent)으로 분리하여 표시함.
  - **Performance Optimization**: 로그 병합 및 해시 계산 등 무거운 헬퍼 함수들을 컴포넌트 외부로 추출하여 React의 불필요한 리렌더링 오버헤드를 줄임.
- **결과**:
  - **개발 효율성**: 외부 도구 없이 런처 내에서 직접 설정을 제어할 수 있어 디버깅 속도가 향상됨.
  - **안정성**: 엄격한 유효성 검증을 통해 잘못된 데이터 주입으로 인한 앱 크래시를 방지함.
  - **가독성 및 유지보수**: 고아 데이터 식별을 통해 불필요한 설정 키를 정리하고 시스템 무결성을 유지하기 쉬워짐.

#### ADR-007: Setting Dependency & Environment Priority (Developer Mode)

- **상황**: 디버그 및 개발 관련 설정들이 늘어남에 따라 일반 사용자의 UI 복잡성을 낮추고, 특정 개발 환경(예: 특정 창 강제 노출)에서 설정을 안전하고 편리하게 강제할 수 있는 메커니즘이 필요함.
- **결정**:
  - **Dependency Mechanism (`dependsOn`)**: 설정 항목 간의 부모-자식 관계를 정의함. 부모 설정(`dev_mode`)이 활성화된 경우에만 하위 설정 아이템들이 렌더링되도록 구현하여 UI 가독성을 개선함.
  - **Environment Priority Logic**: `VITE_SHOW_GAME_WINDOW=true`와 같은 환경 변수가 감지될 경우, 관련 설정값을 강제로 `true`로 덮어쓰고 UI 상에서 비활성화(Disabled) 처리함.
  - **Smart Persistence (Selective Saving)**:
    - 환경 변수에 의해 **강제된 값**은 저장소(`electron-store`)에 **기록하지 않음**. 이를 통해 환경 변수 없이 재시작 시 원래의 사용자 설정을 유지함.
    - 일반적인 상황에서 사용자가 직접 조작한 설정값은 `setConfig`를 통해 **즉시 영구 저장**됨.
  - **Restart-Required Policy**: 실시간 창 제어의 복잡성을 피하기 위해, 중요 설정 변경 시 UI 하단에 '재시작 필요' 안내를 표시하고 다음 실행 시 적용되는 방식을 채택함.
- **결과**:
  - **사용자 경험 성숙도**: 복잡한 설정 간의 관계를 시각적으로 명확히 전달하며, 적용 시점(재시작)을 명시하여 혼란을 방지함.

## 5. Documentation Map

이 프로젝트의 주요 기능 및 가이드는 다음 문서와 연결되어 있습니다.

| 기능 영역 (Area)   | 관련 문서 (Document)                                                                               | 비고 (Note)                              |
| :----------------- | :------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| **설정 시스템**    | [Settings Guide](file:///d:/project_poe2/POE2-unofficial-launcher/src/renderer/settings/types.ts)  | `dependsOn`, `onInit` 등 인터페이스 정의 |
| **이벤트 시스템**  | [EVENT_SYSTEM_GUIDE.md](./EVENT_SYSTEM_GUIDE.md)                                                   | ADR-004 관련 상세 가이드                 |
| **빌드 및 릴리즈** | [README.md](../README.md)                                                                          | 설치 및 빌드 환경 변수 설명              |
| **개발자 모드**    | [Walkthrough](../../.gemini/antigravity/brain/1d4cd62b-eadf-4401-ad03-4f7212fb6e98/walkthrough.md) | 최신 구현 내역 (영속성 로직 포함)        |
| **UAC 우회**       | [uac.ts](../src/main/utils/uac.ts)                                                                 | 시스템 레지스트리 및 작업 스케줄러 로직  |

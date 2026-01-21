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
    - 메인 프로세스의 `store.onDidChange` 이벤트를 구독하여 설정 변경 시 렌더러로 즉시 알림(`config-changed`)을 보냄.
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

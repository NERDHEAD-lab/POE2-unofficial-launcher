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

#### ADR-005: Unified PowerShell & Registry Management (Standardization)

- **상황**: `uac.ts`, `registry.ts` 등 여러 곳에서 개별적으로 PowerShell 프로세스(`spawn`) 및 `reg.exe`를 직접 호출함. 이로 인해 시스템 작업 로깅이 파편화되고, 관리자 권한 작업 시 중복된 UAC 팝업이 발생하는 등 유지보수와 UX 측면에서 개선이 필요함.
- **결정**:
  - **PowerShellManager 일원화**: 모든 PowerShell 및 외부 시스템 명령 실행을 `PowerShellManager` 싱글톤으로 통합하여 실행 이력을 디버그 콘솔에서 실시간으로 확인할 수 있게 함.
  - **Registry Utility 표준화**: `registry.ts`를 통해 레지스트리 경로와 조작 로직을 중앙 집중화하고, PowerShell 표준 명령어(`Get-ItemProperty`, `Set-ItemProperty`)를 사용하여 시스템 안정성을 높임.
  - **Persistent Session**: 관리자 권한이 필요한 경우 **Named Pipe** 기반의 지속 세션을 활용하여 UAC 팝업 발생을 최소화함.
- **결과**:
  - **가시성 확보**: 런처 내부에서 일어나는 모든 시스템 레벨 작업이 통합 로깅되어 디버깅이 용이해짐.
  - **신뢰성**: 직접적인 프로세스 호출 대신 검증된 유틸리티를 사용하여 런타임 오류 가능성을 낮춤.

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

#### ADR-008: Robust UAC Bypass via Proxy VBS & Task Scheduler

- **상황**: 게임 실행 파일을 직접 호출 시 관리자 권한 요청(UAC)이 매번 발생하여 자동화 흐름이 끊김. 이를 해결하기 위해 시스템 레지스트리를 수정하여 런처가 제어권을 가져와야 함.
- **결정**:
  - **Task Scheduler 활용**: `schtasks`를 이용해 관리자 권한으로 실행되는 작업을 등록하고, 일반 사용자 권한에서 이 작업을 호출하는 방식으로 UAC를 우회함.
  - **Proxy VBS & Runner 구조**:
    - `proxy.vbs`: 레지스트리 프로토콜 핸들러에 등록되어 `schtasks /run`을 호출하는 트리거 역할.
    - `runner.vbs`: 실제 관리자 권한으로 실행되어 원본 게임 실행 파일을 실행하고 결과를 로그로 남기는 역할.
  - **PowerShell 인자 최적화**: 경로 내 공백 및 인용 부호 문제를 해결하기 위해 PowerShell의 배열 인자 처리 방식(`$schArgs = @(...)`)과 이중 따옴표(`""`) 이스케이프 관례를 적용함.
- **결과**: 사용자는 최초 한 번의 UAC 승인만으로 이후 모든 게임 실행 과정에서 추가 팝업 없이 자동 로그인 및 실행 기능을 누릴 수 있음.

#### ADR-009: Single Instance Lock & Active Window Focus

- **상황**: 사용자가 런처를 여러 번 실행할 경우 중복 프로세스가 생성되어 시스템 리소스를 낭비하고 설정 파일 충돌을 일으킬 수 있음.
- **결정**:
  - **Single Instance Lock**: 일렉트론의 `app.requestSingleInstanceLock()`을 사용하여 앱 시작 시 락을 체크하고, 획득 실패 시 즉시 종료함.
  - **Second Instance Handling**: 두 번째 실행 시도가 감지되면 기존 인스턴스로 이벤트를 전달하고, 기존 창이 트레이에 있거나 최소화된 경우 복구(`restore`) 및 포커스(`focus`) 처리함.
- **결과**: 앱의 유일성을 보장하고, 사용자가 앱을 다시 찾기 위해 트레이 아이콘을 뒤지는 수고를 덜어줌.

#### ADR-010: Persistent PowerShell Session & Socket Monitoring

- **상황**: 관리자 권한 작업마다 매번 새로운 PowerShell 프로세스를 띄우면 UAC 프롬프트가 반복되고 실행 지연이 발생함.
- **결정**:
  - **Persistent Session**: `PowerShellManager`를 통해 한 번 승인된 관리자 권한 PowerShell 세션을 백그라운드에서 유지함.
  - **Socket-based Liveness**: 관리자 세션을 띄운 "런처" 프로세스가 실행 직후 종료되더라도, 실제 세션과 연결된 **IPC 소켓이 살아있다면 세션을 유지**하도록 `ensureSession` 로직을 개선함.
- **결과**: 앱 실행 중 단 한 번의 UAC 승인으로 모든 관리자 권한 작업을 지연 없이 즉시 수행할 수 있게 됨.

#### ADR-011: Initial Onboarding Wizard & First-Run Logic

- **상황**: 앱 최초 실행 시 사용자가 MAU 수집 고지, 광고 안내, 인증서 부재로 인한 자동 업데이트 제한 등 주요 정책을 인지하고 필수 설정(UAC 우회 등)을 진행할 수 있는 안내 장치가 필요함.
- **결정**:
  - **Multi-step Onboarding Modal**: React 기반의 3단계 위저드를 구현하여 고지 사항 확인, UAC 우회 설정, 자동화 안내를 순차적으로 진행함.
  - **`showOnboarding` State**: 런처 설정(`AppConfig`)에 플래그를 추가하여 온보딩 완료 시 이를 저장하고 이후 실행부터는 노출되지 않도록 제어함.
  - **Dynamic Theme Integration**: 온보딩 모달 내에서도 현재 선택된 게임 프로젝트의 테마 색상을 실시간으로 반영하여 시각적 일관성을 유지함.
- **결과**: 서비스 정책에 대한 투명성을 확보하고, 사용자가 앱의 주요 기능을 즉시 활용할 수 있도록 초기 진입 장벽을 낮춤.

#### ADR-012: Uninstaller Cleanup & Standalone Script Strategy

- **상황**: 앱 제거 시 사용자의 시스템에 남은 UAC 우회 관련 작업 스케줄러 항목과 레지스트리 설정이 그대로 방치되어 시스템의 무결성을 해칠 수 있음. 기존의 앱 실행(`--uninstall`) 방식은 파일 잠금(Lock) 문제 및 프로세스 종료 타이밍 이슈로 인해 불안정함.
- **결정**:
  - **Standalone Batch Script**: UAC 우회 설정(`enableUACBypass`) 시, 나중에 정리를 수행할 수 있는 독립적인 배치 파일(`uninstall_uac.bat`)을 미리 생성해둠.
  - **Uninstaller Integration**: NSIS 언인스톨러(`installer.nsh`)는 앱을 실행하지 않고, 이 배치 파일을 직접 호출하여 정리 작업을 수행함.
  - **No Dependencies**: 앱 런타임에 의존하지 않고 OS 기본 명령어(`schtasks`, `powershell`)만 사용하는 스크립트로 동작하여 제거 과정의 안정성을 보장함.
- **결과**: 앱 파일이 완전히 제거되기 전에 시스템 설정을 깔끔하게 원복(Revert)하며, 제거 중 발생할 수 있는 프로세스 충돌 문제를 원천 차단함.

#### ADR-013: Service Channel Architecture (Kakao vs GGG)

- **상황**: Kakao Games(Korea)와 GGG(Global) 서비스 채널의 실행 방식과 권한 레벨이 상이하여, 단일한 프로세스 감시 및 로그 분석 로직으로는 오작동(이중 감시, 미감지 등)이 발생함.
- **결정**:
  - **Kakao Games (Admin Privileged)**:
    - 런처(`POE2_Launcher`)가 관리자 권한으로 실행되어 클라이언트(`PathOfExile_KG.exe`)를 호출함.
    - 일반 권한의 런처에서는 클라이언트의 경로(Path)를 직접 확인할 수 없으므로, **런처 프로세스 유무** 및 **활성 게임 컨텍스트(`activeGame`)**를 기준으로 식별함.
    - 클라이언트 종료 시 감시를 즉시 중단함.
  - **GGG (User Privileged)**:
    - 런처 없이 클라이언트(`PathOfExile.exe`)가 직접 실행됨.
    - **파일 경로(Folder Name)**를 통해 POE1과 POE2를 명확히 구분하여 로그 감시를 수행함.
  - **Robust Monitoring**:
    - 패치 오류 등으로 프로세스가 **시작 직후 종료(Immediate Crash)**되는 경우를 대비하여, `PROCESS_STOP` 이벤트 수신 시 **마지막 로그 체크(`checkLog`)**를 강제 수행하도록 개선함.
- **결과**: 서비스 채널별 특성에 맞춘 최적화된 감시 전략을 통해 로그 누락 및 오작동을 방지함.

#### ADR-014: Continuous Process Monitoring Strategy (Optimization Toggle)

- **상황**: 런처 외부(웹 브라우저, 직접 실행 등)에서 게임이 실행되거나, 사용자가 런처를 백그라운드로 두고 다른 작업을 할 때도 패치 오류 등을 감지해야 한다는 요구사항이 존재함. 기존 로직은 리소스 절약을 위해 런처가 포커스를 잃으면 감시를 일시 중단(Suspend)했음.
- **결정**:
  - **Optimization Setting**: `processWatcherEnabled` 설정을 도입하여 프로세스 감시 최적화 모드(기본값: 활성)를 제어함.
  - **Always-On Monitoring**: 최적화 모드를 끄면(`false`), 런처가 백그라운드 상태이거나 포커스가 없어도 감시 루프를 중단하지 않고 **항상 유지**함.
  - **Smart Warning**: 설정을 끌 때, '부팅 시 자동 실행' 및 '트레이 최소화'가 설정되어 있지 않다면 감지 효과가 제한적일 수 있음을 경고 메시지로 안내함.
- **결과**: 리소스 사용량(CPU/Polling)은 소폭 증가하지만, 런처의 실행 상태와 무관하게(런처가 켜져만 있다면) 게임 실행 및 오류를 놓치지 않고 포착할 수 있음.

#### ADR-015: Standardized Logging System (Main, Preload, Renderer)

- **상황**: 프로젝트 전반(`Main`, `Preload`, `Renderer`)에서 `console.log`, `console.warn`, `console.error`를 직접 사용함으로 인해 로그 형식이 파편화되고, 런처 내부의 '디버그 콘솔' 탭에서 로그를 통합적으로 모니터링하기 어려움. 특히 프리로드 환경의 로그는 브라우저 도구를 열지 않으면 확인이 불가능함.
- **결정**:
  - **Unified Logger System**: 모든 레이어에서 `LoggerBase`를 확장한 커스텀 로거(`Logger`, `PreloadLogger`, `RendererLogger`)를 사용하도록 강제함.
  - **Implicit Console Ban**: 코드 내에서 원시 `console.*` 호출을 엄격히 지양함. 모든 로그는 반드시 관련 로거 인스턴스를 통해 생성해야 함.
  - **Process-Specific Categorization**: 로그 타입을 나누어(`MAIN`, `PRELOAD`, `DEVTOOLS`, `RENDERER` 등) 디버그 콘솔에서 프로세스별 필터링이 가능하도록 설계함.
  - **Inter-process Streaming**: IPC(`debug-log:send`)를 통해 프리로드 및 렌더러의 로그를 메인 프로세스로 집약하여 하나의 타임라인으로 시각화함.
- **결과**:
  - **통합 가시성**: 개발자 도구를 열지 않고도 런처 UI 내에서 모든 시스템 흐름과 자동화 과정을 실시간으로 모니터링할 수 있음.
  - **디버깅 편의성**: 로그 발생 시점의 정확한 타임스탬프와 프로세스 문맥을 보존하여 복합적인 오류 원인을 빠르게 식별함.

#### ADR-016: Intelligent Window Scaling & Real-time Resolution Adaptation

- **상황**: 1440x960 고정 해상도 런처가 FHD 노트북이나 UMPC(Steam Deck, Legion Go 등)와 같은 저해상도/고배율 환경에서 UI가 잘리거나 조작이 불가능해지는 현상이 발생함.
- **결정**:
  - **Dynamic Scaling Mode**: 화면 해상도를 실시간으로 감지하여, 공간이 부족할 경우 `resizable: true` 모드로 자동 전환하고 렌더러에서 `transform: scale()`을 이용한 Scale-to-fit을 적용함.
  - **Fixed UX Priority**: QHD/4K 등 충분한 해상도 환경에서는 기존의 고정형 창(Fixed size) UX를 우선하여 디자인 정체성을 유지함.
  - **Real-time Metrics Observation**: `display-metrics-changed` 및 `move` 이벤트를 구독하여 창이 다른 모니터로 이동하거나 해상도 설정이 변경되는 즉시 모드를 전환함.
  - **Letterbox Implementation**: 배경 이미지를 스케일러 내부로 가두어, 화면 비율이 다를 경우 상하단/좌우에 블랙 바를 형성함으로써 시각적 일관성을 확보함.
  - **State Indication**: 저해상도 지원 모드 활성화 시 타이틀바 제목에 상태 문구를 추가하여 사용자에게 가변 모드임을 인지시킴.
- **결과**: 다양한 폼팩터(UMPC, 구형 노트북 등)에서 런처가 잘림 없이 항상 최적의 크기로 노출되며, 고성능 환경에서는 원래의 프리미엄 고정 디자인을 유지함.

## 5. Settings System

런처의 설정 화면은 `src/renderer/settings/types.ts` 인터페이스를 기반으로 선언적으로 구축됩니다.

- **설정 구성**: [settings-config.ts](../src/renderer/settings/settings-config.ts)에서 실제 노출될 아이템들을 정의합니다.
  - **카테고리 구조**: `General`, `Account`, `Automation`, `Advanced`, `About`
- **핵심 메커니즘**:
  - **Type-Safe Binding**: `shared/config.ts`의 `DEFAULT_CONFIG`와 `id`로 매핑되어 영속성을 보장받습니다.
  - **Dynamic Context**: `onInit`, `onChangeListener`를 통해 실시간 시스템 상태 반영 및 항목 레이블/비활성화 제어가 가능합니다.
  - **Semantic Feedback**: `addDescription`을 통한 `info`, `warning`, `error` 시각적 피드백 시스템을 갖추고 있습니다.
  - **Option Richness**: `radio`, `select` 타입의 개별 옵션에 상세 설명을 추가하여 직관적인 UI를 제공합니다.
- **무결성 검증**: 빌드 시 `config-integrity.test.ts`를 통해 기본값과 설정 UI의 정합성(ID 일치 여부 등)을 검증합니다.
- **상세 가이드**: 영속성 모델(Persistence Model) 및 타입별 구현 예제는 **[SETTINGS_GUIDE.md](./SETTINGS_GUIDE.md)**를 참고하세요.

## 6. Documentation Map

이 프로젝트의 주요 기능 및 가이드는 다음 문서와 연결되어 있습니다.

| 기능 영역 (Area)        | 관련 문서 (Document)                                                                                         | 비고 (Note)                             |
| :---------------------- | :----------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| **설정 구성**           | [Settings Config](file:///d:/project_poe2/POE2-unofficial-launcher/src/renderer/settings/settings-config.ts) | 실제 노출 항목 정의 및 상호작용 로직    |
| **설정 사용 가이드**    | [SETTINGS_GUIDE.md](./SETTINGS_GUIDE.md)                                                                     | 각 설정 타입별 코드 예제 및 가이드      |
| **설정 인터페이스**     | [Settings Logic](file:///d:/project_poe2/POE2-unofficial-launcher/src/renderer/settings/types.ts)            | `SettingItem` 등 핵심 타입 정의         |
| **이벤트 시스템**       | [EVENT_SYSTEM_GUIDE.md](./EVENT_SYSTEM_GUIDE.md)                                                             | ADR-004 관련 상세 가이드                |
| **빌드 및 릴리즈 (EN)** | [README.md](../README.md)                                                                                    | 설치 및 빌드 환경 변수 설명             |
| **빌드 및 릴리즈 (KR)** | [README_KR.md](./README_KR.md)                                                                               | 설치 및 빌드 (한국어 버전)              |
| **UAC 우회**            | [uac.ts](../src/main/utils/uac.ts)                                                                           | 시스템 레지스트리 및 작업 스케줄러 로직 |
| **후원하기 (EN/KR)**    | [SUPPORT.md](./SUPPORT.md) / [SUPPORT_KR.md](./SUPPORT_KR.md)                                                | 개발자 후원 방법 및 커뮤니티 안내       |

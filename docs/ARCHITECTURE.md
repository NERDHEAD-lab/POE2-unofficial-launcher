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
- `npm run package:force`: **(필수 검증)** 빌드 전 실행 중인 프로세스를 종료하고 패키징.
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

### ADR-001: Vite + Electron Integration

- **Context**: 최신 프론트엔드 개발 경험과 Electron의 결합 필요.
- **Decision**: `vite-plugin-electron`을 사용하여 Main/Renderer 프로세스를 통합 빌드하고 HMR을 지원함.

### ADR-002: Dual Window Architecture

- **Context**: 메인 UI와 실제 게임 런칭 프로세스(웹뷰)의 분리가 필요.
- **Decision**:
  - **Main Window (UI)**: 사용자 인터페이스 담당.
  - **Game Window (Background)**: `nodeIntegration: false`, `contextIsolation: false`로 설정된 숨겨진 윈도우에서 Daum 웹 페이지 로직 수행.
  - **IPC**: 메인 프로세스를 중계자로 하여 두 윈도우 간 통신.

### ADR-003: Preload Script Separation

- **Context**: UI 윈도우와 게임 제어 윈도우의 역할이 완전히 다름.
- **Decision**:
  - `preload.ts`: Main Window용. 안전한 API 노출 (ContextBridge).
  - `preload-game.ts`: Game Window용. DOM 조작 및 자동화 로직 포함 (Direct DOM Access).

### ADR-004: Documentation Synchronization

- **Context**: 글로벌 사용자와 한국 사용자를 모두 지원하기 위해 다국어 문서가 필요.
- **Decision**:
  - `README.md` (Root): 영문 전용 (Global Standard).
  - `docs/README_KR.md`: 국문 전용.
  - **Rule**: `README.md` 업데이트 시, 반드시 `docs/README_KR.md`도 동일한 내용으로 동기화해야 함.

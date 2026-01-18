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

### Active Rules (Mandatory Constraints)

#### ADR-001: Documentation Synchronization

- **Rule**: `README.md` (영문) 업데이트 시, **즉시** `docs/README_KR.md` (국문)도 동일한 내용으로 동기화해야 합니다.

#### ADR-002: Icon Source

- **Source**: 아이콘이 필요한 경우, [Google Fonts Icons](https://fonts.google.com/icons) (Material Symbols/Icons)를 표준 소스로 사용합니다.
- **Implementation**: 모든 아이콘은 `src/assets/icons/` 디렉토리에 **SVG/PNG 파일**로 저장하여 관리하며, 코드 내에서 Import하여 사용합니다. (Inline SVG 지양)

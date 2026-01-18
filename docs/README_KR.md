# POE Unofficial Launcher (비공식)

![release](https://img.shields.io/github/v/release/NERDHEAD-lab/POE2-unofficial-launcher?include_prereleases&style=flat-square)
![license](https://img.shields.io/github/license/NERDHEAD-lab/POE2-unofficial-launcher?style=flat-square)
![downloads](https://img.shields.io/github/downloads/NERDHEAD-lab/POE2-unofficial-launcher/total?style=flat-square)

> **면책 조항**: 본 프로그램은 **패스 오브 엑자일(Path of Exile)** 및 **패스 오브 엑자일 2(Path of Exile 2)** 의 **비공식** 런처입니다. Grinding Gear Games 또는 Kakao Games와는 무관합니다. 사용에 따른 책임은 사용자 본인에게 있습니다.

Electron 기반의 커스텀 런처로, **패스 오브 엑자일** 및 **패스 오브 엑자일 2** (한국 서버)의 실행 과정을 자동화하도록 설계되었습니다. 로그인, 지정 PC 확인, 인트로 모달 등을 자동으로 처리하여 간소화된 실행 경험을 제공합니다.

## 주요 기능

- **게임 실행 자동화**: 전체 실행 시퀀스를 자동으로 처리합니다.
- **팝업 자동 처리**: "지정 PC", "로그인 필요", "인트로" 모달 등을 사용자 개입 없이 확인하고 처리합니다.
- **듀얼 윈도우 구조**:
  - **메인 윈도우**: 런처 상태 및 제어를 위한 깔끔한 UI.
  - **백그라운드 게임 윈도우**: 실제 Daum 게임 스타터 웹 프로세스를 보이지 않게(또는 디버그 모드에서 보이게) 처리합니다.
- **보안 처리**: 비밀번호 데이터를 저장하지 않으며, 가능한 경우 세션 쿠키 및 기존 브라우저 로그인 상태를 활용합니다.

## 설치 방법

1. [Releases](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/releases) 페이지로 이동합니다.
2. 최신 `Setup.exe`를 다운로드합니다.
3. 설치 프로그램을 실행합니다.

## 개발 가이드

### 필수 조건

- Node.js (v18 이상)
- npm 또는 yarn

### 설정

```bash
# 리포지토리 클론
git clone https://github.com/NERDHEAD-lab/POE2-unofficial-launcher.git

# 의존성 설치 및 환경 설정
npm run setup
```

### 로컬 실행

```bash
# 개발 모드 실행
npm run dev

# 디버그 모드 실행 (게임 윈도우 및 개발자 도구 표시)
npm run dev:test
```

### 빌드

```bash
# 프로덕션 빌드 (Windows)
npm run build
```

## 기여하기

기여는 언제나 환영합니다! Pull Request를 자유롭게 제출해주세요.

## 라이센스

이 프로젝트는 [GNU Affero General Public License v3.0](../LICENSE) 하에 배포됩니다.

## 리포지토리

[https://github.com/NERDHEAD-lab/POE2-unofficial-launcher](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher)

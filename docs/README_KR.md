<p align="center">
  <img src="../src/renderer/assets/layout/frame-top-center.gif" width="100%" />
</p>

<h1 align="center">POE Unofficial Launcher</h1>

<p align="center">
  <img src="https://img.shields.io/github/v/release/NERDHEAD-lab/POE2-unofficial-launcher?include_prereleases&style=flat-square" />
  <img src="https://img.shields.io/github/license/NERDHEAD-lab/POE2-unofficial-launcher?style=flat-square" />
  <img src="https://img.shields.io/github/downloads/NERDHEAD-lab/POE2-unofficial-launcher/total?style=flat-square" />
</p>

<p align="center">
  <a href="../README.md"><b>EN</b></a> | <a href="README_KR.md"><b>KR</b></a>
</p>

> **면책 조항 (Disclaimer)**: 본 프로그램은 **Path of Exile** 및 **Path of Exile 2**를 위한 **비공식(Unofficial)** 런처입니다. Grinding Gear Games 또는 Kakao Games와 무관하며, 사용 시 발생하는 모든 책임은 사용자에게 있습니다.

**Path of Exile** 및 **Path of Exile 2**의 실행 과정을 자동화하기 위해 설계된 일렉트론(Electron) 기반 비공식 런처입니다. Kakao Games와 Grinding Gear Games(GGG) 플랫폼을 모두 지원하며, 로그인, 지정 PC 확인, 인트로 팝업 등을 자동으로 처리하여 쾌적한 게임 실행 환경을 제공합니다.

<p align="center">
  <img src="PoE%20Unofficial%20Launcher%20preview.gif" width="100%" />
</p>

## 주요 기능

- **게임 실행 자동화**: **Path of Exile 1 & 2** (Kakao Games / GGG)의 전체 실행 시퀀스를 자동으로 처리합니다.
- **팝업 자동화**: "지정 PC", "로그인 필요", "인트로" 모달 등을 사용자 개입 없이 확인 및 승인합니다.
- **DaumGameStarter UAC 우회**: 사용자 계정 컨트롤(UAC) 확인 창 없이 게임을 즉시 실행합니다 (Windows 스케줄러 기반).
- **패치 오류 자동 대응**: 'Transferred a partial file' 등 고질적인 패치 오류 감지 시 자동으로 복구 및 재실행합니다.
- **듀얼 윈도우 아키텍처**:
  - **메인 윈도우**: 런처 상태 및 제어를 위한 깔끔한 UI.
  - **백그라운드 처리**: 실제 다음 게임 스타터 웹 프로세스를 비활성 창에서 처리하여 사용자에게 노출되지 않습니다.
- **보안**: 비밀번호 데이터를 별도로 저장하지 않으며, 세션 쿠키 및 기존 브라우저 로그인 상태를 활용합니다.

## 설치 방법

1. [Releases](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/releases) 페이지로 이동합니다.
2. 최신 버전의 `Setup.exe`를 다운로드합니다.
3. 설치 프로그램을 실행합니다.

## 개발용 설정

### 준비물

- Node.js (v18 이상)
- npm 또는 yarn

### 설정

```bash
# 저장소 복제
git clone https://github.com/NERDHEAD-lab/POE2-unofficial-launcher.git

# 의존성 설치 및 환경 설정
npm run setup
```

### 로컬 실행

```bash
# 개발 모드로 실행
npm run dev

# 디버그 모드로 실행 (게임 창 및 개발자 도구 노출)
npm run dev:test
```

### 빌드

```bash
# 프로덕션 빌드 (Windows)
npm run build
```

## 기여하기

기여는 언제나 환영합니다! 풀 리퀘스트(Pull Request)를 자유롭게 제출해 주세요.

## 라이선스

이 프로젝트는 [GNU Affero General Public License v3.0](../LICENSE) 라이선스에 따라 배포됩니다.

## 저장소 주소

[https://github.com/NERDHEAD-lab/POE2-unofficial-launcher](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher)

## 후원하기

이 프로젝트가 도움이 되었다면 개발자를 후원해주세요! [상세 정보](./SUPPORT_KR.md)

<p align="center">
  <img src="../src/renderer/assets/layout/banner-bottom.png" width="100%" />
</p>

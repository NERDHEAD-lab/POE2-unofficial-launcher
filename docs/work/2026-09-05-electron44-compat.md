# Electron 44 호환성 수정

> 작성일: 2026-09-05 · 상태: 구현·분리 리뷰 완료, 사용자 검증·머지 대기 · 브랜치: fix/electron44-compat · 대상 PR: #281

## 승인 및 설계

사용자가 앞선 원인 분석의 두 수정에 대해 "조치하고 PR CI 통과하면 알려줘, 머지는 내가 할께"라고 승인했다. 범위는 기존 Electron 44 PR의 호환 수정, 테스트, 분리 리뷰, push 및 CI 확인까지다. PR 머지와 릴리스는 사용자에게 남긴다.

목표: Electron 44.1.0에서 자동 시작 설정의 타입 오류를 해소하고, 외부 링크 복사 실패를 기존 비치명적 오류 처리 안에 유지한다.

설계: AutoLaunchHandler가 소유한 자동 시작 등록에서 제거된 macOS 전용 openAsHidden 옵션만 없앤다. Windows의 openAtLogin 및 args --hidden, AppConfig와 CONFIG_CHANGE 흐름은 유지한다. 런타임 외부 링크 처리는 openExternalSafely가 계속 소유하며 clipboard.writeText 완료를 await하여 비동기 실패를 기존 catch에서 처리한다.

변경 영향: Electron 43.4.1 → 44.1.0 런타임 변경은 기존 PR의 승인 범위다. 직접 동작 수정은 자동 시작 API 인자와 링크 복사 완료/실패 처리에 한정된다. 신규 의존성, 설정 스키마, 마이그레이션, IPC 경계 및 릴리스 흐름은 변경하지 않는다.

근거: CI TS2353은 AutoLaunchHandler.ts:36의 openAsHidden에서 발생했다. 도입 이력은 547515cf이며 Windows 최소화는 main.ts의 --hidden 처리로 동작한다. 링크 복사 도입 이력은 e54074df이며 기존 테스트는 동기 throw만 다뤘다.

## 마일스톤 1 — 호환 수정 및 CI

- [x] src/main/tests/auto-launch.test.ts에 packaged 상태의 자동 시작/최소화 네 조합과 개발 모드 등록 생략을 검증한다.
- [x] src/main/tests/open-external.test.ts에 비동기 복사 거절 및 완료 대기 검증을 추가한다.
- [x] 수정 전 실패를 확인한 뒤 AutoLaunchHandler.ts의 openAsHidden 한 줄을 제거하고 open-external.ts의 clipboard.writeText에 await를 추가한다.
- [x] Windows에서 집중 테스트, 전체 src 테스트, lint, build:check를 검증한다.
- [x] 구현과 분리된 리뷰를 통과한다.

배포 전 전달 절차: 기존 renovate/electron-44.x에 fast-forward push하고, [#281 Checks](https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/pull/281/checks)의 최종 head CI를 확인하여 사용자에게 보고한다. 이 문서의 로컬 결과는 push 전 검증 기록이다.

## DoD

- [Windows-pwsh] Electron 44 타입 검사 및 번들 빌드가 성공한다.
- [Windows-pwsh] 자동 시작/최소화 네 조합의 openAtLogin 및 --hidden 인자가 유지되고 개발 모드에서는 OS 등록하지 않는다.
- [Windows-pwsh] 비동기 클립보드 실패가 내부 logger.error로 처리되고 함수는 false로 완료된다.
- [Windows-pwsh] 클립보드 쓰기가 완료되기 전에는 외부 링크 처리 함수가 완료되지 않는다.
- [Windows-pwsh] 기존 src 테스트가 통과한다. node:test 파일을 Vitest가 수집하는 기존 전체 명령 문제와 구분한다.
- [Windows-pwsh] 기존 PR의 최종 head에서 GitHub Windows CI가 통과한다.
- [사용자] 머지 전에 실제 Windows 자동 시작/최소화 및 외부 링크 실패 시 링크 복사를 확인한다. 카카오 로그인/실행은 Electron 런타임 변경에 대한 사용자 확인 항목이다. CI 통과로 실동작 검증을 대신하지 않는다.

## 분리 리뷰

- 사전 설계: electron44_review — 통과. 추가 owner 결정이나 의존 장벽 없음. 자동 시작 인자 계약과 클립보드 비동기 실패/완료 대기를 검증하고 실제 Windows 동작은 사용자 확인으로 남긴다.
- 라운드 1: electron44_review — 통과. 수정이 필요한 지적 없음. 두 제품 수정이 설정/IPC/lifecycle 범위를 넓히지 않으며 자동 시작 5개 및 외부 링크 9개 테스트, 전체 src 결과와 검증 로그를 확인했다. PR push 및 최종 head CI 확인 단계로 진행 가능하다.

## 로컬 검증 기록

- 환경: Windows PowerShell, Node 24.18.0, Electron 44.1.0, jsdom 30.0.1.
- 수정 전 집중 테스트: 6개 실패, 8개 통과. 자동 시작 API의 제거된 옵션 및 클립보드 실패 처리/완료 대기 회귀를 재현했다.
- 수정 전 타입 검사: TS2353, openAsHidden이 Settings에 없음.
- 수정 후 전체 src 테스트: 721개 통과, 9개 스킵, 실패 및 unhandled error 0. 자동 시작 5개와 외부 링크 9개가 포함된다.
- npm run lint: exit 0.
- npm run build:check: exit 0.
- git diff --check: 통과.
- 실제 Windows 자동 시작/최소화, 실제 링크 복사 및 카카오 로그인/실행은 사용자 머지 전 확인 항목으로 남아 있다.

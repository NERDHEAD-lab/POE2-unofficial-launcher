# 카카오 게임 실행 자동화 실패 판정 강화

## 배경

카카오 게임 실행은 GGG 실행과 달리 웹 페이지 자동화, 로그인, 보안센터, 본인인증, `daumgamestarter://` 핸드오프가 섞여 있다.
단순 timeout이나 게임 프로세스 실행 여부만으로 실패를 판단하면 로그인 대기, 사용자가 직접 처리해야 하는 인증 화면, 게임 실행 후 조기 종료를 구분하기 어렵다.

## 목표

- 웹 자동화가 게임 실행 핸드오프까지 도달했는지 명확히 판단한다.
- 로그인 또는 인증처럼 사용자 입력이 필요한 화면은 자동화 실패로 오인하지 않는다.
- 게임이 실행된 뒤 바로 종료되는 상황은 자동화 실패가 아니라 실행 후 조기 종료로 분리한다.
- 자동화 실패가 확정되면 진단 덤프, 오류 알림, 게임 상태 error 전환을 하나의 finalizer에서 처리한다.

## 제안 구조

자동화 세션에 checkpoint를 둔다.

- `session-started`
- `page-loaded`
- `handler-matched`
- `user-input-required`
- `launch-command-triggered`
- `process-start-detected`
- `process-stable`
- `process-exited-early`

판정 기준은 다음 방향으로 둔다.

- `launch-command-triggered` 전 handler 예외, 필수 DOM 누락, 미처리 페이지 고착은 자동화 실패 후보로 본다.
- `user-input-required` 상태에서는 일반 자동화 timeout을 중지하거나 별도 장기 대기로 전환한다.
- `launch-command-triggered` 이후 프로세스가 곧 종료되면 자동화 실패가 아니라 실행 후 조기 종료로 기록한다.
- handler 없는 페이지가 grace time 이후에도 URL과 DOM이 안정적으로 유지되면 자동화 실패로 확정한다.

## 구현 체크포인트

- 자동화 세션 상태 타입과 상태 전이 로그 추가
- preload handler match, handler execute, visibility request, unhandled page, timeout 경로에서 checkpoint 갱신
- 로그인/QR/본인인증/보안센터 visibility policy를 `user-input-required`와 연결
- 실패 확정 시 `finalizeKakaoStartFailure()`로 단일 처리
- 조기 종료 판정은 process watcher와 별도 이벤트로 연결

# ADR-013: Service Channel Architecture (Kakao vs GGG)

## Context

본 런처는 **Kakao Games**와 **GGG (Global)** 두 가지 서비스 채널을 모두 지원해야 합니다. 두 서비스는 실행 방식, 권한 레벨, 프로세스 구조가 근본적으로 다르며, 이를 정확히 식별하고 감시(Log Monitoring)하는 전략이 필요합니다.

## Architecture

| Feature              | **Kakao Games (KR)**                                            | **GGG (Global)**                                      |
| :------------------- | :-------------------------------------------------------------- | :---------------------------------------------------- |
| **권한 (Privilege)** | **관리자 권한 (Admin)** 필수 (DaumGameStarter)                  | **일반 권한 (User)** 권장                             |
| **실행 흐름**        | Launcher (`POE2_Launcher.exe`) -> Client (`PathOfExile_KG.exe`) | Client (`PathOfExile.exe`) 직접 실행                  |
| **프로세스 식별**    | **Launcher 이름**으로 식별 (`POE_Launcher` vs `POE2_Launcher`)  | **파일 경로(Folder Name)**로 식별 (`Path of Exile 2`) |
| **로그 감시 대상**   | `PathOfExile_KG.exe` (Client PID)                               | `PathOfExile.exe` (Client PID)                        |
| **감시 중단 시점**   | Client 종료 시 (Launcher는 이후 종료됨)                         | Client 종료 시                                        |

## Decision

1. **Kakao Games 식별 전략**:
   - `PathOfExile_KG.exe`는 관리자 권한으로 실행되므로, 일반 권한의 런처에서는 `Process Path` 접근이 불가능할 수 있음.
   - 따라서 **Path 검증을 생략**하고, **현재 활성화된 게임 컨텍스트(`activeGame`)** 또는 **실행 중인 런처 프로세스(`ProcessWatcher`)**를 통해 게임 버전을 식별함.
   - 로그 감시는 Client PID를 대상으로 하며, Client가 종료되면 감시를 즉시 중단함.

2. **GGG 식별 전략**:
   - `PathOfExile.exe`는 POE1과 POE2가 동일한 이름을 사용함.
   - 일반 권한으로 접근 가능하므로, **파일 경로(Path Verification)**를 통해 폴더명(`Path of Exile 2`)을 확인하고 정확한 게임 인스턴스에만 로그 감시를 붙임.

3. **LogWatcher Robustness**:
   - Client가 실행 직후 크래시(Crash)되는 경우를 대비하여, `PROCESS_STOP` 이벤트 수신 시 **마지막으로 한 번 더 로그를 체크(`checkLog`)**한 후 종료하도록 로직을 강화함.

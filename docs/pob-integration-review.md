# PoB i18n 통합 — 사용자 검토 / 결정 필요 항목 체크리스트

> 본 문서는 [pob-integration-plan.md](pob-integration-plan.md) 에서 **사용자(NERDHEAD) 결정이 필요한 항목**만 모아둔 체크리스트입니다.
>
> 작성일: 2026-05-26 · 최종 갱신: 2026-05-26 (5차) · 작성자: Claude (Opus 4.7)
> 형식: `[ ]` 결정 대기, `[x]` 결정 완료.
>
> 확정된 항목은 본 문서에서 제거하고 plan §6 표에 반영됨. **현재 미결정 항목은 없습니다** — 모두 plan 으로 이동. 남은 것은 PR 진행 시점에 자동 처리될 PoC 검증과 사용자가 한 질문에 대한 답변 기록.

---

## A. 사용자 질문에 대한 답변 (참고용 보관)

### A.1 "PR 이 뭐의 약자임?"

**답**: **Pull Request** (GitHub PR) 의 약자.

- 본 통합에서 "PR-1", "PR-2" 식으로 쓰는 번호 = "Pull Request 단위로 쪼갠 작업 묶음 1번, 2번, ..."
- 즉 PR-1 의 작업은 → 작업 → 코드 변경 → GitHub 에 Pull Request 한 개 올림 → 리뷰 → 머지 의 흐름
- 일부 PR (PR-6 의 mode 별 포팅) 은 내부에서 다시 여러 sub-PR (Tree PR, Items PR, ...) 로 쪼개짐

plan §8.1 의 "PR 용어 정리" 박스에 명시함.

### A.2 "PR-1 의 좌측 버튼 → 비공식 런처 좌측 패널 목록에 추가하는 거 맞지?"

**답**: 맞습니다. 정확한 위치:

- 파일: [src/renderer/App.tsx:1191-1212](src/renderer/App.tsx#L1191-L1212)
- 위치: `Section B: 메뉴 영역` 의 최상단 (현재 `SupportLinks` 위)
- 형태: 기존 `SupportLinks` 와 동일 톤의 메뉴 버튼, 라벨 `POB i18n (BETA)`, 우측에 노란색 BETA 배지

plan §4 + §8.1 에 명시.

---

## B. Phase 0 잔여 PoC (PR 진행 시점에 자동 처리)

### B.1 PoC-0.2 — RePoE CDN 실재 검증 (PR-7 시작 전 1회)

PR-7 의 첫 작업으로 다음 명령 실행해서 baseline 확보. 그 이후는 GitHub Actions 가 매일 자동 검증 (plan §5).

- [ ] `Invoke-WebRequest -Method Head https://repoe-fork.github.io/poe2/version.txt`
- [ ] `Invoke-WebRequest -Method Head https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json`
- [ ] `Invoke-WebRequest -Method Head https://repoe-fork.github.io/poe2/passive_skill_trees/Default.json`
- [ ] `Invoke-WebRequest -Method Head https://ggpk.exposed/version?poe=2`
- 200 응답 아닌 항목이 있으면 해당 경로 / 언어는 자체 사전 구축 트랙으로 분리

### B.2 PoC-0.4 — Deflate/Inflate 라운드트립 검증 (PR-8 시점)

우회 방식은 plan §6 의 "빌드코드" 행에서 A 확정 (Node zlib + base64 IPC). 호환성 검증만 남음.

- [ ] 한국 PoB 커뮤니티 빌드 코드 3개 fixture 확보 (Pastebin/Discord 채집)
- [ ] launcher 에서 import → export → 다시 import → 트리/아이템/스킬 동일성 검증
- [ ] **양방향 검증 (사용자 명시 조건)**: launcher 가 export 한 코드를 PoB GUI 가 import 했을 때 정상 로드되는지

---

## C. PR 분할 / 마일스톤 / 일정

본 섹션은 plan §8 의 사본이지만, 사용자가 진행 상황을 빠르게 체크할 수 있도록 본 문서에도 보관.

### C.1 PR 분할

- [ ] PR-1: 좌측 패널에 진입 버튼 추가 + InstallerModal (UI only, locator 는 mock 반환)
- [ ] PR-2: PoBLocator 실제 구현 + 통합
- [ ] PR-3: BuildsScanner + BuildListView 1:1 포팅 + i18n JSON 골격 (ko/en) + Electron 보안 옵션 적용
- [ ] PR-4: PoBVault 최초 스냅샷 + LuaJIT 번들 + ipc_bridge.lua + 최소 RPC 3 메서드
- [ ] PR-5: BuildEditView 라우팅 + Lua 세션 lazy spawn + Deflate/Inflate IPC override
- [ ] PR-6: PoB UI mode 순차 포팅 (Tree → Items → Skills → Calcs → Config, 각 mode 별 sub-PR)
- [ ] PR-7: RePoE 캐시 파이프라인 + GitHub Actions 주기 CDN 검증 (B.1 baseline 후)
- [ ] PR-8: Ctrl+C 파서 (ko + en) + 빌드 코드 라운드트립 검증 (B.2)
- [ ] PR-9: ContractValidator + PoBVault 세대 관리 + UI 배너 + 옵트아웃 토글
- [ ] PR-10: Lua 데이터 점진 대체 #1 (패시브 트리 텍스트)
- [ ] PR-N: Monorepo 분리 (npm workspaces, 대규모, 별도 리뷰)

### C.2 체크포인트 마일스톤

사용자 명시 요청: **PR-6 (M3) 완료 시점에 알림** — 진행 상황을 캡쳐해서 커뮤니티에 공유 예정.

| 마일스톤                   | 시점                              | 사용자가 보이는 결과물                                                            |
| -------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| M0 PoC 통과                | 본 세션 종료 (✅ 2026-05-26 완료) | LuaJIT + HeadlessWrapper exit 0                                                   |
| M1 UI 첫 진입              | PR-1 ~ PR-3 머지 후               | 비공식 런처에서 POB i18n 버튼 → 한국어 BuildList                                  |
| M2 BUILD 진입 가능         | PR-4 ~ PR-5 머지 후               | New → BuildEditView placeholder + Lua 세션 spawn                                  |
| **🎯 M3 PoB UI 골격 완성** | **PR-6 모두 머지 후**             | **Tree/Items/Skills/Calcs/Config 5개 mode 가 한국어로 진입 가능** ← **알림 지점** |
| M4 RePoE 통합              | PR-7 머지 후                      | 트리/스탯 한국어 치환                                                             |
| M5 빌드 코드 호환          | PR-8 머지 후                      | 한국 커뮤니티 빌드 코드 import OK                                                 |
| M6 Fallback 검증           | PR-9 머지 후                      | PoB 강제 손상 → 자동 복구                                                         |
| M7 BETA 출시 후보          | PR-10 머지 후                     | 모든 핵심 흐름 + Tree 옵션 C 임시 구현                                            |

---

## D. 본 문서 사용법

1. 본 문서는 **결정 대시보드** 이자 **PR/마일스톤 추적** 용. 새로운 결정 사항이 생기면 여기에 항목 추가 → 결정 후 plan §6 으로 이동.
2. PR 진행 시 C.1 의 체크박스 갱신. M3 도달 시 사용자에게 알림 (사용자 명시 요청).
3. PoC 결과 (B 섹션) 가 나오면 plan §1 의 "PoC 실측 결과" 표에 반영하고 본 문서에서 삭제.
4. 모든 항목이 완료되면 본 문서를 archive (`docs/_archive/`) 또는 git 에서 삭제.

---

## E. 변경 이력

- **1차 (2026-05-26)**: 초기 작성. Q1~Q9, B, C, D, E 섹션 모두 미결정.
- **2차 (2026-05-26)**: Q1, Q3, Q4, Q5, Q6, Q7, Q8 plan 으로 확정 이동. Q2, Q9 상세 설명 추가.
- **3차 (2026-05-26)**: Q2, Q9, B(라이선스), D.2(vault), C.2(CDN 주기 테스트) plan 으로 확정 이동. PoC-0.1b 본 세션 실행 결과 plan §1 반영. C.3/D.1 풀어서 재작성.
- **4차 (2026-05-26)**: 빌드코드(A), D.1(메타 A), C.1(트리 C), C.3(cold start 후순위), C.4(텔레메트리 X) plan 으로 확정 이동. C.2(Electron 보안), C.4(텔레메트리 정의) 풀어서 §A.1/§A.2 로 재작성.
- **6차 (2026-05-26)**: Q10 추가/확정 — **대상 게임 우선순위 = PoE2 만 먼저**. POB i18n 진입 버튼은 `config.activeGame === "POE2"` 일 때만 노출. PoE1 통합은 후순위 (handoff §5.8). plan §5 Q10 행 + §0/§3 진입 조건 + handoff §3 결정 표에 반영. PR-1 의 좌측 버튼 컴포넌트가 게임 가드를 들고 있어야 함.
- **5차 (2026-05-26)**: 마지막 미결정 항목 모두 plan 으로 확정 이동:
  - **C.2 (Electron 보안)**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` 확정. Claude 가 4차 표에서 "3개 모두 true" 로 잘못 권장한 것을 사용자가 잡아냄 — 정정 완료.
  - **C.4 (오류 보고)**: 텔레메트리 추가 안 함 + 단 exception 은 launcher 의 logger.error 로 흘러가 오류 보고서에 표시되도록 연결
  - **사용자 질문 답변**: PR = Pull Request 약자 (§A.1), 좌측 버튼 = 비공식 런처 좌측 패널 Section B 최상단 (§A.2)
  - **PR-6 마일스톤 알림**: plan §8.3 + 본 문서 §C.2 에 명시. M3 도달 시 사용자에게 보고
  - 본 시점 이후 사용자 결정 대기 항목 0건. PoC 검증 (B.1/B.2) 은 PR 진행 시점에 자동 처리.

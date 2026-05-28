# PR-8: Ctrl+C 파서 + 빌드 코드 라운드트립 검증

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-7](PR-7.md) (RePoE 캐시)
> 후속 PR: [PR-9](PR-9.md) (ContractValidator + Vault 세대 관리)

## 목표

1. **인게임 Ctrl+C 아이템 텍스트 파서** — 사용자가 PoE 클라이언트(한국어/영어) 에서 아이템 복사 → 본 launcher 에 붙여넣기 → 영어 표준으로 역변환 → PoB Lua 에 전달
2. **빌드 코드 (Pastebin) 라운드트립 검증** — PR-5 에서 만든 Inflate/Deflate IPC override 가 PoB GUI 와 100% 호환되는지 실측 (review §B.2 의 PoC-0.4)

## 종료 기준

- [x] 한국어 Ctrl+C 텍스트 → 영어 표준 텍스트 변환 (LOCALE_HEADER_DICTIONARIES 적용)
- [x] 영어 Ctrl+C 텍스트 → 그대로 통과
- [x] BuildEditView Items 탭에서 paste 동작 → 아이템 정상 인식
- [ ] 한국 PoB 커뮤니티 빌드 코드 3개 fixture 라운드트립 검증 통과:
  - launcher 에서 import → 메모리 빌드 → export → 동일 빌드 코드 (정규화 후)
  - launcher 가 export 한 코드를 PoB GUI 에 import → 정상 표시
  - PoB GUI 에서 export 한 코드를 launcher 에 import → 정상 표시
- [ ] vitest 자동 회귀 테스트 fixture 3개 commit

## 작업 항목

## 세부 진행 단계

- [x] **PR-8.1** PoB 원본 분석 + RPC/계약 경계 확정
  - `new("Item", raw)` / `ItemClass:ParseRaw` 입력 shape 확인
  - `Common.ImportBuild` / `Main.Init` 의 build code decode 규칙 확인
  - Items 탭 paste 최소 통합 지점 확정
- [x] **PR-8.2** build code pure utility + fixture 테스트
  - base64url 정규화 + raw deflate/inflate helper
  - `Imported Build2.xml` 기반 deterministic build code roundtrip fixture
  - 외부 커뮤니티 build code fixture 를 추가할 수 있는 테스트 harness 마련
- [x] **PR-8.3** Ctrl+C item parser typed contract + 단위 테스트
  - `LOCALE_HEADER_DICTIONARIES` 적용
  - en 입력은 그대로 통과
  - ko header/base/item 이름 역매핑과 안전한 fallback
  - stat translation reverse matcher 는 fixture 기반으로 지원 범위를 제한
- [x] **PR-8.4** parse-and-add IPC/API + Lua compatibility 테스트
  - main service parser → 기존 `createCustom`/`new("Item", raw)` 경로
  - 실패 시 원문 + 오류 reason 반환
  - 실제 Lua item snapshot 에서 name/base/mod count 검증
- [x] **PR-8.5** BuildEditView Items 탭 paste UX
  - Custom item textarea paste/submit 경로 통합
  - Shared items pane paste drop-in 경로는 PoB 원본 shared list 모델을 유지하는 범위에서만 추가
- [x] **PR-8.6** build code import/export API + 회귀 검증
  - launcher import → in-memory build → launcher export normalized roundtrip
  - community code 3개 fixture 는 공개 source 확보 시 추가
  - PoB GUI 상호 수동 검증은 자동 테스트와 별도 기록
- [x] **PR-8.7** 전체 Windows 검증 + 종료 기준 점검

  - 2026-05-28: Windows `npm run lint`, `npm test`, `npm run build:check` 통과.
  - 공개 커뮤니티 build-code 3개 fixture 와 PoB GUI 수동 상호 검증은 외부 source 확보/사용자 수동 검증 시 추가한다.

### 1. Ctrl+C 파서

- 새 파일: `src/main/services/pobRepoe/itemCopyParser.ts`
- LOCALE_HEADER_DICTIONARIES (review §A.1 의 Gemini 초안 §2.A 그대로 채택):
  ```ts
  const LOCALE_HEADER_DICTIONARIES = {
    ko: {
      itemClass: /^아이템 종류:\s*(.+)$/,
      rarity: /^아이템 희귀도:\s*(.+)$/,
      rarityMap: {
        일반: "Normal",
        마법: "Magic",
        희귀: "Rare",
        고유: "Unique",
      },
      quality: /^퀄리티:\s*\+(\d+)%/,
      requirements: /^요구 사항:\s*(.+)$/,
      reqMap: { 레벨: "Level", 지능: "Int", 힘: "Str", 민첩: "Dex" },
      itemLevel: /^아이템 레벨:\s*(\d+)$/,
      sockets: /^홈:\s*(.+)$/,
      spirit: /^정신력:\s*(\d+)$/,
      grantsSkill: /^스킬 부여:\s*(\d+)레벨\s*(.+)$/,
      fractured: /^분열된 아이템$/,
    },
    en: {
      /* 영어는 PoB 원본 그대로, 매핑 불필요 */
    },
  };
  ```
- 변환 단계:
  1. 헤더 파싱 (아이템 종류/희귀도/요구사항/레벨/홈/정신력)
  2. 옵션 텍스트 → 영어 stat_translations 사전 lookup (RePoE 의 ko/en 매핑)
  3. 영어 표준 PoB 옵션 문자열로 재조립
- ko 외 ja/ru 는 PR-N 후순위 (review 참고)

### 2. Items 탭 통합

- BuildEditView Items 탭 (PR-6.2) 의 "Shared items" 입력란에 paste 이벤트 핸들러
- paste → 텍스트 → itemCopyParser → 영어 표준 → RPC `pob.items.parseAndAdd({ englishText })` → PoB Lua 가 아이템으로 인식
- 실패 시 (파싱 불가) → 사용자에게 원본 텍스트 + 오류 메시지

### 3. 빌드 코드 라운드트립 검증

review §B.2 의 PoC-0.4. 본 PR 의 핵심 회귀 테스트.

- fixture: `src/main/services/pobRepoe/__tests__/fixtures/build-codes/*.txt`
  - 한국 PoB 커뮤니티에서 3개 빌드 코드 채집 (Pastebin/Discord/Reddit)
  - 다양한 클래스/스킬 커버
- vitest 케이스:
  1. `launcher import → in-memory build → launcher export` → 정규화 후 원본과 동일
  2. `launcher export` 한 코드를 외부 PoB GUI 에서 import → 정상 표시 (수동 검증, PR 본문에 스크린샷)
  3. `PoB GUI 에서 export` 한 코드 (fixture) 를 launcher 에서 import → 정상 표시
- 정규화 규칙: whitespace 무시, XML attribute 순서 무시 (PoB 가 attribute 순서를 보장 안 함)

### 4. 회귀 자동화

- GitHub Actions 의 vitest run 에 `pob.deflate.roundtrip` 테스트 포함
- 외부 PoB GUI 검증은 자동화 불가 → PR 본문 스크린샷으로 1회 검증

## 결정 사항 (plan §6 에서 참조)

- **빌드코드 (구 A.1)**: A 확정 — Node zlib + base64 IPC. 본 PR 에서 호환성 실증
- **Q5 (다국어)**: ko + en 부터. ja/ru 는 dict 정의만, 값 비움. 본 PR 도 동일
- **Gemini 초안 §2.A**: LOCALE_HEADER_DICTIONARIES 그대로 채택 (review §A.1)
- **PR-8.1 원본 분석 결과**:
  - PoB item parser 는 `ItemClass:ParseRaw(raw)` 에서 `Item Class:` optional, `Rarity:`, 영문 base/title/spec line 을 해석한다. Launcher 는 Lua parser 를 수정하지 않고 Node service 에서 ko Ctrl+C 텍스트를 영문 PoB raw text 로 정규화한 뒤 기존 `createCustom` 경로로 전달한다.
  - PoB build code decode 는 `common.base64.decode(code:gsub("-", "+"):gsub("_", "/"))` → `Inflate(...)` → XML 이다. Launcher build code utility 도 같은 base64url 정규화와 raw deflate/inflate 규칙을 사용한다.
  - 현재 Items shared pane 에는 입력란이 없으므로 1차 통합은 Custom item modal textarea + optional pane paste handler 로 진행한다. Shared list 자체 모델은 PoB 원본처럼 drag/shared item collection 으로 유지한다.
  - repo 에는 한국 커뮤니티 build code 3개 fixture 가 아직 없다. 자동 테스트 harness 는 먼저 만들고, 실제 public fixture 확보 후 3개 `.txt` 를 추가한다.

## 검증 시나리오

1. 한국어 PoE 클라이언트에서 유니크 아이템 Ctrl+C
2. BuildEditView Items 탭 → Shared items 입력란 paste
3. 한국어 → 영어 변환 → PoB Lua 가 아이템 인식 → Items 탭에 표시
4. 영어 PoE 클라이언트 (해외 계정) 의 동일 아이템 Ctrl+C → 동일 결과
5. fixture 빌드 코드 3개 import → 트리/아이템/스킬 정상 표시
6. 본 launcher export → 같은 코드를 PoB GUI 에 import → 트리 노드 셋 + 메인 스킬 일치 확인 (스크린샷)
7. 반대 방향도 동일 검증

## 마일스톤

PR-8 머지 시 **M5: 빌드 코드 호환** 달성. 한국 PoB 커뮤니티와 빌드 공유 가능.

## 참고

- LOCALE_HEADER_DICTIONARIES 출처: `D:\project_poe2\PathOfBuilding-PoE2-KR\docs\pob_kr_i18n_spec.md` §2.A
- PoB 의 빌드코드 처리 패턴: PR-5 참고 (CompareTab, ImportTab, PartyTab 등)

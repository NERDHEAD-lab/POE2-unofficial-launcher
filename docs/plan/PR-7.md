# PR-7: RePoE 캐시 파이프라인 + GitHub Actions 주기 검증

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-6](PR-6.md) (PoB UI 5개 mode 포팅)
> 후속 PR: [PR-8](PR-8.md) (Ctrl+C 파서 + 빌드코드 라운드트립)

## 목표

RePoE CDN 에서 다국어 게임 데이터 (트리 노드 텍스트, 스탯 description, 유니크 아이템 등) 를 캐시 → POB i18n Window 에서 PoB 가 반환한 영문 ID 를 한국어로 치환.

**Phase 0 PoC-0.2 의 baseline 검증을 본 PR 첫 작업으로 실행** (review §B.1).

## 종료 기준

- [x] PoC-0.2 baseline: 4개 RePoE URL 의 200 응답 확인 (수동 1회)
- [x] `packages/pob-repoe` (또는 `src/main/services/pobRepoe/`) 구현
  - version.txt 조회 + ETag/Last-Modified 비교
  - 변경 시에만 다국어 리소스 다운로드
- [x] 캐시 위치: `app.getPath('userData')/pob-i18n-cache/{locale}/...`
- [x] `cache_manifest.json` 스키마 (review §A.1 의 Gemini 초안 §5.B 그대로)
- [x] Translator (영문 ID → 한국어 텍스트 매핑) 동작
- [x] BuildEditView 의 Tree/Items/Skills 탭에 한국어 텍스트 노출
- [x] GitHub Actions `.github/workflows/pob-repoe-cdn-check.yml` 추가, 매일 KST 18:00 cron
- [x] CDN 검증 실패 시 Issue 자동 생성 (라벨 `pob-repoe`, `cdn-broken`)

## 작업 항목

### PR-7.1: RePoE 데이터 맵핑 분석 및 자동화 스크립트(Skill) 구축
- [x] 완료: `.agents/skills/pob-repoe-data` 프로젝트 Skill 추가

- RePoE 페이지를 기반으로 `content.ggpk` 구조와 해당 페이지의 자료구조가 언어별로 어떻게 매핑되어 있고 어떻게 가져올 수 있는지 분석
- 트리, 아이템, 스킬(접두/접미, 젬, 소켓 등)에 대응하는 "데이터 매핑 지도" 작성
- 위 지도를 기준으로 데이터를 추출하고 치환하는 Agent Skill을 작성하여 프로젝트에 우선 추가
- **💡 Hint:** 이후 7.2부터 진행되는 작업은 본 단계에서 작성된 Skill을 적극 활용하여 작업하면 됩니다.

### PR-7.2: PoC-0.2 baseline (PR 첫 작업)
- [x] 완료: 4개 URL HEAD 200 확인 + `pobRepoe/cdnBaseline` opt-in 테스트 추가

review §B.1 에 명시. PR 시작 전 수동 실행:

```powershell
Invoke-WebRequest -Method Head https://repoe-fork.github.io/poe2/version.txt
Invoke-WebRequest -Method Head https://repoe-fork.github.io/poe2/Korean/passive_skill_trees/Default.json
Invoke-WebRequest -Method Head https://repoe-fork.github.io/poe2/passive_skill_trees/Default.json
Invoke-WebRequest -Method Head https://ggpk.exposed/version?poe=2
```

- 모두 200 → 정상 진행
- 일부 404 → 해당 경로/언어는 자체 사전 트랙으로 분리 + plan §6 트리 행 갱신

### PR-7.3: repoe-fetcher
- [x] 완료: `src/main/services/pobRepoe/fetcher.ts` + fetcher 단위 테스트 추가

- 새 파일: `src/main/services/pobRepoe/fetcher.ts`
- 동작:
  1. `version.txt` GET (또는 HEAD + If-None-Match)
  2. 응답 ETag/Last-Modified + body 를 `cache_manifest.json` 과 비교
  3. 변경됨 → 다국어 리소스 다운로드:
     - `passive_skill_trees/Default.json` (트리 노드)
     - `stat_translations.json` (스탯 description 템플릿)
     - `mods.json` (모드 텍스트)
     - 유니크/스킬 데이터 (RePoE 구조 실측 후 확정)
  4. 변경 없음 → cache 그대로
- 추가 방어: `version.txt` 의 버전 문자열 + `ggpk.exposed/version?poe=2` 의 라이브 버전 일치 시에만 다운로드 (디플로이 지연 회피 — review §A.1 의 Gemini 초안 §5.A 정책 그대로)

### PR-7.4: cache 매니저
- [x] 완료: `src/main/services/pobRepoe/cache.ts` + cache manifest/resource 단위 테스트 추가

- 새 파일: `src/main/services/pobRepoe/cache.ts`
- 저장 위치: `app.getPath('userData')/pob-i18n-cache/{locale}/`
- `cache_manifest.json` 스키마:
  ```json
  {
    "last_check_timestamp": 1779774000,
    "active_locale": "ko",
    "cached_locales": {
      "ko": {
        "cached_at": 1779770000,
        "tree_version": "0.4.0.1",
        "version_file_etag": "W/\"5f3a7c...\"",
        "version_file_last_modified": "Mon, 25 May 2026 05:40:00 GMT"
      }
    }
  }
  ```

### PR-7.5: Translator
- [x] 완료: `src/main/services/pobRepoe/translator.ts` + translator 단위 테스트 추가

- 새 파일: `src/main/services/pobRepoe/translator.ts`
- API:
  ```ts
  class Translator {
    constructor(locale: "ko" | "en");
    translateNodeName(nodeId: string): string;
    translateStatLine(englishLine: string, values: number[]): string;
    translateItemName(uniqueId: string): string;
    translateGemName(gemId: string): string;
  }
  ```
- 매핑 실패 시 → 영문 원문 fallback (사용자가 항상 무언가는 보게)

### PR-7.6: BuildEditView 통합
- [x] 완료: cached RePoE 번역 스냅샷 IPC + Tree/Items/Skills 표시 전용 overlay 통합

- PR-6 의 Tree/Items/Skills 탭에서 PoB Lua 가 반환한 영문 ID 를 Translator 거쳐 한국어로 표시
- 단 사용자가 PoB Lua 에 보내는 값 (검색 쿼리, 아이템 ID) 은 **영문 그대로** (빌드 코드 호환성 유지 — plan §4 결정)

### PR-7.7: GitHub Actions 주기 검증
- [x] 완료: daily KST 18:00 workflow + live CDN JSON/overlap opt-in 테스트 + 실패 Issue 생성

- 새 파일: `.github/workflows/pob-repoe-cdn-check.yml`
- 트리거:
  - `schedule: cron: '0 9 * * *'` (UTC 09:00 = KST 18:00)
  - `workflow_dispatch`
- 작업:
  - `npm ci` + `npm test -- packages/pob-repoe/src/__tests__/cdn-baseline.spec.ts`
  - 실패 시 issue 자동 생성 (`gh issue create` 또는 actions/github-script)
- 테스트 파일: `packages/pob-repoe/src/__tests__/cdn-baseline.spec.ts`
  - 4개 URL 200 확인
  - JSON 파싱 OK
  - 필수 필드 (nodes, connections) 존재
  - 영문 vs 한국어 키 셋 ≥ 80% 일치

### PR-7.8: ESLint 도메인 분리 룰
- [x] 완료: `npm run lint`에 `src/pob/i18n/*.json` key domain guard 추가

- i18n JSON (UI 자체 문자열) ↔ RePoE 캐시 (게임 데이터) 혼합 방지
- 룰:
  - `src/pob/i18n/*.json` 에 PoB Lua 가 반환할 법한 문자열 (예: `"Critical Strike Chance"`) 이 키로 들어가면 lint warn
  - 또는 PR 리뷰 체크리스트로 강제 (자동화 어려우면)

## 결정 사항 (plan §6 에서 참조)

- **C.2 (테스트)**: RePoE CDN 주기 검증은 vitest + GitHub Actions
- **D.7 (텔레메트리 X)**: GitHub Actions Issue 자동 생성은 텔레메트리 아님 (개발자 모니터링)
- **트리 (plan §6 옵션 C)**: 본 PR 에서 RePoE 트리 데이터를 정식으로 사용 시작

## 검증 시나리오

1. PoC-0.2 baseline 4개 URL 200 확인
2. `npm run dev` → POB i18n 진입 → 첫 실행 시 RePoE 다운로드 진행률 표시
3. 다운로드 완료 후 캐시 디렉토리에 파일 생성됨
4. BuildEditView Tree 탭 → 노드 호버 시 한국어 텍스트 표시
5. Items 탭 → 유니크 아이템 이름 한국어 (RePoE 커버리지 범위 내에서)
6. 두 번째 실행: version.txt ETag 동일 → 다운로드 skip, 즉시 캐시 사용
7. GitHub Actions 수동 트리거 → 통과 확인
8. 가짜 URL (잘못된 CDN) 로 변경 → 실패 → Issue 자동 생성 확인 후 원복

## 마일스톤

PR-7 머지 시 **M4: RePoE 통합** 달성. 트리/스탯/유니크 한국어 표시.

## 참고

- review §A.1 의 Gemini 초안 §5 (캐시 정책) 그대로 채택
- RePoE: https://repoe-fork.github.io/poe2/
- ggpk version: https://ggpk.exposed/version?poe=2

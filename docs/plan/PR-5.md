# PR-5: BuildEditView 라우팅 + Lua 세션 lazy spawn + Deflate/Inflate IPC override

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-4](PR-4.md) (PoBVault + LuaJIT + 최소 RPC)
> 후속 PR: [PR-6](PR-6.md) (PoB UI mode 순차 포팅)

## 목표

PR-3 의 BuildEditView placeholder 를 실제 PoB BUILD mode 의 **shell** 로 격상. 사용자가 New/Open 클릭 시 PoBSession lazy spawn 후 빌드 XML 을 import → 가장 기본 정보 (className, level, mainSkill) 표시.

Deflate/Inflate IPC override 도 이 PR 에서 — 빌드 코드(Pastebin) import 가 PR-8 의 사전 조건.

## 종료 기준

- [ ] BuildListView → New 또는 Open → BuildEditView 라우팅
- [ ] BuildEditView 진입 시 PoBSession lazy spawn (이미 떠 있으면 재사용)
- [ ] 선택한 빌드 XML 을 `pob.loadBuildXml` 로 import
- [ ] 화면에 최소 정보 표시: className, ascendClassName, level, mainSkillName, mainSkillDPS
- [ ] BuildListView 로 복귀 시 PoBSession 유지 (다음 빌드 진입 빠르게)
- [ ] **Deflate/Inflate IPC override** 동작 — ipc_bridge 에서 Lua 글로벌을 redirect, Node 측 zlib 처리
- [ ] vitest: Pastebin 류 base64 코드 → inflate → XML 라운드트립 (단위 테스트, 실제 PoB 빌드코드는 PR-8)

## 작업 항목

### 1. BuildEditView 실제 구현

- 파일: `src/pob/views/BuildEditView.tsx` (PR-3 placeholder 교체)
- 라우트 진입 시:
  1. URL `/build/:fileName?` → 새 빌드면 빈 XML, 기존 빌드면 fs 로 XML 읽기
  2. main 으로 IPC `pob:session-ensure` → PoBSession spawn (없으면)
  3. IPC `pob:load-build` (fileName + xml) → `pob.loadBuildXml` RPC 호출
  4. 응답 → 상단 헤더에 표시:
     - 빌드명, className, ascendClassName, level
     - mainSkill, mainSkillDPS (PoB 가 반환한 PlayerStat 값)
  5. 본문: placeholder "본 빌드의 상세 화면은 PR-6 의 각 mode 별 sub-PR 에서 구현 — Tree, Items, Skills, Calcs, Config 탭이 추가될 예정"
  6. 좌측 상단: BuildListView 로 복귀 버튼
- 빌드 변경 시 unsaved 표시 (PR-6 이후 본격 처리)

### 2. PoBSession lazy + life-cycle

- main 의 PoBSession 인스턴스를 **singleton** 으로 보관
- API 추가:
  - `ensureSpawned(): Promise<void>` — 없으면 spawn, 있으면 즉시 return
  - `isAlive(): boolean` — 죽었는지 확인 (process.exitCode 체크)
  - 자동 재spawn 정책: 비정상 종료 시 최대 3회 재시도, 그 사이는 RPC 큐잉
- BuildEditView 가 처음 진입할 때만 spawn (Phase 3 종료 기준: BuildListView 는 Lua spawn 0)
- POB i18n Window 닫힐 때 PoBSession dispose

### 3. RPC 메서드 확장

PR-4 의 3개에 추가:

- `pob.loadBuildXml({ xml, name? })` → 응답 확장:
  ```ts
  {
    ok: boolean;
    className: string;
    ascendClassName: string;
    level: number;
    mainSkillName: string | null;
    mainSkillDPS: number | null;
    playerStats: Record<string, number>; // XML 의 <PlayerStat> 다 긁어서
  }
  ```
- `pob.newBuild()` → 빈 빌드 생성, `{ ok: true }`
- `pob.saveBuildXml()` → 현재 빌드를 XML 로 직렬화 후 반환, BuildEditView 가 fs 에 저장

### 4. Deflate/Inflate IPC override (핵심)

ipc_bridge.lua 시작 부분에 글로벌 override:

```lua
-- Inflate/Deflate 를 Node 측 zlib 로 redirect
-- PoB HeadlessWrapper 의 noop 구현을 덮어씀
local b64 = require("base64") -- PoB 의 lua/base64.lua

function Inflate(data)
    -- data: raw bytes (압축됨)
    -- Node 로 RPC: { method: "_internal.inflate", params: { data: b64encode(data) } }
    local response = sync_rpc_request("_internal.inflate", { data = b64.encode(data) })
    if response.error then error(response.error.message) end
    return b64.decode(response.result.data)
end

function Deflate(data)
    local response = sync_rpc_request("_internal.deflate", { data = b64.encode(data) })
    if response.error then error(response.error.message) end
    return b64.decode(response.result.data)
end
```

- `sync_rpc_request` 는 ipc_bridge 내부의 동기 RPC 호출 helper — Node 에 요청 보내고 응답 라인 한 줄 받을 때까지 block
- Node 측 main 에서 `_internal.inflate` / `_internal.deflate` 핸들러:
  ```ts
  // pobSession.ts 의 onChildLine 핸들러에서 "_internal.*" 메서드를 자동 처리
  case "_internal.inflate":
    return { data: zlib.inflateRawSync(Buffer.from(params.data, "base64")).toString("base64") };
  case "_internal.deflate":
    return { data: zlib.deflateRawSync(Buffer.from(params.data, "base64")).toString("base64") };
  ```

PoB 의 빌드 코드 호출 패턴 ([CompareTab.lua:1320](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/CompareTab.lua#L1320), [ImportTab.lua:128](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/ImportTab.lua#L128) 등 7군데) 가 그대로 동작.

### 5. base64 모듈 확인

- PoB 의 `lua/base64.lua` 확인 (PoC-0.1b 에서 존재 확인됨)
- ipc_bridge 에서 `require("base64")` 가능한지 검증 (LUA_PATH 에 `.\lua\?.lua` 포함되어 있어야 함 — PR-4 의 spawn env 이미 적용)

### 6. vitest 단위 테스트

- 새 파일: `src/main/services/pobSession.deflate.test.ts`
- 케이스:
  - 임의 문자열 → Node deflate → Buffer → base64 → Lua inflate (mock) → 원본 동일
  - 빈 문자열 / 큰 문자열 (1MB) / 한글 포함 / 바이너리 데이터
  - error 케이스: 깨진 압축 데이터 → error 응답

## 결정 사항 (plan §6 에서 참조)

- **빌드코드 (구 A.1)**: A 확정 — Node zlib + base64 IPC. 본 PR 에서 인프라 구축, PR-8 에서 실제 한국 PoB 커뮤니티 빌드 코드로 라운드트립 검증.
- **D.1**: BuildEditView 의 메타도 Lua 에서 받음 (BuildListView 와 달리 정확도 우선)

## 검증 시나리오

1. BuildListView → "Imported Build" 선택 → Open
2. BuildEditView 라우팅 + PoBSession spawn 로그 출력
3. 헤더에 "Monk · Invoker · Level 62 · ..." 표시
4. 본문에 PR-6 안내 placeholder
5. 복귀 → BuildListView → 다른 빌드 Open → PoBSession 재사용 (spawn 로그 없음)
6. Deflate/Inflate 단위 테스트 통과
7. 한국 PoB 커뮤니티 빌드 코드 1개로 수동 import 시도 (PR-8 본격 fixture 전 sanity check):
   - 빌드코드를 BuildEditView 의 임시 입력란에 붙여넣기 → `Inflate` → XML 디코드 → loadBuildXml → 정상 import

## 마일스톤

PR-4 + PR-5 머지 시 **M2: BUILD 진입 가능** 도달.

## 참고

- PoB 의 Inflate/Deflate 호출처: [CompareTab.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/CompareTab.lua), [ImportTab.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/ImportTab.lua), [PartyTab.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Classes/PartyTab.lua), [Common.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/Common.lua), [Main.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/Main.lua), [Build.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/Build.lua), [DataLegionLookUpTableHelper.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/Modules/DataLegionLookUpTableHelper.lua)
- HeadlessWrapper 의 noop 자리: [HeadlessWrapper.lua:86-101](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/HeadlessWrapper.lua#L86-L101)

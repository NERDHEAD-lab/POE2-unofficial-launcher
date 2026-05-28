# PR-4: PoBVault + LuaJIT 번들 + ipc_bridge.lua + 최소 RPC

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-3](PR-3.md) (BuildListView 동작)
> 후속 PR: [PR-5](PR-5.md) (BuildEditView 라우팅 + Lua 연결)

## 목표

LuaJIT 을 launcher resources 에 번들하고, 사용자 PoB InstallLocation 의 검증된 사본(vault) 을 `userData/pob-vault/<version>/` 에 만들어 거기서 헤드리스 Lua 세션을 spawn. 최소 RPC 3개로 round-trip 동작 확인.

본 PR 의 핵심: **PoC-0.1b 본 세션에서 통과** — `luajit HeadlessWrapper.lua` (cwd=vault, LUA_PATH=`.\?.lua;.\?\init.lua;.\lua\?.lua;.\lua\?\init.lua`) 가 exit 0 + "Startup time: 0 ms" 확인됨. 코드로 옮기기만 하면 됨.

## 종료 기준

- [ ] `<launcher>/resources/lua/luajit.exe` 번들 (electron-builder extraResources)
- [ ] `<launcher>/resources/lua/HeadlessWrapper.lua` 번들 (source repo 사본, 버전 고정)
- [ ] `<launcher>/resources/lua/ipc_bridge.lua` 작성 (JSON-RPC over stdio)
- [ ] PoBVault 가 사용자 InstallLocation → `userData/pob-vault/<version>/` 스냅샷 복사
- [ ] PoBSession 이 vault active 에서 luajit + ipc_bridge spawn → READY 응답
- [ ] 3개 RPC 메서드 round-trip 동작 (ping / loadBuildXml / exportBuildXml)
- [ ] vitest 통합 테스트: `POB_INSTALL_LOCATION` env 지정 시 통과, 미지정 시 skip
- [ ] BuildListView 에서는 여전히 Lua 세션 안 띄움 (lazy spawn 은 PR-5)

## 작업 항목

### 1. LuaJIT 번들

- 다운로드: LuaJIT 2.1 Windows x64 (PoC 검증 버전: 2.1.1720049189 from winget `DEVCOM.LuaJIT`)
  - 라이선스: MIT
  - 출처: `C:\Users\<user>\AppData\Local\Programs\LuaJIT\bin\luajit.exe` 또는 https://github.com/LuaJIT/LuaJIT release
- 배치: `resources/lua/luajit.exe`
- electron-builder 설정 ([../../package.json](../../package.json) 의 `build.extraResources`):
  ```json
  "extraResources": [
    { "from": "resources/lua", "to": "lua" }
  ]
  ```
- 라이선스 표기: `resources/lua/LICENSE-LuaJIT.txt` 동봉

### 2. HeadlessWrapper.lua 번들

- 출처: `D:\project_poe2\PathOfBuilding-PoE2-KR\src\HeadlessWrapper.lua` (NERDHEAD-lab/PoB-PoE2-KR repo)
- 배치: `resources/lua/HeadlessWrapper.lua`
- **PoB 설치본에는 이 파일이 없음** (NSIS 인스톨러가 제외) — PoC-0.1b 에서 확인
- 버전 고정: 본 PR 시점 PoB 0.15.0 의 source 트리 기준 사본. 향후 PoB 메이저 업데이트 시 vault 갱신 트리거가 ContractValidator 에서 처리

### 3. ipc_bridge.lua 작성

- 새 파일: `resources/lua/ipc_bridge.lua`
- 구조:

  ```lua
  #@
  -- launcher 의 JSON-RPC 진입점
  -- 실행: luajit ipc_bridge.lua (cwd=vault active)
  -- env: LUA_PATH=.\?.lua;.\?\init.lua;.\lua\?.lua;.\lua\?\init.lua

  io.stdout:setvbuf("no")
  io.stderr:setvbuf("no")

  -- HeadlessWrapper 절대경로로 로드 (launcher 의 resources/lua/ 에 있음)
  local headlessPath = arg[1] or "HeadlessWrapper.lua"  -- launcher 가 첫 인자로 전달
  dofile(headlessPath)

  -- PR-5 에서 Inflate/Deflate override 추가 예정 (Node zlib RPC)

  local json = require("dkjson")

  local function rpc_send(obj)
      io.stdout:write(json.encode(obj) .. "\n")
      io.stdout:flush()
  end

  local function rpc_loop()
      rpc_send({ jsonrpc = "2.0", method = "_ready" })
      while true do
          local line = io.read("*l")
          if not line or line == "" then break end
          local req = json.decode(line)
          if not req then
              rpc_send({ jsonrpc = "2.0", error = { code = -32700, message = "Parse error" } })
          else
              local ok, result = pcall(handle_method, req.method, req.params or {})
              if ok then
                  rpc_send({ jsonrpc = "2.0", id = req.id, result = result })
              else
                  rpc_send({ jsonrpc = "2.0", id = req.id, error = { code = -32603, message = tostring(result) } })
              end
          end
      end
  end

  function handle_method(method, params)
      if method == "pob.ping" then
          return { pong = true, pobVersion = (mainObject and mainObject.versionNumber) or "?" }
      elseif method == "pob.loadBuildXml" then
          loadBuildFromXML(params.xml, params.name or "RPC build")
          local b = mainObject.main.modes["BUILD"]
          return {
              ok = true,
              className = b.spec and b.spec.curClassId or "?",
              level = b.characterLevel or 0,
              -- ... PR-5 에서 확장
          }
      elseif method == "pob.exportBuildXml" then
          local b = mainObject.main.modes["BUILD"]
          return { xml = b:SaveDB("export") }
      else
          error("Unknown method: " .. tostring(method))
      end
  end

  rpc_loop()
  ```

- 라이선스: launcher 의 PoB 래핑 모듈 → **MIT** (plan §6 B 결정)

### 4. PoBVault 패키지 구조

- 새 경로: `src/main/services/pobVault/` (모노레포 분리 전이라 main 안에 둠)
  - `vault.ts` — 메인 매니저
  - `snapshot.ts` — InstallLocation → vault 복사
  - `metadata.ts` — `metadata.json` 읽기/쓰기
- 저장 위치: `app.getPath('userData')/pob-vault/`
  - `<version>/` 디렉토리 (압축 안 함)
  - `active.txt` — 현재 사용 중인 `<version>` 가리킴
  - `<version>/metadata.json`:
    ```json
    {
      "version": "0.15.0",
      "sourceInstallLocation": "G:\\Path of Building Community (PoE2)",
      "copiedAt": "2026-05-26T12:34:56Z",
      "smokeTestPassedAt": null,
      "hash": "sha256:..."
    }
    ```
- 주요 API:
  ```ts
  ensureSnapshot(installLocation: string): Promise<{ version: string; vaultPath: string }>
  getActive(): Promise<{ version: string; vaultPath: string } | null>
  promote(stagingVersion: string): Promise<void>
  ```
- **본 PR 의 vault**: smoke test 없이 단순 복사 → active 설정. ContractValidator + 세대 관리는 PR-9.
- 복사 방식: `fs.cp(src, dst, { recursive: true })` (Node 16.7+)
- 진행률: 사용자에게 알림 표시 (BuildListView 상단 배너 또는 모달) — PoB 본체 ~315MB

### 5. PoBSession 구현

- 새 파일: `src/main/services/pobSession.ts`
- 핵심 메서드:

  ```ts
  class PoBSession {
    async spawn(): Promise<void> {
      const active = await vault.getActive();
      if (!active) {
        const locator = await getPobInstallPath();
        if (!locator.installLocation) throw new Error("PoB not installed");
        await vault.ensureSnapshot(locator.installLocation);
      }
      const resPath = process.resourcesPath; // packaged 시 자동
      const luaExe = path.join(resPath, "lua", "luajit.exe");
      const bridgePath = path.join(resPath, "lua", "ipc_bridge.lua");
      const wrapperPath = path.join(resPath, "lua", "HeadlessWrapper.lua");

      this.proc = spawn(luaExe, [bridgePath, wrapperPath], {
        cwd: active.vaultPath,
        windowsHide: true,
        env: {
          ...process.env,
          LUA_PATH: ".\\?.lua;.\\?\\init.lua;.\\lua\\?.lua;.\\lua\\?\\init.lua",
          PATH: active.vaultPath + ";" + (process.env.PATH ?? ""),
        },
      });
      // newline-delimited JSON 파싱
      // READY 메시지 대기 (10s timeout)
    }

    async call<T>(method: string, params: object): Promise<T> {
      // id 부여, write line, response queue, 30s timeout
    }

    async dispose(): Promise<void> {
      this.proc?.kill();
    }
  }
  ```

- dev 모드 처리: `process.resourcesPath` 대신 `path.join(app.getAppPath(), "resources")` fallback

### 6. RPC 3개

- `pob.ping` → `{ pong: true, pobVersion: string }`
- `pob.loadBuildXml({ xml, name? })` → `{ ok: true, className, level }`
- `pob.exportBuildXml()` → `{ xml: string }`

### 7. vitest 통합 테스트

- 새 파일: `src/main/services/pobSession.test.ts`
- 케이스:
  - `POB_INSTALL_LOCATION` env 없으면 `it.skip`
  - PoBSession spawn → ping → pong 확인
  - 빌드 XML fixture 로드 → loadBuildXml → exportBuildXml → 라운드트립 (whitespace 무시) 동일
  - dispose 후 프로세스 종료 확인
- 30s 타임아웃

## 결정 사항 (plan §6 에서 참조)

- **Q1**: LuaJIT 외부 번들 — PoC-0.1b 통과로 확정
- **Q7**: vault 저장 위치 `userData/pob-vault/<version>/`
- **D.2**: PoB InstallLocation 직접 spawn 안 함, 항상 vault active 사용
- **B (라이선스)**: 본 PR 의 신규 파일들 (ipc_bridge.lua, pobVault, pobSession) 은 **PoB MIT 상속**

## 검증 시나리오

1. `npm run build:check` → vite 빌드 성공, electron-builder dry run
2. dev 모드 (`npm run dev`) 에서 vitest 통합 테스트 실행:
   ```
   POB_INSTALL_LOCATION="G:\Path of Building Community (PoE2)" npm test -- pobSession
   ```
3. 최초 실행: vault 비어있음 → 사용자 InstallLocation 의 ~315MB 복사 (진행률 표시)
4. 복사 완료 후 vault active = "0.15.0"
5. PoBSession spawn → 콘솔 로그:
   ```
   [PoBSession] spawning luajit (cwd=...\pob-vault\0.15.0)
   [PoBSession] Loading main script...
   [PoBSession] Unicode support detected
   [PoBSession] Uniques loaded
   [PoBSession] Rares loaded
   [PoBSession] Startup time: X ms
   [PoBSession] READY
   ```
6. `pob.ping` 호출 → `{ pong: true, pobVersion: "0.15.0" }`
7. fixture 빌드 XML 로드 → className/level 정상 반환
8. export → 다시 import → 라운드트립 동일
9. **두 번째 실행**: vault 존재하므로 즉시 active 사용, 복사 안 함
10. 사용자 PoB 폴더 권한 변경/이동 테스트 → vault 는 그대로 동작 (D.2 격리 검증)

## 추가 검증 (사용자 머신에서 본 세션이 사전 통과)

- LuaJIT 2.1.1720049189 + cwd=PoB + LUA_PATH 조합 → HeadlessWrapper exit 0 ✅
- dkjson 로드 OK ✅
- `Loading main script... → Startup time: 0 ms` 로그 출력 ✅

따라서 본 PR 의 위험은 **packaging 단계** (electron-builder 가 resources/lua/ 를 올바르게 번들하는지) 와 **dev vs production 경로 처리** (`process.resourcesPath` vs `app.getAppPath()`).

## 마일스톤

PR-3 + PR-4 머지 시 인프라 완성. 사용자에게 보이는 변화는 미미하지만 PR-5 부터 빠르게 진행 가능.

## 참고

- PoC-0.1b 결과: plan §1 "PoC 실측 결과" 5번 항목
- HeadlessWrapper source: [HeadlessWrapper.lua](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/src/HeadlessWrapper.lua)
- PoB CI 의 luajit 사용 예시: [test.yml](file:///mnt/d/project_poe2/PathOfBuilding-PoE2-KR/.github/workflows/test.yml) 의 `cd src; luajit HeadlessWrapper.lua`
